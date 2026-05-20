from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Form
from fastapi.responses import StreamingResponse
import uuid
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
import os
import shutil
import tempfile
import json
from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorClient
from services.document_processor import DocumentProcessor
from services.query_processor import QueryProcessor
from services.agent_orchestrator import AgentOrchestrator

# Load environment variables
load_dotenv()

import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning, message="coroutine 'ClientResponse.json' was never awaited")

from contextlib import asynccontextmanager

# MongoDB Setup
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    print("WARNING: MONGO_URI is not set. Chat history will not persist!")
db_client = AsyncIOMotorClient(MONGO_URI) if MONGO_URI else None
db = db_client.nexusai if db_client else None

@asynccontextmanager
async def lifespan(app: FastAPI):
    if db_client is not None:
        try:
            # Ping the server to verify connection
            await db_client.admin.command('ping')
            print("==================================================")
            print("🚀 NexusAI: Successfully connected to MongoDB Atlas!")
            print("==================================================")
        except Exception as e:
            print(f"❌ NexusAI: Failed to connect to MongoDB: {e}")
    yield
    if db_client is not None:
        db_client.close()

app = FastAPI(
    title="NexusAI API",
    description="Backend API for NexusAI Self-Correcting Multi-Agent Research Intelligence Platform",
    version="0.2.0",
    lifespan=lifespan
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

# ---------------------------------------------------------
# SESSION MANAGEMENT ENDPOINTS
# ---------------------------------------------------------
@app.get("/api/sessions")
async def get_sessions():
    if db is None:
        return {"sessions": []}
    cursor = db.sessions.find().sort("created_at", -1)
    sessions = await cursor.to_list(length=100)
    for s in sessions:
        s["_id"] = str(s["_id"])
    return {"sessions": sessions}

@app.post("/api/sessions")
async def create_session():
    session_id = f"chat_{uuid.uuid4().hex[:8]}"
    if db is not None:
        await db.sessions.insert_one({
            "session_id": session_id,
            "title": "New Chat",
            "created_at": datetime.utcnow()
        })
    return {"session_id": session_id}

@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    if db is None:
        return {"messages": []}
    cursor = db.chat_history.find({"session_id": session_id}).sort("timestamp", 1)
    messages = await cursor.to_list(length=1000)
    for m in messages:
        m["_id"] = str(m["_id"])
    return {"messages": messages}

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    if db is not None:
        await db.sessions.delete_one({"session_id": session_id})
        await db.chat_history.delete_many({"session_id": session_id})
    
    # Delete local vector storage for this session
    session_dir = os.path.join("storage", "sessions", session_id)
    if os.path.exists(session_dir):
        shutil.rmtree(session_dir)
        
    return {"message": "Session deleted."}


# ---------------------------------------------------------
# DOCUMENT INGESTION ENDPOINTS
# ---------------------------------------------------------

# In-memory dictionary to track async upload tasks
upload_jobs = {}

def process_upload_task(job_id: str, file_paths_and_names: list, session_id: str):
    try:
        upload_jobs[job_id]["status"] = "processing"
        processor = DocumentProcessor(session_id=session_id)
        total_chunks = 0
        filenames = []
        
        for temp_path, original_filename in file_paths_and_names:
            try:
                num_chunks = processor.process_document(temp_path, original_filename=original_filename)
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
async def upload_document(
    background_tasks: BackgroundTasks, 
    files: List[UploadFile] = File(...),
    session_id: str = Form("default")
):
    job_id = str(uuid.uuid4())
    upload_jobs[job_id] = {"status": "pending"}
    
    file_paths_and_names = []
    
    try:
        for file in files:
            _, ext = os.path.splitext(file.filename.lower())
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
                shutil.copyfileobj(file.file, temp_file)
                file_paths_and_names.append((temp_file.name, file.filename))
                
        background_tasks.add_task(process_upload_task, job_id, file_paths_and_names, session_id)
        return {"job_id": job_id, "status": "processing", "message": "Upload received. Processing in the background."}
    except Exception as e:
        upload_jobs[job_id] = {"status": "error", "error": str(e)}
        return {"error": str(e)}

@app.get("/api/upload/status/{job_id}")
def get_upload_status(job_id: str):
    if job_id not in upload_jobs:
        return {"status": "error", "error": "Job ID not found"}
    return upload_jobs[job_id]

@app.delete("/api/clear")
def clear_knowledge_base(session_id: str = "default"):
    try:
        processor = DocumentProcessor(session_id=session_id)
        processor.clear_database()
        return {"message": f"Knowledge base for {session_id} successfully cleared."}
    except Exception as e:
        return {"error": str(e)}


# ---------------------------------------------------------
# QUERY ENDPOINTS
# ---------------------------------------------------------
class QueryRequest(BaseModel):
    query: str
    session_id: str = "default"

@app.post("/api/query")
async def query_document(request: QueryRequest):
    try:
        # Fetch last 5 message pairs (10 messages) + 1st message pair
        chat_history_str = ""
        if db is not None:
            cursor = db.chat_history.find({"session_id": request.session_id}).sort("timestamp", 1)
            all_msgs = await cursor.to_list(length=1000)
            
            # If it's the very first query of a new session, rename the session title to the user's query
            if len(all_msgs) == 0:
                short_title = request.query[:30] + "..." if len(request.query) > 30 else request.query
                await db.sessions.update_one(
                    {"session_id": request.session_id},
                    {"$set": {"title": short_title}}
                )
            
            if len(all_msgs) > 0:
                # Always keep the first 2 messages (Master setup)
                first_pair = all_msgs[:2]
                # Then grab up to the last 10
                last_msgs = all_msgs[2:][-10:] if len(all_msgs) > 2 else []
                
                context_msgs = first_pair + last_msgs
                
                for m in context_msgs:
                    chat_history_str += f"{m['role'].upper()}: {m['content']}\n\n"

        orchestrator = AgentOrchestrator(session_id=request.session_id)
        
        # Save user message immediately
        if db is not None:
            await db.chat_history.insert_one({
                "session_id": request.session_id,
                "role": "user",
                "content": request.query,
                "timestamp": datetime.utcnow()
            })

        async def event_generator():
            try:
                streamed_any = False
                full_assistant_response = ""
                final_sources = []
                
                # Consume node and runnable execution events in real-time
                async for event in orchestrator.graph.astream_events({"query": request.query, "chat_history": chat_history_str}, version="v2"):
                    kind = event["event"]
                    if kind == "on_chat_model_stream":
                        if "generator" in event.get("tags", []):
                            token = event["data"]["chunk"].content
                            if token:
                                streamed_any = True
                                full_assistant_response += token
                                yield f"data: {json.dumps({'text': token})}\n\n"
                                
                    elif kind == "on_chain_end" and event["name"] in ["execute_simple_rag", "execute_compare_rag"]:
                        output = event["data"]["output"]
                        if isinstance(output, dict):
                            if not streamed_any and "answer" in output:
                                full_assistant_response = output['answer']
                                yield f"data: {json.dumps({'text': output['answer']})}\n\n"
                            if "sources" in output:
                                final_sources = output['sources']
                                yield f"data: {json.dumps({'sources': final_sources})}\n\n"
                                
                # Save assistant response after stream is complete
                if db is not None:
                    await db.chat_history.insert_one({
                        "session_id": request.session_id,
                        "role": "assistant",
                        "content": full_assistant_response,
                        "sources": final_sources,
                        "timestamp": datetime.utcnow()
                    })
                    
            except Exception as stream_err:
                print(f"Error during stream generation: {stream_err}")
                yield f"data: {json.dumps({'error': str(stream_err)})}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
    except Exception as e:
        return {"error": str(e)}
