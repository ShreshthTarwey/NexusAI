import { useState, useRef, useEffect } from 'react';
import './index.css';

// Robust stateful Markdown parser for block elements (headers, lists with nested indents, tables, code blocks, blockquotes, and paragraphs)
const MarkdownRenderer = ({ content }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  
  let currentBlock = null; 
  // Can be: 
  // { type: 'paragraph', lines: [] }
  // { type: 'list', listType: 'ul'|'ol', items: [] } (items: { text, indent }[])
  // { type: 'table', rows: [] }
  // { type: 'code', lang: '', lines: [] }
  // { type: 'blockquote', lines: [] }

  const flushCurrentBlock = (key) => {
    if (!currentBlock) return;

    if (currentBlock.type === 'paragraph') {
      elements.push(
        <p key={key} className="markdown-paragraph">
          {currentBlock.lines.map((line, lIdx) => (
            <span key={lIdx}>
              {lIdx > 0 && <br />}
              {parseInlineMarkdown(line)}
            </span>
          ))}
        </p>
      );
    } else if (currentBlock.type === 'blockquote') {
      elements.push(
        <blockquote key={key} className="markdown-blockquote">
          {currentBlock.lines.map((line, lIdx) => (
            <div key={lIdx}>{parseInlineMarkdown(line)}</div>
          ))}
        </blockquote>
      );
    } else if (currentBlock.type === 'code') {
      elements.push(
        <pre key={key} className="markdown-code-block">
          <code>{currentBlock.lines.join('\n')}</code>
        </pre>
      );
    } else if (currentBlock.type === 'list') {
      const ListTag = currentBlock.listType;
      elements.push(
        <ListTag key={key} className={`markdown-list-${currentBlock.listType}`}>
          {currentBlock.items.map((item, i) => {
            // Determine indent level based on spaces (e.g. 2 or 4 spaces = 1 indent level)
            const level = item.indent >= 4 ? 2 : item.indent >= 2 ? 1 : 0;
            const indentStyle = level > 0 ? { marginLeft: `${level * 1.25}rem` } : {};
            
            return (
              <li 
                key={i} 
                className={`markdown-list-item indent-${level}`} 
                style={{
                  ...indentStyle,
                  listStyleType: level === 0 ? 'disc' : level === 1 ? 'circle' : 'square'
                }}
              >
                {parseInlineMarkdown(item.text)}
              </li>
            );
          })}
        </ListTag>
      );
    } else if (currentBlock.type === 'table') {
      const rows = currentBlock.rows;
      if (rows.length >= 2) {
        // Find clean headers
        const headerCells = rows[0].split('|').map(c => c.trim()).filter((c, idx, arr) => {
          if (idx === 0 && c === '') return false;
          if (idx === arr.length - 1 && c === '') return false;
          return true;
        });

        // Filter and clean rows, skipping separator rows (containing dashed dividers)
        const bodyRows = rows.slice(1)
          .filter(r => !r.includes('---'))
          .map(r => 
            r.split('|').map(c => c.trim()).filter((c, idx, arr) => {
              if (idx === 0 && c === '') return false;
              if (idx === arr.length - 1 && c === '') return false;
              return true;
            })
          );
        
        elements.push(
          <div className="table-responsive" key={key}>
            <table className="comparison-table">
              <thead>
                <tr>
                  {headerCells.map((cell, idx) => (
                    <th key={idx}>{parseInlineMarkdown(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{parseInlineMarkdown(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    }

    currentBlock = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Fenced Code Block
    if (trimmed.startsWith('```')) {
      if (currentBlock && currentBlock.type === 'code') {
        flushCurrentBlock(`code-${i}`);
      } else {
        flushCurrentBlock(`pre-code-${i}`);
        const lang = trimmed.slice(3).trim();
        currentBlock = { type: 'code', lang, lines: [] };
      }
      continue;
    }

    if (currentBlock && currentBlock.type === 'code') {
      currentBlock.lines.push(line);
      continue;
    }

    // 2. Empty Line
    if (!trimmed) {
      flushCurrentBlock(`empty-${i}`);
      continue;
    }

    // 3. Headers
    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        flushCurrentBlock(`header-pre-${i}`);
        const level = match[1].length;
        const text = match[2];
        const Tag = `h${level}`;
        elements.push(
          <Tag key={`h-${i}`} className={`markdown-h${level}`}>
            {parseInlineMarkdown(text)}
          </Tag>
        );
        continue;
      }
    }

    // 4. Blockquotes
    if (trimmed.startsWith('>')) {
      const text = trimmed.slice(1).trim();
      if (currentBlock && currentBlock.type === 'blockquote') {
        currentBlock.lines.push(text);
      } else {
        flushCurrentBlock(`quote-pre-${i}`);
        currentBlock = { type: 'blockquote', lines: [text] };
      }
      continue;
    }

    // 5. Tables
    if (trimmed.startsWith('|')) {
      if (currentBlock && currentBlock.type === 'table') {
        currentBlock.rows.push(line);
      } else {
        flushCurrentBlock(`table-pre-${i}`);
        currentBlock = { type: 'table', rows: [line] };
      }
      continue;
    }

    // 6. Bullet Lists
    const bulletMatch = line.match(/^(\s*)[\*\-\+]\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const text = bulletMatch[2];
      if (currentBlock && currentBlock.type === 'list' && currentBlock.listType === 'ul') {
        currentBlock.items.push({ text, indent });
      } else {
        flushCurrentBlock(`list-pre-${i}`);
        currentBlock = { type: 'list', listType: 'ul', items: [{ text, indent }] };
      }
      continue;
    }

    // 7. Numbered Lists
    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const indent = numMatch[1].length;
      const text = numMatch[3];
      if (currentBlock && currentBlock.type === 'list' && currentBlock.listType === 'ol') {
        currentBlock.items.push({ text, indent });
      } else {
        flushCurrentBlock(`list-pre-${i}`);
        currentBlock = { type: 'list', listType: 'ol', items: [{ text, indent }] };
      }
      continue;
    }

    // 8. Paragraph (fallback)
    if (currentBlock && currentBlock.type === 'paragraph') {
      currentBlock.lines.push(line);
    } else {
      flushCurrentBlock(`para-pre-${i}`);
      currentBlock = { type: 'paragraph', lines: [line] };
    }
  }

  flushCurrentBlock('final');

  return <div className="markdown-body">{elements}</div>;
};

// Helper to parse inline markdown (bold, code, links)
const parseInlineMarkdown = (text) => {
  if (!text) return '';
  const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (match) {
        return <a key={index} href={match[2]} target="_blank" rel="noopener noreferrer" className="markdown-link">{match[1]}</a>;
      }
    }
    return part;
  });
};

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
      if (data.job_id) {
        pollUploadStatus(data.job_id);
      } else {
        setResponse(data);
        setStatus('success');
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      setStatus('error');
      setResponse({ error: error.message });
    }
  };

  const pollUploadStatus = (jobId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/upload/status/${jobId}`);
        const data = await res.json();
        
        if (data.status === 'success') {
          clearInterval(interval);
          setResponse(data);
          setStatus('success');
          setMessages([{
            role: 'assistant',
            content: `I've successfully ingested the document (${data.chunks} chunks). How can I help you analyze it?`
          }]);
        } else if (data.status === 'error') {
          clearInterval(interval);
          setStatus('error');
          setResponse({ error: data.error });
        }
      } catch (error) {
        clearInterval(interval);
        setStatus('error');
        setResponse({ error: error.message });
      }
    }, 2000);
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

      if (!res.ok) throw new Error('Query failed');

      // Initialize an empty assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [] }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // The last element might be an incomplete line, so we keep it in the buffer
          buffer = lines.pop();

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              try {
                // Remove 'data: ' prefix
                const jsonStr = line.replace(/^data:\s*/, '');
                if (!jsonStr.trim()) continue;
                
                const data = JSON.parse(jsonStr);
                
                if (data.text) {
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMsgIndex = newMessages.length - 1;
                    newMessages[lastMsgIndex] = {
                      ...newMessages[lastMsgIndex],
                      content: newMessages[lastMsgIndex].content + data.text
                    };
                    return newMessages;
                  });
                }
                if (data.sources) {
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMsgIndex = newMessages.length - 1;
                    newMessages[lastMsgIndex] = {
                      ...newMessages[lastMsgIndex],
                      sources: data.sources
                    };
                    return newMessages;
                  });
                }
              } catch (e) {
                console.warn("Failed to parse SSE line:", line, e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Query error:", error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}. Please check if the backend is running and GEMINI_API_KEY is configured.`
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
                  <MarkdownRenderer content={msg.content} />
                  
                  {/* Display Sources if available (for traceability) */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-container">
                      <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Retrieved Contexts:</div>
                      <div className="sources-list">
                        {msg.sources.map((src, idx) => {
                          const pageVal = src.metadata?.page;
                          const hasValidPage = pageVal !== undefined && 
                                               pageVal !== null && 
                                               pageVal !== '?' && 
                                               pageVal !== 'Unknown' && 
                                               !isNaN(Number(pageVal));
                          return (
                            <span key={idx} className="source-badge" title={src.content}>
                              {src.metadata?.source_file || 'Unknown'}
                              {hasValidPage ? ` (Page ${Number(pageVal) + 1})` : ''}
                            </span>
                          );
                        })}
                      </div>
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
            <strong>Phase 3 Hybrid RAG Pipeline:</strong> Active. 
            Documents are processed efficiently via PyMuPDF in background tasks. 
            Hybrid retrieval uses both FAISS (Semantics) and BM25 (Keywords). 
            Grounded responses stream via SSE from **Gemini 2.5 Flash**.
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
