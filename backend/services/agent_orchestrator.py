from typing import TypedDict, List, Dict, Any
from langgraph.graph import StateGraph, START, END
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from services.query_processor import QueryProcessor
from pydantic import BaseModel, Field
import os
import random
from langchain_core.runnables import RunnableConfig
from services.tools import safe_calculator, web_search, create_knowledge_base_search_tool

class RouterDecision(BaseModel):
    route: str = Field(
        description="The classification of the user request. MUST be either 'simple_rag' (if the query is asking about a single document, simple fact retrieval, or single-source information), 'compare_rag' (if the query involves comparing/contrasting multiple documents, cross-referencing files, or synthesizing a summary/comparison matrix across files), or 'tool_calling' (if the query explicitly requests web search, math calculations, real-time facts, or external information not present in the uploaded documents)."
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
    is_relevant: bool

class AgentOrchestrator:
    """
    Orchestration layer that manages state and routes user queries using LangGraph.
    Now enhanced with a Reliability & Control Layer (Guardrails & Self-Correction).
    Load-balanced across 4 Groq Keys and OpenRouter keys with programmatic search fallbacks.
    """
    router_llm: Any
    guardrail_llm: Any
    grader_llm: Any
    generation_llm: Any
    
    def __init__(self, session_id: str = "default"):
        self.session_id = session_id
        self.llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0, max_retries=1)
        self.query_processor = QueryProcessor(session_id=session_id)
        self.kb_search_tool = create_knowledge_base_search_tool(self.query_processor)
        self.tools = [safe_calculator, web_search, self.kb_search_tool]
        
        # Check for Groq API Keys and activate resilience layer
        groq_api_key = os.getenv("GROQ_API_KEY")
        groq_api_key2 = os.getenv("GROQ_API_KEY2")
        groq_api_key3 = os.getenv("GROQ_API_KEY3")
        groq_api_key4 = os.getenv("GROQ_API_KEY4")
        
        self.groq_generators = []
        
        if groq_api_key or groq_api_key2 or groq_api_key3 or groq_api_key4:
            try:
                from langchain_groq import ChatGroq
                
                fallbacks_router = []
                fallbacks_guardrail = []
                fallbacks_grader = []
                
                # 1. Setup Groq Key 1 (GSK 1)
                if groq_api_key:
                    groq_router_1 = ChatGroq(model="llama-3.1-8b-instant", temperature=0, groq_api_key=groq_api_key, max_retries=1)
                    groq_generator_1 = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key, max_retries=1)
                    fallbacks_router.append(groq_router_1.with_structured_output(RouterDecision))
                    fallbacks_guardrail.append(groq_router_1.with_structured_output(GuardrailDecision))
                    fallbacks_grader.append(groq_router_1.with_structured_output(GraderDecision))
                    self.groq_generators.append(groq_generator_1)
                    
                # 2. Setup Groq Key 2 (GSK 2)
                if groq_api_key2:
                    groq_router_2 = ChatGroq(model="llama-3.1-8b-instant", temperature=0, groq_api_key=groq_api_key2, max_retries=1)
                    groq_generator_2 = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key2, max_retries=1)
                    fallbacks_router.append(groq_router_2.with_structured_output(RouterDecision))
                    fallbacks_guardrail.append(groq_router_2.with_structured_output(GuardrailDecision))
                    fallbacks_grader.append(groq_router_2.with_structured_output(GraderDecision))
                    self.groq_generators.append(groq_generator_2)

                # 3. Setup Groq Key 3 (GSK 3)
                if groq_api_key3:
                    groq_router_3 = ChatGroq(model="llama-3.1-8b-instant", temperature=0, groq_api_key=groq_api_key3, max_retries=1)
                    groq_generator_3 = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key3, max_retries=1)
                    fallbacks_router.append(groq_router_3.with_structured_output(RouterDecision))
                    fallbacks_guardrail.append(groq_router_3.with_structured_output(GuardrailDecision))
                    fallbacks_grader.append(groq_router_3.with_structured_output(GraderDecision))
                    self.groq_generators.append(groq_generator_3)

                # 4. Setup Groq Key 4 (GSK 4)
                if groq_api_key4:
                    groq_router_4 = ChatGroq(model="llama-3.1-8b-instant", temperature=0, groq_api_key=groq_api_key4, max_retries=1)
                    groq_generator_4 = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key4, max_retries=1)
                    fallbacks_router.append(groq_router_4.with_structured_output(RouterDecision))
                    fallbacks_guardrail.append(groq_router_4.with_structured_output(GuardrailDecision))
                    fallbacks_grader.append(groq_router_4.with_structured_output(GraderDecision))
                    self.groq_generators.append(groq_generator_4)
                    
                # Load balance the fallback router keys per session startup by shuffling them
                random.shuffle(fallbacks_router)
                random.shuffle(fallbacks_guardrail)
                random.shuffle(fallbacks_grader)

                self.router_llm = self.llm.with_structured_output(RouterDecision).with_config({"tags": ["router"]}).with_fallbacks(fallbacks_router, exceptions_to_handle=[Exception])
                self.guardrail_llm = self.llm.with_structured_output(GuardrailDecision).with_config({"tags": ["guardrail"]}).with_fallbacks(fallbacks_guardrail, exceptions_to_handle=[Exception])
                self.grader_llm = self.llm.with_structured_output(GraderDecision).with_config({"tags": ["grader"]}).with_fallbacks(fallbacks_grader, exceptions_to_handle=[Exception])
                
                self.generation_llm = self.llm
                print(f"NexusAI Resilience Layer: Groq fallbacks ({len(self.groq_generators)}) successfully initialized.")
            except Exception as e:
                print(f"NexusAI Resilience Layer Warning: Failed to initialize fallbacks ({e}). Defaulting to Gemini alone.")
                self.router_llm = self.llm.with_structured_output(RouterDecision).with_config({"tags": ["router"]})
                self.guardrail_llm = self.llm.with_structured_output(GuardrailDecision).with_config({"tags": ["guardrail"]})
                self.grader_llm = self.llm.with_structured_output(GraderDecision).with_config({"tags": ["grader"]})
                self.generation_llm = self.llm
        else:
            print("NexusAI Resilience Layer Warning: No backup keys are defined in the environment. Defaulting to Gemini alone.")
            self.router_llm = self.llm.with_structured_output(RouterDecision).with_config({"tags": ["router"]})
            self.guardrail_llm = self.llm.with_structured_output(GuardrailDecision).with_config({"tags": ["guardrail"]})
            self.grader_llm = self.llm.with_structured_output(GraderDecision).with_config({"tags": ["grader"]})
            self.generation_llm = self.llm

        # Build the graph workflow
        workflow = StateGraph(AgentState)  # type: ignore
        
        # Define nodes
        workflow.add_node("rewrite_query", self.rewrite_query)
        workflow.add_node("input_guardrail", self.input_guardrail)
        workflow.add_node("execute_guardrail_block", self.execute_guardrail_block)
        workflow.add_node("route_intent", self.route_intent)
        workflow.add_node("retrieve_documents", self.retrieve_documents)
        workflow.add_node("document_grader", self.document_grader)
        workflow.add_node("execute_simple_rag", self.execute_simple_rag)
        workflow.add_node("execute_compare_rag", self.execute_compare_rag)
        workflow.add_node("execute_tool_calling_agent", self.execute_tool_calling_agent)
        
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
        
        # Conditional path selection for route_intent
        workflow.add_conditional_edges(
            "route_intent",
            self.decide_intent,
            {
                "retrieve": "retrieve_documents",
                "tool_calling": "execute_tool_calling_agent"
            }
        )
        
        workflow.add_edge("retrieve_documents", "document_grader")
        
        # Conditional path selection for Grader Self-Correction
        workflow.add_conditional_edges(
            "document_grader",
            self.decide_grader,
            {
                "relevant_simple": "execute_simple_rag",
                "relevant_compare": "execute_compare_rag",
                "tool_calling": "execute_tool_calling_agent",
                "retry": "rewrite_query"
            }
        )
        
        workflow.add_edge("execute_simple_rag", END)
        workflow.add_edge("execute_compare_rag", END)
        workflow.add_edge("execute_tool_calling_agent", END)
        
        # Compile the state machine
        self.graph = workflow.compile()
        
    def get_uploaded_files(self) -> List[str]:
        """
        Reads the local BM25 corpus to extract the unique list of uploaded filenames.
        This provides context to the router so it knows exactly what is local and what is external.
        """
        corpus_path = os.path.join("storage", "sessions", self.session_id, "corpus.pkl")
        if not os.path.exists(corpus_path):
            return []
        try:
            import pickle
            with open(corpus_path, 'rb') as f:
                corpus = pickle.load(f)
            files = set()
            for doc in corpus:
                if doc.metadata and doc.metadata.get('source_file'):
                    files.add(doc.metadata.get('source_file'))
            return list(files)
        except Exception as e:
            print(f"Error reading corpus files: {e}")
            return []
            
    async def rewrite_query(self, state: AgentState) -> Dict:
        """
        Rewrites the query based on chat history to inject missing context (coreference resolution).
        If in a self-correction retry phase (retries > 0), reformulates the search keywords to try a different angle.
        """
        history = state.get("chat_history", "")
        original_query = state.get("original_query") or state.get("query", "")
        if not isinstance(history, str):
            history = ""
            
        retries = state.get("retries", 0)
        
        if retries > 0:
            prompt = (
                "You are an expert Search Query Reformulator for a document AI platform. "
                "A previous attempt to retrieve documents using the query below failed because the retrieved documents were graded as irrelevant.\n\n"
                "Your task is to reformulate the search query to use different keywords, synonyms, or a different search angle "
                "to find the necessary information in the document database.\n"
                "Rules:\n"
                "1. Focus on the core entity, subject, or details required to answer the query.\n"
                "2. Try using different terminology or extracting the most critical search terms.\n"
                "3. Keep the reformulated query extremely concise and optimized for search engine indexing.\n"
                "4. Do NOT answer the question. Only output the reformulated standalone query.\n\n"
                f"Original User Question: {original_query}\n"
                f"Previous Failed Query: {state.get('query', '')}\n\n"
                "Reformulated Query:"
            )
        else:
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
            print(f"NexusAI Rewriter (Attempt {retries+1}): '{original_query}' -> '{rewritten}'")
            return {"query": rewritten, "original_query": original_query}
        except Exception as e:
            print(f"NexusAI Rewriter: Gemini failed ({e}). Attempting fallbacks...")
            
            fallback_rewriters = []
            if len(self.groq_generators) > 0:
                for idx, groq_gen in enumerate(self.groq_generators):
                    fallback_rewriters.append((f"Groq Key {idx+1}", groq_gen))
            
            # Shuffle fallbacks to distribute the request load
            random.shuffle(fallback_rewriters)
                
            for name, fallback_llm in fallback_rewriters:
                try:
                    response = await fallback_llm.ainvoke(prompt)
                    rewritten = response.content.strip()
                    print(f"NexusAI Rewriter (Fallback {name}, Attempt {retries+1}): '{original_query}' -> '{rewritten}'")
                    return {"query": rewritten, "original_query": original_query}
                except Exception as fallback_e:
                    print(f"NexusAI Rewriter: Fallback {name} failed ({fallback_e}).")
            
            print("NexusAI Rewriter: All models failed. Falling back to original query.")
            return {"query": original_query, "original_query": original_query}

    def input_guardrail(self, state: AgentState) -> Dict:
        """
        Scope Guardrail: Prevents general knowledge questions and forces RAG scope.
        """
        prompt = (
            "You are a strict security guard for a document AI and search platform. "
            "Your job is to determine if the user query is asking a completely unrelated general knowledge question OR if it is requesting information related to: "
            "1. Uploaded documents or interview preparation.\n"
            "2. Mathematical calculations, computations, or operations.\n"
            "3. Web searches, news, current events, or real-time facts.\n\n"
            "Return True if the query is related to documents, math, web searches, or real-time facts. "
            "Return False if it is a completely off-topic general knowledge question (e.g., 'What is the capital of France?', 'Write a poem about cats').\n\n"
            f"Query: {state['query']}"
        )
        try:
              decision = self.guardrail_llm.invoke(prompt)
              if isinstance(decision, GuardrailDecision):
                  if not decision.is_valid:
                      return {"route": "guardrail_block"}
              elif isinstance(decision, dict):
                  if not decision.get("is_valid", True):
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
        """ Analyzes query intent and decides which execution path to take. """
        query_lower = state["query"].lower()
        
        # Get uploaded files names (lowercased)
        uploaded_files = self.get_uploaded_files()
        uploaded_names_lower = [f.lower() for f in uploaded_files]
        
        # 1. Advanced Python-based Entity Mismatch Router
        import re
        query_words = set(re.findall(r'\b[a-zA-Z]{3,15}\b', query_lower))
        known_external_companies = {
            "microsoft", "google", "apple", "nvidia", "amazon", "meta", "netflix", 
            "amd", "intel", "adobe", "tesla", "tsla", "msft", "goog", "nvda", "amzn"
        }
        
        has_external_mention = False
        for company in known_external_companies:
            if company in query_words:
                is_uploaded = any(company in uploaded_name for uploaded_name in uploaded_names_lower)
                if not is_uploaded:
                    has_external_mention = True
                    break
        
        # Heuristic override for time-sensitive, web search, or math/calculation tasks
        heuristics = [
            "latest", "current", "today", "recent", "updated", "web search", 
            "search the web", "live facts", "real-time", "calculate", "math", 
            "calculator", "sqrt", "pow", "ceo", "internet", "web", "online", 
            "external"
        ]
        if any(kw in query_lower for kw in heuristics) or has_external_mention:
            print(f"NexusAI Router (Python Override): Detected time/web/math/external/mismatch keyword in query. Routing to 'tool_calling'.")
            return {"route": "tool_calling"}
            
        uploaded_str = ", ".join(uploaded_files) if uploaded_files else "None"
 
        prompt = (
            f"You are a professional routing classifier for an AI research platform.\n"
            f"Currently uploaded documents in the database: [{uploaded_str}]\n\n"
            f"Given the user query below, classify its intent into one of the following:\n"
            f"- 'simple_rag': if the query is asking about a single document, simple fact retrieval, or single-source information from the uploaded documents: {uploaded_str}.\n"
            f"- 'compare_rag': if the query involves comparing/contrasting MULTIPLE documents that are ALL PRESENT in the uploaded list: {uploaded_str}.\n"
            f"- 'tool_calling': if the query requires information not in the uploaded documents, OR if it asks to compare an uploaded document with an external entity/company not in the uploaded list (for example, comparing an uploaded Tesla file with Microsoft when Microsoft is not uploaded), OR if it explicitly requests web search, math calculations, or real-time facts.\n\n"
            f"User Query: {state['query']}"
        )
        try:
            decision = self.router_llm.invoke(prompt)
            if isinstance(decision, RouterDecision):
                route = decision.route if decision.route in ["simple_rag", "compare_rag", "tool_calling"] else "simple_rag"
            elif isinstance(decision, dict):
                val = decision.get("route", "simple_rag")
                route = val if val in ["simple_rag", "compare_rag", "tool_calling"] else "simple_rag"
            else:
                route = "simple_rag"
        except Exception as e:
            print(f"Routing classification failed: {e}. Defaulting to simple_rag.")
            route = "simple_rag"
            
        return {"route": route}
        
    def decide_intent(self, state: AgentState) -> str:
        """ Evaluates conditional path edge after route classification. """
        route = state.get("route", "simple_rag")
        if route == "tool_calling":
            return "tool_calling"
        return "retrieve"
        
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
            print("NexusAI Self-Correction: No documents found. Routing to tool calling.")
            return {"grader_retry": False, "is_relevant": False}
            
        # Overview/Summary query bypass to prevent strict grader false-positives
        query_lower = state.get("query", "").lower()
        overview_keywords = ["summary", "summarize", "overview", "what is this document", "content of this document", "about this document", "description of this document"]
        if any(kw in query_lower for kw in overview_keywords):
            print("NexusAI Grader: Detected general overview/summary query. Bypassing grading to ensure successful RAG synthesis.")
            return {"grader_retry": False, "is_relevant": True}
            
        context_text = self.query_processor.format_context(docs)
        prompt = (
            "You are a strict document grader. Your job is to determine if the retrieved context contains "
            "sufficient and specific information to answer the user query.\n\n"
            "Rules:\n"
            "1. If the query asks about a specific entity (e.g. 'Microsoft') or document, and the retrieved context "
            "only contains information about a completely different entity (e.g. 'Tesla') or document, you MUST grade the context as NOT relevant (False).\n"
            "2. Do NOT be fooled by general similarities (e.g. both are financial filings or 10-K documents). The context must contain actual information about the specific subject or entity requested.\n"
            "3. If the context does not contain the specific facts needed to answer the query, grade it as False.\n\n"
            f"User Query: {state['query']}\n\n"
            f"Retrieved Context:\n{context_text}"
        )
        
        try:
            decision = self.grader_llm.invoke(prompt)
            if isinstance(decision, GraderDecision):
                is_relevant = decision.is_relevant
            elif isinstance(decision, dict):
                is_relevant = decision.get("is_relevant", True)
            else:
                is_relevant = True
                
            if not is_relevant:
                if retries < 2:
                    print(f"NexusAI Self-Correction: Documents irrelevant. Retrying... ({retries+1}/2)")
                    return {"grader_retry": True, "retries": retries + 1, "is_relevant": False}
                else:
                    print(f"NexusAI Self-Correction: Max retries reached. Proceeding to tool calling fallback.")
                    return {"grader_retry": False, "is_relevant": False}
            return {"grader_retry": False, "is_relevant": True}
        except Exception as e:
            print(f"Grader failed: {e}. Defaulting to irrelevant to trigger resilient tool calling.")
            return {"grader_retry": False, "is_relevant": False}
            
    def decide_grader(self, state: AgentState) -> str:
        """ Evaluates conditional path edge after grading. """
        if state.get("grader_retry", False):
            return "retry"
        
        if not state.get("is_relevant", True):
            return "tool_calling"
        
        if state.get("route") == "compare_rag":
            return "relevant_compare"
        return "relevant_simple"
        
    async def execute_simple_rag(self, state: AgentState) -> Dict:
        """ Standard RAG generation with load-balanced error mitigation. """
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
            
            fallback_models = []
            if hasattr(self, "openrouter_generators") and self.openrouter_generators:
                for idx, or_gen in enumerate(self.openrouter_generators):
                    fallback_models.append((f"OpenRouter Key {idx+1}", or_gen))
            if hasattr(self, "groq_generators") and self.groq_generators:
                for idx, groq_gen in enumerate(self.groq_generators):
                    fallback_models.append((f"Groq Key {idx+1}", groq_gen))
            
            # Shuffle models to balance request load
            random.shuffle(fallback_models)
            
            for name, fallback_llm in fallback_models:
                try:
                    full_content = ""
                    fallback_chain = self.query_processor.prompt_template | fallback_llm.with_config({"tags": ["generator"]})
                    async for chunk in fallback_chain.astream({"context": context_text, "question": state["query"]}):
                        full_content += chunk.content
                    fallback_success = True
                    print(f"NexusAI Resilience: Fallback {name} succeeded.")
                    break
                except Exception as fallback_e:
                    print(f"NexusAI Resilience: Fallback {name} failed ({fallback_e}).")
            
            if not fallback_success:
                full_content = "I encountered an API rate-limit error while generating the final answer. Please check your model quotas or try again in a few seconds."
            
        sources = [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
        return {"answer": full_content, "sources": sources}
        
    async def execute_compare_rag(self, state: AgentState) -> Dict:
        """ Comparison RAG generation with load-balanced error mitigation. """
        docs = state.get("documents", [])
        if not docs:
            return {"answer": "I couldn't find any relevant documents to run a comparison.", "sources": []}
            
        context_text = self.query_processor.format_context(docs)
        comparison_prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert research comparison agent for the NexusAI platform.\n"
                "Your task is to compare and contrast the information retrieved from multiple documents.\n"
                "Present your comparative findings using structural elements like Markdown tables, comparison lists, or comparison matrices where appropriate. Keep it highly structured and professional.\n"
                "CRITICAL CITATION RULES:\n"
                "You MUST ground your response by citing the source of the information inline. "
                "If a section, paragraph, or list of comparison items is generated from the same source file, you only need to put a single citation `[Source: filename, Pages: X, Y]` (e.g. `[Source: google.md]` or `[Source: tsla-20251231-gen.pdf, Pages: 52, 55]`) at the end of that paragraph, section, or list block. "
                "Do NOT repeat the citation on every single line or comparison point of a list/paragraph if they share the same document. Group multiple pages into a single trailing citation. Use the exact 'source_file' name provided in the context blocks.\n"
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
            
            fallback_models = []
            if hasattr(self, "openrouter_generators") and self.openrouter_generators:
                for idx, or_gen in enumerate(self.openrouter_generators):
                    fallback_models.append((f"OpenRouter Key {idx+1}", or_gen))
            if hasattr(self, "groq_generators") and self.groq_generators:
                for idx, groq_gen in enumerate(self.groq_generators):
                    fallback_models.append((f"Groq Key {idx+1}", groq_gen))
            
            # Shuffle models to balance request load
            random.shuffle(fallback_models)
            
            for name, fallback_llm in fallback_models:
                try:
                    full_content = ""
                    fallback_chain = comparison_prompt | fallback_llm.with_config({"tags": ["generator"]})
                    async for chunk in fallback_chain.astream({"context": context_text, "question": state["query"]}):
                        full_content += chunk.content
                    fallback_success = True
                    print(f"NexusAI Resilience: Fallback {name} succeeded.")
                    break
                except Exception as fallback_e:
                    print(f"NexusAI Resilience: Fallback {name} failed ({fallback_e}).")
            
            if not fallback_success:
                full_content = "I encountered an API rate-limit error while generating the comparison. Please check your model quotas or try again in a few seconds."
            
        sources = [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
        return {"answer": full_content, "sources": sources}

    async def execute_manual_search_fallback(self, query: str, history: str, original_error: Exception, config: RunnableConfig | None = None) -> Dict:
        """
        Premium manual search & synthesis fallback.
        Triggered when all LLM tool-calling integrations fail.
        Programmatically executes web search and local knowledge base searches,
        then uses a robust non-tool-calling fallback LLM (shuffled for load balancing)
        to synthesize a complete, detailed comparative answer with inline citations.
        """
        print("NexusAI Manual Fallback: Programmatically running searches...")
        
        # 1. Extract search queries using heuristics
        import re
        clean_query = re.sub(r'(compare|contrast|difference between|versus|vs|in a table|give the comparison|total revenues|revenues in|in 2025|in 2024)', '', query, flags=re.IGNORECASE).strip()
        words = [w for w in re.split(r'\s+', clean_query) if len(w) > 2]
        
        # Determine entities to search
        companies = ["tesla", "microsoft", "google", "apple", "amazon", "nvidia", "meta", "netflix"]
        detected_companies = []
        for word in words:
            word_lower = word.lower()
            for company in companies:
                if company in word_lower and company not in detected_companies:
                    detected_companies.append(company)
                    
        # Formulate fallback search queries
        search_queries = []
        if len(detected_companies) >= 2:
            search_queries.append(f"{detected_companies[0]} total revenues 2025")
            search_queries.append(f"{detected_companies[1]} total revenues 2025")
        else:
            search_queries.append(query)
            
        print(f"NexusAI Manual Fallback: Formulated search queries: {search_queries}")
        
        # 2. Run searches programmatically
        web_results = []
        kb_results = []
        
        # Run Web Search
        for q in search_queries:
            try:
                print(f"NexusAI Manual Fallback: Running web search for '{q}'...")
                res = web_search.invoke(q)
                if res and "Error" not in res:
                    web_results.append(f"Query: {q}\nResult: {res}")
            except Exception as e:
                print(f"NexusAI Manual Fallback: Web search failed for '{q}': {e}")
                
        # Run Knowledge Base Search
        for q in search_queries:
            try:
                print(f"NexusAI Manual Fallback: Running KB search for '{q}'...")
                res = self.kb_search_tool.invoke(q)
                if res and "Error" not in res and "No relevant" not in res:
                    kb_results.append(f"Query: {q}\nResult: {res}")
            except Exception as e:
                print(f"NexusAI Manual Fallback: KB search failed for '{q}': {e}")
                
        # Format consolidated context
        context_parts = []
        if kb_results:
            context_parts.append("--- LOCAL DOCUMENTS SEARCH RESULTS ---")
            context_parts.extend(kb_results)
        if web_results:
            context_parts.append("--- EXTERNAL INTERNET SEARCH RESULTS ---")
            context_parts.extend(web_results)
            
        consolidated_context = "\n\n".join(context_parts)
        
        if not consolidated_context.strip():
            consolidated_context = "No search results could be retrieved due to network limits."
            
        # 3. Choose a working fallback LLM (without tools) to synthesize the response
        fallback_models = []
        if hasattr(self, "groq_generators") and self.groq_generators:
            for idx, groq_gen in enumerate(self.groq_generators):
                fallback_models.append((f"Groq Key {idx+1}", groq_gen))
                
        # Shuffle for load distribution
        random.shuffle(fallback_models)
                
        system_prompt = (
            "You are a premium AI research synthesis agent on the NexusAI platform.\n"
            "Your task is to answer the user query based ONLY on the provided local and web search contexts.\n"
            "If the user asks for a comparison, you MUST present the comparison in a beautiful, structured Markdown table.\n"
            "Cite your sources inline using `[Source: web:query]` for web facts or the actual filename for local facts.\n"
            "Be professional, clear, and highly comprehensive."
        )
        
        human_prompt = (
            f"User Query: {query}\n\n"
            f"Search Results context:\n{consolidated_context}\n\n"
            "Please synthesize the final response."
        )
        
        full_content = ""
        success = False
        
        for name, model in fallback_models:
            try:
                print(f"NexusAI Manual Fallback: Trying synthesis on model {name}...")
                from langchain_core.messages import SystemMessage, HumanMessage
                messages = [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=human_prompt)
                ]
                response = await model.ainvoke(messages, config=config)
                full_content = response.content.strip()
                success = True
                print(f"NexusAI Manual Fallback: Succeeded using model {name}!")
                break
            except Exception as e:
                print(f"NexusAI Manual Fallback: Model {name} failed: {e}")
                
        if not success:
            # Absolute fallback if even all synthesis models fail (e.g. all APIs are totally down/overloaded)
            print("NexusAI Manual Fallback: All LLM models failed! Generating programmatic response...")
            full_content = (
                f"### Service Rate-Limit Fallback Response\n\n"
                f"The AI service is currently experiencing extremely high rate limits or API quota exhaustion. "
                f"However, we successfully retrieved the following search telemetry to answer your query:\n\n"
                f"**Query:** `{query}`\n\n"
                f"#### Consolidated Search Telemetry:\n"
                f"```text\n{consolidated_context[:1200]}...\n```\n\n"
                f"Please try your query again in a few moments when the API quotas reset."
            )
            
        # Compile sources list
        tool_results = []
        for kb_res in kb_results:
            tool_results.append({
                "content": kb_res,
                "metadata": {"source_file": "manual_kb_search"}
            })
        for web_res in web_results:
            tool_results.append({
                "content": web_res,
                "metadata": {"source_file": "manual_web_search"}
            })
            
        return {"answer": full_content, "sources": tool_results}

    async def execute_tool_calling_agent(self, state: AgentState, config: RunnableConfig | None = None) -> Dict:
        """
        Executes a tool calling agent loop using Gemini and bound tools.
        Fully load balanced across OpenRouter and Groq, and fallbacks to manual search under failure.
        """
        from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, ToolMessage
        
        query = state["query"]
        history = state.get("chat_history", "")
        
        messages: List[BaseMessage] = []
        
        system_instructions = (
            "You are a helpful assistant equipped with specialized tools to answer user questions.\n"
            "You have access to the following tools:\n"
            "- safe_calculator: Use this to calculate math expressions or verify calculations.\n"
            "- web_search: Use this to find real-time info, facts, updates, or web search.\n"
            "- knowledge_base_search: Use this to search the local knowledge base (uploaded documents) for relevant information.\n\n"
            "Guidelines:\n"
            "1. Only use tools if absolutely necessary. If you can answer directly, do so.\n"
            "2. When using web_search, formulate a clean, targeted query.\n"
            "3. If a tool fails or returns an error, try to correct your query/input or try a different approach.\n"
            "4. Once you have enough information, synthesize a final, clear, and complete answer for the user."
        )
        
        messages.append(SystemMessage(content=system_instructions))
        
        if history:
            messages.append(SystemMessage(content=f"Conversation history:\n{history}"))
            
        messages.append(HumanMessage(content=query))
        
        # Build LLM with fallback tool callers
        gemini_with_tools = self.generation_llm.bind_tools(self.tools)
        fallback_tool_callers = []
        
        # Load balanced tool callers
        groq_generators = list(self.groq_generators)
        random.shuffle(groq_generators)
        
        for groq_gen in groq_generators:
            fallback_tool_callers.append(groq_gen.bind_tools(self.tools))
                
        if fallback_tool_callers:
            llm_with_tools = gemini_with_tools.with_fallbacks(fallback_tool_callers, exceptions_to_handle=[Exception])
        else:
            llm_with_tools = gemini_with_tools
        
        tool_results = []
        for step in range(5):
            try:
                response = await llm_with_tools.ainvoke(messages, config=config)
            except Exception as invoke_err:
                print(f"Tool-calling agent LLM invocation failed: {invoke_err}. Triggering Manual Search & Synthesis Fallback...")
                # Graceful premium manual search fallback!
                return await self.execute_manual_search_fallback(query, history, invoke_err, config=config)
                
            messages.append(response)
            
            if not response.tool_calls:
                messages.pop()
                synthesis_prompt = (
                    "Now, synthesize the final response for the user using the tool results. "
                    "Provide a comprehensive, detailed, and well-structured explanation. Instead of generating a single brief sentence, explain the calculations step-by-step, provide the context surrounding the numbers, and break down the relevant segments to make the response highly informative, readable, and professional.\n\n"
                    "CRITICAL CITATION RULES:\n"
                    "You MUST ground your response by citing the source of the information inline:\n"
                    "- For facts retrieved from the local knowledge base (knowledge_base_search), cite using `[Source: filename, Pages: X, Y]` (e.g. `[Source: google.md]` or `[Source: tsla-20251231-gen.pdf, Pages: 52, 55]`).\n"
                    "- For facts retrieved from the web search tool (web_search), cite using `[Source: web:query]` (e.g. `[Source: web:CEO of Adobe]`).\n"
                    "If a paragraph, list of bullet points, or section is generated from the same source document, you only need to put a single citation at the end of that paragraph, section, or list block, grouping multiple pages if applicable. "
                    "Do NOT repeat the citation on every single line or sentence of a list/paragraph if they share the same source document. Do not mention tool names or internal execution details, only output the synthesized response with the inline citations."
                )
                messages.append(SystemMessage(content=synthesis_prompt))
                
                full_content = ""
                stream_config = config.copy() if config else RunnableConfig()
                if "tags" not in stream_config:
                    stream_config["tags"] = []
                if "generator" not in stream_config["tags"]:
                    stream_config["tags"].append("generator")
                
                try:
                    async for chunk in self.generation_llm.astream(messages, config=stream_config):
                        full_content += chunk.content
                except Exception as stream_err:
                    print(f"Streaming final answer failed: {stream_err}. Attempting fallback generation models...")
                    fallback_success = False
                    fallback_models = []
                    if hasattr(self, "groq_generators") and self.groq_generators:
                        for idx, groq_gen in enumerate(self.groq_generators):
                            fallback_models.append((f"Groq Key {idx+1}", groq_gen))
                            
                    # Shuffle fallbacks to distribute request load
                    random.shuffle(fallback_models)
                            
                    for name, fallback_llm in fallback_models:
                        try:
                            full_content = ""
                            async for chunk in fallback_llm.astream(messages, config=stream_config):
                                full_content += chunk.content
                            fallback_success = True
                            print(f"NexusAI Resilience: Fallback streaming model ({name}) succeeded.")
                            break
                        except Exception as fallback_e:
                            print(f"NexusAI Resilience: Fallback streaming model ({name}) failed ({fallback_e}).")
                    
                    if not fallback_success:
                        print("All fallback streaming models failed. Falling back to non-stream response.")
                        if isinstance(response.content, str):
                            full_content = response.content
                        elif isinstance(response.content, list):
                            text_blocks = []
                            for block in response.content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    text_blocks.append(block.get("text", ""))
                                elif isinstance(block, str):
                                    text_blocks.append(block)
                            full_content = "".join(text_blocks)
                        else:
                            full_content = str(response.content)
                        
                        if not full_content or not full_content.strip():
                            full_content = "The service encountered a rate-limit (429) error while synthesizing the final response. Please check your API key quota."
                
                return {"answer": full_content, "sources": tool_results}
                
            # Execute tool calls in parallel using asyncio.gather
            tasks = []
            tool_calls_info = []
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                tool_id = tool_call["id"]
                
                print(f"NexusAI Tool Calling: Agent requested tool '{tool_name}' with args {tool_args}")
                tool_fn = next((t for t in self.tools if t.name == tool_name), None)
                tool_calls_info.append((tool_name, tool_args, tool_id))
                
                if not tool_fn:
                    async def dummy_err(name=tool_name):
                        return f"Error: Tool '{name}' not found."
                    tasks.append(dummy_err())
                else:
                    async def run_tool_safe(t_fn, t_args):
                        try:
                            return await t_fn.ainvoke(t_args, config=config)
                        except Exception as tool_err:
                            return f"Error executing tool: {str(tool_err)}"
                    tasks.append(run_tool_safe(tool_fn, tool_args))
            
            import asyncio
            outputs = await asyncio.gather(*tasks)
            
            for (tool_name, tool_args, tool_id), tool_output in zip(tool_calls_info, outputs):
                messages.append(ToolMessage(content=tool_output, tool_call_id=tool_id))
                tool_results.append({
                    "content": f"Tool: {tool_name}\nInput: {tool_args}\nOutput: {tool_output}",
                    "metadata": {"source_file": f"tool:{tool_name}"}
                })
                
        return {"answer": "Error: Tool calling loop exceeded maximum iterations.", "sources": []}
