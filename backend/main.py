from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
async def upload_document(file: UploadFile = File(...)):
    """
    Handles document upload, temporary storage, and triggers the RAG ingestion pipeline.
    """
    try:
        # Save file to a temporary location for processing
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = temp_file.name

        try:
            # Initialize offline RAG ingestion
            processor = DocumentProcessor(vector_store_path="vector_db")
            num_chunks = processor.process_pdf(temp_path)
            
            return {
                "filename": file.filename,
                "content_type": file.content_type,
                "message": f"Successfully processed into {num_chunks} chunks and stored in FAISS vector DB.",
                "chunks": num_chunks
            }
        finally:
            # Clean up the temporary file after processing
            if os.path.exists(temp_path):
                os.remove(temp_path)

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
