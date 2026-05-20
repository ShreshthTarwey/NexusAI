# NexusAI — Self-Correcting Multi-Agent Research Intelligence Platform

NexusAI is a production-grade Agentic AI platform focused on Hybrid RAG, Multi-Agent Orchestration, Reliability, Traceability, Evaluation, Validation, Deterministic Control Policies, Observability, Context Memory, Self-Correction, Tool Calling, and Graph Runtime Engineering.

## Architecture

The system evolves progressively, currently standing at **Phase 6: Conversational Memory & Session Management**.

**High-Level Architecture (Target):**
User -> Frontend UI -> FastAPI Backend -> LangGraph State Machine -> Supervisor/Orchestrator Agent -> Specialized Agents -> Hybrid Retrieval Layer -> Validation + Reliability Layer -> Control Layer -> Memory Layer -> Evaluation Layer -> Final Response Generator

## Tech Stack
- **Frontend:** React (Vite) with Custom Stateful Markdown Block Parser (Zero Dependency)
- **Backend:** FastAPI (Python)
- **Vector DB:** FAISS
- **Embeddings:** HuggingFace `all-MiniLM-L6-v2` (Local/Offline)
- **LLM:** Google Gemini 2.5 Flash (`gemini-2.5-flash`)
- **Orchestration:** LangGraph (Conditional State Machine Router)
- **Observability:** LangSmith (Latencies & Execution Tracing)

## Core Architectural Guardrails & Defenses
- **Zero-Dependency Stateful Block-Markdown Parser:** A line-by-line custom block parser in the React frontend that dynamically compiles complex headers, bolding, blockquotes, nested list items (2/4 space indents), fenced code blocks, and structured comparison tables directly from chunk streams without any npm library bloat.
- **Routing Token Containment:** Actively parses event logs inside the FastAPI SSE `astream_events` endpoint, utilizing runtime node tag filters (`"generator"` vs. `"router"`) to cleanly trap and drop structured JSON routing outputs (e.g., `{"route": "compare_rag"}`), preventing them from leaking into the user's chat window.
- **Clean Document Traceability:** Resolves metadata inconsistencies across formats. It handles numeric page numbers seamlessly (converting 0-indexed values from PDFs into 1-indexed numbers) while dynamically suppressing empty, placeholder, or invalid page tags (like `(Page ?)`) for Markdown and Text documents, showing only raw, clean filenames.

## Setup Instructions

### Backend
1. Navigate to the `backend` directory.
2. Create a virtual environment: `python -m venv venv`
3. Activate the virtual environment:
   - Windows: `venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Configure environmental variables: Create/edit a `.env` file in the `backend/` directory and add:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
6. Run the server: `uvicorn main:app --reload`


### Frontend
1. Navigate to the `frontend` directory.
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`

## Detailed Architectural Workflow

Here is the microscopic, step-by-step workflow of how data and execution flow through the NexusAI platform when processing files and answering queries.

---

### Phase 1: Uploading the Documents (Frontend to Backend)

**1. User Interaction (React):**
The user selects files (PDFs, MDs, TXTs) using the file input. The `handleFileChange` function captures these files in the component's state.

**2. Sending the Payload (`frontend/src/App.jsx`):**
When the user clicks "Process Document", the `handleSubmit` function is triggered. It creates a `FormData` object, appends the files, and uses `fetch` to send a POST request.

```javascript
// Inside frontend/src/App.jsx
const handleSubmit = async () => {
  if (files.length === 0) return;
  setStatus('uploading');
  
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  try {
    const res = await fetch('http://localhost:8000/api/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.job_id) pollUploadStatus(data.job_id);
  } catch (error) { /* error handling */ }
};
```

**3. Backend Reception (`backend/main.py`):**
FastAPI intercepts the files, copies them into temporary storage using `tempfile`, and registers a **Background Task** to prevent the UI from freezing. It instantly returns a `job_id`.

```python
# Inside backend/main.py
@app.post("/api/upload")
async def upload_document(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...)):
    job_id = str(uuid.uuid4())
    upload_jobs[job_id] = {"status": "pending"}
    
    file_paths_and_names = []
    for file in files:
        _, ext = os.path.splitext(file.filename.lower())
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            file_paths_and_names.append((temp_file.name, file.filename))
            
    # Dispatch heavy IO to the background
    background_tasks.add_task(process_upload_task, job_id, file_paths_and_names)
    return {"job_id": job_id, "status": "processing"}
```

---

### Phase 2: Processing, Chunking & Indexing (The Vector DB)

