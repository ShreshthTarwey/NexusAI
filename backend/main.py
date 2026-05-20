from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
import uuid
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

# Enable CORS strictly for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Locked down for production security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to NexusAI API"}

# In-memory dictionary to track async upload tasks
upload_jobs = {}

def process_upload_task(job_id: str, file_paths_and_names: list):
    """
    Background task to process PDFs and update the global job status.
    """
    try:
        upload_jobs[job_id]["status"] = "processing"
        processor = DocumentProcessor(vector_store_path="vector_db")
        total_chunks = 0
        filenames = []
        
        for temp_path, original_filename in file_paths_and_names:
            try:
                num_chunks = processor.process_pdf(temp_path, original_filename=original_filename)
                total_chunks += num_chunks
                filenames.append(original_filename)
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
        upload_jobs[job_id] = {
            "status": "success",
            "filenames": filenames,
            "chunks": total_chunks,
            "message": f"Successfully processed {len(filenames)} files into {total_chunks} chunks."
        }
    except Exception as e:
        upload_jobs[job_id] = {
            "status": "error",
            "error": str(e)
        }

@app.post("/api/upload")
async def upload_document(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...)):
    """
    Handles multi-document upload, temporary storage, and triggers the RAG ingestion pipeline asynchronously.
    """
    job_id = str(uuid.uuid4())
    upload_jobs[job_id] = {"status": "pending"}
    
    file_paths_and_names = []
    
    try:
        for file in files:
            # Save file to a temporary location for processing
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
                shutil.copyfileobj(file.file, temp_file)
                file_paths_and_names.append((temp_file.name, file.filename))
                
        # Dispatch the heavy processing task to the background
        background_tasks.add_task(process_upload_task, job_id, file_paths_and_names)
        
        return {
            "job_id": job_id, 
            "status": "processing", 
            "message": "Upload received. Processing in the background."
        }
    except Exception as e:
        upload_jobs[job_id] = {"status": "error", "error": str(e)}
        return {"error": str(e)}

@app.get("/api/upload/status/{job_id}")
def get_upload_status(job_id: str):
    """
    Endpoint for the frontend to poll the status of an async upload job.
    """
    if job_id not in upload_jobs:
        return {"status": "error", "error": "Job ID not found"}
    return upload_jobs[job_id]

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
    Retrieves relevant context from the vector database and 
    streams a grounded response using SSE.
    """
    try:
        processor = QueryProcessor(vector_store_path="vector_db")
        return StreamingResponse(processor.stream_query(request.query), media_type="text/event-stream")
    except Exception as e:
        return {"error": str(e)}
