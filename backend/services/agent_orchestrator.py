from typing import TypedDict, List, Dict
from langgraph.graph import StateGraph, START, END
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from services.query_processor import QueryProcessor
from pydantic import BaseModel, Field
import os

class RouterDecision(BaseModel):
    route: str = Field(
        description="The classification of the user request. MUST be either 'simple_rag' (if the query is asking about a single document, simple fact retrieval, or single-source information) or 'compare_rag' (if the query involves comparing/contrasting multiple documents, cross-referencing files, or synthesizing a summary/comparison matrix across files)."
    )

class AgentState(TypedDict):
    query: str
    original_query: str
    route: str
    answer: str
    sources: List[Dict]
    chat_history: str

class AgentOrchestrator:
    """
    Orchestration layer that manages state and routes user queries using LangGraph.
    Differentiates between simple single-document retrieval and complex cross-file comparisons.
    """
    def __init__(self, session_id: str = "default"):
        self.session_id = session_id
        self.llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
        self.query_processor = QueryProcessor(session_id=session_id)
        
        # Check for Groq API Key and activate resilience layer
        groq_api_key = os.getenv("GROQ_API_KEY")
        if groq_api_key:
            try:
                from langchain_groq import ChatGroq
                groq_router = ChatGroq(model="llama-3.1-8b-instant", temperature=0, groq_api_key=groq_api_key)
                groq_generator = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key)
                
                # Bind structured output to our Router schema for Groq fallback
                groq_router_structured = groq_router.with_structured_output(RouterDecision)
                
                self.router_llm = self.llm.with_structured_output(RouterDecision).with_config({"tags": ["router"]}).with_fallbacks([groq_router_structured])
                self.generation_llm = self.llm.with_fallbacks([groq_generator])
                print("NexusAI Resilience Layer: Groq fallback models successfully initialized.")
            except Exception as e:
                print(f"NexusAI Resilience Layer Warning: Failed to initialize Groq fallback models ({e}). Defaulting to Gemini alone.")
                self.router_llm = self.llm.with_structured_output(RouterDecision).with_config({"tags": ["router"]})
                self.generation_llm = self.llm
        else:
            print("NexusAI Resilience Layer Warning: GROQ_API_KEY is not defined in the environment. Defaulting to Gemini alone.")
            self.router_llm = self.llm.with_structured_output(RouterDecision).with_config({"tags": ["router"]})
            self.generation_llm = self.llm

        
        # Build the graph workflow
        workflow = StateGraph(AgentState)
        
        # Define nodes
        workflow.add_node("rewrite_query", self.rewrite_query)
        workflow.add_node("route_intent", self.route_intent)
        workflow.add_node("execute_simple_rag", self.execute_simple_rag)
        workflow.add_node("execute_compare_rag", self.execute_compare_rag)
        
        # Define edges
        workflow.add_edge(START, "rewrite_query")
        workflow.add_edge("rewrite_query", "route_intent")
        
        # Conditional path selection
        workflow.add_conditional_edges(
            "route_intent",
            self.decide_route,
            {
                "simple_rag": "execute_simple_rag",
                "compare_rag": "execute_compare_rag"
            }
        )
        
        workflow.add_edge("execute_simple_rag", END)
        workflow.add_edge("execute_compare_rag", END)
        
        # Compile the state machine
        self.graph = workflow.compile()
        
    async def rewrite_query(self, state: AgentState) -> Dict:
        """
        Rewrites the query based on chat history to inject missing context (coreference resolution).
        """
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
            # We use generation_llm (fallback supported) for rewriting as it's better at reasoning
            response = await self.generation_llm.ainvoke(prompt)
            rewritten = response.content.strip()
            print(f"NexusAI Rewriter: '{original_query}' -> '{rewritten}'")
            return {"query": rewritten, "original_query": original_query}
        except Exception as e:
            print(f"Query rewriting failed: {e}")
            return {"query": original_query, "original_query": original_query}
            
    def route_intent(self, state: AgentState) -> Dict:
        """
        Analyzes query intent and decides which RAG path to execute.
        """
        prompt = (
            f"You are a professional routing classifier for an AI research platform.\n"
            f"Given the user query below, determine if it is a single-document query (fact extraction, simple search) "
            f"or if it is a multi-document query (comparing documents, summarizing cross-file trends, building a matrix).\n\n"
            f"User Query: {state['query']}"
        )
        try:
            decision = self.router_llm.invoke(prompt)
            route = decision.route if decision.route in ["simple_rag", "compare_rag"] else "simple_rag"
        except Exception as e:
            print(f"Routing classification failed: {e}. Defaulting to simple_rag.")
            route = "simple_rag"
            
        return {"route": route}
        
    def decide_route(self, state: AgentState) -> str:
        """
        Helper method to evaluate conditional path edge.
        """
        return state["route"]
        
    async def execute_simple_rag(self, state: AgentState) -> Dict:
        """
        Standard RAG route. Optimized for single-file, quick factual query.
        """
        docs = self.query_processor.retrieve_documents(state["query"], k=5)
        if not docs:
            return {"answer": "I couldn't find any relevant information in the uploaded documents.", "sources": []}
            
        context_text = self.query_processor.format_context(docs)
        chain = self.query_processor.prompt_template | self.generation_llm.with_config({"tags": ["generator"]})
        
        full_content = ""
        # Stream chunks internally to trigger on_chat_model_stream events
        async for chunk in chain.astream({"context": context_text, "question": state["query"]}):
            full_content += chunk.content
            
        sources = [
            {"content": doc.page_content, "metadata": doc.metadata}
            for doc in docs
        ]
        return {"answer": full_content, "sources": sources}
        
    async def execute_compare_rag(self, state: AgentState) -> Dict:
        """
        Comparison RAG route. Optimized for cross-document comparison and structural formats (tables).
        """
        # Retrieve more context chunks for comparison (k=10)
        docs = self.query_processor.retrieve_documents(state["query"], k=10)
        if not docs:
            return {"answer": "I couldn't find any relevant documents to run a comparison.", "sources": []}
            
        context_text = self.query_processor.format_context(docs)
        
        # Prompts Gemini specifically to format a comparison layout (Markdown table/matrix)
        comparison_prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert research comparison agent for the NexusAI platform.\n"
                "Your task is to compare and contrast the information retrieved from multiple documents.\n"
                "Present your comparative findings using structural elements like Markdown tables, comparison lists, or comparison matrices where appropriate. Keep it highly structured and professional.\n"
                "Always cite the 'source_file' name for every row or comparison point in your comparison layout.\n"
                "Use ONLY the following context to answer. If you cannot answer based on context, explicitly say so.\n\n"
                "Context:\n{context}"
            )),
            ("human", "{question}")
        ])
        
        chain = comparison_prompt | self.generation_llm.with_config({"tags": ["generator"]})
        
        full_content = ""
        # Stream chunks internally to trigger on_chat_model_stream events
        async for chunk in chain.astream({"context": context_text, "question": state["query"]}):
            full_content += chunk.content
            
        sources = [
            {"content": doc.page_content, "metadata": doc.metadata}
            for doc in docs
        ]
        return {"answer": full_content, "sources": sources}
