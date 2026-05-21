# NexusAI — Self-Correcting Multi-Agent Research Intelligence Platform

NexusAI is a production-grade Agentic AI platform focused on Hybrid RAG, Multi-Agent Orchestration, Reliability, Traceability, Evaluation, Validation, Deterministic Control Policies, Observability, Context Memory, Self-Correction, Tool Calling, and Graph Runtime Engineering.

## Architecture

The system evolves progressively, currently standing at **Phase 7: Reliability & Control Layer**.

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

### Phase 6: Conversational Memory & Dynamic Session Isolation (MongoDB Memory & Multi-Tenancy)

**1. Dynamic Workspace Isolation:**
Instead of storing all vectorized documents in a single global database, NexusAI isolates indices per chat session. When files are uploaded, vectors and pickles are dynamically written to the `backend/storage/sessions/{session_id}/` folder. This ensures absolute separation between different topics/chats.

**2. Conversational Memory:**
During a conversation, the system retrieves the user's initial master query and the last 10 messages (5 turn pairs) from the `chat_history` collection in MongoDB Atlas for the specific `session_id`, compiling them into a context string.

**3. LangGraph Query Condensation Node:**
The user's follow-up question is routed through the `rewrite_query` state node. It leverages the generation model to reconstruct a context-aware standalone query.

```python
# Inside backend/services/agent_orchestrator.py
async def rewrite_query(self, state: AgentState) -> Dict:
    history = state.get("chat_history", "")
    original_query = state["query"]
    
    if not history.strip():
        return {"query": original_query, "original_query": original_query}
        
    prompt = (
        "You are an expert Query Reformulator. Given a conversation history and a follow-up query, "
        "rewrite the follow-up query to be a standalone search query.\n\n"
        "Rules:\n"
        "1. If the follow-up query is short (e.g. 'Google?', 'What about Microsoft?'), "
        "it is a topic/entity shift. Rewrite it to ask the core question category "
        "about the new entity (e.g. 'What is the hiring process of Google?'). Do NOT assume a comparison "
        "between the old and new entities unless the user explicitly uses comparison words "
        "like 'compare', 'contrast', 'versus', 'differences', or 'similarities'.\n"
        "2. Keep the rewritten query concise and optimized for semantic and keyword search.\n"
        "3. Do NOT answer the question. Only output the rewritten standalone query.\n\n"
        f"History:\n{history}\n\n"
        f"Latest Question: {original_query}\n\n"
        "Standalone Query:"
    )
    try:
        response = await self.generation_llm.ainvoke(prompt)
        rewritten = response.content.strip()
        print(f"NexusAI Rewriter: '{original_query}' -> '{rewritten}'")
        return {"query": rewritten, "original_query": original_query}
    except Exception as e:
        print(f"Query rewriting failed: {e}")
        return {"query": original_query, "original_query": original_query}
```

---

### Phase 6.5: User Authentication & Security Isolation (JWT & Bcrypt)

**1. Hashing & Token Generation:**
User registrations hash password credentials securely using `bcrypt` (with 12 salt rounds) in the `users` database collection. On validation, the `/api/auth/login` endpoint returns a signed JSON Web Token (JWT) representing the user identity (`sub` claim) signed with a secure secret key, defaulting to 24-hour expiration.

**2. Route Guarding & Verification:**
FastAPI utilizes Python's dependency injection (`Depends`) to extract the Bearer token from the incoming Request request header and resolve the authenticated user in MongoDB. All sessions, documents, query operations, and indices are partitioned by the authenticated `username`.

```python
# Inside backend/services/auth.py
async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())
) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is not available"
        )
        
    user = await db.users.find_one({"username": username})
    if user is None:
        raise credentials_exception
        
    user["_id"] = str(user["_id"])
    return user
```

**3. Frontend Persistence & Interceptor Wrapper:**
The React frontend caches the active authentication token in `localStorage`. All resource requests utilize an `apiFetch` helper function that automatically injects the token into headers. If an API request returns `401 Unauthorized`, the client session is cleared and the user is redirected to the login UI gate.

```javascript
// Inside frontend/src/App.jsx
const apiFetch = async (path, options = {}) => {
  const url = `http://localhost:8000${path}`;
  const headers = options.headers || {};
  const storedToken = localStorage.getItem('nexusai_token');
  
  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }
  
  const newOptions = {
    ...options,
    headers
  };
  
  try {
    const res = await fetch(url, newOptions);
    if (res.status === 401) {
      localStorage.removeItem('nexusai_token');
      localStorage.removeItem('nexusai_username');
      setToken(null);
      setCurrentUser(null);
      setSessions([]);
      setCurrentSession('default');
      setMessages([]);
      setFiles([]);
      setStatus('idle');
      setResponse(null);
      throw new Error("Session expired. Please log in again.");
    }
    return res;
  } catch (err) {
    console.error(`API Fetch Error on ${path}:`, err);
    throw err;
  }
};
```

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
- Phase 6: Conversational Memory & Session Management (Completed) *(Note: Session folder expiry date logic to be implemented later)*
- Phase 6.5: User Authentication & Security Isolation (Completed)
- Phase 7: Reliability & Control Layer (Current)
- Phase 8: Tool Calling Layer
- Phase 9: Evaluation Layer
- Phase 10: Production Engineering

