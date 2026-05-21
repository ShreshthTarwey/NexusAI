from typing import TypedDict, List, Dict, Any
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

class GuardrailDecision(BaseModel):
    is_valid: bool = Field(
        description="True if the query is asking about documents, data, interview prep, files, companies, or something related to uploaded knowledge. False if it is a general knowledge question entirely unrelated to the system's purpose (e.g., 'What is the capital of France?')."
    )

class GraderDecision(BaseModel):
    is_relevant: bool = Field(
        description="True if the provided documents contain relevant information to answer the query. False if they are completely irrelevant to the user's question."
    )

class AgentState(TypedDict):
    query: str
    original_query: str
    route: str
    answer: str
    sources: List[Dict]
    documents: List[Any]
    chat_history: str
    retries: int
    grader_retry: bool

class AgentOrchestrator:
    """
    Orchestration layer that manages state and routes user queries using LangGraph.
    Now enhanced with a Reliability & Control Layer (Guardrails & Self-Correction).
    """
    def __init__(self, session_id: str = "default"):
        self.session_id = session_id
        self.llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0, max_retries=1)
        self.query_processor = QueryProcessor(session_id=session_id)
        
        # Check for Groq API Keys and activate resilience layer
        groq_api_key = os.getenv("GROQ_API_KEY")
        groq_api_key2 = os.getenv("GROQ_API_KEY2")
        
        if groq_api_key:
            try:
                from langchain_groq import ChatGroq
                fallbacks_router = []
                fallbacks_guardrail = []
                fallbacks_grader = []
                self.groq_generators = []
                
                # Primary Groq Fallback
                groq_router_1 = ChatGroq(model="llama-3.1-8b-instant", temperature=0, groq_api_key=groq_api_key, max_retries=1)
                groq_generator_1 = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key, max_retries=1)
                fallbacks_router.append(groq_router_1.with_structured_output(RouterDecision))
                fallbacks_guardrail.append(groq_router_1.with_structured_output(GuardrailDecision))
                fallbacks_grader.append(groq_router_1.with_structured_output(GraderDecision))
                self.groq_generators.append(groq_generator_1)
                
                # Secondary Groq Fallback (Load Balancing / Rate Limit Protection)
                if groq_api_key2:
                    groq_router_2 = ChatGroq(model="llama-3.1-8b-instant", temperature=0, groq_api_key=groq_api_key2, max_retries=1)
                    groq_generator_2 = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key2, max_retries=1)
                    fallbacks_router.append(groq_router_2.with_structured_output(RouterDecision))
                    fallbacks_guardrail.append(groq_router_2.with_structured_output(GuardrailDecision))
                    fallbacks_grader.append(groq_router_2.with_structured_output(GraderDecision))
                    self.groq_generators.append(groq_generator_2)
                
                self.router_llm = self.llm.with_structured_output(RouterDecision).with_config({"tags": ["router"]}).with_fallbacks(fallbacks_router)
                self.guardrail_llm = self.llm.with_structured_output(GuardrailDecision).with_config({"tags": ["guardrail"]}).with_fallbacks(fallbacks_guardrail)
                self.grader_llm = self.llm.with_structured_output(GraderDecision).with_config({"tags": ["grader"]}).with_fallbacks(fallbacks_grader)
                
                self.generation_llm = self.llm
                print(f"NexusAI Resilience Layer: Groq fallback models ({len(self.groq_generators)}) successfully initialized.")
            except Exception as e:
                print(f"NexusAI Resilience Layer Warning: Failed to initialize Groq fallback models ({e}). Defaulting to Gemini alone.")
                self.router_llm = self.llm.with_structured_output(RouterDecision).with_config({"tags": ["router"]})
                self.guardrail_llm = self.llm.with_structured_output(GuardrailDecision).with_config({"tags": ["guardrail"]})
                self.grader_llm = self.llm.with_structured_output(GraderDecision).with_config({"tags": ["grader"]})
                self.generation_llm = self.llm
        else:
            print("NexusAI Resilience Layer Warning: GROQ_API_KEY is not defined in the environment. Defaulting to Gemini alone.")
            self.router_llm = self.llm.with_structured_output(RouterDecision).with_config({"tags": ["router"]})
            self.guardrail_llm = self.llm.with_structured_output(GuardrailDecision).with_config({"tags": ["guardrail"]})
            self.grader_llm = self.llm.with_structured_output(GraderDecision).with_config({"tags": ["grader"]})
            self.generation_llm = self.llm

        # Build the graph workflow
        workflow = StateGraph(AgentState)
        
        # Define nodes
        workflow.add_node("rewrite_query", self.rewrite_query)
        workflow.add_node("input_guardrail", self.input_guardrail)
        workflow.add_node("execute_guardrail_block", self.execute_guardrail_block)
        workflow.add_node("route_intent", self.route_intent)
        workflow.add_node("retrieve_documents", self.retrieve_documents)
        workflow.add_node("document_grader", self.document_grader)
        workflow.add_node("execute_simple_rag", self.execute_simple_rag)
        workflow.add_node("execute_compare_rag", self.execute_compare_rag)
        
        # Define edges
        workflow.add_edge(START, "rewrite_query")
        workflow.add_edge("rewrite_query", "input_guardrail")
        
        # Conditional path selection for Guardrail
        workflow.add_conditional_edges(
            "input_guardrail",
            self.decide_guardrail,
            {
                "valid": "route_intent",
                "invalid": "execute_guardrail_block"
            }
        )
        
        workflow.add_edge("execute_guardrail_block", END)
        workflow.add_edge("route_intent", "retrieve_documents")
        workflow.add_edge("retrieve_documents", "document_grader")
        
        # Conditional path selection for Grader Self-Correction
        workflow.add_conditional_edges(
            "document_grader",
            self.decide_grader,
            {
                "relevant_simple": "execute_simple_rag",
                "relevant_compare": "execute_compare_rag",
                "retry": "rewrite_query"
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
        original_query = state.get("query", "")
        
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
            print(f"NexusAI Rewriter: Gemini failed ({e}). Attempting fallbacks...")
            if hasattr(self, "groq_generators") and self.groq_generators:
                for idx, fallback_llm in enumerate(self.groq_generators):
                    try:
                        response = await fallback_llm.ainvoke(prompt)
                        rewritten = response.content.strip()
                        print(f"NexusAI Rewriter (Fallback {idx+1}): '{original_query}' -> '{rewritten}'")
                        return {"query": rewritten, "original_query": original_query}
                    except Exception as fallback_e:
                        print(f"NexusAI Rewriter: Fallback {idx+1} failed ({fallback_e}).")
            
            print("NexusAI Rewriter: All models failed. Falling back to original query.")
            return {"query": original_query, "original_query": original_query}

    def input_guardrail(self, state: AgentState) -> Dict:
        """
        Scope Guardrail: Prevents general knowledge questions and forces RAG scope.
        """
        prompt = (
            "You are a strict security guard for a document AI platform. "
            "Your job is to determine if the user query is asking a general knowledge question OR if it is asking about uploaded documents/interview prep. "
            "Return True if it is related to documents/interview prep. Return False if it is general knowledge (e.g., 'What is the capital of France?').\n\n"
            f"Query: {state['query']}"
        )
        try:
            decision = self.guardrail_llm.invoke(prompt)
            if not decision.is_valid:
                return {"route": "guardrail_block"}
        except Exception as e:
            print(f"Guardrail failed: {e}")
        return {}
        
    def decide_guardrail(self, state: AgentState) -> str:
        """ Evaluates if query is valid or blocked by guardrail. """
        if state.get("route") == "guardrail_block":
            return "invalid"
        return "valid"
        
    async def execute_guardrail_block(self, state: AgentState) -> Dict:
        """ Gracefully denies general knowledge questions. """
        return {"answer": "I can only answer questions related to our uploaded documents.", "sources": []}
            
    def route_intent(self, state: AgentState) -> Dict:
        """ Analyzes query intent and decides which RAG path to execute. """
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
        
    def retrieve_documents(self, state: AgentState) -> Dict:
        """ Retrieves documents based on route. """
        route = state.get("route", "simple_rag")
        k = 10 if route == "compare_rag" else 5
        docs = self.query_processor.retrieve_documents(state["query"], k=k)
        return {"documents": docs}
        
    def document_grader(self, state: AgentState) -> Dict:
        """ Evaluates retrieved chunks for relevance to trigger self-correction. """
        docs = state.get("documents", [])
        retries = state.get("retries", 0)
        
        if not docs:
            return {"grader_retry": False}
            
        context_text = self.query_processor.format_context(docs)
        prompt = (
            "You are a strict document grader. Determine if the provided context contains any information relevant to the user query.\n\n"
            f"Query: {state['query']}\n\nContext:\n{context_text}"
        )
        
        try:
            decision = self.grader_llm.invoke(prompt)
            if not decision.is_relevant:
                if retries < 2:
                    print(f"NexusAI Self-Correction: Documents irrelevant. Retrying... ({retries+1}/2)")
                    return {"grader_retry": True, "retries": retries + 1}
                else:
                    print(f"NexusAI Self-Correction: Max retries reached. Proceeding.")
                    return {"grader_retry": False}
            return {"grader_retry": False}
        except Exception as e:
            print(f"Grader failed: {e}")
            return {"grader_retry": False}
            
    def decide_grader(self, state: AgentState) -> str:
        """ Evaluates conditional path edge after grading. """
        if state.get("grader_retry", False):
            return "retry"
        
        if state.get("route") == "compare_rag":
            return "relevant_compare"
        return "relevant_simple"
        
    async def execute_simple_rag(self, state: AgentState) -> Dict:
        """ Standard RAG generation. """
        docs = state.get("documents", [])
        if not docs:
            return {"answer": "I couldn't find any relevant information in the uploaded documents.", "sources": []}
            
        context_text = self.query_processor.format_context(docs)
        chain = self.query_processor.prompt_template | self.generation_llm.with_config({"tags": ["generator"]})
        
        full_content = ""
        try:
            async for chunk in chain.astream({"context": context_text, "question": state["query"]}):
                full_content += chunk.content
        except Exception as e:
            print(f"NexusAI Resilience: Generation failed ({e}). Attempting fallbacks...")
            fallback_success = False
            if hasattr(self, "groq_generators") and self.groq_generators:
                for idx, fallback_llm in enumerate(self.groq_generators):
                    try:
                        full_content = ""
                        fallback_chain = self.query_processor.prompt_template | fallback_llm.with_config({"tags": ["generator"]})
                        async for chunk in fallback_chain.astream({"context": context_text, "question": state["query"]}):
                            full_content += chunk.content
                        fallback_success = True
                        print(f"NexusAI Resilience: Fallback {idx+1} succeeded.")
                        break
                    except Exception as fallback_e:
                        print(f"NexusAI Resilience: Fallback {idx+1} failed ({fallback_e}).")
            
            if not fallback_success:
                raise Exception("All generation models failed.")
            
        sources = [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
        return {"answer": full_content, "sources": sources}
        
    async def execute_compare_rag(self, state: AgentState) -> Dict:
        """ Comparison RAG generation. """
        docs = state.get("documents", [])
        if not docs:
            return {"answer": "I couldn't find any relevant documents to run a comparison.", "sources": []}
            
        context_text = self.query_processor.format_context(docs)
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
        try:
            async for chunk in chain.astream({"context": context_text, "question": state["query"]}):
                full_content += chunk.content
        except Exception as e:
            print(f"NexusAI Resilience: Generation failed ({e}). Attempting fallbacks...")
            fallback_success = False
            if hasattr(self, "groq_generators") and self.groq_generators:
                for idx, fallback_llm in enumerate(self.groq_generators):
                    try:
                        full_content = ""
                        fallback_chain = comparison_prompt | fallback_llm.with_config({"tags": ["generator"]})
                        async for chunk in fallback_chain.astream({"context": context_text, "question": state["query"]}):
                            full_content += chunk.content
                        fallback_success = True
                        print(f"NexusAI Resilience: Fallback {idx+1} succeeded.")
                        break
                    except Exception as fallback_e:
                        print(f"NexusAI Resilience: Fallback {idx+1} failed ({fallback_e}).")
            
            if not fallback_success:
                raise Exception("All generation models failed.")
            
        sources = [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
        return {"answer": full_content, "sources": sources}
