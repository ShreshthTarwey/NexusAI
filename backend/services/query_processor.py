import os
import pickle
import json
import re
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.vectorstores import FAISS
from services.embeddings_manager import EmbeddingsManager
try:
    from langchain.retrievers import EnsembleRetriever
except ImportError:
    try:
        from langchain_classic.retrievers import EnsembleRetriever
    except ImportError:
        from langchain_community.retrievers import EnsembleRetriever
from langsmith import traceable
from filelock import FileLock

class QueryProcessor:
    """
    Service responsible for querying the vector database and generating 
    grounded responses using the Gemini API.
    """
    def __init__(self, session_id: str = "default"):
        # Strict input validation on session_id to prevent path traversal
        if not re.match(r"^[a-zA-Z0-9_]{3,50}$", session_id):
            raise ValueError(f"Invalid session ID format: {session_id}")
            
        self.session_id = session_id
        self.session_dir = os.path.join("storage", "sessions", session_id)
        self.vector_store_path = os.path.join(self.session_dir, "vector_db")
        self.bm25_path = os.path.join(self.session_dir, "bm25_retriever.pkl")
        self.lock_path = os.path.join(self.session_dir, "database.lock")
        
        # Using cached shared embeddings singleton
        self.embeddings = EmbeddingsManager.get_embeddings()
        
        # Initialize Gemini Chat Model (gemini-2.5-flash is fast, accurate, and cost-effective)
        # We set temperature to 0 to maximize determinism and reliability.
        gemini_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
        
        # Check for Groq API Key and activate resilience layer
        groq_api_key = os.getenv("GROQ_API_KEY")
        if groq_api_key:
            try:
                from langchain_groq import ChatGroq
                groq_generator = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key)
                self.llm = gemini_llm.with_fallbacks([groq_generator])
                print("NexusAI Query Processor Resilience: Groq generation fallback successfully initialized.")
            except Exception as e:
                print(f"NexusAI Query Processor Warning: Failed to initialize Groq fallback ({e}). Defaulting to Gemini alone.")
                self.llm = gemini_llm
        else:
            print("NexusAI Query Processor Warning: GROQ_API_KEY is not defined in the environment. Defaulting to Gemini alone.")
            self.llm = gemini_llm

        
        # Define a strict system prompt to enforce groundedness and document comparison
        self.prompt_template = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an intelligent research assistant for the NexusAI platform. "
                "Use ONLY the following retrieved context to answer the user's question. "
                "If the answer is not in the context, explicitly state that you do not know. "
                "Do not hallucinate or use outside knowledge. "
                "When comparing information from multiple documents, explicitly cite the 'source_file' provided in the context.\n\n"
                "Context:\n{context}"
            )),
            ("human", "{question}")
        ])

    def retrieve_documents(self, user_question: str, k: int = 5) -> list:
        """
        Loads FAISS and BM25 indices, constructs an EnsembleRetriever,
        and retrieves relevant document chunks.
        """
        if not os.path.exists(self.vector_store_path):
            return []
            
        # Acquire lock to ensure we don't read while a background task is saving
        with FileLock(self.lock_path, timeout=60):
            # Load the local vector database (FAISS - Semantic)
            vectorstore = FAISS.load_local(
                self.vector_store_path, 
                self.embeddings, 
                allow_dangerous_deserialization=True
            )
            faiss_retriever = vectorstore.as_retriever(search_kwargs={"k": k})

            # Load the BM25 statistical index (BM25 - Keyword)
            try:
                with open(self.bm25_path, 'rb') as f:
                    bm25_retriever = pickle.load(f)
                
                # Make sure retrieval limits match the requested 'k'
                bm25_retriever.k = k
                    
                # Create the Hybrid Ensemble Retriever (FAISS 60%, BM25 40%)
                ensemble_retriever = EnsembleRetriever(
                    retrievers=[bm25_retriever, faiss_retriever], 
                    weights=[0.4, 0.6]
                )
                # Retrieve top chunks dynamically ranked
                docs = ensemble_retriever.invoke(user_question)
            except Exception as e:
                print(f"BM25 fallback failed: {e}")
                # Fallback to pure FAISS if BM25 is missing
                docs = faiss_retriever.invoke(user_question)
        return docs

    def format_context(self, docs: list) -> str:
        """
        Formats list of retrieved document chunks into a structured context block.
        """
        context_blocks = []
        for doc in docs:
            filename = doc.metadata.get('source_file', 'Unknown Document')
            page = doc.metadata.get('page', 'Unknown Page')
            context_blocks.append(f"[Source: {filename}, Page: {page}]\n{doc.page_content}")
            
        return "\n\n---\n\n".join(context_blocks)

    @traceable(name="Hybrid RAG Query Stream")
    def stream_query(self, user_question: str):
        """
        Executes the RAG pipeline: Retrieve -> Generate.
        Yields the answer chunk-by-chunk in SSE format, followed by sources.
        """
        if not os.path.exists(self.vector_store_path):
            yield f"data: {json.dumps({'text': 'No documents have been ingested yet. Please upload a document first.'})}\n\n"
            yield f"data: {json.dumps({'sources': []})}\n\n"
            return
            
        docs = self.retrieve_documents(user_question, k=5)
        
        if not docs:
            yield f"data: {json.dumps({'text': "I couldn't find any relevant information in the uploaded documents."})}\n\n"
            yield f"data: {json.dumps({'sources': []})}\n\n"
            return

        context_text = self.format_context(docs)
        

        # Format sources to return to the frontend for observability
        sources_list = [
            {
                "content": doc.page_content,
                "metadata": doc.metadata
            }
            for doc in docs
        ]
        
        # Create and execute the generation chain
        chain = self.prompt_template | self.llm
        
        # Stream the LLM response word-by-word
        for chunk in chain.stream({"context": context_text, "question": user_question}):
            yield f"data: {json.dumps({'text': chunk.content})}\n\n"
            
        # Finally, append the sources payload
        yield f"data: {json.dumps({'sources': sources_list})}\n\n"
