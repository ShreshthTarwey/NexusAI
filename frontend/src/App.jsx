import { useState, useRef, useEffect } from 'react';
import './index.css';

// Robust stateful Markdown parser for block elements (headers, lists with nested indents, tables, code blocks, blockquotes, and paragraphs)
const MarkdownRenderer = ({ content, sources, toolSources }) => {
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
              {parseInlineMarkdown(line, sources, toolSources)}
            </span>
          ))}
        </p>
      );
    } else if (currentBlock.type === 'blockquote') {
      elements.push(
        <blockquote key={key} className="markdown-blockquote">
          {currentBlock.lines.map((line, lIdx) => (
            <div key={lIdx}>{parseInlineMarkdown(line, sources, toolSources)}</div>
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
                {parseInlineMarkdown(item.text, sources, toolSources)}
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
                    <th key={idx}>{parseInlineMarkdown(cell, sources, toolSources)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{parseInlineMarkdown(cell, sources, toolSources)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      } else {
        // Render incomplete table rows as plain text during streaming
        elements.push(
          <div key={key} className="markdown-text">
            {rows.map((r, i) => <div key={i}>{r}</div>)}
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
            {parseInlineMarkdown(text, sources, toolSources)}
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

// Helper to find the actual content chunk associated with a citation value
const findSourceChunk = (sourceVal, sourcesList = [], toolSourcesList = []) => {
  const allSources = [...(sourcesList || []), ...(toolSourcesList || [])];
  const isWeb = sourceVal.startsWith('web:');
  const isCalc = sourceVal.startsWith('calc:') || sourceVal.startsWith('math:');

  if (isWeb) {
    const queryTerm = sourceVal.slice(4).trim();
    // 1. Exact match on query parameter in web_search input
    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:web_search') {
        const content = src.content || '';
        if (content.toLowerCase().includes(queryTerm.toLowerCase())) {
          const outputMarker = 'Output:';
          const idx = content.indexOf(outputMarker);
          if (idx !== -1) return content.substring(idx + outputMarker.length).trim();
          return content;
        }
      }
    }
    // 2. Fallback: match any web search content if queryTerm not explicitly in content
    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:web_search') {
        const content = src.content || '';
        const outputMarker = 'Output:';
        const idx = content.indexOf(outputMarker);
        if (idx !== -1) return content.substring(idx + outputMarker.length).trim();
        return content;
      }
    }
  } else if (isCalc) {
    const exprTerm = sourceVal.split(':')[1]?.trim() || '';
    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:safe_calculator') {
        const content = src.content || '';
        if (!exprTerm || content.toLowerCase().includes(exprTerm.toLowerCase())) {
          const outputMarker = 'Output:';
          const idx = content.indexOf(outputMarker);
          if (idx !== -1) return `${exprTerm} = ${content.substring(idx + outputMarker.length).trim()}`;
          return content;
        }
      }
    }
    // Fallback: return first calculator tool output
    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:safe_calculator') {
        return src.content || '';
      }
    }
  } else {
    // Local document search
    // 1. Direct match by filename (from Simple/Compare RAG)
    for (const src of allSources) {
      if (src.metadata?.source_file === sourceVal) {
        return src.content;
      }
    }
    // 2. Parsed match inside knowledge_base_search output
    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:knowledge_base_search') {
        const content = src.content || '';
        const outputMarker = 'Output:';
        const idx = content.indexOf(outputMarker);
        if (idx !== -1) {
          const outputText = content.substring(idx + outputMarker.length);
          const blocks = outputText.split(/\n+\-\-\-\n+/);
          for (const block of blocks) {
            if (block.includes(`[Source: ${sourceVal}`)) {
              const headerEnd = block.indexOf(']');
              if (headerEnd !== -1) return block.substring(headerEnd + 1).trim();
              return block.trim();
            }
          }
        }
      }
    }
  }
  return null;
};

