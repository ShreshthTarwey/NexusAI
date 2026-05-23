import os
import sys
import json
import time

# Add parent directory to path so we can import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
# Resolve absolute path to backend/.env relative to this script's directory
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
dotenv_path = os.path.join(backend_dir, ".env")
load_dotenv(dotenv_path=dotenv_path)

from services.embeddings_manager import EmbeddingsManager
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

def run_synthetic_generation():
    """
    Synthetically generates additional RAG test cases directly from the ingested PDF
    using RAGAS and load-balanced Groq models.
    """
    print("\n==================================================")
    print("NexusAI: Starting Synthetic Testset Generation Loop")
    print("==================================================")
    
    # 1. Verify environment keys
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        print("Error: GROQ_API_KEY is not defined in environment. Synthetic generation requires Groq API access.")
        return
        
    # 2. Locate PDF document
    # Find any pdf inside storage/sessions/ or backend/Data/
    pdf_path = None
    target_dir = os.path.join("backend", "Data")
    if not os.path.exists(target_dir):
        # Fallback to absolute workspace root searching
        target_dir = "Data"
        
    if os.path.exists(target_dir):
        for f in os.listdir(target_dir):
            if f.lower().endswith(".pdf") and "tsla" in f.lower():
                pdf_path = os.path.join(target_dir, f)
                break
                
    if not pdf_path:
        # Search global sessions directory
        sessions_dir = os.path.join("storage", "sessions")
        if os.path.exists(sessions_dir):
            for s_dir in os.listdir(sessions_dir):
                full_s_dir = os.path.join(sessions_dir, s_dir)
                if os.path.isdir(full_s_dir):
                    for f in os.listdir(full_s_dir):
                        if f.lower().endswith(".pdf"):
                            pdf_path = os.path.join(full_s_dir, f)
                            break
                    if pdf_path:
                        break

    if not pdf_path or not os.path.exists(pdf_path):
        print("Warning: Tesla 10-K PDF document not found in workspace directories. Please ensure the PDF is uploaded.")
        return
        
    print(f"Loading document: {pdf_path}")
    
    try:
        from langchain_groq import ChatGroq
        from ragas.testset.generator import TestsetGenerator
        from ragas.testset.evolutions import simple, reasoning, multi_context
        from ragas.llms import LangchainLLMWrapper
        from ragas.embeddings import LangchainEmbeddingsWrapper
        
        # 3. Load PDF and chunk text
        loader = PyMuPDFLoader(pdf_path)
        docs = loader.load()
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_documents(docs)
        
        print(f"Split document into {len(chunks)} chunks.")
        
        # 4. Set up generator models (using Groq high TPM models to prevent 429)
        generator_llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key)
        critic_llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0, groq_api_key=groq_api_key)
        
        ragas_generator_llm = LangchainLLMWrapper(generator_llm)
        ragas_critic_llm = LangchainLLMWrapper(critic_llm)
        
        # 5. Set up local embedding wrapper to save cloud tokens
        local_emb = EmbeddingsManager.get_embeddings()
        ragas_embeddings = LangchainEmbeddingsWrapper(local_emb)
        
        print("Initializing RAGAS Testset Generator...")
        generator = TestsetGenerator.from_langchain(
            generator_llm=ragas_generator_llm,
            critic_llm=ragas_critic_llm,
            embeddings=ragas_embeddings
        )
        
        # 6. Generate a small synthetic set (e.g. 3 test cases to append)
        print("Generating 3 synthetic test cases (this can take up to 2-3 minutes)...")
        testset = generator.generate_with_langchain_docs(
            documents=chunks[:30],  # Limit chunks to speed up generation
            test_size=3,
            distributions={simple: 0.5, reasoning: 0.5}
        )
        
        df = testset.to_pandas()
        new_cases = []
        for _, row in df.iterrows():
            new_cases.append({
                "question": row["question"],
                "ground_truth": row["ground_truth"],
                "contexts": row["contexts"] if isinstance(row["contexts"], list) else [row["contexts"]]
            })
            
        # 7. Merge into existing test_set.json
        json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_set.json")
        existing_cases = []
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                existing_cases = json.load(f)
                
        existing_cases.extend(new_cases)
        
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(existing_cases, f, indent=2)
            
        print(f"Success! Generated and appended {len(new_cases)} synthetic test cases to test_set.json.")
        print(f"Total test cases in dataset: {len(existing_cases)}")
        
    except Exception as e:
        print(f"Error during synthetic generation: {e}")

if __name__ == "__main__":
    run_synthetic_generation()
