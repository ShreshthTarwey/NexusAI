import asyncio
import aiohttp
import time
import json
import random
import os
import numpy as np
from datetime import datetime

# Load test configurations
BASE_URL = "http://localhost:8000"
NUM_USERS = 10
CONCURRENCY = 5
QUERY_LOOPS = 3

# Sample context to populate synthetic text document
MOCK_DOCUMENT_CONTENT = """
NexusAI System Specifications and Operations Manual.
NexusAI is a hybrid agentic platform running LangGraph machines.
The system features offline FAISS semantic indexing using all-MiniLM-L6-v2 embeddings.
BM25 rank retriever provides statistical exact-keyword overlap weighting.
Conversational context memory is persisted securely in MongoDB Atlas database collections.
Dynamic session directories isolate vector indices per-tenant using strict session identifier regex validation.
A resilient multi-tier fallback architecture reroutes traffic to Llama-3.3-70b-versatile via Groq.
XSS sanitization rules inside the Markdown block compiler block unsafe scripts using protocol allowlists.
"""

SAMPLE_QUERIES = [
    "What is the embedding model used in NexusAI?",
    "Where is the chat memory persisted?",
    "What fallback model is used when Gemini is down?",
    "How does the system prevent XSS?",
    "What indices does the hybrid retriever ensemble?"
]

