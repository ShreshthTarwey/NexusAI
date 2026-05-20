# Engineering Log & Progress Tracker

## Current Project State
- Transitioned to **Phase 5: Agentic Routing**.
- **Phase 4: Observability & Tracing** is completed.
- **Phase 1, 2, 3 & 3.5** are completed.
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
- **Phase 4 (Current):** Integrated LangSmith for enterprise-grade observability.
- Added `@traceable` decorators to Python backend functions to generate granular execution latency dashboards.

## Pending Tasks
- [x] Transition to Phase 4 (Observability & Tracing).
- [ ] Transition to Phase 5 (Agentic Routing).
- [ ] Integrate LangGraph to introduce conditional logic and routing between simple queries and complex document comparisons.

## Current Limitations
- No AI agent (LangGraph) or memory layer is wired up yet.

## Next Milestone
- Phase 5: Implement LangGraph to act as an orchestration layer, routing user questions to different specialized pipelines depending on intent.

## Changed Files
- `README.md`
- `steps.md`
- `backend/requirements.txt`
- `backend/.env`
- `backend/main.py`
- `backend/services/__init__.py`
- `backend/services/document_processor.py`
- `backend/services/query_processor.py`
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
