import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, FileText, Network } from 'lucide-react';
import './index.css';

import LandingPage from './components/LandingPage';
import AuthLayout from './components/AuthLayout';
import Sidebar from './components/Sidebar';
import UploadCard from './components/UploadCard';
import ChatSection from './components/ChatSection';

// ── View states: 'landing' | 'auth' | 'workspace'
function App() {
  const storedToken = localStorage.getItem('nexusai_token');
  const [view, setView] = useState(storedToken ? 'workspace' : 'landing');
  const [token, setToken] = useState(storedToken || null);
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('nexusai_username') || null);

  // Auth Form State
  const [authMode, setAuthMode] = useState('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Workspace State
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState('default');
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('idle');
  const [response, setResponse] = useState(null);
  const [chunkCount, setChunkCount] = useState(null); // track ingested chunks
  const fileInputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [toolLog, setToolLog] = useState([]);
  const activeToolStartTimeRef = useRef(0);
  const activeToolTimeoutRef = useRef(null);

  // Authenticated fetch wrapper
  const apiFetch = async (path, options = {}) => {
    const url = `http://localhost:8000${path}`;
    const headers = options.headers || {};
    const t = localStorage.getItem('nexusai_token');
    if (t) headers['Authorization'] = `Bearer ${t}`;
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        handleLogout();
        throw new Error('Session expired. Please log in again.');
      }
      return res;
    } catch (err) {
      console.error(`API error on ${path}:`, err);
      throw err;
    }
  };

  useEffect(() => {
    if (token) fetchSessions();
  }, [token]);

  useEffect(() => {
    if (currentSession && currentSession !== 'default') {
      fetchSessionMessages(currentSession);
    } else {
      setMessages([]); setFiles([]); setStatus('idle'); setResponse(null);
    }
  }, [currentSession]);

  const fetchSessions = async () => {
    try {
      const res = await apiFetch('/api/sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) { console.error('Failed to fetch sessions', e); }
  };

  const fetchSessionMessages = async (sessionId) => {
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
        setStatus('success');
      } else {
        setMessages([]); setStatus('idle');
        setChunkCount(null);
      }
    } catch (e) { console.error('Failed to fetch messages', e); }
  };

  const handleNewChat = async () => {
    try {
      const res = await apiFetch('/api/sessions', { method: 'POST' });
      const data = await res.json();
      setCurrentSession(data.session_id);
      fetchSessions();
      return data.session_id;
    } catch (e) { console.error('Failed to create chat', e); return null; }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;
    try {
      await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (currentSession === sessionId) setCurrentSession('default');
      fetchSessions();
    } catch (err) { console.error(err); }
  };

  const handleFileChange = (e) => {
    const fileList = e.target?.files || e;
    const arr = Array.isArray(fileList) ? fileList : Array.from(fileList);
    if (arr.length > 0) {
      setFiles(arr);
      setStatus('idle');
      setResponse(null);
      if (currentSession === 'default') handleNewChat();
    }
  };

  const handleUploadClick = async () => {
    if (currentSession === 'default') {
      const id = await handleNewChat();
      if (!id) { alert('Failed to initialize session.'); return; }
    }
    fileInputRef.current?.click();
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('Wipe the knowledge base for this session?')) return;
    try {
      await apiFetch(`/api/clear?session_id=${currentSession}`, { method: 'DELETE' });
      setFiles([]); setMessages([]); setStatus('idle'); setResponse(null);
    } catch (err) { console.error('Error clearing DB:', err); }
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setStatus('uploading');
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    formData.append('session_id', currentSession);
    try {
      const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (data.job_id) pollUploadStatus(data.job_id);
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
          if (data.chunks) setChunkCount(data.chunks);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `I've successfully ingested **${data.chunks} chunks** from your document. The knowledge base is ready — ask me anything.`,
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
    if (currentSession === 'default') { alert('Please create a New Chat first.'); return; }

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
      let done = false, buffer = '';
      let currentToolLog = [], pendingToolsMap = {};

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim().startsWith('data: ')) continue;
            try {
              const jsonStr = line.replace(/^data:\s*/, '');
              if (!jsonStr.trim()) continue;
              const data = JSON.parse(jsonStr);

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
                  const msgs = [...prev];
                  const last = msgs.length - 1;
                  msgs[last] = { ...msgs[last], content: msgs[last].content + data.text };
                  return msgs;
                });
              }

              if (data.sources) {
                setMessages(prev => {
                  const msgs = [...prev];
                  msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], sources: data.sources };
                  return msgs;
                });
              }

              if (data.tool_sources) {
                setMessages(prev => {
                  const msgs = [...prev];
                  msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], toolSources: data.tool_sources };
                  return msgs;
                });
              }

              if (data.tool_status === 'start') {
                if (activeToolTimeoutRef.current) {
                  clearTimeout(activeToolTimeoutRef.current);
                  activeToolTimeoutRef.current = null;
                }
                activeToolStartTimeRef.current = Date.now();
                pendingToolsMap[data.tool_name] = { name: data.tool_name, input: data.tool_input, output: null };
                setActiveTool({ name: data.tool_name, input: data.tool_input });
              }

              if (data.tool_status === 'end') {
                const entry = pendingToolsMap[data.tool_name];
                if (entry) {
                  entry.output = data.tool_output;
                  currentToolLog = [...currentToolLog, entry];
                  setToolLog([...currentToolLog]);
                  delete pendingToolsMap[data.tool_name];
                }
              }
            } catch (e) { console.warn('Failed to parse SSE line', e); }
          }
        }
      }

      if (currentToolLog.length > 0) {
        setMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], toolLog: currentToolLog };
          return msgs;
        });
      }

      fetchSessions();
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error.message}.` }]);
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
    if (!username || !password) { setAuthError('Please fill in all fields.'); return; }
    if (authMode === 'signup' && password !== authConfirmPassword) { setAuthError('Passwords do not match.'); return; }
    setAuthLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Authentication failed');
      if (authMode === 'login') {
        localStorage.setItem('nexusai_token', data.access_token);
        localStorage.setItem('nexusai_username', data.username);
        setToken(data.access_token);
        setCurrentUser(data.username);
        setAuthUsername(''); setAuthPassword(''); setAuthConfirmPassword('');
        setView('workspace');
      } else {
        setAuthMode('login');
        setAuthPassword(''); setAuthConfirmPassword('');
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
    setToken(null); setCurrentUser(null);
    setSessions([]); setCurrentSession('default');
    setMessages([]); setFiles([]); setStatus('idle'); setResponse(null);
    setView('landing');
  };

  const currentSessionTitle = sessions.find(s => s.session_id === currentSession)?.title;

  // ── Render views
  if (view === 'landing') {
    return <LandingPage onEnter={() => setView(storedToken ? 'workspace' : 'auth')} />;
  }

  if (view === 'auth' || !token) {
    return (
      <AuthLayout
        authMode={authMode}
        setAuthMode={setAuthMode}
        authUsername={authUsername}
        setAuthUsername={setAuthUsername}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authConfirmPassword={authConfirmPassword}
        setAuthConfirmPassword={setAuthConfirmPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        authError={authError}
        setAuthError={setAuthError}
        authLoading={authLoading}
        handleAuthSubmit={handleAuthSubmit}
      />
    );
  }

  // ── Workspace view
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#09090c',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Dynamic animated background — subtle mesh orbs */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        overflow: 'hidden',
      }}>
        {/* Slow-drifting emerald orb top-left */}
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', top: '-10%', left: '10%',
            width: '500px', height: '500px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16,185,129,0.045) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        {/* Slow-drifting indigo orb bottom-right */}
        <motion.div
          animate={{ x: [0, -25, 0], y: [0, 20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
          style={{
            position: 'absolute', bottom: '-5%', right: '5%',
            width: '420px', height: '420px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)',
            filter: 'blur(50px)',
          }}
        />
        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0,0,0,0.6) 0%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0,0,0,0.6) 0%, transparent 100%)',
        }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Sidebar
          sessions={sessions}
          currentSession={currentSession}
          setCurrentSession={setCurrentSession}
          currentUser={currentUser}
          handleNewChat={handleNewChat}
          handleDeleteSession={handleDeleteSession}
          handleLogout={handleLogout}
        />

        {/* Main workspace */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          background: 'transparent',
        }}>
          {/* Top bar */}
          <div style={{
            height: '58px',
            borderBottom: '1px solid #1e2027',
            padding: '0 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            background: 'rgba(9,9,12,0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}>
            {/* Left: session title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {currentSession !== 'default' && (
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.7)',
                }} className="pulse-dot" />
              )}
              <h1 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.02em',
                color: currentSession === 'default' ? '#3d4149' : '#d4d6db',
              }}>
                {currentSession === 'default' ? 'Select or create a chat' : currentSessionTitle || 'New Workspace'}
              </h1>
              {/* Chunk count pill */}
              {chunkCount && currentSession !== 'default' && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '2px 8px',
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: '99px',
                    fontSize: '0.6875rem', fontWeight: 700, color: '#34d399',
                  }}
                >
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                  {chunkCount} chunks indexed
                </motion.span>
              )}
            </div>

            {/* Right: actions */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {currentSession !== 'default' && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileHover={{ scale: 1.03, background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleClearDatabase}
                  title="Wipe knowledge base for this session"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 13px',
                    background: 'rgba(239,68,68,0.07)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: '7px',
                    cursor: 'pointer',
                    color: '#f87171',
                    fontSize: '0.78rem', fontWeight: 600,
                    letterSpacing: '0.01em',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <Trash2 size={12} />
                  Wipe Index
                </motion.button>
              )}
            </div>
          </div>

          {/* Content area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 32px',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Empty workspace */}
            {currentSession === 'default' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  textAlign: 'center', gap: '16px',
                }}
              >
                <div style={{
                  width: '60px', height: '60px', borderRadius: '16px',
                  background: 'rgba(16,185,129,0.07)',
                  border: '1px solid rgba(16,185,129,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 30px rgba(16,185,129,0.08)',
                }}>
                  <Network size={26} color="#34d399" />
                </div>
                <div>
                  <h2 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em',
                    color: '#c9ccd2', marginBottom: '6px',
                  }}>
                    Ready to Orchestrate
                  </h2>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', maxWidth: '300px' }}>
                    Create a new chat and upload your research documents to begin.
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: '0 0 24px rgba(16,185,129,0.2)' }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleNewChat}
                  style={{
                    padding: '10px 26px',
                    background: 'linear-gradient(135deg, #059669, #0f766e)',
                    border: 'none', borderRadius: '8px',
                    color: 'white', fontSize: '0.875rem', fontWeight: 600,
                    cursor: 'pointer', marginTop: '8px',
                  }}
                >
                  + New Chat
                </motion.button>
              </motion.div>
            )}

            {currentSession !== 'default' && (
              <>
                <UploadCard
                  files={files}
                  status={status}
                  response={response}
                  messages={messages}
                  fileInputRef={fileInputRef}
                  handleFileChange={handleFileChange}
                  handleUploadClick={handleUploadClick}
                  handleSubmit={handleSubmit}
                />
                <ChatSection
                  messages={messages}
                  status={status}
                  currentSession={currentSession}
                  isQuerying={isQuerying}
                  activeTool={activeTool}
                  query={query}
                  setQuery={setQuery}
                  handleQuerySubmit={handleQuerySubmit}
                  handleUploadClick={handleUploadClick}
                />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
