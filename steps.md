# Engineering Log & Progress Tracker

## Current Project State
- **Phase 9: Evaluation Layer** is completed.
- **Phases 1–7** (Foundation → RAG → Hybrid RAG → Observability → Agentic Routing → Conversational Memory → Auth → Reliability) are all completed.
- The fundamental directory structure (`backend/` and `frontend/`) has been initialized.
- `README.md` and `steps.md` are actively maintained.
- FastAPI backend configured with session-scoped endpoints, JWT auth, rate limiting, session GC, and parallel tool calling.
- React frontend (Vite) features a premium two-column chat UI with async upload race-condition fix and XSS-safe Markdown rendering.

## What Was Implemented
- Created project foundation documentation.
- Defined project roadmap and high-level architecture.
- Initialized Python virtual environment and installed `fastapi`, `uvicorn`, `python-multipart`, and `python-dotenv`.
- Created `main.py` with FastAPI setup.
- Scaffolding of React frontend via `create-vite`.
- Designed professional `App.jsx` and `index.css` reflecting a serious AI platform aesthetic.
- **Phase 2:** Added offline RAG dependencies (`langchain`, `faiss-cpu`, `langchain-huggingface`, `pypdf`) and implemented `DocumentProcessor` service.
- Wired the `/api/upload` endpoint to parse PDFs, chunk text using `RecursiveCharacterTextSplitter`, and index it using HuggingFace embeddings (`all-MiniLM-L6-v2`) into a local FAISS vector store.
- Implemented `QueryProcessor` utilizing Google Gemini (`gemini-2.5-flash`) via `langchain-google-genai` to generate highly reliable, grounded answers from FAISS retrieved chunks.
- Created `/api/query` POST endpoint utilizing Pydantic schemas (`QueryRequest`) to enforce data structures.
- **Phase 3:** Refactored UI and backend endpoints to support batch multi-file uploads for document comparison.
- Added `/api/clear` endpoint to wipe knowledge base for fresh sessions.
- Injected strict filename metadata into chunk indexing for precise traceability.
- Integrated `rank_bm25` to build a local keyword statistical index alongside FAISS.
- Refactored `QueryProcessor` to use an `EnsembleRetriever` (FAISS 60%, BM25 40%), effectively merging semantic and keyword search, expanding the retrieval limit to 10 chunks to avoid multi-doc comparison blindness.
- **Phase 3.5:** Replaced `pypdf` with `pymupdf` for high-speed, robust document extraction.
- Refactored `main.py` to process uploads asynchronously via FastAPI `BackgroundTasks`, returning a `job_id` to prevent browser timeouts.
- Upgraded the React frontend (`App.jsx`) to continuously poll the `job_id` status and display real-time async processing updates.
- Overhauled the `/api/query` endpoint to yield `StreamingResponse` via Server-Sent Events (SSE).
- Upgraded the React chat UI to decode the `ReadableStream` dynamically, creating a word-by-word typing effect directly from Gemini's generative chain.
- **Phase 4:** Integrated LangSmith for enterprise-grade observability.
- Added `@traceable` decorators to Python backend functions to generate granular execution latency dashboards.
- **Phase 5:** Integrated LangGraph for Agentic Routing.
- Implemented state-machine routing (`AgentOrchestrator`) utilizing structured Pydantic classifications to steer query executions into specialized single-document RAG vs. multi-document comparison paths.
- **Bug Fix (Startup Error):** Resolved a server startup crash (`ImportError` on `EnsembleRetriever` from `langchain_community.retrievers`) by introducing a robust, version-agnostic import block (falling back from `langchain.retrievers` -> `langchain_classic.retrievers` -> `langchain_community.retrievers`) ensuring immediate compatibility with modern LangChain structures.
- **UI/UX & Routing Stream Overhaul:**
  - Upgraded the React chat UI with a custom stateful block-Markdown parser (`MarkdownRenderer`) that parses line-by-line rather than splitting blindly, enabling proper formatting of headers, paragraphs, nested bullet lists (tracking 2/4-space indent levels), code blocks, blockquotes, and comparison tables.
  - Upgraded `index.css` with premium CSS styles for headers, lists, code panels, and comparison tables using modern typography, glassmorphism, responsive alignment, and sleek neon accents.
  - Fixed the metadata display inconsistency where non-PDF documents (Markdown and Text files) showed broken `(Page ?)` markers by implementing a robust numeric page validation check in `App.jsx` that hides the page count completely when it is missing or invalid.
  - Reinforced routing token containment within `backend/main.py` by filtering the LangGraph stream strictly on the `"generator"` event tag to drop router classification chunks (such as `{"route": "compare_rag"}`) in real time, preventing them from leaking into the user's UI.
