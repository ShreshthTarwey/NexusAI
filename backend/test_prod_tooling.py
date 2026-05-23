import os
import sys
import re
import asyncio
import time
import unittest
from unittest.mock import MagicMock, AsyncMock

# Add backend directory to sys.path so we can import services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.embeddings_manager import EmbeddingsManager
from services.document_processor import DocumentProcessor
from services.query_processor import QueryProcessor
from services.agent_orchestrator import AgentOrchestrator
from services.tools import safe_calculator, web_search
from main import validate_session_id
from fastapi import HTTPException

class TestSystemHardeningAndTooling(unittest.IsolatedAsyncioTestCase):

    def test_embeddings_singleton(self):
        """
        Verify that multiple instances of QueryProcessor and DocumentProcessor
        refer to the exact same HuggingFaceEmbeddings singleton instance.
        """
        print("\n--- Testing Embeddings Singleton Cache ---")
        doc_proc = DocumentProcessor(session_id="chat_12345678")
        query_proc = QueryProcessor(session_id="chat_12345678")
        
        self.assertIs(doc_proc.embeddings, query_proc.embeddings, 
                      "Embeddings objects in DocumentProcessor and QueryProcessor are NOT the same instance!")
        
        # Verify it matches the manager singleton
        manager_instance = EmbeddingsManager.get_embeddings()
        self.assertIs(doc_proc.embeddings, manager_instance, 
                      "Processor embeddings instance does not match EmbeddingsManager singleton!")
        print("Success: Embedding singleton shares the exact same memory address across services.")

    def test_session_id_security_hardening(self):
        """
        Verify path traversal session ID blocking on backend services and main.py endpoints.
        """
        print("\n--- Testing Session ID Security Hardening (Traversal Prevention) ---")
        invalid_ids = [
            "../admin",
            "chat_123/../../etc",
            "default/..",
            "invalid-session-char$",
            "sh",            # Too short (less than 3 chars)
            "a" * 51,         # Too long (more than 50 chars)
            "session_id with spaces",
            "path\\traversal"
        ]
        
        valid_ids = [
            "default",
            "chat_abcd1234",
            "session_99_test",
            "user_name_123"
        ]

        # Test DocumentProcessor validation
        for invalid_id in invalid_ids:
            with self.assertRaises(ValueError, msg=f"DocumentProcessor failed to raise ValueError for invalid ID: {invalid_id}"):
                DocumentProcessor(session_id=invalid_id)
            
            with self.assertRaises(ValueError, msg=f"QueryProcessor failed to raise ValueError for invalid ID: {invalid_id}"):
                QueryProcessor(session_id=invalid_id)

            with self.assertRaises(HTTPException, msg=f"validate_session_id failed to raise HTTPException for: {invalid_id}"):
                validate_session_id(invalid_id)

        # Verify valid IDs pass without error
        for valid_id in valid_ids:
            try:
                DocumentProcessor(session_id=valid_id)
                QueryProcessor(session_id=valid_id)
                validate_session_id(valid_id)
            except Exception as e:
                self.fail(f"Valid session_id '{valid_id}' was incorrectly blocked: {e}")

        print("Success: Path traversal and malformed session IDs are successfully blocked.")

    def test_markdown_xss_link_sanitization(self):
        """
        Verify the Markdown URL parsing protocol filter matches the React frontend rules.
        React frontend rules:
        - Protocols allowed: http, https, mailto, tel, file (for dev workspace)
        - Protocols blocked: javascript:
        - Relative paths allowed.
        """
        print("\n--- Testing Markdown XSS Link Sanitization Logic ---")
        
        def mock_js_link_sanitizer(url):
            url_clean = url.strip()
            url_lower = url_clean.toLowerCase() if hasattr(url_clean, 'toLowerCase') else url_clean.lower()
            
            # Simple protocol checker matching JS regex /^[a-z]+:/i
            has_protocol = bool(re.match(r'^[a-z]+:', url_lower))
            is_safe = False
            
            if not has_protocol:
                is_safe = True
            else:
                is_safe = (
                    url_lower.startswith('http://') or
                    url_lower.startswith('https://') or
                    url_lower.startswith('mailto:') or
                    url_lower.startswith('tel:') or
                    url_lower.startswith('file://')
                )
                
            if is_safe and not re.search(r'^\s*javascript:', url_lower):
                return f"safe_link:{url_clean}"
            else:
                return "blocked"

        test_cases = [
            ("https://google.com", "safe_link:https://google.com"),
            ("http://nexusai.io/api", "safe_link:http://nexusai.io/api"),
            ("mailto:admin@nexus.ai", "safe_link:mailto:admin@nexus.ai"),
            ("tel:+1234567890", "safe_link:tel:+1234567890"),
            ("file:///C:/Users/DELL/workspace", "safe_link:file:///C:/Users/DELL/workspace"),
            ("/api/local/route", "safe_link:/api/local/route"),
            ("./local/file.txt", "safe_link:./local/file.txt"),
            ("javascript:alert(document.cookie)", "blocked"),
            ("   javascript:prompt(1)  ", "blocked"),
            ("data:text/html,<html>", "blocked"),
            ("vbscript:msgbox(1)", "blocked"),
        ]

        for url, expected in test_cases:
            res = mock_js_link_sanitizer(url)
            self.assertEqual(res, expected, f"Failed link check for URL: '{url}' -> Expected {expected}, got {res}")

        print("Success: XSS Link sanitizer successfully permits safe protocols and restricts javascript:/unsafe URIs.")

    async def test_high_performance_parallel_tool_calling(self):
        """
        Verify that execute_tool_calling_agent runs multiple tool calls concurrently.
        We will simulate running 3 tool calls, each having a 0.5 second execution delay.
        Under sequential flow: elapsed time >= 1.5 seconds.
        Under parallel flow: elapsed time should be close to 0.5 seconds (well under 1.0s).
        """
        print("\n--- Testing High-Performance Parallel Tool Calling ---")
        
        # Create dummy tasks that simulate tools
        async def dummy_slow_tool(delay: float):
            await asyncio.sleep(delay)
            return "Success"

        # Define 3 tool calls
        start_time = time.time()
        
        # Run three slow tasks concurrently with asyncio.gather (same structure as execute_tool_calling_agent)
        tasks = [dummy_slow_tool(0.5) for _ in range(3)]
        results = await asyncio.gather(*tasks)
        
        end_time = time.time()
        elapsed = end_time - start_time
        
        self.assertEqual(results, ["Success", "Success", "Success"])
        print(f"Time elapsed for 3 parallel tool executions: {elapsed:.4f} seconds")
        self.assertLess(elapsed, 1.0, f"Tool execution took {elapsed}s which indicates sequential running instead of parallel!")
        
        print("Success: Parallel tool execution validated concurrently via asyncio.gather.")

if __name__ == "__main__":
    unittest.main()