// Interactive source badge showing custom hover popup card
const InlineSourceBadge = ({ sourceVal, sources, toolSources }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isWeb = sourceVal.startsWith('web:');
  const isCalc = sourceVal.startsWith('calc:') || sourceVal.startsWith('math:');
  
  const displayLabel = isWeb 
    ? `🌐 ${sourceVal.slice(4)}` 
    : isCalc 
    ? `🧮 ${sourceVal.split(':')[1] || sourceVal}` 
    : `📄 ${sourceVal}`;
    
  const chunkContent = findSourceChunk(sourceVal, sources, toolSources);

  return (
    <span 
      className="inline-source-badge-container"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="inline-source-badge">
        {displayLabel}
      </span>
      {showTooltip && (
        <span className="source-popover">
          <span className="popover-header">
            <span className="popover-icon">{isWeb ? '🌐' : isCalc ? '🧮' : '📄'}</span>
            <span className="popover-title">
              {isWeb ? 'Web Search Grounding' : isCalc ? 'Calculated Result' : 'Document Grounding'}
            </span>
          </span>
          <span className="popover-meta">
            {isWeb ? `Query: "${sourceVal.slice(4)}"` : isCalc ? `Expression: ${sourceVal.split(':')[1] || ''}` : `File: ${sourceVal}`}
          </span>
          <span className="popover-body">
            {chunkContent ? chunkContent : "No matching grounding chunk found in session sources."}
          </span>
          <span className="popover-arrow"></span>
        </span>
      )}
    </span>
  );
};

// Helper to parse inline markdown (bold, code, links, and source citations)
const parseInlineMarkdown = (text, sources, toolSources) => {
  if (!text) return '';
  const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\)|\[Source:\s*.*?\])/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('[Source:') && part.endsWith(']')) {
      const sourceVal = part.slice(8, -1).trim();
      return (
        <InlineSourceBadge 
          key={index} 
          sourceVal={sourceVal} 
          sources={sources} 
          toolSources={toolSources} 
        />
      );
    }
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (match) {
        const url = match[2].trim();
        const urlLower = url.toLowerCase();
        const hasProtocol = /^[a-z]+:/i.test(urlLower);
        let isSafe = false;
        
        if (!hasProtocol) {
          // Relative URLs are safe
          isSafe = true;
        } else {
          // Allow http, https, mailto, tel, and file (for local workspace links)
          isSafe = urlLower.startsWith('http://') || 
                   urlLower.startsWith('https://') || 
                   urlLower.startsWith('mailto:') || 
                   urlLower.startsWith('tel:') || 
                   urlLower.startsWith('file://');
        }
        
        if (isSafe && !/^\s*javascript:/i.test(url)) {
          return <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="markdown-link">{match[1]}</a>;
        } else {
          return <span key={index} className="markdown-link-disabled" title="Blocked potentially unsafe link" style={{ textDecoration: 'line-through', opacity: 0.6 }}>{match[1]}</span>;
        }
      }
    }
    return part;
  });
};

// Helper to reconstruct tool execution logs from sources for database-loaded history messages
const getToolLogEntries = (msg) => {
  if (msg.toolLog && msg.toolLog.length > 0) {
    return msg.toolLog;
  }
  if (!msg.sources) return [];
  
  const entries = [];
  for (const src of msg.sources) {
    const filename = src.metadata?.source_file || '';
    if (filename.startsWith('tool:')) {
      const toolName = filename.substring(5);
      const content = src.content || '';
      
      let inputVal = '';
      let outputVal = '';
      const inputMarker = 'Input:';
      const outputMarker = 'Output:';
      
      const inputIdx = content.indexOf(inputMarker);
      const outputIdx = content.indexOf(outputMarker);
      
      if (inputIdx !== -1 && outputIdx !== -1) {
        inputVal = content.substring(inputIdx + inputMarker.length, outputIdx).trim();
        outputVal = content.substring(outputIdx + outputMarker.length).trim();
      } else {
        inputVal = content;
      }
      
      entries.push({
        name: toolName,
        input: inputVal,
        output: outputVal
      });
    }
  }
  return entries;
};