class UserSession:
    def __init__(self, user_idx: int):
        self.username = f"load_user_{user_idx}_{random.randint(1000, 9999)}"
        self.password = "SecurePassword123!"
        self.token = None
        self.session_id = None
        self.metrics = {
            "register": None,
            "login": None,
            "create_session": None,
            "upload_file": None,
            "queries": []
        }

    async def run(self, session: aiohttp.ClientSession, file_path: str):
        # 1. Register User
        start = time.time()
        try:
            async with session.post(f"{BASE_URL}/api/auth/register", json={
                "username": self.username,
                "password": self.password
            }) as resp:
                if resp.status == 200:
                    self.metrics["register"] = time.time() - start
                else:
                    print(f"[{self.username}] Registration failed: {resp.status}")
                    return False
        except Exception as e:
            print(f"[{self.username}] Registration error: {e}")
            return False

        # 2. Login User
        start = time.time()
        try:
            async with session.post(f"{BASE_URL}/api/auth/login", json={
                "username": self.username,
                "password": self.password
            }) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self.token = data["access_token"]
                    self.metrics["login"] = time.time() - start
                else:
                    print(f"[{self.username}] Login failed: {resp.status}")
                    return False
        except Exception as e:
            print(f"[{self.username}] Login error: {e}")
            return False

        headers = {"Authorization": f"Bearer {self.token}"}

        # 3. Create persistent chat session
        start = time.time()
        try:
            async with session.post(f"{BASE_URL}/api/sessions", headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self.session_id = data["session_id"]
                    self.metrics["create_session"] = time.time() - start
                else:
                    print(f"[{self.username}] Session creation failed: {resp.status}")
                    return False
        except Exception as e:
            print(f"[{self.username}] Session creation error: {e}")
            return False

        # 4. Upload mock file to the session
        start = time.time()
        try:
            data = aiohttp.FormData()
            data.add_field('files', open(file_path, 'rb'), filename='load_spec.txt', content_type='text/plain')
            data.add_field('session_id', self.session_id)
            
            async with session.post(f"{BASE_URL}/api/upload", data=data, headers=headers) as resp:
                if resp.status == 200:
                    # Polling for processing status (simulate frontend)
                    job_data = await resp.json()
                    job_id = job_data.get("job_id")
                    
                    if job_id:
                        success = await self.poll_upload_job(session, job_id, headers)
                        if success:
                            self.metrics["upload_file"] = time.time() - start
                        else:
                            print(f"[{self.username}] File processing job failed")
                            return False
                    else:
                        self.metrics["upload_file"] = time.time() - start
                else:
                    print(f"[{self.username}] Upload failed: {resp.status}")
                    return False
        except Exception as e:
            print(f"[{self.username}] Upload error: {e}")
            return False

        # 5. Flood queries concurrently (simulate conversational interaction)
        for i in range(QUERY_LOOPS):
            query = random.choice(SAMPLE_QUERIES)
            start_q = time.time()
            ttft = None  # Time to first token
            tokens_count = 0
            
            try:
                payload = {
                    "query": query,
                    "session_id": self.session_id
                }
                async with session.post(f"{BASE_URL}/api/query", json=payload, headers=headers) as resp:
                    if resp.status == 200:
                        # Read SSE Stream
                        async for line in resp.content:
                            line_str = line.decode('utf-8').strip()
                            if line_str.startswith("data:"):
                                data_chunk = json.loads(line_str[5:])
                                if "text" in data_chunk:
                                    if ttft is None:
                                        ttft = time.time() - start_q
                                    tokens_count += 1
                        
                        total_duration = time.time() - start_q
                        self.metrics["queries"].append({
                            "query": query,
                            "ttft": ttft,
                            "duration": total_duration,
                            "tokens": tokens_count,
                            "status": "success"
                        })
                    else:
                        self.metrics["queries"].append({
                            "query": query,
                            "ttft": None,
                            "duration": time.time() - start_q,
                            "tokens": 0,
                            "status": f"failed_HTTP_{resp.status}"
                        })
            except Exception as q_err:
                self.metrics["queries"].append({
                    "query": query,
                    "ttft": None,
                    "duration": time.time() - start_q,
                    "tokens": 0,
                    "status": f"error_{str(q_err)}"
                })
            
            await asyncio.sleep(random.uniform(0.5, 1.5)) # Slight random user think time

        # Clean up database resources for this session dynamically
        try:
            async with session.delete(f"{BASE_URL}/api/sessions/{self.session_id}", headers=headers) as resp:
                pass
        except Exception:
            pass

        return True

    async def poll_upload_job(self, session: aiohttp.ClientSession, job_id: str, headers: dict) -> bool:
        for _ in range(30): # max 30 seconds polling
            await asyncio.sleep(1)
            async with session.get(f"{BASE_URL}/api/upload/status/{job_id}", headers=headers) as resp:
                if resp.status == 200:
                    status_data = await resp.json()
                    if status_data.get("status") == "success":
                        return True
                    elif status_data.get("status") == "error":
                        return False
        return False

def compile_percentiles(times_list):
    if not times_list:
        return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "avg": 0.0}
    clean_list = [t for t in times_list if t is not None]
    if not clean_list:
        return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "avg": 0.0}
    return {
        "p50": np.percentile(clean_list, 50),
        "p95": np.percentile(clean_list, 95),
        "p99": np.percentile(clean_list, 99),
        "avg": np.mean(clean_list)
    }

