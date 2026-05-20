import os
import pickle
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.retrievers import EnsembleRetriever

class QueryProcessor:
    """
    Service responsible for querying the vector database and generating 
    grounded responses using the Gemini API.
    """
    def __init__(self, vector_store_path: str = "vector_db"):
        self.vector_store_path = vector_store_path
        # Must match the embeddings used during ingestion
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        
        # Initialize Gemini Chat Model (gemini-2.5-flash is fast, accurate, and cost-effective)
        # We set temperature to 0 to maximize determinism and reliability.
        self.llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

        
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

    def query(self, user_question: str) -> dict:
        """
        Executes the RAG pipeline: Retrieve -> Generate.
        Returns the answer and the exact source chunks for traceability.
        """
        if not os.path.exists(self.vector_store_path):
            return {
                "answer": "No documents have been ingested yet. Please upload a document first.", 
                "sources": []
            }
            
        # Load the local vector database (FAISS - Semantic)
        vectorstore = FAISS.load_local(
            self.vector_store_path, 
            self.embeddings, 
            allow_dangerous_deserialization=True
        )
        faiss_retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

        # Load the BM25 statistical index (BM25 - Keyword)
        try:
            with open("bm25_retriever.pkl", 'rb') as f:
                bm25_retriever = pickle.load(f)
                
            # Create the Hybrid Ensemble Retriever (FAISS 60%, BM25 40%)
            ensemble_retriever = EnsembleRetriever(
                retrievers=[bm25_retriever, faiss_retriever], 
                weights=[0.4, 0.6]
            )
            # Retrieve top 10 chunks total (5 from each, dynamically ranked)
            docs = ensemble_retriever.invoke(user_question)
        except Exception as e:
            print(f"BM25 fallback failed: {e}")
            # Fallback to pure FAISS if BM25 is missing
            docs = faiss_retriever.invoke(user_question)
        
        if not docs:
            return {
                "answer": "I couldn't find any relevant information in the uploaded documents.", 
                "sources": []
            }

        # Combine document content to form the context block, including metadata!
        context_blocks = []
        for doc in docs:
            filename = doc.metadata.get('source_file', 'Unknown Document')
            page = doc.metadata.get('page', 'Unknown Page')
            context_blocks.append(f"[Source: {filename}, Page: {page}]\n{doc.page_content}")
            
        context_text = "\n\n---\n\n".join(context_blocks)
        
        # Create and execute the generation chain
        chain = self.prompt_template | self.llm
        response = chain.invoke({"context": context_text, "question": user_question})
        
        # Format sources to return to the frontend for observability
        sources = [
            {
                "content": doc.page_content,
                "metadata": doc.metadata
            }
            for doc in docs
        ]
        
        return {
            "answer": response.content,
            "sources": sources
        }