**1. The Document Processor (`backend/services/document_processor.py`):**
The background task initializes `DocumentProcessor`. It uses `PyMuPDFLoader` for PDFs and `TextLoader` for Markdown/Text.

**2. Chunking:**
It uses `RecursiveCharacterTextSplitter` (chunk_size=1000, overlap=200) and injects the `source_file` metadata into every chunk for UI traceability.

**3. Database Creation (FAISS and BM25):**
All DB operations are wrapped in `FileLock("database.lock")`.

```python
# Inside backend/services/document_processor.py
with FileLock(self.lock_path, timeout=120):
    # 1. FAISS VECTOR INDEXING (Semantic Search)
    if os.path.exists(self.vector_store_path):
        vectorstore = FAISS.load_local(self.vector_store_path, self.embeddings, allow_dangerous_deserialization=True)
        vectorstore.add_documents(chunks)
        vectorstore.save_local(self.vector_store_path)
    else:
        vectorstore = FAISS.from_documents(chunks, self.embeddings)
        vectorstore.save_local(self.vector_store_path)

    # 2. BM25 STATISTICAL INDEXING (Keyword Search)
    corpus.extend(chunks)
    with open("corpus.pkl", 'wb') as f:
        pickle.dump(corpus, f)
        
    bm25_retriever = BM25Retriever.from_documents(corpus)
    with open("bm25_retriever.pkl", 'wb') as f:
        pickle.dump(bm25_retriever, f)
```

---

### Phase 3: Agent Orchestration (Asking a Question)

**1. The LangGraph State Machine (`backend/services/agent_orchestrator.py`):**
When the `/api/query` endpoint is hit, the `AgentOrchestrator` uses a highly-prompted Router LLM (Gemini 2.5 Flash, falling back to Llama 3.1 8B via Groq if Gemini fails) to decide if the query is `simple_rag` or `compare_rag`.

```python
# Inside backend/services/agent_orchestrator.py
def route_intent(self, state: AgentState) -> Dict:
    decision = self.router_llm.invoke(prompt)
    route = decision.route if decision.route in ["simple_rag", "compare_rag"] else "simple_rag"
    return {"route": route}
```

**2. Routing & Retrieval (`backend/services/query_processor.py`):**
Based on the route, it pulls either 5 or 10 chunks using an `EnsembleRetriever` (60% FAISS semantic matching, 40% BM25 exact keyword matching).

```python
# Inside backend/services/query_processor.py
ensemble_retriever = EnsembleRetriever(
    retrievers=[bm25_retriever, faiss_retriever], 
    weights=[0.4, 0.6]
)
docs = ensemble_retriever.invoke(user_question)
```

---

### Phase 4: Streaming the Response

**1. Generating the Answer:**
The retrieved chunks are formatted and fed to the Resilient Generator LLM (Gemini 2.5 Flash or Llama 3.3 70B via Groq).

**2. Server-Sent Events (SSE) (`backend/main.py`):**
As the LLM generates tokens, FastAPI intercepts them using `astream_events` and yields them instantly to the frontend. It actively filters tags to ensure routing logs (like `{"route": "simple_rag"}`) don't leak.

```python
# Inside backend/main.py
async for event in orchestrator.graph.astream_events({"query": request.query}, version="v2"):
    kind = event["event"]
    if kind == "on_chat_model_stream":
        # Only stream tokens from models tagged as 'generator'
        if "generator" in event.get("tags", []):
            token = event["data"]["chunk"].content
            if token:
                yield f"data: {json.dumps({'text': token})}\n\n"
```

**3. React UI Updates:**
The frontend's `handleQuerySubmit` reads this stream via a `TextDecoder`, appending tokens in real-time to create a smooth typing effect, followed by the `sources` array for the UI citation badges.

---

## Folder Structure
```
NexusAI/
├── backend/          # FastAPI application
├── frontend/         # React UI application
├── README.md         # Project documentation
└── steps.md          # Engineering log and progress tracker
```

## Future Roadmap
- Phase 1: Project Foundation (Completed)
- Phase 2: Basic Offline RAG Pipeline (Completed)
- Phase 3 & 3.5: Hybrid RAG & Ingestion Performance (Completed)
- Phase 4: Observability & Tracing via LangSmith (Completed)
- Phase 5: Agentic Routing via LangGraph (Completed)
- Phase 6: Conversational Memory & Session Management (Current)
- Phase 7: Reliability & Control Layer
- Phase 8: Tool Calling Layer
- Phase 9: Evaluation Layer
- Phase 10: Production Engineering

