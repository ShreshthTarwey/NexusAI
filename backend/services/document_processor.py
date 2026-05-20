import os
import shutil
import pickle
from langchain_community.document_loaders import PyMuPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_community.retrievers import BM25Retriever
from langsmith import traceable
from filelock import FileLock

class DocumentProcessor:
    """
    Service responsible for document ingestion, chunking, and vector storage.
    Currently uses an offline HuggingFace model (all-MiniLM-L6-v2) for embeddings
    and FAISS for fast local vector retrieval.
    """
    def __init__(self, vector_store_path: str = "vector_db"):
        self.vector_store_path = vector_store_path
        self.corpus_path = "corpus.pkl"
        self.bm25_path = "bm25_retriever.pkl"
        self.lock_path = "database.lock"
        
        # Using a highly efficient local embedding model
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        # Initialize text splitter for chunking documents
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            add_start_index=True
        )

    @traceable(name="Document Ingestion Pipeline")
    def process_document(self, file_path: str, original_filename: str = None) -> int:
        """
        Loads a document (PDF, Markdown, Text), injects filename metadata, 
        and updates FAISS + BM25 indices.
        Returns the number of chunks processed.
        """
        # Determine the file type based on original_filename or file_path suffix
        filename_to_check = original_filename or file_path
        _, ext = os.path.splitext(filename_to_check.lower())

        if ext == ".pdf":
            loader = PyMuPDFLoader(file_path)
        elif ext in [".md", ".markdown", ".txt"]:
            loader = TextLoader(file_path, encoding='utf-8')
        else:
            raise ValueError(f"Unsupported file format: {ext}")

        docs = loader.load()

        if not docs:
            raise ValueError("No text could be extracted from the document.")

        # Split the document into chunks
        chunks = self.text_splitter.split_documents(docs)

        # Inject original filename into metadata for document comparison traceability
        if original_filename:
            for chunk in chunks:
                chunk.metadata['source_file'] = original_filename

        # Wrap the disk writes in a FileLock to prevent race conditions 
        # when multiple files are uploaded concurrently.
        with FileLock(self.lock_path, timeout=120):
            # ---------------------------------------------------------
            # 1. FAISS VECTOR INDEXING (Semantic Search)
            # ---------------------------------------------------------
            if os.path.exists(self.vector_store_path):
                vectorstore = FAISS.load_local(
                    self.vector_store_path, 
                    self.embeddings, 
                    allow_dangerous_deserialization=True
                )
                vectorstore.add_documents(chunks)
                vectorstore.save_local(self.vector_store_path)
            else:
                vectorstore = FAISS.from_documents(chunks, self.embeddings)
                vectorstore.save_local(self.vector_store_path)

            # ---------------------------------------------------------
            # 2. BM25 STATISTICAL INDEXING (Keyword Search)
            # ---------------------------------------------------------
            # BM25 requires the full corpus to calculate TF-IDF. 
            # We maintain a global corpus list, append new chunks, and rebuild.
            corpus = []
            if os.path.exists(self.corpus_path):
                try:
                    with open(self.corpus_path, 'rb') as f:
                        corpus = pickle.load(f)
                except Exception as e:
                    print(f"Warning: Failed to load existing corpus, starting fresh. Error: {e}")
                    corpus = []
            
            corpus.extend(chunks)
            
            with open(self.corpus_path, 'wb') as f:
                pickle.dump(corpus, f)
                
            # Rebuild BM25 retriever
            bm25_retriever = BM25Retriever.from_documents(corpus)
            # Ensure it returns the same number of chunks as FAISS later
            bm25_retriever.k = 5 
            with open(self.bm25_path, 'wb') as f:
                pickle.dump(bm25_retriever, f)

        return len(chunks)

    def process_pdf(self, file_path: str, original_filename: str = None) -> int:
        """
        Backward compatibility wrapper mapping to the generic process_document method.
        """
        return self.process_document(file_path, original_filename)

    def clear_database(self):
        """
        Wipes the FAISS directory and BM25 local files to clear the context.
        """
        with FileLock(self.lock_path, timeout=60):
            if os.path.exists(self.vector_store_path):
                shutil.rmtree(self.vector_store_path)
            if os.path.exists(self.corpus_path):
                os.remove(self.corpus_path)
            if os.path.exists(self.bm25_path):
                os.remove(self.bm25_path)
