# NexusAI — Self-Correcting Multi-Agent Research Intelligence Platform

NexusAI is a production-grade Agentic AI platform focused on Hybrid RAG, Multi-Agent Orchestration, Reliability, Traceability, Evaluation, Validation, Deterministic Control Policies, Observability, Context Memory, Self-Correction, Tool Calling, and Graph Runtime Engineering.

## Architecture

The system evolves progressively, currently standing at **Phase 8: Robust Tool Calling Layer & System Hardening**.

**High-Level Architecture (Target):**
User -> Frontend UI -> FastAPI Backend -> LangGraph State Machine -> Supervisor/Orchestrator Agent -> Specialized Agents -> Hybrid Retrieval Layer -> Validation + Reliability Layer -> Control Layer -> Memory Layer -> Evaluation Layer -> Final Response Generator

## Tech Stack
- **Frontend:** React (Vite) with Custom Stateful Markdown Block Parser (Zero Dependency)
- **Backend:** FastAPI (Python)
- **Vector DB:** FAISS (session-scoped per chat)
- **Keyword Index:** BM25 (`rank_bm25`) — rebuilt on every upload
- **Embeddings:** HuggingFace `all-MiniLM-L6-v2` (Local/Offline, singleton-cached)
- **LLM:** Google Gemini 2.5 Flash (`gemini-2.5-flash`)
- **Fallback LLMs:** Groq `llama-3.1-8b-instant` (routing) & `llama-3.3-70b-versatile` (generation + tool-calling)
- **Orchestration:** LangGraph (Conditional State Machine Router)
- **Observability:** LangSmith (Latencies & Execution Tracing)
- **Rate Limiting:** `slowapi`
- **Session GC:** Async background loop (12-hour sweep, 7-day TTL)

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
   MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/nexusai
   JWT_SECRET=your_jwt_secret_key_here
   JWT_ALGORITHM=HS256

   # Optional — enables Groq fallback for Gemini outages/rate limits
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_API_KEY2=your_secondary_groq_api_key_here

   # Optional — enables LangSmith observability tracing
   LANGCHAIN_TRACING_V2=true
   LANGCHAIN_API_KEY=your_langsmith_api_key_here
   LANGCHAIN_PROJECT=nexusai
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
When the `/api/query` endpoint is hit, the `AgentOrchestrator` uses a highly-prompted Router LLM (Gemini 2.5 Flash, falling back to Llama 3.1 8B via Groq if Gemini fails) to classify the query into one of three routes:
- `simple_rag` — single document, single-source fact retrieval.
- `compare_rag` — cross-document comparison or synthesis across multiple files.
- `tool_calling` — real-time web search, math calculations, or hybrid agent-RAG tasks.

```python
# Inside backend/services/agent_orchestrator.py
def route_intent(self, state: AgentState) -> Dict:
    decision = self.router_llm.invoke(prompt)
    route = decision.route if decision.route in ["simple_rag", "compare_rag", "tool_calling"] else "simple_rag"
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

### Phase 7: Reliability & Control Layer (Guardrails, Rate Limiting & Self-Correction)

This phase upgrades NexusAI from a standard RAG system to a resilient, self-correcting, and secure production service.

**1. Self-Correcting RAG Loop (Pillar 1):**
We restructured the LangGraph state machine into a self-correcting loop. A `document_grader` node evaluates if the retrieved chunks are relevant to the query *before* generating an answer. If irrelevant, it increments a retry counter and routes back to the query rewriter to try a different search phrasing. This loops up to a maximum of 2 retries, significantly reducing hallucinations.

**2. Scope Guardrails (Pillar 2):**
To prevent the AI from answering general knowledge questions unrelated to the uploaded documents, we introduced an `input_guardrail` node. It classifies the intent and short-circuits execution to a graceful block message ("I can only answer questions related to our uploaded documents.") if the user wanders out of scope. In Phase 8, the state machine sequence was updated: the query rewriter runs first to resolve the coreference context from history, and then the input guardrail evaluates the contextualized query. If valid, the system proceeds to intent classification and execution.

**3. Rate Limiting (Pillar 3):**
Integrated `slowapi` to protect backend endpoints from brute-force attacks and abuse. Authentication endpoints are throttled to 10 requests/minute, while querying and uploads are throttled to 30 requests/minute.

**4. Structured Data Validation (Pillar 4):**
Enhanced all evaluation LLM calls (Guardrail, Router, Grader) by using LangChain's `with_structured_output`, strictly enforcing output conformity to predefined Pydantic schemas.

**5. Multi-Tier API Fallbacks & Load Balancing (Pillar 5):**
Constructed a highly resilient API layer that cascades through LLMs during outages or rate-limiting (HTTP 429) events. If the primary Gemini model fails (e.g. max tokens per minute exceeded), the system dynamically traps the exception in real-time and reroutes the query and context payload to a fallback Groq instance (`llama-3.1-8b` / `llama-3.3-70b`). To act as a load balancer and guarantee uptime, it supports an additional `GROQ_API_KEY2` as a secondary fallback layer. The system dynamically truncates chat history to prevent Context Window overflow crashes on smaller fallback models.

**Full State Machine Architecture Graph (Phase 8):**
```mermaid
graph TD
    START((START)) --> rewrite_query
    rewrite_query --> input_guardrail

    input_guardrail -- valid --> route_intent
    input_guardrail -- invalid --> execute_guardrail_block
    execute_guardrail_block --> END((END))

    route_intent -- simple_rag / compare_rag --> retrieve_documents
    route_intent -- tool_calling --> execute_tool_calling_agent

    retrieve_documents --> document_grader
    document_grader -- relevant_simple --> execute_simple_rag
    document_grader -- relevant_compare --> execute_compare_rag
    document_grader -- tool_calling --> execute_tool_calling_agent
    document_grader -- retry --> rewrite_query

    execute_simple_rag --> END
    execute_compare_rag --> END
    execute_tool_calling_agent --> END