async def main_load_test():
    print("==================================================")
    print("NexusAI: Running Automated Load & Performance Test")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("==================================================")
    print(f"Total Virtual Users: {NUM_USERS}")
    print(f"Concurrency Limit: {CONCURRENCY}")
    print(f"Queries per User: {QUERY_LOOPS}")
    print("--------------------------------------------------")

    # Generate small mock spec sheet
    mock_file = "load_spec.txt"
    with open(mock_file, "w", encoding="utf-8") as f:
        f.write(MOCK_DOCUMENT_CONTENT)

    users = [UserSession(i) for i in range(NUM_USERS)]
    
    # Throttle concurrency using a Semaphore
    sem = asyncio.Semaphore(CONCURRENCY)
    
    async def worker(user, client_session):
        async with sem:
            await user.run(client_session, mock_file)

    start_time = time.time()
    
    conn = aiohttp.TCPConnector(limit=100)
    async with aiohttp.ClientSession(connector=conn) as client_session:
        tasks = [worker(user, client_session) for user in users]
        await asyncio.gather(*tasks)

    elapsed_time = time.time() - start_time

    # Cleanup mock spec sheet
    if os.path.exists(mock_file):
        os.remove(mock_file)

    # Compile all load results
    reg_times = [u.metrics["register"] for u in users if u.metrics["register"] is not None]
    login_times = [u.metrics["login"] for u in users if u.metrics["login"] is not None]
    session_times = [u.metrics["create_session"] for u in users if u.metrics["create_session"] is not None]
    upload_times = [u.metrics["upload_file"] for u in users if u.metrics["upload_file"] is not None]
    
    q_ttfts = []
    q_durations = []
    q_tokens = []
    success_queries = 0
    failed_queries = 0

    for u in users:
        for q in u.metrics["queries"]:
            if q["status"] == "success":
                success_queries += 1
                if q["ttft"] is not None:
                    q_ttfts.append(q["ttft"])
                q_durations.append(q["duration"])
                q_tokens.append(q["tokens"])
            else:
                failed_queries += 1

    reg_stats = compile_percentiles(reg_times)
    login_stats = compile_percentiles(login_times)
    session_stats = compile_percentiles(session_times)
    upload_stats = compile_percentiles(upload_times)
    q_ttft_stats = compile_percentiles(q_ttfts)
    q_dur_stats = compile_percentiles(q_durations)

    total_requests = len(reg_times) + len(login_times) + len(session_times) + len(upload_times) + success_queries + failed_queries
    qps = total_requests / elapsed_time

    print("\n==================================================")
    print("          NEXUSAI LOAD PERFORMANCE REPORT")
    print("==================================================")
    print(f"Elapsed test duration : {elapsed_time:.2f} seconds")
    print(f"Total compiled requests: {total_requests}")
    print(f"Avg QPS throughput    : {qps:.2f} req/sec")
    print("--------------------------------------------------")
    print(f"🛡️ USER ACCESS:")
    print(f"  - Registration : Avg: {reg_stats['avg']:.2f}s | p50: {reg_stats['p50']:.2f}s | p95: {reg_stats['p95']:.2f}s")
    print(f"  - User Login   : Avg: {login_stats['avg']:.2f}s | p50: {login_stats['p50']:.2f}s | p95: {login_stats['p95']:.2f}s")
    print("--------------------------------------------------")
    print(f"📁 INGESTION LAYER:")
    print(f"  - Session Init : Avg: {session_stats['avg']:.2f}s | p50: {session_stats['p50']:.2f}s | p95: {session_stats['p95']:.2f}s")
    print(f"  - File Ingest  : Avg: {upload_stats['avg']:.2f}s | p50: {upload_stats['p50']:.2f}s | p95: {upload_stats['p95']:.2f}s")
    print("--------------------------------------------------")
    print(f"💬 QUERY STREAM ENGINES:")
    print(f"  - Success rate : {success_queries} / {success_queries + failed_queries} ({success_queries/(success_queries+failed_queries)*100 if (success_queries+failed_queries) > 0 else 0:.1f}%)")
    print(f"  - Time to First: Avg: {q_ttft_stats['avg']:.2f}s | p50: {q_ttft_stats['p50']:.2f}s | p95: {q_ttft_stats['p95']:.2f}s")
    print(f"  - Generation   : Avg: {q_dur_stats['avg']:.2f}s | p50: {q_dur_stats['p50']:.2f}s | p95: {q_dur_stats['p95']:.2f}s")
    print(f"  - Avg Tokens/s : {np.mean(q_tokens)/q_dur_stats['avg'] if q_dur_stats['avg'] > 0 and q_tokens else 0:.1f} tokens/sec")
    print("==================================================")

if __name__ == "__main__":
    # Check if backend server is running, if not warn the user
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.connect(("localhost", 8000))
        s.close()
        asyncio.run(main_load_test())
    except ConnectionRefusedError:
        print("Error: The NexusAI server is not running on http://localhost:8000.")
        print("Please start the backend server before running the load test.")
