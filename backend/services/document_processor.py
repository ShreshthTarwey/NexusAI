import os
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

class DocumentProcessor:
    """
    Service responsible for document ingestion, chunking, and vector storage.
    Currently uses an offline HuggingFace model (all-MiniLM-L6-v2) for embeddings
    and FAISS for fast local vector retrieval.
    """
    def __init__(self, vector_store_path: str = "vector_db"):
        self.vector_store_path = vector_store_path
        # Using a highly efficient local embedding model
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        # Initialize text splitter for chunking documents
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            add_start_index=True
        )

    def process_pdf(self, file_path: str) -> int:
        """
        Loads a PDF, splits it into chunks, and updates/creates the FAISS index.
        Returns the number of chunks processed.
        """
        # Load the document
        loader = PyPDFLoader(file_path)
        docs = loader.load()

        if not docs:
            raise ValueError("No text could be extracted from the PDF.")

        # Split the document into chunks
        chunks = self.text_splitter.split_documents(docs)

        # Create or update the FAISS vector database
        if os.path.exists(self.vector_store_path):
            # Load existing DB and add new chunks
            vectorstore = FAISS.load_local(
                self.vector_store_path, 
                self.embeddings, 
                allow_dangerous_deserialization=True
            )
            vectorstore.add_documents(chunks)
            vectorstore.save_local(self.vector_store_path)
        else:
            # Initialize a new FAISS DB
            vectorstore = FAISS.from_documents(chunks, self.embeddings)
            vectorstore.save_local(self.vector_store_path)

        return len(chunks)