- **Phase 6 (Completed):** Integrated Conversational Memory & Session Management.
- Integrated MongoDB using `motor` to persistently store chat history and session metadata.
- Implemented multi-tenant session isolation, dynamically routing FAISS vector DBs and BM25 `.pkl` files to `storage/sessions/<session_id>/` to prevent cross-contamination between different chat threads.
- Built a query condensation/rewriter node into the LangGraph state machine. It retrieves the master prompt and the last 5 turns of conversation to rewrite follow-up queries, preserving context while avoiding forced comparisons during entity shifts (e.g. asking "Google?").
- Refactored the React frontend to feature a premium two-column layout with a dynamic sidebar for switching, creating, and deleting persistent chat sessions.
- Suppressed benign Python 3.13 aiohttp RuntimeWarnings (`ClientResponse.json was never awaited`) to keep terminal logs clean.
- **Phase 6.5 (Completed):** User Authentication (Login / Logout).
- Implemented custom JWT-based authentication in FastAPI utilizing the existing MongoDB Atlas setup for credential storage.
- Created `backend/services/auth.py` with password hashing (bcrypt), JWT creation/validation, and FastAPI dependencies.
- Secured backend routes (`/api/sessions`, `/api/upload`, `/api/query`, `/api/clear`) with user ownership checks, mapping queries, files, and indices strictly to the authenticated `username`.
- Designed a premium glassmorphic React Login/Signup UI gate in `App.jsx` using vanilla CSS, utilizing `localStorage` to persist access tokens.
- Wrapped all API calls in an authenticated helper `apiFetch` that handles header token injection and automatic 401 redirect behavior.
- Added user profile info status footer and a secure Logout button in the sidebar.
- Created and executed a backend integration test `test_auth.py` validating registration, duplicate checks, login failures, credential validation, session retrieval, and automated database cleanup.
- **Phase 7 (Completed):** Integrated Reliability & Control Layer.
- Engineered a self-correcting RAG loop using LangGraph, incorporating a `document_grader` node that autonomously evaluates context relevance and forces query rewrites and re-retrieval (up to 2 retries) if hallucination risks are detected.
- Added strict Scope Guardrails via an `input_guardrail` node to classify intents and block general knowledge questions (e.g. "What is the capital of France?"), answering gracefully with "I can only answer questions related to our uploaded documents."
- Implemented API Rate Limiting using `slowapi` on `/api/auth`, `/api/upload`, and `/api/query` endpoints to prevent abuse and brute-force attacks.
- Enhanced all evaluation LLM calls (Guardrail, Router, Grader) with `with_structured_output` for rigorous Pydantic schema enforcement.
- Engineered a robust Multi-Tier Fallback Loop for all components (Rewriter, Graders, RAG Generators). If Gemini hits a Rate Limit (429), it instantly degrades to Groq `llama-3.1-8b` / `llama-3.3-70b` models.
- Integrated a secondary API key, `GROQ_API_KEY2`, acting as a final load balancer. If the primary Groq fallback fails due to limits, the system dynamically reroutes traffic to the secondary fallback without dropping the user's request.
- Removed LangChain's internal default exponential backoff retries (`max_retries=0`) across all LLMs to guarantee immediate, zero-delay failovers during outages.
- Implemented intelligent Context Truncation in backend chat history aggregation, safeguarding fallback LLMs against maximum context length crashes (Error 400).
- **Phase 8 (Completed):** Robust Tool Calling Layer & System Hardening.
- **[Pillar 1] Parallel Tool Execution:** Refactored `execute_tool_calling_agent` to collect all tool calls from a single LLM turn into a `tasks` list and execute them concurrently with `asyncio.gather`. Per-tool error handling returns failures as `ToolMessage` content rather than raising exceptions, so the agent loop self-corrects without crashing.
- **[Pillar 2] Groq Tool-Calling Fallback:** Tools are bound to both the primary Gemini model and all configured Groq fallback LLMs (`llama-3.3-70b-versatile`). If Gemini fails during the agentic loop, the system transparently falls over to the Groq tool caller via LangChain's `.with_fallbacks()` chain.
- **[Pillar 3] `knowledge_base_search` Tool:** Added a session-scoped `knowledge_base_search` tool built via a factory function in `tools.py`. This gives the agentic tool caller direct access to the local FAISS+BM25 knowledge base alongside external tools, enabling fully hybrid agent-RAG workflows in a single agent turn.
- **[Pillar 4] HuggingFace Embeddings Singleton:** Created `backend/services/embeddings_manager.py` with a class-level `_instance` cache. All `DocumentProcessor` and `QueryProcessor` instances now share the exact same `HuggingFaceEmbeddings` object in memory, eliminating the ~1.5s PyTorch model load on every request.
- **[Pillar 5] Session ID Path Traversal Prevention:** Enforced strict regex validation (`^[a-zA-Z0-9_]{3,50}$`) on `session_id` at three layers: inside `DocumentProcessor.__init__`, `QueryProcessor.__init__`, and a new `validate_session_id()` FastAPI helper called on every session-scoped endpoint. Invalid or traversal-containing IDs return HTTP 400 immediately.
- **[Pillar 6] Automatic Session Garbage Collection:** Registered an `asyncio`-based background task in the FastAPI lifespan context manager. The `session_garbage_collection_loop` runs every 12 hours and deletes any `storage/sessions/` directory that is either older than 7 days (expired TTL) or not present in the MongoDB sessions collection (orphaned). The `default` directory is exempt.
- **[Pillar 7] XSS Link Sanitization:** The `parseInlineMarkdown` helper in `App.jsx` now validates each Markdown link URL against an explicit protocol allowlist (`http://`, `https://`, `mailto:`, `tel:`, `file://`, relative paths). Any URL matching `javascript:`, `vbscript:`, `data:`, or any other scheme is rendered as a disabled, strikethrough `<span>` with a blocked tooltip, eliminating AI-generated XSS vectors.
- **[Pillar 8] Session Race Condition Fix:** Converted `handleUploadClick` in `App.jsx` from a synchronous call to a fully `async/await` function. The hidden file input is only `.click()`-ed after the backend confirms session creation, preventing uploads from targeting a non-existent `session_id`.
- **[Pillar 9] Progressive Query Rewrite Degradation Fix:** The `rewrite_query` state node now reads `state.get("original_query")` (set once on first entry) rather than the mutable `state["query"]`. This prevents the self-correction retry loop from re-reformulating an already-reformulated query, which previously caused progressive context stripping over successive retries.
- **[Pillar 10] Active Tool Pulse UX & Glow Core:** Upgraded the pulsing indicator with a modern, high-contrast double-ring emerald glowing animation, and implemented a minimum display duration of `1500ms` using React refs and timeouts to prevent quick concurrent tool executions from flashing too fast to be visible.
- **[Pillar 11] Stateful Grounding Citation Popovers:** Refactored the inline markdown parser to replace default browser title tooltips with stateful custom React components (`InlineSourceBadge`). It resolves citation keys (filenames, web query terms, math expressions) to original chunk content (`findSourceChunk`) and displays hoverable glassmorphic popovers detailing exact context groundings.
- **[Pillar 12] Parallel Tool Log Aggregation Race Fix:** Swapped the singular `pendingToolEntry` state with a mapping dictionary (`pendingToolsMap`) to safely aggregate concurrent tool starts and completions in parallel `asyncio.gather` tool calling executions without losing logs.
- **[Pillar 13] Coreference Context Guardrail Routing Fix:** Rearranged the LangGraph edges to run query reformulation (`rewrite_query`) before safety classification (`input_guardrail`). This ensures that follow-up context-dependent queries (e.g. "Give me a brief description") are rewritten using conversation history before the guardrail node classifies them, eliminating false-positive guardrail blocks.
- **[Pillar 14] Dynamic Tool Execution Log Reconstruction:** Implemented `getToolLogEntries` inside `App.jsx` to dynamically parse message sources on loading chat history from MongoDB, rendering historical tool execution logs identically to active live queries.
- **[Pillar 15] Router Keyword Override:** Added a deterministic keyword override check in `route_intent` (for terms like "latest", "current", "calculate", "web search") to instantly route search-oriented and time-sensitive queries to the tool-calling agent.
- **[Pillar 16] Robust Exception Fallback Handling:** Configured `exceptions_to_handle=[Exception]` in all LLM fallback chains to intercept Gemini rate-limit (429) exceptions correctly, triggering zero-delay failover to Groq, and defensively wrapped tool calling executions to handle all-model failures gracefully.
- **[Pillar 17] Grounded Paragraph Citation Format:** Relaxed prompt constraints in RAG execution nodes to support block-level/paragraph-level citations, eliminating overly brief or truncated model responses.
- **Phase 9:** Integrated RAGAS Evaluation Layer.
  - Coded `backend/eval/run_eval.py` to automate evaluations using the RAGAS framework (`ragas-0.4.3`) to calculate Faithfulness, Answer Relevancy, and Context Recall.
  - Populated a golden test set in `backend/eval/test_set.json` with 12 high-complexity evaluation scenarios (including out-of-scope, mathematical, and multi-file comparisons).
  - Built a 4-key resilient fallback LLM pool (2 Groq keys + 2 OpenRouter keys) using **Gemini 2.5 Flash Free (`google/gemini-2.5-flash:free`)** on OpenRouter to natively support structured schemas and tool-calling at zero cost.
  - Wrapped structured output fallbacks (`RouterDecision`, `GuardrailDecision`, `GraderDecision`) individually to preserve Pydantic schema validation across rate-limiting outages.
  - Linked `groq_generators` to include all key fallbacks so that the tool-calling agent dynamically cascades across keys during tool executions.
  - Bound the evaluation metrics to the HuggingFace embeddings singleton (`EmbeddingsManager.get_embeddings()`) to offload embedding math locally.
  - Coded a dynamic FAISS & BM25 database cloner inside `run_eval.py` to copy active ingestion session data into the evaluation session environment.
  - Exposed an authenticated, rate-limited FastAPI POST endpoint (`/api/eval/run`) to execute evaluations in a non-blocking background subprocess.
  - Generated premium local Markdown reports under `backend/eval/reports/` and enabled real-time traces inside LangSmith.