// Collapsible Tool Execution Log — shown inside each assistant message that used tools
const ToolExecutionLog = ({ entries }) => {
  const [open, setOpen] = useState(false);

  const toolIcons = {
    web_search: '🌐',
    safe_calculator: '🧮',
    knowledge_base_search: '🔍',
  };

  return (
    <div className="tool-log-container">
      <button
        className={`tool-log-toggle ${open ? 'open' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
      >
        <span className="tool-log-toggle-icon">{open ? '▾' : '▸'}</span>
        <span>Tool Execution Log</span>
        <span className="tool-log-count">{entries.length} step{entries.length !== 1 ? 's' : ''}</span>
      </button>

      {open && (
        <div className="tool-log-body">
          {entries.map((entry, i) => (
            <div key={i} className="tool-log-entry">
              <div className="tool-log-header">
                <span className="tool-log-icon">{toolIcons[entry.name] || '🔧'}</span>
                <span className="tool-log-name">{entry.name}</span>
                <span className="tool-log-step">Step {i + 1}</span>
              </div>
              <div className="tool-log-field">
                <span className="tool-log-label">Input</span>
                <span className="tool-log-value">{String(entry.input)}</span>
              </div>
              {entry.output && (
                <div className="tool-log-field">
                  <span className="tool-log-label">Output</span>
                  <span className="tool-log-value tool-log-output">{String(entry.output)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const formatToolInput = (inputStr) => {
  if (!inputStr) return '';
  // Match single or double quoted values for keys like 'query' or 'expression' in stringified python dicts
  const match = inputStr.match(/'(?:query|expression)':\s*['"](.*?)['"]/);
  if (match) {
    return match[1];
  }
  return inputStr;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('nexusai_token') || null);
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('nexusai_username') || null);
  
  // Auth Form State
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState('default');
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('idle');
  const [response, setResponse] = useState(null);
  const fileInputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [activeTool, setActiveTool] = useState(null); // { name, input } | null
  const [toolLog, setToolLog] = useState([]); // [{ name, input, output }] for current streaming msg
  const messagesEndRef = useRef(null);
  const activeToolStartTimeRef = useRef(0);
  const activeToolTimeoutRef = useRef(null);

  // Authenticated custom fetch wrapper
  const apiFetch = async (path, options = {}) => {
    const url = `http://localhost:8000${path}`;
    const headers = options.headers || {};
    const storedToken = localStorage.getItem('nexusai_token');
    
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }
    
    const newOptions = {
      ...options,
      headers
    };
    
    try {
      const res = await fetch(url, newOptions);
      if (res.status === 401) {
        localStorage.removeItem('nexusai_token');
        localStorage.removeItem('nexusai_username');
        setToken(null);
        setCurrentUser(null);
        setSessions([]);
        setCurrentSession('default');
        setMessages([]);
        setFiles([]);
        setStatus('idle');
        setResponse(null);
        throw new Error("Session expired. Please log in again.");
      }
      return res;
    } catch (err) {
      console.error(`API Fetch Error on ${path}:`, err);
      throw err;
    }
  };

  // Fetch all sessions on load / login change
  useEffect(() => {
    if (token) {
      fetchSessions();
    }
  }, [token]);

  // When session changes, fetch its messages
  useEffect(() => {
    if (currentSession && currentSession !== 'default') {
      fetchSessionMessages(currentSession);
    } else {
      setMessages([]);
      setFiles([]);
      setStatus('idle');
      setResponse(null);
    }
  }, [currentSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async () => {
    try {
      const res = await apiFetch('/api/sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    }
  };

  const fetchSessionMessages = async (sessionId) => {
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/messages`);
      if (!res.ok) return;
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
      const res = await apiFetch('/api/sessions', { method: 'POST' });
      const data = await res.json();
      setCurrentSession(data.session_id);
      fetchSessions();
      return data.session_id;
    } catch (e) {
      console.error("Failed to create new chat", e);
      return null;
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this chat?")) return;
    try {
      await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
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

  const handleUploadClick = async () => {
    if (currentSession === 'default') {
      const newSessionId = await handleNewChat();
      if (!newSessionId) {
        alert("Failed to initialize a new session. Please try again.");
        return;
      }
    }
    fileInputRef.current.click();
  };

  const handleClearDatabase = async () => {
    if (!window.confirm("Are you sure you want to wipe the knowledge base? This will delete all uploaded documents.")) return;
    try {
      await apiFetch(`/api/clear?session_id=${currentSession}`, { method: 'DELETE' });
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
      const res = await apiFetch('/api/upload', {
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
        const res = await apiFetch(`/api/upload/status/${jobId}`);
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
    setActiveTool(null);
    setToolLog([]);

    try {
      const res = await apiFetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content, session_id: currentSession }),
      });
      if (!res.ok) throw new Error('Query failed');

      setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [], toolSources: [] }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';
      // Local log accumulated during stream (to set on message at end)
      let currentToolLog = [];
      let pendingToolsMap = {};

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

                // ── Text token ──────────────────────────────────────────────
                if (data.text) {
                  const elapsed = Date.now() - activeToolStartTimeRef.current;
                  const minDuration = 1500;
                  if (elapsed < minDuration) {
                    if (!activeToolTimeoutRef.current) {
                      activeToolTimeoutRef.current = setTimeout(() => {
                        setActiveTool(null);
                        activeToolTimeoutRef.current = null;
                      }, minDuration - elapsed);
                    }
                  } else {
                    setActiveTool(null);
                  }
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

                // ── Document sources ─────────────────────────────────────────
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

                // ── Tool sources (execution log) ──────────────────────────────
                if (data.tool_sources) {
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMsgIndex = newMessages.length - 1;
                    newMessages[lastMsgIndex] = {
                      ...newMessages[lastMsgIndex],
                      toolSources: data.tool_sources
                    };
                    return newMessages;
                  });
                }

                // ── Tool status: started ──────────────────────────────────────
                if (data.tool_status === 'start') {
                  if (activeToolTimeoutRef.current) {
                    clearTimeout(activeToolTimeoutRef.current);
                    activeToolTimeoutRef.current = null;
                  }
                  activeToolStartTimeRef.current = Date.now();
                  pendingToolsMap[data.tool_name] = { name: data.tool_name, input: data.tool_input, output: null };
                  setActiveTool({ name: data.tool_name, input: data.tool_input });
                }

                // ── Tool status: completed ────────────────────────────────────
                if (data.tool_status === 'end') {
                  const entry = pendingToolsMap[data.tool_name];
                  if (entry) {
                    entry.output = data.tool_output;
                    currentToolLog = [...currentToolLog, entry];
                    setToolLog([...currentToolLog]);
                    delete pendingToolsMap[data.tool_name];
                  }
                }

              } catch (e) {
                console.warn("Failed to parse SSE line", e);
              }
            }
          }
        }
      }

      // Attach accumulated tool log to the last message
      if (currentToolLog.length > 0) {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsgIndex = newMessages.length - 1;
          newMessages[lastMsgIndex] = {
            ...newMessages[lastMsgIndex],
            toolLog: currentToolLog
          };
          return newMessages;
        });
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
      if (activeToolTimeoutRef.current) {
        clearTimeout(activeToolTimeoutRef.current);
        activeToolTimeoutRef.current = null;
      }
      setActiveTool(null);
      setToolLog([]);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    
    const username = authUsername.trim();
    const password = authPassword;
    
    if (!username || !password) {
      setAuthError('Please fill in all fields.');
      return;
    }
    
    if (authMode === 'signup' && password !== authConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    
    setAuthLoading(true);
    
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || 'Authentication failed');
      }
      
      if (authMode === 'login') {
        localStorage.setItem('nexusai_token', data.access_token);
        localStorage.setItem('nexusai_username', data.username);
        setToken(data.access_token);
        setCurrentUser(data.username);
        setAuthUsername('');
        setAuthPassword('');
        setAuthConfirmPassword('');
      } else {
        setAuthMode('login');
        setAuthPassword('');
        setAuthConfirmPassword('');
        setAuthError('Successfully registered! Please sign in.');
      }
    } catch (err) {
      setAuthError(err.message || 'An error occurred during authentication.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('nexusai_token');
    localStorage.removeItem('nexusai_username');
    setToken(null);
    setCurrentUser(null);
    setSessions([]);
    setCurrentSession('default');
    setMessages([]);
    setFiles([]);
    setStatus('idle');
    setResponse(null);
  };

  // Auth UI Gate
  if (!token) {
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-logo">NexusAI</h1>
            <p className="auth-subtitle">Self-Correcting Multi-Agent Intelligence</p>
          </div>
          
          <div className="auth-tabs">
            <button 
              className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
            >
              Sign In
            </button>
            <button 
              className={`auth-tab ${authMode === 'signup' ? 'active' : ''}`}
              onClick={() => { setAuthMode('signup'); setAuthError(''); }}
            >
              Sign Up
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authError && (
              <div className={`auth-message ${authError.includes('Successfully') ? 'success' : 'error'}`}>
                {authError}
              </div>
            )}
            
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                className="auth-input"
                placeholder="Enter username"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  className="auth-input"
                  placeholder="Enter password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "👁" : "👁‍🗨"}
                </button>
              </div>
            </div>
            
            {authMode === 'signup' && (
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  id="confirmPassword"
                  className="auth-input"
                  placeholder="Confirm password"
                  value={authConfirmPassword}
                  onChange={(e) => setAuthConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}
            
            <button type="submit" className="auth-submit-btn" disabled={authLoading}>
              {authLoading ? (
                <div className="loading-spinner" style={{ width: '1.2rem', height: '1.2rem', margin: '0 auto' }}></div>
              ) : (
                authMode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
          
          <div className="auth-footer">
            🔒 Secure multi-tenant workspace powered by MongoDB
          </div>
        </div>
      </div>
    );
  }

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
        
        {/* Profile Card inside Sidebar */}
        <div className="sidebar-profile">
          <div className="profile-info">
            <span className="profile-avatar">👤</span>
            <span className="profile-username" title={currentUser}>{currentUser}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Log Out">
            Logout
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="main-content">
        <div className="app-container">
          <header style={{textAlign: 'left', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
              <h1 style={{fontSize: '2rem'}}>
                  {currentSession === 'default' 
                      ? "Welcome to NexusAI" 
                      : sessions.find(s => s.session_id === currentSession)?.title || "New Chat"}
              </h1>
              <p className="subtitle">Upload documents and ask questions</p>
            </div>
            {currentSession !== 'default' && (
              <button className="clear-db-btn" onClick={handleClearDatabase} title="Clear Knowledge Base">
                Wipe index
              </button>
            )}
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
                    <MarkdownRenderer content={msg.content} sources={msg.sources} toolSources={msg.toolSources} />
                    {/* ── Tool Execution Log (collapsible) ── */}
                    {getToolLogEntries(msg).length > 0 && (
                      <ToolExecutionLog entries={getToolLogEntries(msg)} />
                    )}
                    {/* ── Document Sources ── */}
                    {msg.sources && msg.sources.filter(s => !s.metadata?.source_file?.startsWith('tool:')).length > 0 && (
                      <div className="sources-container">
                        <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Retrieved Contexts:</div>
                        <div className="sources-list">
                          {msg.sources.filter(s => !s.metadata?.source_file?.startsWith('tool:')).map((src, idx) => {
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
                    {activeTool ? (
                      <div className="tool-status-badge">
                        <span className="tool-status-icon">
                          {activeTool.name === 'web_search' ? '🌐' : activeTool.name === 'knowledge_base_search' ? '🔍' : '🧮'}
                        </span>
                        <span className="tool-status-text">
                          {activeTool.name === 'web_search'
                            ? `Searching the web for "${formatToolInput(activeTool.input)}"`
                            : activeTool.name === 'knowledge_base_search'
                            ? `Searching local documents for "${formatToolInput(activeTool.input)}"`
                            : `Calculating "${formatToolInput(activeTool.input)}"`}
                        </span>
                        <span className="tool-status-pulse"></span>
                      </div>
                    ) : (
                      <div className="loading-spinner" style={{ width: '1.5rem', height: '1.5rem', margin: 0 }}></div>
                    )}
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
