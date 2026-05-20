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
    route: str
    answer: str
    sources: List[Dict]

class AgentOrchestrator:
    """
    Orchestration layer that manages state and routes user queries using LangGraph.
    Differentiates between simple single-document retrieval and complex cross-file comparisons.
    """
    def __init__(self, vector_store_path: str = "vector_db"):
        self.vector_store_path = vector_store_path
        self.llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
        self.query_processor = QueryProcessor(vector_store_path=vector_store_path)
        
        # Bind structured output to our Router schema
        self.router_llm = self.llm.with_structured_output(RouterDecision)
        
        # Build the graph workflow
        workflow = StateGraph(AgentState)
        
        # Define nodes
        workflow.add_node("route_intent", self.route_intent)
        workflow.add_node("execute_simple_rag", self.execute_simple_rag)
        workflow.add_node("execute_compare_rag", self.execute_compare_rag)
        
        # Define edges
        workflow.add_edge(START, "route_intent")
        
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
        chain = self.query_processor.prompt_template | self.llm
        
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
        
        chain = comparison_prompt | self.llm
        
        full_content = ""
        # Stream chunks internally to trigger on_chat_model_stream events
        async for chunk in chain.astream({"context": context_text, "question": state["query"]}):
            full_content += chunk.content
            
        sources = [
            {"content": doc.page_content, "metadata": doc.metadata}
            for doc in docs
        ]
        return {"answer": full_content, "sources": sources}