```

*Alternatively, view the visual workflow diagram:*

![NexusAI State Machine Workflow](./frontend/src/assets/workflow.png)

**Guardrail Node Snippet:**
```python
def input_guardrail(self, state: AgentState) -> Dict:
    prompt = (
        "You are a strict security guard... Return True if it is related to documents, math, web searches... False if general knowledge..."
        f"Query: {state['query']}"
    )
    decision = self.guardrail_llm.invoke(prompt)
    if not decision.is_valid:
        return {"route": "guardrail_block"}
    return {}
```

---

### Phase 8: Robust Tool Calling Layer & System Hardening

This phase transforms NexusAI from a resilient RAG system into a **production-grade agentic platform** with parallel tool execution, strict security hardening, and zero-overhead embedding caching.

**1. Parallel Tool Execution (Pillar 1):**
The `execute_tool_calling_agent` node now dispatches all tool calls requested by the LLM in a **single agent turn** concurrently, using `asyncio.gather`. Instead of running three tools sequentially (3× latency), they all fire simultaneously and resolve in the time of the slowest single tool call. Each tool failure is isolated — an error in one tool is returned as a plain-text ToolMessage, allowing the LLM to self-correct without crashing the loop.

```python
# Inside backend/services/agent_orchestrator.py
outputs = await asyncio.gather(*tasks)
for (tool_name, tool_args, tool_id), tool_output in zip(tool_calls_info, outputs):
    messages.append(ToolMessage(content=str(tool_output), tool_call_id=tool_id))
```

**2. Groq Fallback for Tool Calling (Pillar 2):**
Tools are bound to both the primary Gemini model and all configured Groq fallback models (`llama-3.3-70b-versatile`). If Gemini fails during the tool-calling loop (rate-limit 429 or network outage), the request is automatically rerouted to the fallback tool caller without interrupting the agent loop.

```python
# Inside backend/services/agent_orchestrator.py
gemini_with_tools = self.generation_llm.bind_tools(self.tools)
fallback_tool_callers = [groq_gen.bind_tools(self.tools) for groq_gen in self.groq_generators]
llm_with_tools = gemini_with_tools.with_fallbacks(fallback_tool_callers)
```

**3. New Tool — `knowledge_base_search` (Pillar 3):**
A session-scoped `knowledge_base_search` tool is dynamically created via a factory function and injected into the agent's tool belt. This lets the tool-calling agent query the local FAISS + BM25 vector store for context *while simultaneously* running a web search or calculation — enabling hybrid agent-RAG workflows in a single step.

```python
# Inside backend/services/tools.py
def create_knowledge_base_search_tool(query_processor):
    @tool
    def knowledge_base_search(query: str) -> str:
        """Searches the local knowledge base (uploaded documents) for relevant information."""
        docs = query_processor.retrieve_documents(query, k=5)
        return query_processor.format_context(docs) if docs else "No relevant information found."
    return knowledge_base_search