- **Phase 9.5 (Completed):** E2E Verification & Bug Fixing.
  - Ran full end-to-end manual verification validating: parallel tool calling logs, dynamic log reconstruction from history, rate-limiting failovers, XSS hyperlink blocking, and coreference-routing sequences.
  - Resolved RAGAS uppercase Metric class and lowercase module import conflicts, initializing metric objects with LLM and embedding runners explicitly.
  - Transitioned to next steps.

## Pending Tasks
- [x] Transition to Phase 6 (Conversational Memory & Session Management).
- [x] Transition to Phase 7 (Reliability & Control Layer).
- [x] Transition to Phase 8 (Robust Tool Calling Layer & System Hardening).
- [x] Run full end-to-end manual verification: parallel tool calls, XSS link injection, upload race condition.
- [x] Transition to Phase 9 (Evaluation Layer).
- [ ] Final Testing and Project Wrap-up.

## Current Limitations
- The evaluation loop operates as an offline pipeline task; in the future, we can run real-time evaluations inline during active chats.
- The tool-calling agent's synthesis step does not yet stream tokens; it falls back to a non-streaming invocation if the final streaming call fails.
- `upload_jobs` is an in-memory dictionary; it will not survive server restarts. A Redis/DB-backed job store is needed for production.

## Next Milestone
- Phase 10: Production Engineering — optimize backend memory consumption, finalize production clustering, and conduct full load-testing.

