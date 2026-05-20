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
from services.agent_orchestrator import AgentOrchestrator
import json

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
    Routes the query through the LangGraph Agentic Router state machine,
    streaming LLM tokens and sources using SSE.
    """
    try:
        orchestrator = AgentOrchestrator(vector_store_path="vector_db")
        
        async def event_generator():
            try:
                streamed_any = False
                # We consume node and runnable execution events in real-time
                async for event in orchestrator.graph.astream_events({"query": request.query}, version="v2"):
                    kind = event["event"]
                    # Stream chat model chunks word-by-word
                    if kind == "on_chat_model_stream":
                        token = event["data"]["chunk"].content
                        if token:
                            streamed_any = True
                            yield f"data: {json.dumps({'text': token})}\n\n"
                    # Capture the final RAG nodes to send sources to the UI
                    elif kind == "on_chain_end" and event["name"] in ["execute_simple_rag", "execute_compare_rag"]:
                        output = event["data"]["output"]
                        if isinstance(output, dict):
                            # Fallback: if we haven't streamed any tokens, send the answer block directly
                            if not streamed_any and "answer" in output:
                                yield f"data: {json.dumps({'text': output['answer']})}\n\n"
                            if "sources" in output:
                                yield f"data: {json.dumps({'sources': output['sources']})}\n\n"
            except Exception as stream_err:
                print(f"Error during stream generation: {stream_err}")
                yield f"data: {json.dumps({'error': str(stream_err)})}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
    except Exception as e:
        return {"error": str(e)}