```

**4. HuggingFace Embeddings Singleton (Pillar 4):**
A new `EmbeddingsManager` service lazy-loads the `all-MiniLM-L6-v2` model into a **process-level singleton** on first use. Every `DocumentProcessor` and `QueryProcessor` instance now shares the exact same in-memory model weights, eliminating the ~1.5 second PyTorch load penalty on every request.

```python
# Inside backend/services/embeddings_manager.py
class EmbeddingsManager:
    _instance = None
    @classmethod
    def get_embeddings(cls) -> HuggingFaceEmbeddings:
        if cls._instance is None:
            cls._instance = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        return cls._instance
```

**5. Session ID Hardening & Path Traversal Prevention (Pillar 5):**
All `session_id` values are validated against the strict regex `^[a-zA-Z0-9_]{3,50}$` at three enforcement points: `DocumentProcessor.__init__`, `QueryProcessor.__init__`, and a new `validate_session_id()` FastAPI helper invoked on every session-scoped endpoint. Any path traversal attempt (e.g. `../admin`, `chat/../../etc`) is immediately rejected with HTTP 400.

```python
# Inside backend/main.py
def validate_session_id(session_id: str):
    if not re.match(r"^[a-zA-Z0-9_]{3,50}$", session_id):
        raise HTTPException(status_code=400, detail=f"Invalid session ID format: {session_id}")
```

**6. Automatic Session Garbage Collection (Pillar 6):**
A FastAPI lifespan background task fires every **12 hours** to sweep `storage/sessions/`. It deletes any directory that is either older than **7 days** (expired) or does not appear in the MongoDB `sessions` collection (orphaned). The `default` directory is always exempt.

```python
# Inside backend/main.py
async def session_garbage_collection_loop(app_db):
    while True:
        # Scan storage/sessions/, delete expired (>7d) and orphaned dirs
        await asyncio.sleep(43200)  # 12 hours
```

**7. XSS Link Sanitization in Markdown Renderer (Pillar 7):**
The `parseInlineMarkdown` function in the React frontend now validates every hyperlink's protocol before rendering. Only `http://`, `https://`, `mailto:`, `tel:`, `file://`, and relative paths are allowed. Any URL starting with `javascript:`, `vbscript:`, `data:`, or any other unlisted scheme is rendered as a disabled strikethrough `<span>` with a tooltip, blocking XSS injection via AI-generated Markdown.

```javascript
// Inside frontend/src/App.jsx
if (isSafe && !/^\s*javascript:/i.test(url)) {
  return <a href={url} target="_blank" rel="noopener noreferrer">...</a>;
} else {
  return <span style={{ textDecoration: 'line-through', opacity: 0.6 }} title="Blocked unsafe link">...</span>;
}
```

**8. Session Race Condition Fix (Pillar 8):**
The `handleUploadClick` function in `App.jsx` was refactored from a synchronous fire-and-forget call into a fully `async/await` chain. The file picker dialog is only opened *after* the server confirms session creation, preventing the file upload from targeting a stale or non-existent `session_id`.

```javascript
// Inside frontend/src/App.jsx
const handleUploadClick = async () => {
  if (currentSession === 'default') {
    const newSessionId = await handleNewChat(); // await session creation first
    if (!newSessionId) { alert("Failed to initialize a new session."); return; }
  }
  fileInputRef.current.click(); // open picker only after session confirmed
};
```

**9. Progressive Rewrite Degradation Fix (Pillar 9):**
The `rewrite_query` node now reads from `state.get("original_query")` rather than `state["query"]` for every retry iteration. This prevents the self-correction loop from re-reformulating an already-reformulated query, which caused increasingly abstract and context-stripped search strings on successive retries.

**10. Active Tool Pulse UX & Glow Core (Pillar 10):**
We upgraded the pulsing indicator in the frontend UI to ensure it is highly visible during fast executions. A modern, high-contrast double-ring emerald green glowing animation is used. Additionally, we implemented a minimum display duration of `1500ms` using React refs and timeouts to prevent quick concurrent tool executions from flashing too fast to be visible.

**11. Stateful Grounding Citation Popovers (Pillar 11):**
We refactored the inline markdown parser to replace default browser title tooltips with stateful custom React components (`InlineSourceBadge`). It resolves citation keys (filenames, web query terms, math expressions) to original chunk content (`findSourceChunk`) and displays hoverable glassmorphic popovers detailing exact context groundings.

**12. Parallel Tool Log Aggregation Race Fix (Pillar 12):**
To aggregate concurrent tool executions without losing logs, we swapped the singular `pendingToolEntry` state with a mapping dictionary (`pendingToolsMap`) to safely aggregate concurrent tool starts and completions in parallel `asyncio.gather` tool calling executions without losing logs.

