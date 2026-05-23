import os
import sys
import json
import asyncio
import time
import pandas as pd
from datetime import datetime

# Add parent directory to path so we can import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
# Resolve absolute path to backend/.env relative to this script's directory
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
dotenv_path = os.path.join(backend_dir, ".env")
load_dotenv(dotenv_path=dotenv_path)

from services.embeddings_manager import EmbeddingsManager
from services.agent_orchestrator import AgentOrchestrator

async def run_evaluation_suite():
    """
    Executes the golden test set against the active LangGraph Orchestrator
    and computes the RAG Triad scores using RAGAS, load-balanced fallbacks,
    and local embeddings.
    """
    print("\n==================================================")
    print("NexusAI: Initializing Production RAGAS Evaluation")
    print("==================================================")
    
    # 1. Load active API Keys for fallback load balancer
    groq_key_1 = os.getenv("GROQ_API_KEY")
    groq_key_2 = os.getenv("GROQ_API_KEY2")
    or_key_1 = os.getenv("OPEN_ROUTER_KEY1")
    or_key_2 = os.getenv("OPEN_ROUTER_KEY2")
    
    if not groq_key_1:
        print("Error: GROQ_API_KEY is missing in the environment. Evaluation requires Groq for high-performance reasoning.")
        return
        
    print("Loaded Cloud Keys Pool:")
    print(f"- Groq Key 1: {'Active' if groq_key_1 else 'Missing'}")
    print(f"- Groq Key 2: {'Active' if groq_key_2 else 'Missing'}")
    print(f"- OpenRouter Key 1: {'Active' if or_key_1 else 'Missing'}")
    print(f"- OpenRouter Key 2: {'Active' if or_key_2 else 'Missing'}")
    
    # 2. Load golden test set
    json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_set.json")
    if not os.path.exists(json_path):
        print(f"Error: Golden test set file not found at: {json_path}")
        return
        
    with open(json_path, "r", encoding="utf-8") as f:
        test_cases = json.load(f)
        
    print(f"Loaded {len(test_cases)} evaluation cases from test_set.json.")
    
    # 3. Setup evaluation workspace & clone vector DB from active session
    eval_session_id = "chat_evaluation_run"
    eval_session_dir = os.path.join(backend_dir, "storage", "sessions", eval_session_id)
    os.makedirs(eval_session_dir, exist_ok=True)
    
    # Scan storage/sessions/ to find a session containing vector_db
    source_session_dir = None
    sessions_dir = os.path.join(backend_dir, "storage", "sessions")
    if os.path.exists(sessions_dir):
        for s_dir in os.listdir(sessions_dir):
            if s_dir == eval_session_id:
                continue
            full_path = os.path.join(sessions_dir, s_dir)
            if os.path.isdir(full_path) and os.path.exists(os.path.join(full_path, "vector_db")):
                source_session_dir = full_path
                break
                
    if source_session_dir:
        print(f"Cloning vector database from active session: {source_session_dir} -> {eval_session_dir}")
        import shutil
        try:
            # Copy FAISS database directory
            src_db = os.path.join(source_session_dir, "vector_db")
            dest_db = os.path.join(eval_session_dir, "vector_db")
            if os.path.exists(dest_db):
                shutil.rmtree(dest_db)
            shutil.copytree(src_db, dest_db)
            
            # Copy BM25 Pickles if they exist
            for pkl in ["bm25_retriever.pkl", "corpus.pkl"]:
                src_pkl = os.path.join(source_session_dir, pkl)
                dest_pkl = os.path.join(eval_session_dir, pkl)
                if os.path.exists(src_pkl):
                    shutil.copy2(src_pkl, dest_pkl)
            print("Session cloning completed successfully.")
        except Exception as copy_err:
            print(f"Warning: Failed to copy active database: {copy_err}. Standard RAG might run empty.")
    else:
        print("Warning: No active vector store found under storage/sessions/. Continuing empty.")

    orchestrator = AgentOrchestrator(session_id=eval_session_id)
    
    # 4. EXPLICIT RESILIENT BYPASS: Build a load-balanced cloud LLM pool for both Orchestrator and Evaluator
    # This prevents hitting rate limits (TPD/RPM) on any single key by falling back seamlessly across all 4 keys!
    from langchain_groq import ChatGroq
    from langchain_openai import ChatOpenAI
    from services.agent_orchestrator import RouterDecision, GuardrailDecision, GraderDecision
    
    # Initialize basic model wrappers for the key pool
    model_groq_1 = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_key_1, max_retries=0)
    model_groq_2 = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_key_2, max_retries=0) if groq_key_2 else None
    
    # Use google/gemini-2.5-flash:free on OpenRouter since it supports structured outputs and tool calling natively and has 100% stable compatibility!
    model_or_1 = ChatOpenAI(
        model="google/gemini-2.5-flash:free",
        temperature=0,
        openai_api_key=or_key_1,
        openai_api_base="https://openrouter.ai/api/v1",
        max_retries=0
    ) if or_key_1 else None
    
    model_or_2 = ChatOpenAI(
        model="google/gemini-2.5-flash:free",
        temperature=0,
        openai_api_key=or_key_2,
        openai_api_base="https://openrouter.ai/api/v1",
        max_retries=0
    ) if or_key_2 else None
    
    # Create the active list of fallback models
    fallback_models = []
    if model_groq_2:
        fallback_models.append(model_groq_2)
    if model_or_1:
        fallback_models.append(model_or_1)
    if model_or_2:
        fallback_models.append(model_or_2)
        
    resilient_evaluator = model_groq_1.with_fallbacks(fallback_models, exceptions_to_handle=[Exception])
    
    # Construct structured output fallback chains for the orchestrator to preserve Type Integrity
    # Route structured fallbacks
    primary_router = model_groq_1.with_structured_output(RouterDecision)
    router_fallbacks = []
    if model_groq_2:
        router_fallbacks.append(model_groq_2.with_structured_output(RouterDecision))
    if model_or_1:
        router_fallbacks.append(model_or_1.with_structured_output(RouterDecision))
    if model_or_2:
        router_fallbacks.append(model_or_2.with_structured_output(RouterDecision))
    resilient_router_llm = primary_router.with_fallbacks(router_fallbacks, exceptions_to_handle=[Exception])
    
    # Guardrail structured fallbacks
    primary_guardrail = model_groq_1.with_structured_output(GuardrailDecision)
    guardrail_fallbacks = []
    if model_groq_2:
        guardrail_fallbacks.append(model_groq_2.with_structured_output(GuardrailDecision))
    if model_or_1:
        guardrail_fallbacks.append(model_or_1.with_structured_output(GuardrailDecision))
    if model_or_2:
        guardrail_fallbacks.append(model_or_2.with_structured_output(GuardrailDecision))
    resilient_guardrail_llm = primary_guardrail.with_fallbacks(guardrail_fallbacks, exceptions_to_handle=[Exception])
    
    # Grader structured fallbacks
    primary_grader = model_groq_1.with_structured_output(GraderDecision)
    grader_fallbacks = []
    if model_groq_2:
        grader_fallbacks.append(model_groq_2.with_structured_output(GraderDecision))
    if model_or_1:
        grader_fallbacks.append(model_or_1.with_structured_output(GraderDecision))
    if model_or_2:
        grader_fallbacks.append(model_or_2.with_structured_output(GraderDecision))
    resilient_grader_llm = primary_grader.with_fallbacks(grader_fallbacks, exceptions_to_handle=[Exception])
    
    # Bind the resilient components to the orchestrator properly
    orchestrator.generation_llm = resilient_evaluator
    orchestrator.router_llm = resilient_router_llm
    orchestrator.guardrail_llm = resilient_guardrail_llm
    orchestrator.grader_llm = resilient_grader_llm
    
    # Set groq_generators to contain ALL active key options so tool calling can dynamically bind and fall back across keys
    orchestrator.groq_generators = [model_groq_1] + fallback_models
    
    eval_data = []
    print("\nExecuting queries through local LangGraph State Machine (Bypassing Gemini -> Using Resilient Groq/OpenRouter Pool)...")
    
    # Process test cases with a rate-limit safe concurrency limit
    for idx, case in enumerate(test_cases):
        q = case["question"]
        print(f"\n[{idx+1}/{len(test_cases)}] Question: '{q}'")
        
        start_time = time.time()
        try:
            # Inject history context manually to let rewriter run if needed
            state = {
                "query": q,
                "original_query": q,
                "chat_history": "",
                "retries": 0,
                "grader_retry": False
            }
            # Run state graph synchronously
            res = await orchestrator.graph.ainvoke(state)
            latency = time.time() - start_time
            
            generated_answer = res.get("answer", "")
            retrieved_docs = res.get("documents", [])
            
            # Format chunks to match RAGAS expectations
            contexts = [doc.page_content for doc in retrieved_docs] if retrieved_docs else ["No context retrieved."]
            
            print(f"-> Generated Answer: {generated_answer[:60]}...")
            print(f"-> Chunks Retrieved: {len(contexts)} | Latency: {latency:.2f}s")
            
            eval_data.append({
                "question": q,
                "answer": generated_answer,
                "contexts": contexts,
                "ground_truth": case["ground_truth"]
            })
            
            # Delay slightly between runs to protect cloud rate limits
            await asyncio.sleep(2)
            
        except Exception as e:
            print(f"-> Pipeline execution failed for query: {e}")
            eval_data.append({
                "question": q,
                "answer": f"Error: {e}",
                "contexts": ["Error retrieving context."],
                "ground_truth": case["ground_truth"]
            })
            
    # 4. Initialize RAGAS dataset
    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics.collections import Faithfulness, AnswerRelevancy, ContextRecall
        from ragas.llms import LangchainLLMWrapper
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from langchain_groq import ChatGroq
        from langchain_openai import ChatOpenAI
        
        print("\nLoading RAGAS Dataset...")
        dataset = Dataset.from_list(eval_data)
        
        # 5. Build resilient load-balanced LLM Pool for Evaluator Judge
        primary_evaluator = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_key_1, max_retries=0)
        fallback_evaluators = []
        
        if groq_key_2:
            fallback_evaluators.append(ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_key_2, max_retries=0))
        if or_key_1:
            fallback_evaluators.append(ChatOpenAI(
                model="google/gemini-2.5-flash:free",
                temperature=0,
                openai_api_key=or_key_1,
                openai_api_base="https://openrouter.ai/api/v1",
                max_retries=0
            ))
        if or_key_2:
            fallback_evaluators.append(ChatOpenAI(
                model="google/gemini-2.5-flash:free",
                temperature=0,
                openai_api_key=or_key_2,
                openai_api_base="https://openrouter.ai/api/v1",
                max_retries=0
            ))
            
        # Compile cascade logic: automatically rotate through all keys on rate-limits
        resilient_evaluator = primary_evaluator.with_fallbacks(fallback_evaluators, exceptions_to_handle=[Exception])
        ragas_llm = LangchainLLMWrapper(resilient_evaluator)
        
        # 6. Configure local embeddings singleton to save cloud quota
        local_emb = EmbeddingsManager.get_embeddings()
        ragas_embeddings = LangchainEmbeddingsWrapper(local_emb)
        
        print("Computing RAG Triad scores (Faithfulness, Answer Relevancy, Context Recall)...")
        
        # Instantiate metric classes with their respective components
        faithfulness_metric = Faithfulness(llm=ragas_llm)
        answer_relevancy_metric = AnswerRelevancy(llm=ragas_llm, embeddings=ragas_embeddings)
        context_recall_metric = ContextRecall(llm=ragas_llm, embeddings=ragas_embeddings)
        
        # Run evaluations with strict worker throttle to protect keys
        result = evaluate(
            dataset=dataset,
            metrics=[faithfulness_metric, answer_relevancy_metric, context_recall_metric],
            llm=ragas_llm,
            embeddings=ragas_embeddings
        )
        
        # 7. Print Terminal Score Dashboard
        print("\n==================================================")
        print("      NEXUSAI RAGAS EVALUATION METRICS DASHBOARD")
        print("==================================================")
        print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("--------------------------------------------------")
        for metric, score in result.items():
            print(f"📊 {metric.upper():<25} : {score * 100:.2f}%")
        print("==================================================")
        
        # 8. Save local markdown report
        report_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")
        os.makedirs(report_dir, exist_ok=True)
        report_path = os.path.join(report_dir, f"eval_report_{int(time.time())}.md")
        
        df_result = result.to_pandas()
        
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(f"# NexusAI RAGAS Quality Report\n\n")
            f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write(f"## Overall Score Metrics\n\n")
            f.write(f"| Metric | Quality Score |\n")
            f.write(f"| :--- | :--- |\n")
            for metric, score in result.items():
                f.write(f"| **{metric.capitalize()}** | {score * 100:.2f}% |\n")
            f.write("\n")
            f.write(f"## Microscopic Query Performance Analysis\n\n")
            f.write(f"| # | Question | Faithfulness | Answer Relevancy | Context Recall |\n")
            f.write(f"| :--- | :--- | :--- | :--- | :--- |\n")
            for idx, row in df_result.iterrows():
                f.write(f"| {idx+1} | {row['question'][:50]}... | {row.get('faithfulness', 0)*100:.1f}% | {row.get('answer_relevancy', 0)*100:.1f}% | {row.get('context_recall', 0)*100:.1f}% |\n")
            f.write("\n*Local report saved successfully at: backend/eval/reports/*\n")
            
        print(f"Saved detailed local quality report at: {report_path}")
        
    except Exception as eval_err:
        print(f"Evaluation runner encountered an error: {eval_err}")

if __name__ == "__main__":
    asyncio.run(run_evaluation_suite())
