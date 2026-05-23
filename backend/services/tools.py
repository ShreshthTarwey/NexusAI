import re
import math
import urllib.parse
import urllib.request
from langchain_core.tools import tool

@tool
def safe_calculator(expression: str) -> str:
    """
    Safely evaluates a mathematical expression.
    Use this tool whenever the query asks to calculate math expressions, verify calculations, or evaluate operations.
    Input must be a mathematical expression string, e.g. "sqrt(144) * 1.5".
    """
    if not expression or not isinstance(expression, str) or not expression.strip():
        return "Error: Expression parameter is empty or invalid."
        
    # Allow only digits, basic operators, spaces, parentheses, and selected mathematical names
    clean_expr = expression.strip()
    
    # Strip common formatting characters that LLMs pass: currency symbols and commas in numbers
    clean_expr = re.sub(r'[\$,€£¥]', '', clean_expr)
    
    # Check for unauthorized characters or functions
    if '**' in clean_expr:
        return "Error: Exponentiation operator '**' is not allowed. Please use pow(base, exponent) instead."
        
    sanitized = re.sub(r'(sqrt|sin|cos|tan|log|pi|e|pow|abs)', '', clean_expr)
    if not re.match(r'^[0-9+\-*/().%\s]*$', sanitized):
        return "Error: Invalid mathematical expression. Only basic arithmetic and standard math functions (sqrt, sin, cos, tan, log, abs, pow, pi, e) are allowed."
    
    safe_dict = {
        "sqrt": math.sqrt,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "log": math.log,
        "pow": math.pow,
        "abs": abs,
        "pi": math.pi,
        "e": math.e
    }
    
    try:
        # Evaluate in restricted namespace with no builtins accessible
        result = eval(clean_expr, {"__builtins__": None}, safe_dict)
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {str(e)}"

@tool
def web_search(query: str) -> str:
    """
    Searches the web using DuckDuckGo to find real-time info, facts, and updates.
    Use this tool when the information is not present in the uploaded documents,
    or when a user explicitly asks for external web search or live facts.
    """
    if not query or not isinstance(query, str) or not query.strip():
        return "Error: Query parameter is empty or invalid."
        
    try:
        from langchain_community.tools import DuckDuckGoSearchRun
        search_tool = DuckDuckGoSearchRun()
        result = search_tool.run(query)
        if result:
            return result
    except Exception as e:
        print(f"NexusAI Tools warning: Langchain DuckDuckGoSearchRun failed ({e}). Attempting direct fallback scraper...")
        
    # Fallback to direct HTTP request to DuckDuckGo HTML interface if packages fail
    try:
        encoded_query = urllib.parse.quote(query)
        url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
        req = urllib.request.Request(
            url, 
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            }
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode('utf-8')
            
        # Extract snippets using simple regex (no bs4 dependency required)
        snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.DOTALL)
        if snippets:
            clean_snippets = []
            for s in snippets[:4]:
                s_clean = re.sub(r'<[^>]*>', '', s).strip()
                # Decode HTML entities
                s_clean = s_clean.replace('&amp;', '&').replace('&quot;', '"').replace('&apos;', "'").replace('&lt;', '<').replace('&gt;', '>')
                clean_snippets.append(s_clean)
            return "\n\n".join(clean_snippets)
    except Exception as fallback_err:
        print(f"NexusAI Tools error: Direct fallback web scraper failed ({fallback_err})")
        
    return "Error: Could not retrieve search results due to a network connection timeout or temporary search engine block."

def create_knowledge_base_search_tool(query_processor):
    """
    Factory function to create a session-scoped knowledge_base_search tool.
    This links the tool with the QueryProcessor of the active session.
    """
    @tool
    def knowledge_base_search(query: str) -> str:
        """
        Searches the local knowledge base (uploaded documents) for relevant information.
        Use this tool when the query requires searching or checking facts, details, or documentation in the uploaded documents
        while performing another task (e.g. comparing with web results or performing math on retrieved values).
        Input must be a simple keyword search or semantic query string.
        """
        if not query or not isinstance(query, str) or not query.strip():
            return "Error: Query parameter is empty or invalid."
        try:
            docs = query_processor.retrieve_documents(query, k=5)
            if not docs:
                return "No relevant information found in the local knowledge base."
            return query_processor.format_context(docs)
        except Exception as e:
            return f"Error searching knowledge base: {str(e)}"
            
    return knowledge_base_search
