import { useState, useRef } from 'react';
import './index.css';

function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, uploading, success, error
  const [response, setResponse] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
      setResponse(null);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleSubmit = async () => {
    if (!file) return;

    setStatus('uploading');
    
    const formData = new FormData();
    formData.append('file', file);

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
    } catch (error) {
      console.error("Error uploading file:", error);
      setStatus('error');
      setResponse({ error: error.message });
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
            ref={fileInputRef}
            onChange={handleFileChange}
            className="file-input"
            accept=".pdf,.md,.txt"
          />

          {!file ? (
            <button className="upload-btn" onClick={handleUploadClick}>
              Select File
            </button>
          ) : (
            <div className="file-details">
              <strong>Selected File:</strong> {file.name}
              <br />
              <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
            </div>
          )}

          {file && status !== 'uploading' && status !== 'success' && (
            <div style={{ marginTop: '1.5rem' }}>
              <button className="upload-btn" onClick={handleSubmit}>
                Process Document
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
        </div>

        <div className="orchestration-notice">
          <h3>System Status</h3>
          <p>
            <strong>Phase 1 Initialization:</strong> The core infrastructure is online. 
            The LangGraph state machine, specialized reasoning agents, and hybrid retrieval layer 
            are pending deployment in subsequent phases.
          </p>
          <p>
            Current capabilities are limited to foundational API connectivity and UI routing.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
