# NexusAI — Self-Correcting Multi-Agent Research Intelligence Platform

NexusAI is a production-grade Agentic AI platform focused on Hybrid RAG, Multi-Agent Orchestration, Reliability, Traceability, Evaluation, Validation, Deterministic Control Policies, Observability, Context Memory, Self-Correction, Tool Calling, and Graph Runtime Engineering.

## Architecture

The system evolves progressively, currently standing at Phase 1.

**High-Level Architecture (Target):**
User -> Frontend UI -> FastAPI Backend -> LangGraph State Machine -> Supervisor/Orchestrator Agent -> Specialized Agents -> Hybrid Retrieval Layer -> Validation + Reliability Layer -> Control Layer -> Memory Layer -> Evaluation Layer -> Final Response Generator

## Tech Stack
- **Frontend:** React (Vite)
- **Backend:** FastAPI (Python)
- **More to come:** LangGraph, FAISS, RAGAS, Docker, etc.

## Setup Instructions

### Backend
1. Navigate to the `backend` directory.
2. Create a virtual environment: `python -m venv venv`
3. Activate the virtual environment:
   - Windows: `venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Run the server: `uvicorn main:app --reload`

### Frontend
1. Navigate to the `frontend` directory.
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`

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
- Phase 2: Basic Offline RAG Pipeline (Current)
- Phase 3: Hybrid RAG
- Phase 4: Observability & Tracing
- Phase 5: Agentic Workflow
- Phase 6: Reliability & Control Layer
- Phase 7: Tool Calling Layer
- Phase 8: Memory Layer
- Phase 9: Evaluation Layer
- Phase 10: Production Engineering
