from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

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
    # Phase 1: Simple file upload endpoint (Mocking actual storage/processing for now)
    # In future phases, this will trigger the ingestion pipeline
    try:
        # Here we would normally save the file and index it.
        # For Phase 1, we just return a success response with file details.
        return {
            "filename": file.filename,
            "content_type": file.content_type,
            "message": "File uploaded successfully. Processing pipeline not yet implemented."
        }
    except Exception as e:
        return {"error": str(e)}
