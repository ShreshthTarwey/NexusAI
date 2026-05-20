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
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState('default');
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('idle');
  const [response, setResponse] = useState(null);
  const fileInputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const messagesEndRef = useRef(null);

  // Fetch all sessions on load
  useEffect(() => {
    fetchSessions();
  }, []);

  // When session changes, fetch its messages
  useEffect(() => {
    if (currentSession && currentSession !== 'default') {
      fetchSessionMessages(currentSession);
    } else {
      setMessages([]);
      setFiles([]);
      setStatus('idle');
    }
  }, [currentSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    }
  };

  const fetchSessionMessages = async (sessionId) => {
    try {
      const res = await fetch(`http://localhost:8000/api/sessions/${sessionId}/messages`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
        setStatus('success'); // Assume if there are messages, db has files
      } else {
        setMessages([]);
        setStatus('idle');
      }
    } catch (e) {
      console.error("Failed to fetch messages", e);
    }
  };

  const handleNewChat = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/sessions', { method: 'POST' });
      const data = await res.json();
      setCurrentSession(data.session_id);
      fetchSessions();
    } catch (e) {
      console.error("Failed to create new chat", e);
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this chat?")) return;
    try {
      await fetch(`http://localhost:8000/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (currentSession === sessionId) {
        setCurrentSession('default');
      }
      fetchSessions();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setStatus('idle');
      setResponse(null);
      // Auto-create a session if we are in default state
      if (currentSession === 'default') {
        handleNewChat();
      }
    }
  };

  const handleUploadClick = () => {
    if (currentSession === 'default') {
        handleNewChat();
    }
    setTimeout(() => {
        fileInputRef.current.click();
    }, 100);
  };

  const handleClearDatabase = async () => {
    if (!window.confirm("Are you sure you want to wipe the knowledge base? This will delete all uploaded documents.")) return;
    try {
      await fetch(`http://localhost:8000/api/clear?session_id=${currentSession}`, { method: 'DELETE' });
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
    formData.append('session_id', currentSession);

    try {
      const res = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (data.job_id) {
        pollUploadStatus(data.job_id);
      }
    } catch (error) {
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
          setMessages(prev => [...prev, {
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
    if (currentSession === 'default') {
        alert("Please create a New Chat first.");
        return;
    }

    const userMessage = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsQuerying(true);

    try {
      const res = await fetch('http://localhost:8000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content, session_id: currentSession }),
      });
      if (!res.ok) throw new Error('Query failed');

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
          buffer = lines.pop();

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              try {
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
                console.warn("Failed to parse SSE line", e);
              }
            }
          }
        }
      }
      
      // Update session title dynamically after first query completes
      fetchSessions();
      
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}.`
      }]);
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="app-layout">
      {/* Sidebar for Sessions */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>NexusAI</h2>
        </div>
        <div className="sidebar-new">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <span style={{marginRight: '8px'}}>+</span> New Chat
          </button>
        </div>
        <div className="sidebar-sessions">
          {sessions.map(s => (
            <div 
              key={s.session_id} 
              className={`session-item ${currentSession === s.session_id ? 'active' : ''}`}
              onClick={() => setCurrentSession(s.session_id)}
            >
              <div className="session-title">💬 {s.title || 'New Chat'}</div>
              <button 
                className="delete-session-btn"
                onClick={(e) => handleDeleteSession(e, s.session_id)}
                title="Delete Chat"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Area */}
      <main className="main-content">
        <div className="app-container">
          <header style={{textAlign: 'left', marginBottom: '2rem'}}>
            <h1 style={{fontSize: '2rem'}}>
                {currentSession === 'default' 
                    ? "Welcome to NexusAI" 
                    : sessions.find(s => s.session_id === currentSession)?.title || "New Chat"}
            </h1>
            <p className="subtitle">Upload documents and ask questions</p>
          </header>

          <div className="upload-card">
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileChange}
              className="file-input"
              accept=".pdf,.md,.txt"
            />

            {files.length === 0 && messages.length === 0 && (
              <>
                <div className="upload-icon">📄</div>
                <h2>Upload Research Document</h2>
                <button className="upload-btn" onClick={handleUploadClick}>
                  Select Files
                </button>
              </>
            )}

            {files.length > 0 && status !== 'uploading' && status !== 'success' && (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <div className="file-details">
                  <strong>Selected Files ({files.length})</strong>
                </div>
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
          </div>

          {(status === 'success' || messages.length > 0) && currentSession !== 'default' && (
            <div className="chat-section">
              <div className="chat-messages">
                {messages.map((msg, index) => (
                  <div key={index} className={`message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}>
                    <MarkdownRenderer content={msg.content} />
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="sources-container">
                        <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Retrieved Contexts:</div>
                        <div className="sources-list">
                          {msg.sources.map((src, idx) => {
                            const pageVal = src.metadata?.page;
                            const hasValidPage = pageVal !== undefined && pageVal !== null && !isNaN(Number(pageVal));
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
                <button type="button" className="send-btn" style={{background: 'transparent', color: 'var(--text-secondary)'}} onClick={handleUploadClick} title="Upload more files">
                    📎
                </button>
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
        </div>
      </main>
    </div>
  );
}

export default App;