## Changed Files
- `README.md`
- `steps.md`
- `backend/requirements.txt`
- `backend/.env`
- `backend/main.py`
- `backend/services/__init__.py`
- `backend/services/document_processor.py`
- `backend/services/query_processor.py`
- `backend/services/auth.py`
- `backend/services/agent_orchestrator.py`
- `backend/services/tools.py`
- `backend/services/embeddings_manager.py` *(new — Phase 8)*
- `backend/test_prod_tooling.py` *(new — Phase 8)*
- `backend/eval/run_eval.py` *(new — Phase 9)*
- `backend/eval/test_set.json` *(new — Phase 9)*
- `backend/eval/generate_synthetic_set.py` *(new — Phase 9)*
- `frontend/src/index.css`
- `frontend/src/App.jsx`

## Important Design Decisions
- Adopted a modular structure from the start, separating frontend and backend to facilitate distinct scaling and development of the FastAPI and React applications.
- Built a premium UI with glassmorphism out of the gate to signal the "serious production-style" intent.
- Selected `HuggingFaceEmbeddings` with `all-MiniLM-L6-v2` for the initial embedding model to ensure the system can run offline, fast, and completely free without cloud API limits.
- Selected **Google Gemini 2.5 Flash** (`gemini-2.5-flash`) via `langchain-google-genai` for the generation layer to leverage its massive context, cost-effectiveness, and speed, replacing the initial mock/OpenAI plans.
- Moved RAG logic into dedicated `DocumentProcessor` and `QueryProcessor` classes in `backend/services/` to keep `main.py` clean, adhering to solid engineering practices.
- **Phase 3 Design Choice:** Rebuilt the BM25 statistical model on every multi-file upload instead of trying to patch an existing index, favoring reliability and math correctness.
- Increased retrieval chunk limit to `k=10` to guarantee cross-document context is retrieved during multi-doc comparison, fully utilizing Gemini's massive 1M context window without risking overflow.
- **Phase 8 Design Choice — Embeddings Singleton over DI:** A class-level singleton was chosen over FastAPI's `Depends`-based dependency injection for embeddings because it needs to be shared across background tasks (non-request contexts), not just route handlers. The singleton pattern guarantees a single PyTorch model load regardless of how many non-async background workers are active.
- **Phase 8 Design Choice — Per-Tool Error Isolation:** Rather than catching a tool-level exception and aborting the entire agent loop, errors are stringified and returned as `ToolMessage` content. This allows the LLM to reason about the failure and either retry with a corrected input or pivot to another tool, making the agent significantly more robust under transient failures.
- **Phase 8 Design Choice — Factory Function for Session-Scoped Tool:** The `knowledge_base_search` tool must carry a reference to the session's `QueryProcessor`. Wrapping it in a factory (`create_knowledge_base_search_tool`) creates a new closure per `AgentOrchestrator` instance without polluting the global tool registry, ensuring strict session isolation.
- **Phase 8 Design Choice — GC via Lifespan Background Task:** The session GC loop is launched as an `asyncio.create_task` inside FastAPI's `asynccontextmanager` lifespan, rather than a cron job or OS scheduler. This keeps the cleanup logic inside the application process with access to the MongoDB client, supports graceful cancellation on shutdown, and requires zero external infrastructure.
