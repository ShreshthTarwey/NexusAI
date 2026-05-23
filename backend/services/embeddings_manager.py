import os
import gc
import time
import asyncio
from langchain_huggingface import HuggingFaceEmbeddings

class EmbeddingsManager:
    _instance = None
    _last_accessed = 0.0

    @classmethod
    def get_embeddings(cls) -> HuggingFaceEmbeddings:
        """
        Returns a global singleton instance of HuggingFaceEmbeddings.
        Ensures the PyTorch weights are only loaded into memory once.
        Updates the last accessed timestamp for dynamic idle monitoring.
        """
        cls._last_accessed = time.time()
        if cls._instance is None:
            print("NexusAI: Initializing HuggingFaceEmbeddings (all-MiniLM-L6-v2) once in memory...")
            cls._instance = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
            print("NexusAI: HuggingFaceEmbeddings initialized successfully.")
        return cls._instance

    @classmethod
    def unload(cls):
        """
        Explicitly unloads the embedding model from memory and forces garbage collection.
        """
        if cls._instance is not None:
            print("NexusAI EmbeddingsManager: Unloading embedding model weights from memory...")
            cls._instance = None
            gc.collect()
            
            # If torch is available, clear CUDA cache to release GPU memory
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
            print("NexusAI EmbeddingsManager: Embedding model weights unloaded successfully.")

    @classmethod
    async def auto_unload_loop(cls):
        """
        Asynchronous background task that monitors the idle time of the embedding model
        and unloads it if it has been inactive beyond the configured TTL.
        """
        print("NexusAI EmbeddingsManager: Background idle-unload monitor initialized.")
        while True:
            try:
                # Read dynamic TTL from env (default: 900 seconds / 15 minutes)
                ttl = float(os.getenv("EMBEDDINGS_IDLE_TTL", "900"))
                
                if cls._instance is not None:
                    idle_duration = time.time() - cls._last_accessed
                    if idle_duration > ttl:
                        print(f"NexusAI EmbeddingsManager: Model has been idle for {idle_duration:.1f}s (TTL: {ttl}s). Triggering auto-unload.")
                        cls.unload()
            except Exception as e:
                print(f"NexusAI EmbeddingsManager Error in auto_unload_loop: {e}")
                
            await asyncio.sleep(60)
