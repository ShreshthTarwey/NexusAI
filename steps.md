# Engineering Log & Progress Tracker

## Current Project State
- Transitioned to **Phase 2: Basic Offline RAG Pipeline**.
- **Phase 1: Project Foundation** is completed.
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

## Pending Tasks
- [x] Connect frontend to backend properly (test the upload flow).
- [x] Transition to Phase 2 (Basic Offline RAG Pipeline).
- [x] Build retrieval query endpoint (`/api/query`) to search the FAISS vector store.
- [x] Wire up basic grounded answer generation using the retrieved context.
- [x] Connect the React frontend to the `/api/query` endpoint and display answers + sources.
- [ ] Transition to Phase 3 (Hybrid RAG).

## Current Limitations
- The vector DB path (`vector_db`) is hardcoded; should be moved to environment config later.
- No AI agent (LangGraph) or memory layer is wired up yet.

## Next Milestone
- Phase 3: Implement BM25 keyword retrieval, hybrid ranking, and query rewriting to improve retrieval quality.

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
