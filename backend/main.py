from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
import os
import shutil
import tempfile
from services.document_processor import DocumentProcessor
from services.query_processor import QueryProcessor

# Load environment variables
load_dotenv()

app = FastAPI(
    title="NexusAI API",
    description="Backend API for NexusAI Self-Correcting Multi-Agent Research Intelligence Platform",
    version="0.1.0"
)

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to NexusAI API"}

@app.post("/api/upload")
async def upload_document(files: List[UploadFile] = File(...)):
    """
    Handles multi-document upload, temporary storage, and triggers the RAG ingestion pipeline.
    """
    try:
        processor = DocumentProcessor(vector_store_path="vector_db")
        total_chunks = 0
        filenames = []
        
        for file in files:
            # Save file to a temporary location for processing
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
                shutil.copyfileobj(file.file, temp_file)
                temp_path = temp_file.name

            try:
                # Initialize offline RAG ingestion with filename tracing
                num_chunks = processor.process_pdf(temp_path, original_filename=file.filename)
                total_chunks += num_chunks
                filenames.append(file.filename)
            finally:
                # Clean up the temporary file after processing
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        return {
            "filenames": filenames,
            "message": f"Successfully processed {len(filenames)} files into {total_chunks} chunks.",
            "chunks": total_chunks
        }
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/clear")
def clear_knowledge_base():
    """
    Completely wipes the vector database and BM25 index.
    """
    try:
        processor = DocumentProcessor(vector_store_path="vector_db")
        processor.clear_database()
        return {"message": "Knowledge base successfully cleared."}
    except Exception as e:
        return {"error": str(e)}

class QueryRequest(BaseModel):
    query: str

@app.post("/api/query")
async def query_document(request: QueryRequest):
    """
    Retrieves relevant context from the FAISS vector database and 
    generates a grounded response using OpenAI.
    """
    try:
        processor = QueryProcessor(vector_store_path="vector_db")
        result = processor.query(request.query)
        return result
    except Exception as e:
        return {"error": str(e)}
