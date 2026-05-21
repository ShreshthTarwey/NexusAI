# Engineering Log & Progress Tracker

## Current Project State
- Transitioned to **Phase 6: Conversational Memory & Session Management**.
- **Phase 5: Agentic Routing** is completed.
- **Phase 1, 2, 3, 3.5 & 4** are completed.
- The fundamental directory structure (`backend/` and `frontend/`) has been initialized.
- `README.md` and `steps.md` are actively maintained.
- FastAPI backend configured with an initial file upload API endpoint (`/api/upload`) and CORS.
- React frontend (Vite) set up with a dark-mode, glassmorphism UI indicating the project's identity as a multi-agent platform.

## What Was Implemented
- Created project foundation documentation.
- Defined project roadmap and high-level architecture.
- Initialized Python virtual environment and installed `fastapi`, `uvicorn`, `python-multipart`, and `python-dotenv`.
- Created `main.py` with FastAPI setup.
- Scaffolding of React frontend via `create-vite`.
- Designed professional `App.jsx` and `index.css` reflecting a serious AI platform aesthetic.
- **Phase 2 (Current):** Added offline RAG dependencies (`langchain`, `faiss-cpu`, `langchain-huggingface`, `pypdf`) and implemented `DocumentProcessor` service.
- Wired the `/api/upload` endpoint to parse PDFs, chunk text using `RecursiveCharacterTextSplitter`, and index it using HuggingFace embeddings (`all-MiniLM-L6-v2`) into a local FAISS vector store.
- Implemented `QueryProcessor` utilizing Google Gemini (`gemini-2.5-flash`) via `langchain-google-genai` to generate highly reliable, grounded answers from FAISS retrieved chunks.
- Created `/api/query` POST endpoint utilizing Pydantic schemas (`QueryRequest`) to enforce data structures.
- **Phase 3 (Current):** Refactored UI and backend endpoints to support batch multi-file uploads for document comparison.
- Added `/api/clear` endpoint to wipe knowledge base for fresh sessions.
- Injected strict filename metadata into chunk indexing for precise traceability.
- Integrated `rank_bm25` to build a local keyword statistical index alongside FAISS.
- Refactored `QueryProcessor` to use an `EnsembleRetriever` (FAISS 60%, BM25 40%), effectively merging semantic and keyword search, expanding the retrieval limit to 10 chunks to avoid multi-doc comparison blindness.
- **Phase 3.5 (Current):** Replaced `pypdf` with `pymupdf` for high-speed, robust document extraction.
- Refactored `main.py` to process uploads asynchronously via FastAPI `BackgroundTasks`, returning a `job_id` to prevent browser timeouts.
- Upgraded the React frontend (`App.jsx`) to continuously poll the `job_id` status and display real-time async processing updates.
- Overhauled the `/api/query` endpoint to yield `StreamingResponse` via Server-Sent Events (SSE).
- Upgraded the React chat UI to decode the `ReadableStream` dynamically, creating a word-by-word typing effect directly from Gemini's generative chain.
- **Phase 4:** Integrated LangSmith for enterprise-grade observability.
- Added `@traceable` decorators to Python backend functions to generate granular execution latency dashboards.
- **Phase 5 (Current):** Integrated LangGraph for Agentic Routing.
- Implemented state-machine routing (`AgentOrchestrator`) utilizing structured Pydantic classifications to steer query executions into specialized single-document RAG vs. multi-document comparison paths.
- **Bug Fix (Startup Error):** Resolved a server startup crash (`ImportError` on `EnsembleRetriever` from `langchain_community.retrievers`) by introducing a robust, version-agnostic import block (falling back from `langchain.retrievers` -> `langchain_classic.retrievers` -> `langchain_community.retrievers`) ensuring immediate compatibility with modern LangChain structures.
- **UI/UX & Routing Stream Overhaul:**
  - Upgraded the React chat UI with a custom stateful block-Markdown parser (`MarkdownRenderer`) that parses line-by-line rather than splitting blindly, enabling proper formatting of headers, paragraphs, nested bullet lists (tracking 2/4-space indent levels), code blocks, blockquotes, and comparison tables.
  - Upgraded `index.css` with premium CSS styles for headers, lists, code panels, and comparison tables using modern typography, glassmorphism, responsive alignment, and sleek neon accents.
  - Fixed the metadata display inconsistency where non-PDF documents (Markdown and Text files) showed broken `(Page ?)` markers by implementing a robust numeric page validation check in `App.jsx` that hides the page count completely when it is missing or invalid.
  - Reinforced routing token containment within `backend/main.py` by filtering the LangGraph stream strictly on the `"generator"` event tag to drop router classification chunks (such as `{"route": "compare_rag"}`) in real time, preventing them from leaking into the user's UI.
- **Phase 6 (Completed):** Integrated Conversational Memory & Session Management. (Later the session folder expiry date to be set)
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

## Pending Tasks
- [x] Transition to Phase 6 (Conversational Memory & Session Management).
- [ ] Transition to Phase 7 (Reliability & Control Layer).
- [ ] Implement system safety guardrails, rate-limiting, or LLM output validation logic.

## Current Limitations
- Phase 6 is complete, but session directories on disk currently persist indefinitely; a garbage collection or expiry date logic needs to be implemented later.
- No semantic routing guardrails or strict JSON structural validations are placed on the final generation output yet.

## Next Milestone
- Phase 7: Implement Reliability, Guardrails, and Control Layer to validate LLM outputs and enforce system safety policies.

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
