from langchain_huggingface import HuggingFaceEmbeddings

class EmbeddingsManager:
    _instance = None

    @classmethod
    def get_embeddings(cls) -> HuggingFaceEmbeddings:
        """
        Returns a global singleton instance of HuggingFaceEmbeddings.
        Ensures the PyTorch weights are only loaded into memory once.
        """
        if cls._instance is None:
            print("NexusAI: Initializing HuggingFaceEmbeddings (all-MiniLM-L6-v2) once in memory...")
            cls._instance = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
            print("NexusAI: HuggingFaceEmbeddings initialized successfully.")
        return cls._instance
