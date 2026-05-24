import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Network, ArrowRight, Cpu, Database, Globe } from 'lucide-react';

// Animated left panel — orchestration graph visualization
const OrchestrationPanel = () => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 1200);
    return () => clearInterval(t);
  }, []);

  const nodes = [
    { x: 50, y: 60, label: 'Query', color: '#10b981', size: 36 },
    { x: 160, y: 110, label: 'Retrieval', color: '#14b8a6', size: 30 },
    { x: 155, y: 30, label: 'Planner', color: '#818cf8', size: 30 },
    { x: 265, y: 80, label: 'Tools', color: '#f59e0b', size: 28 },
    { x: 350, y: 65, label: 'Critic', color: '#ef4444', size: 28 },
    { x: 440, y: 60, label: 'Response', color: '#10b981', size: 32 },
  ];

  const edges = [
    [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5],
  ];

  const activeEdge = tick % edges.length;

  return (
    <div style={{ width: '100%', height: '160px', position: 'relative' }}>
      <svg width="100%" height="160" viewBox="0 0 500 160" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {edges.map(([from, to], i) => {
          const a = nodes[from], b = nodes[to];
          const isActive = i === activeEdge;
          return (
            <g key={i}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={isActive ? '#10b981' : '#1f2228'}
                strokeWidth={isActive ? 1.5 : 1}
                strokeDasharray={isActive ? '5 3' : undefined}
                opacity={isActive ? 0.9 : 0.4}
                style={{ transition: 'all 0.3s ease' }}
              />
              {isActive && (
                <circle r="3" fill="#10b981" filter="url(#glow-green)" opacity="0.8">
                  <animateMotion
                    dur="0.8s"
                    repeatCount="1"
                    path={`M${a.x},${a.y} L${b.x},${b.y}`}
                  />
                </circle>
              )}
            </g>
          );
        })}

        {nodes.map((node, i) => {
          const isActive = edges[activeEdge]?.includes(i);
          return (
            <g key={i}>
              <circle
                cx={node.x}
                cy={node.y}
                r={node.size / 2}
                fill={`${node.color}12`}
                stroke={isActive ? node.color : `${node.color}40`}
                strokeWidth={isActive ? 1.5 : 1}
                style={{ transition: 'all 0.3s ease' }}
              />
              {isActive && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.size / 2 + 4}
                  fill="none"
                  stroke={`${node.color}30`}
                  strokeWidth="2"
                />
              )}
              <text
                x={node.x}
                y={node.y + node.size / 2 + 14}
                textAnchor="middle"
                fill={isActive ? node.color : '#4b5058'}
                fontSize="9"
                fontWeight="500"
                style={{ transition: 'all 0.3s ease', fontFamily: 'Inter, sans-serif' }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const AuthLayout = ({
  authMode,
  setAuthMode,
  authUsername,
  setAuthUsername,
  authPassword,
  setAuthPassword,
  authConfirmPassword,
  setAuthConfirmPassword,
  showPassword,
  setShowPassword,
  authError,
  setAuthError,
  authLoading,
  handleAuthSubmit,
}) => {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      background: '#08090b',
    }}>
      {/* Left panel — product showcase */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '4rem',
        position: 'relative',
        overflow: 'hidden',
        borderRight: '1px solid #1a1d22',
      }}>
        {/* Subtle grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 30% 50%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 30% 50%, black 30%, transparent 100%)',
        }} />

        {/* Emerald glow */}
        <div style={{
          position: 'absolute', top: '20%', left: '-10%',
          width: '400px', height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Brand mark */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3.5rem' }}
          >
            <div style={{
              width: '34px', height: '34px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #059669, #0f766e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Network size={17} color="white" />
            </div>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.125rem', letterSpacing: '-0.02em' }}>
              NexusAI
            </span>
          </motion.div>

          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '2.25rem',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.15,
              color: '#f1f2f4',
              marginBottom: '1rem',
            }}
          >
            Multi-Agent Intelligence,
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #10b981, #14b8a6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Fully Observable
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            style={{ color: '#6b7280', fontSize: '0.9375rem', lineHeight: 1.7, maxWidth: '380px', marginBottom: '3rem' }}
          >
            A stateful orchestration system with RAGAS-validated RAG, multi-key API resilience, and real-time agent telemetry.
          </motion.p>

          {/* Orchestration graph */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{
              padding: '20px 24px 12px',
              background: 'rgba(14,16,19,0.8)',
              border: '1px solid #1f2228',
              borderRadius: '12px',
              marginBottom: '2rem',
            }}
          >
            <div style={{
              fontSize: '0.6875rem', fontWeight: 600, color: '#4b5058',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span className="pulse-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              Live Agent Graph
            </div>
            <OrchestrationPanel />
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            style={{ display: 'flex', gap: '2rem' }}
          >
            {[
              { label: 'API Resilience', val: '4-key pool' },
              { label: 'Eval Framework', val: 'RAGAS v3' },
              { label: 'Vector Search', val: 'Hybrid FAISS' },
            ].map((stat, i) => (
              <div key={i}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e8eaed' }}>{stat.val}</div>
                <div style={{ fontSize: '0.7rem', color: '#4b5058', marginTop: '1px' }}>{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 3rem',
        position: 'relative',
      }}>
        <motion.div
          key={authMode}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          style={{ width: '100%', maxWidth: '400px' }}
        >
          {/* Header */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '1.625rem',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: '#f1f2f4',
              marginBottom: '6px',
            }}>
              {authMode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              {authMode === 'login'
                ? 'Sign in to your workspace to continue.'
                : 'Start orchestrating with NexusAI.'}
            </p>
          </div>

          {/* Mode tabs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: '#0e1013',
            border: '1px solid #1f2228',
            borderRadius: '8px',
            padding: '3px',
            marginBottom: '1.75rem',
          }}>
            {['login', 'signup'].map(mode => (
              <button
                key={mode}
                onClick={() => { setAuthMode(mode); setAuthError(''); }}
                style={{
                  padding: '7px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                  background: authMode === mode ? '#1a1d22' : 'transparent',
                  color: authMode === mode ? '#f1f2f4' : '#6b7280',
                }}
              >
                {mode === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Error / success message */}
          <AnimatePresence mode="wait">
            {authError && (
              <motion.div
                key="msg"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  padding: '10px 12px',
                  borderRadius: '7px',
                  marginBottom: '1rem',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  background: authError.includes('Successfully')
                    ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${authError.includes('Successfully') ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  color: authError.includes('Successfully') ? '#34d399' : '#f87171',
                }}
              >
                {authError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Username */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#8b909a', marginBottom: '6px' }}>
                Username
              </label>
              <input
                type="text"
                id="username"
                placeholder="e.g. john_doe"
                value={authUsername}
                onChange={e => setAuthUsername(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#0e1013',
                  border: '1px solid #1f2228',
                  borderRadius: '8px',
                  color: '#f1f2f4',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(16,185,129,0.5)'; }}
                onBlur={e => { e.target.style.borderColor = '#1f2228'; }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#8b909a', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 14px',
                    background: '#0e1013',
                    border: '1px solid #1f2228',
                    borderRadius: '8px',
                    color: '#f1f2f4',
                    fontSize: '0.9rem',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(16,185,129,0.5)'; }}
                  onBlur={e => { e.target.style.borderColor = '#1f2228'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#4b5058',
                    display: 'flex', alignItems: 'center', padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <AnimatePresence>
              {authMode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#8b909a', marginBottom: '6px' }}>
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    placeholder="••••••••"
                    value={authConfirmPassword}
                    onChange={e => setAuthConfirmPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: '#0e1013',
                      border: '1px solid #1f2228',
                      borderRadius: '8px',
                      color: '#f1f2f4',
                      fontSize: '0.9rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(16,185,129,0.5)'; }}
                    onBlur={e => { e.target.style.borderColor = '#1f2228'; }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={authLoading}
              whileHover={{ scale: authLoading ? 1 : 1.02, boxShadow: authLoading ? 'none' : '0 0 24px rgba(16,185,129,0.15)' }}
              whileTap={{ scale: authLoading ? 1 : 0.98 }}
              style={{
                marginTop: '8px',
                padding: '11px',
                background: authLoading ? '#1a1d22' : 'linear-gradient(135deg, #059669, #0f766e)',
                border: authLoading ? '1px solid #1f2228' : 'none',
                borderRadius: '8px',
                color: authLoading ? '#4b5058' : 'white',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: authLoading ? 'not-allowed' : 'pointer',
                letterSpacing: '-0.01em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background 0.2s ease',
              }}
            >
              {authLoading ? (
                <>
                  <div style={{
                    width: '14px', height: '14px',
                    border: '2px solid #2d3139',
                    borderTopColor: '#10b981',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  Authenticating...
                </>
              ) : (
                <>
                  {authMode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </form>

          <p style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: '#4b5058' }}>
            🔒 Secured with JWT · Multi-tenant isolation · MongoDB Atlas
          </p>
        </motion.div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .auth-grid { grid-template-columns: 1fr !important; }
          .auth-left { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default AuthLayout;