- **[Pillar 13] Coreference Context Guardrail Routing Fix:** We rearranged the LangGraph edges to run query reformulation (`rewrite_query`) before safety classification (`input_guardrail`). This ensures that follow-up context-dependent queries (e.g. "Give me a brief description") are rewritten using conversation history before the guardrail node classifies them, eliminating false-positive guardrail blocks.
- **[Pillar 14] Dynamic Tool Execution Log Reconstruction:** We implemented `getToolLogEntries` inside `App.jsx` to dynamically parse message sources on loading chat history from MongoDB, rendering historical tool execution logs identically to active live queries.
- **[Pillar 15] Router Keyword Override:** We added a deterministic keyword override check in `route_intent` (for terms like "latest", "current", "calculate", "web search") to instantly route search-oriented and time-sensitive queries to the tool-calling agent.
- **[Pillar 16] Robust Exception Fallback Handling:** We configured `exceptions_to_handle=[Exception]` in all LLM fallback chains to intercept Gemini rate-limit (429) exceptions correctly, triggering zero-delay failover to Groq, and defensively wrapped tool calling executions to handle all-model failures gracefully.
- **[Pillar 17] Grounded Paragraph Citation Format:** We relaxed prompt constraints in RAG execution nodes to support block-level/paragraph-level citations, eliminating overly brief or truncated model responses.

**Tool Calling Agent Loop Flow:**
```
User Query
    │
    ▼
rewrite_query    ──► (if history: condense to standalone query)
    │
    ▼
input_guardrail  ──► (block off-topic queries)
    │
    ▼
route_intent     ──► classified as 'tool_calling'
    │
    ▼
execute_tool_calling_agent
    │
    ├── SystemMessage (instructions + tool descriptions)
    ├── HumanMessage  (user query)
    │
    ▼
  LLM with tools bound (Gemini → Groq fallback)
    │
    ├── Response has tool_calls?
    │       YES ──► Dispatch all tools concurrently (asyncio.gather)
    │               ├── safe_calculator(expr)         ──► math result
    │               ├── web_search(query)             ──► live web snippets
    │               └── knowledge_base_search(query)  ──► local FAISS+BM25 docs
    │               Each error is caught per-tool and returned as ToolMessage
    │               Loop continues (max 5 iterations)
    │
    └── Response has NO tool_calls?
            ──► Synthesis prompt injected
            ──► Final answer streamed to frontend via SSE
```

---

## Folder Structure
```
NexusAI/
├── backend/
│   ├── main.py                          # FastAPI app, endpoints, lifespan GC, session validation
│   ├── requirements.txt                 # Python dependencies
│   ├── .env                             # Environment variables (not committed)
│   ├── test_prod_tooling.py             # Phase 8 automated test suite
│   └── services/
│       ├── __init__.py
│       ├── auth.py                      # JWT auth, bcrypt hashing, FastAPI dependency
│       ├── embeddings_manager.py        # HuggingFace embeddings singleton (Phase 8)
│       ├── document_processor.py        # PDF/MD/TXT ingestion → FAISS + BM25 indexing
│       ├── query_processor.py           # Hybrid retrieval (EnsembleRetriever) + LLM generation
│       ├── tools.py                     # safe_calculator, web_search, knowledge_base_search
│       └── agent_orchestrator.py        # LangGraph state machine + tool-calling agent loop
├── frontend/
│   ├── src/
│   │   ├── App.jsx                      # React UI, markdown parser, SSE reader, XSS sanitizer
│   │   └── index.css                    # Glassmorphism design system
│   └── package.json
├── storage/
│   └── sessions/
│       └── {session_id}/                # Per-session FAISS + BM25 + lock files
├── README.md                            # Project documentation
└── steps.md                             # Engineering log and progress tracker
```

## Future Roadmap
- Phase 1: Project Foundation (Completed)
- Phase 2: Basic Offline RAG Pipeline (Completed)
- Phase 3 & 3.5: Hybrid RAG & Ingestion Performance (Completed)
- Phase 4: Observability & Tracing via LangSmith (Completed)
- Phase 5: Agentic Routing via LangGraph (Completed)
- Phase 6: Conversational Memory & Session Management (Completed)
- Phase 6.5: User Authentication & Security Isolation (Completed)
- Phase 7: Reliability & Control Layer (Completed)
- Phase 8: Robust Tool Calling Layer & System Hardening (Completed)
- Phase 9: Evaluation Layer (Upcoming)
- Phase 10: Production Engineering

