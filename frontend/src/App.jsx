import { useState, useRef, useEffect } from 'react';
import './index.css';

function App() {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('idle'); // idle, uploading, success, error
  const [response, setResponse] = useState(null);
  const fileInputRef = useRef(null);

  // Chat States
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setStatus('idle');
      setResponse(null);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleClearDatabase = async () => {
    if (!window.confirm("Are you sure you want to wipe the knowledge base? This will delete all uploaded documents.")) return;
    
    try {
      await fetch('http://localhost:8000/api/clear', { method: 'DELETE' });
      setFiles([]);
      setMessages([]);
      setStatus('idle');
      setResponse(null);
    } catch (error) {
      console.error("Error clearing DB:", error);
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;

    setStatus('uploading');
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const res = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      setResponse(data);
      setStatus('success');
      // Add initial system message once upload succeeds
      setMessages([{
        role: 'assistant',
        content: `I've successfully ingested the document (${data.chunks} chunks). How can I help you analyze it?`
      }]);
    } catch (error) {
      console.error("Error uploading file:", error);
      setStatus('error');
      setResponse({ error: error.message });
    }
  };

  const handleQuerySubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || isQuerying) return;

    const userMessage = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsQuerying(true);

    try {
      const res = await fetch('http://localhost:8000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content }),
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || []
      }]);
    } catch (error) {
      console.error("Query error:", error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}. Please check if the backend is running and GEMINI_API_KEY is configured in .env.`
      }]);
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>NexusAI</h1>
        <p className="subtitle">Self-Correcting Multi-Agent Research Intelligence Platform</p>
      </header>

      <main>
        <div className="upload-card">
          <div className="upload-icon">📄</div>
          <h2>Upload Research Document</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            Supported formats: PDF, Markdown, TXT
          </p>

          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFileChange}
            className="file-input"
            accept=".pdf,.md,.txt"
          />

          {files.length === 0 ? (
            <button className="upload-btn" onClick={handleUploadClick}>
              Select Files
            </button>
          ) : (
            <div className="file-details">
              <strong>Selected Files ({files.length}):</strong>
              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                {files.map((f, i) => (
                  <li key={i}>{f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB)</li>
                ))}
              </ul>
            </div>
          )}

          {files.length > 0 && status !== 'uploading' && status !== 'success' && (
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="upload-btn" onClick={handleSubmit}>
                Process {files.length > 1 ? 'Documents' : 'Document'}
              </button>
            </div>
          )}

          {status === 'uploading' && (
            <div>
              <div className="loading-spinner"></div>
              <p>Initializing Ingestion Pipeline...</p>
            </div>
          )}

          {status === 'success' && response && (
            <div className="status-message status-success">
              ✓ {response.message}
            </div>
          )}

          {status === 'error' && response && (
            <div className="status-message status-error">
              ✗ Error: {response.error}
            </div>
          )}

          {(status === 'success' || messages.length > 0) && (
            <div style={{ marginTop: '1.5rem' }}>
              <button className="upload-btn" style={{ background: 'var(--error)' }} onClick={handleClearDatabase}>
                Clear Knowledge Base
              </button>
            </div>
          )}
        </div>

        {/* Chat Interface - Only show after a file is successfully uploaded or if messages exist */}
        {(status === 'success' || messages.length > 0) && (
          <div className="chat-section">
            <div className="chat-messages">
              {messages.map((msg, index) => (
                <div key={index} className={`message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}>
                  <div>{msg.content}</div>
                  
                  {/* Display Sources if available (for traceability) */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-container">
                      <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Retrieved Contexts:</div>
                      {msg.sources.map((src, idx) => (
                        <span key={idx} className="source-badge" title={src.content}>
                          {src.metadata?.source_file || 'Unknown'} (Page {src.metadata?.page !== undefined ? src.metadata.page : '?'})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isQuerying && (
                <div className="message assistant-message">
                  <div className="loading-spinner" style={{ width: '1.5rem', height: '1.5rem', margin: 0 }}></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-wrapper" onSubmit={handleQuerySubmit}>
              <input
                type="text"
                className="chat-input"
                placeholder="Ask a question about the uploaded document..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isQuerying}
              />
              <button type="submit" className="send-btn" disabled={!query.trim() || isQuerying}>
                ➤
              </button>
            </form>
          </div>
        )}

        <div className="orchestration-notice">
          <h3>System Status</h3>
          <p>
            <strong>Phase 2 Ingestion & RAG Pipeline:</strong> Active. 
            Documents are parsed into chunks and embedded using HuggingFace embeddings (`all-MiniLM-L6-v2`) in a local FAISS vector store. 
            Grounded responses are generated via **Gemini 2.5 Flash** (`gemini-2.5-flash`).
          </p>
          <p>
            LangGraph state machines and multi-agent hybrid retrieval layers are pending in subsequent phases.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
