from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Form, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
import uuid
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import os
import shutil
import tempfile
import json
from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorClient
from services.document_processor import DocumentProcessor
from services.query_processor import QueryProcessor
from services.agent_orchestrator import AgentOrchestrator
from services.auth import hash_password, verify_password, create_access_token, get_current_user

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
            print("NexusAI: Successfully connected to MongoDB Atlas!")
            print("==================================================")
        except Exception as e:
            print(f"NexusAI: Failed to connect to MongoDB: {e}")
    yield
    if db_client is not None:
        db_client.close()

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="NexusAI API",
    description="Backend API for NexusAI Self-Correcting Multi-Agent Research Intelligence Platform",
    version="0.2.5",
    lifespan=lifespan
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.state.db = db

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
# USER AUTHENTICATION SCHEMAS & ENDPOINTS
# ---------------------------------------------------------
class UserAuth(BaseModel):
    username: str
    password: str

@app.post("/api/auth/register")
@limiter.limit("10/minute")
async def register(request: Request, auth_data: UserAuth):
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available"
        )
    username = auth_data.username.strip().lower()
    if not username or not auth_data.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
        
    existing_user = await db.users.find_one({"username": username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
        
    hashed_pwd = hash_password(auth_data.password)
    await db.users.insert_one({
        "username": username,
        "password_hash": hashed_pwd,
        "created_at": datetime.utcnow()
    })
    return {"message": "User registered successfully"}

@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, auth_data: UserAuth):
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available"
        )
    username = auth_data.username.strip().lower()
    user = await db.users.find_one({"username": username})
    if not user or not verify_password(auth_data.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
        
    token = create_access_token({"sub": username})
    return {"access_token": token, "token_type": "bearer", "username": username}

@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"username": current_user["username"]}


# ---------------------------------------------------------
# SESSION MANAGEMENT ENDPOINTS
# ---------------------------------------------------------
@app.get("/api/sessions")
async def get_sessions(current_user: dict = Depends(get_current_user)):
    if db is None:
        return {"sessions": []}
    cursor = db.sessions.find({"username": current_user["username"]}).sort("created_at", -1)
    sessions = await cursor.to_list(length=100)
    for s in sessions:
        s["_id"] = str(s["_id"])
    return {"sessions": sessions}

@app.post("/api/sessions")
async def create_session(current_user: dict = Depends(get_current_user)):
    session_id = f"chat_{uuid.uuid4().hex[:8]}"
    if db is not None:
        await db.sessions.insert_one({
            "session_id": session_id,
            "username": current_user["username"],
            "title": "New Chat",
            "created_at": datetime.utcnow()
        })
    return {"session_id": session_id}

@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        return {"messages": []}
    
    # Verify session ownership
    session = await db.sessions.find_one({"session_id": session_id, "username": current_user["username"]})
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found or unauthorized")
        
    cursor = db.chat_history.find({"session_id": session_id}).sort("timestamp", 1)
    messages = await cursor.to_list(length=1000)
    for m in messages:
        m["_id"] = str(m["_id"])
    return {"messages": messages}

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    if db is not None:
        # Verify session ownership
        session = await db.sessions.find_one({"session_id": session_id, "username": current_user["username"]})
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found or unauthorized")
            
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
@limiter.limit("30/minute")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks, 
    files: List[UploadFile] = File(...),
    session_id: str = Form("default"),
    current_user: dict = Depends(get_current_user)
):
    # Verify session ownership
    if db is not None:
        session = await db.sessions.find_one({"session_id": session_id, "username": current_user["username"]})
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found or unauthorized")

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
def get_upload_status(job_id: str, current_user: dict = Depends(get_current_user)):
    if job_id not in upload_jobs:
        return {"status": "error", "error": "Job ID not found"}
    return upload_jobs[job_id]

@app.delete("/api/clear")
async def clear_knowledge_base(session_id: str = "default", current_user: dict = Depends(get_current_user)):
    if db is not None:
        session = await db.sessions.find_one({"session_id": session_id, "username": current_user["username"]})
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found or unauthorized")

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
@limiter.limit("30/minute")
async def query_document(request: Request, query_request: QueryRequest, current_user: dict = Depends(get_current_user)):
    if db is not None:
        # Verify session ownership
        session = await db.sessions.find_one({"session_id": query_request.session_id, "username": current_user["username"]})
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found or unauthorized")

    try:
        # Fetch last 5 message pairs (10 messages) + 1st message pair
        chat_history_str = ""
        if db is not None:
            cursor = db.chat_history.find({"session_id": query_request.session_id}).sort("timestamp", 1)
            all_msgs = await cursor.to_list(length=1000)
            
            # If it's the very first query of a new session, rename the session title to the user's query
            if len(all_msgs) == 0:
                short_title = query_request.query[:30] + "..." if len(query_request.query) > 30 else query_request.query
                await db.sessions.update_one(
                    {"session_id": query_request.session_id},
                    {"$set": {"title": short_title}}
                )
            
            if len(all_msgs) > 0:
                # Always keep the first 2 messages (Master setup)
                first_pair = all_msgs[:2]
                # Then grab up to the last 10
                last_msgs = all_msgs[2:][-10:] if len(all_msgs) > 2 else []
                
                context_msgs = first_pair + last_msgs
                
                for m in context_msgs:
                    content = m['content']
                    if m['role'] == 'assistant' and len(content) > 500:
                        content = content[:500] + "... [truncated]"
                    chat_history_str += f"{m['role'].upper()}: {content}\n\n"

        orchestrator = AgentOrchestrator(session_id=query_request.session_id)
        
        # Save user message immediately
        if db is not None:
            await db.chat_history.insert_one({
                "session_id": query_request.session_id,
                "role": "user",
                "content": query_request.query,
                "timestamp": datetime.utcnow()
            })

        async def event_generator():
            try:
                streamed_any = False
                full_assistant_response = ""
                final_sources = []
                
                # Consume node and runnable execution events in real-time
                async for event in orchestrator.graph.astream_events({"query": query_request.query, "chat_history": chat_history_str}, version="v2"):
                    kind = event["event"]
                    if kind == "on_chat_model_stream":
                        if "generator" in event.get("tags", []):
                            token = event["data"]["chunk"].content
                            if token:
                                streamed_any = True
                                full_assistant_response += token
                                yield f"data: {json.dumps({'text': token})}\n\n"
                                
                    elif kind == "on_chain_end" and event["name"] in ["execute_simple_rag", "execute_compare_rag", "execute_guardrail_block"]:
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
                        "session_id": query_request.session_id,
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
