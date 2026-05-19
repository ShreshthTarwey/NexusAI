import os
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

class QueryProcessor:
    """
    Service responsible for querying the vector database and generating 
    grounded responses using the OpenAI API.
    """
    def __init__(self, vector_store_path: str = "vector_db"):
        self.vector_store_path = vector_store_path
        # Must match the embeddings used during ingestion
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        
        # Initialize OpenAI Chat Model (gpt-4o-mini is fast and accurate for RAG)
        # We set temperature to 0 to maximize determinism and reliability.
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        
        # Define a strict system prompt to enforce groundedness
        self.prompt_template = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an intelligent research assistant for the NexusAI platform. "
                "Use ONLY the following retrieved context to answer the user's question. "
                "If the answer is not in the context, explicitly state that you do not know. "
                "Do not hallucinate or use outside knowledge.\n\n"
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
            
        # Load the local vector database
        vectorstore = FAISS.load_local(
            self.vector_store_path, 
            self.embeddings, 
            allow_dangerous_deserialization=True
        )
        
        # Retrieve top 4 most relevant chunks
        retriever = vectorstore.as_retriever(search_kwargs={"k": 4})
        docs = retriever.invoke(user_question)
        
        if not docs:
            return {
                "answer": "I couldn't find any relevant information in the uploaded documents.", 
                "sources": []
            }

        # Combine document content to form the context block
        context_text = "\n\n---\n\n".join([doc.page_content for doc in docs])
        
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
