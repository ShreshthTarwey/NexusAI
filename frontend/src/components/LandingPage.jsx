import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Cpu, Database, Globe, Network, Shield, Zap } from 'lucide-react';

// Animated pipeline node
const PipelineNode = ({ icon: Icon, label, color, delay, active }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
    }}
  >
    <div
      style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        background: `rgba(${color}, 0.08)`,
        border: `1px solid rgba(${color}, 0.25)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: `rgb(${color})`,
        position: 'relative',
      }}
      className={active ? 'node-pulse' : ''}
    >
      <Icon size={20} />
      {active && (
        <span style={{
          position: 'absolute',
          top: -3, right: -3,
          width: '8px', height: '8px',
          borderRadius: '50%',
          background: `rgb(${color})`,
          boxShadow: `0 0 6px rgb(${color})`,
        }} className="pulse-dot" />
      )}
    </div>
    <span style={{ fontSize: '0.6875rem', color: '#6b7280', textAlign: 'center', maxWidth: '60px', lineHeight: 1.3, fontWeight: 500 }}>
      {label}
    </span>
  </motion.div>
);

// Animated connecting arrow
const FlowArrow = ({ delay }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: delay + 0.3 }}
    style={{
      display: 'flex',
      alignItems: 'center',
      color: '#2d3139',
      paddingBottom: '22px',
    }}
  >
    <svg width="32" height="2" viewBox="0 0 32 2">
      <line x1="0" y1="1" x2="28" y2="1" stroke="#2d3139" strokeWidth="1" strokeDasharray="4 3" className="flow-line" />
    </svg>
    <ArrowRight size={12} color="#2d3139" />
  </motion.div>
);

// Main landing page
const LandingPage = ({ onEnter }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const heroRef = useRef(null);
  const [activeNode, setActiveNode] = useState(0);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!heroRef.current) return;
      const rect = heroRef.current.getBoundingClientRect();
      setMousePos({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    };
    const el = heroRef.current;
    if (el) el.addEventListener('mousemove', handleMouseMove);
    return () => { if (el) el.removeEventListener('mousemove', handleMouseMove); };
  }, []);

  // Cycle active node for demo
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveNode(prev => (prev + 1) % 5);
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  const pipelineNodes = [
    { icon: Database, label: 'Document Ingestion', color: '16, 185, 129', delay: 0.2 },
    { icon: Network, label: 'RAG Retrieval', color: '20, 184, 166', delay: 0.35 },
    { icon: Cpu, label: 'Agent Planner', color: '99, 102, 241', delay: 0.5 },
    { icon: Globe, label: 'Tool Execution', color: '245, 158, 11', delay: 0.65 },
    { icon: Shield, label: 'Critic Review', color: '239, 68, 68', delay: 0.8 },
  ];

  const features = [
    {
      icon: Network,
      title: 'Multi-Agent Orchestration',
      desc: 'LangGraph-powered stateful agent graphs coordinate document retrieval, tool use, and self-correction in a closed-loop system.',
      accent: '16, 185, 129',
    },
    {
      icon: Shield,
      title: 'RAGAS Evaluation Suite',
      desc: 'Phase 9 evaluation layer scores Faithfulness, Answer Relevance, and Context Recall across every response automatically.',
      accent: '99, 102, 241',
    },
    {
      icon: Zap,
      title: 'Resilient 4-Key API Pool',
      desc: 'Load-balanced fallback across 2 Groq + 2 OpenRouter keys guarantees zero downtime during rate-limit events.',
      accent: '245, 158, 11',
    },
    {
      icon: Globe,
      title: 'Live Tool Calling',
      desc: 'Real-time web search, safe computation, and vector database retrieval with SSE streaming telemetry.',
      accent: '20, 184, 166',
    },
    {
      icon: Database,
      title: 'Hybrid Vector Search',
      desc: 'FAISS dense retrieval + BM25 sparse ranking fused with cross-encoder reranking for state-of-the-art recall.',
      accent: '248, 113, 113',
    },
    {
      icon: Cpu,
      title: 'Session Persistence',
      desc: 'Multi-tenant MongoDB-backed session isolation with per-user conversation history and vector index cloning.',
      accent: '167, 139, 250',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#08090b', color: '#f1f2f4', overflowX: 'hidden' }}>
      {/* Nav */}
      <motion.nav
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 50,
          padding: '0 2rem',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(8,9,11,0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1a1d22',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '26px', height: '26px',
            borderRadius: '7px',
            background: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Network size={14} color="white" />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.0625rem', letterSpacing: '-0.02em' }}>
            NexusAI
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onEnter}
            style={{
              padding: '7px 20px',
              background: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)',
              border: 'none',
              borderRadius: '7px',
              color: 'white',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '-0.01em',
            }}
          >
            Launch Platform →
          </motion.button>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section
        ref={heroRef}
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: '80px 2rem 4rem',
          overflow: 'hidden',
        }}
      >
        {/* Dynamic spotlight following cursor */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(ellipse 60% 50% at ${mousePos.x}% ${mousePos.y}%, rgba(16,185,129,0.06) 0%, transparent 70%)`,
            transition: 'background 0.1s ease',
          }}
        />

        {/* Grid background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }} />

        {/* Hero content */}
        <div style={{ maxWidth: '800px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 14px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: '99px',
              marginBottom: '2rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#34d399',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
            Production-Grade Multi-Agent System
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.1,
              marginBottom: '1.5rem',
              color: '#f1f2f4',
            }}
          >
            An AI Orchestration
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 60%, #059669 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Operating System
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            style={{
              fontSize: '1.0625rem',
              color: '#6b7280',
              lineHeight: 1.75,
              maxWidth: '560px',
              margin: '0 auto 2.5rem',
            }}
          >
            NexusAI is a stateful, self-correcting multi-agent system that orchestrates document intelligence, tool execution, and RAG validation with observable precision.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(16,185,129,0.2)' }}
              whileTap={{ scale: 0.97 }}
              onClick={onEnter}
              style={{
                padding: '12px 28px',
                background: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)',
                border: 'none',
                borderRadius: '9px',
                color: 'white',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '-0.01em',
                transition: 'all 0.2s ease',
              }}
            >
              Open Workspace →
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02, background: 'rgba(255,255,255,0.05)' }}
              whileTap={{ scale: 0.98 }}
              style={{
                padding: '12px 28px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid #1f2228',
                borderRadius: '9px',
                color: '#8b909a',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              View Architecture
            </motion.button>
          </motion.div>
        </div>

        {/* Orchestration pipeline visualization */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'relative',
            zIndex: 1,
            marginTop: '5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0',
            padding: '28px 32px',
            background: 'rgba(14,16,19,0.8)',
            border: '1px solid #1f2228',
            borderRadius: '16px',
            backdropFilter: 'blur(12px)',
            maxWidth: '700px',
            width: '100%',
          }}
        >
          <div style={{
            position: 'absolute',
            top: '-1px', left: '24px',
            padding: '0 8px',
            background: '#08090b',
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: '#4b5058',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Live Orchestration Pipeline
          </div>

          {pipelineNodes.map((node, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start' }}>
              <PipelineNode
                icon={node.icon}
                label={node.label}
                color={node.color}
                delay={node.delay}
                active={activeNode === i}
              />
              {i < pipelineNodes.length - 1 && <FlowArrow delay={node.delay} />}
            </div>
          ))}
        </motion.div>
      </section>

      {/* Features Grid */}
      <section style={{ padding: '6rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '4rem' }}
        >
          <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#10b981', marginBottom: '1rem' }}>
            System Architecture
          </p>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: '#f1f2f4',
          }}>
            Built for serious AI engineering
          </h2>
        </motion.div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1px',
          background: '#1a1d22',
          borderRadius: '14px',
          overflow: 'hidden',
          border: '1px solid #1a1d22',
        }}>
          {features.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.4 }}
                whileHover={{ background: 'rgba(255,255,255,0.02)' }}
                style={{
                  padding: '28px',
                  background: '#0e1013',
                  transition: 'background 0.2s ease',
                  cursor: 'default',
                }}
              >
                <div style={{
                  width: '40px', height: '40px',
                  borderRadius: '10px',
                  background: `rgba(${feat.accent}, 0.08)`,
                  border: `1px solid rgba(${feat.accent}, 0.2)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: `rgb(${feat.accent})`,
                  marginBottom: '16px',
                }}>
                  <Icon size={18} />
                </div>
                <h3 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  color: '#e8eaed',
                  marginBottom: '8px',
                  letterSpacing: '-0.01em',
                }}>
                  {feat.title}
                </h3>
                <p style={{ fontSize: '0.84375rem', color: '#6b7280', lineHeight: 1.65 }}>
                  {feat.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* CTA Banner */}
      <section style={{ padding: '4rem 2rem 8rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{
            padding: '3rem',
            background: 'rgba(16,185,129,0.04)',
            border: '1px solid rgba(16,185,129,0.15)',
            borderRadius: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0, left: '50%', transform: 'translateX(-50%)',
            width: '200px', height: '1px',
            background: 'linear-gradient(90deg, transparent, #10b981, transparent)',
          }} />
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '2rem',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: '#f1f2f4',
            marginBottom: '1rem',
          }}>
            Ready to orchestrate intelligence?
          </h2>
          <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.9375rem' }}>
            Upload your documents and watch multi-agent AI analyze, retrieve, compute, and validate in real time.
          </p>
          <motion.button
            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(16,185,129,0.2)' }}
            whileTap={{ scale: 0.97 }}
            onClick={onEnter}
            style={{
              padding: '13px 32px',
              background: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)',
              border: 'none',
              borderRadius: '9px',
              color: 'white',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '-0.01em',
            }}
          >
            Launch NexusAI →
          </motion.button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #1a1d22',
        padding: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '20px', height: '20px',
            borderRadius: '5px',
            background: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Network size={11} color="white" />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '0.875rem', color: '#6b7280' }}>
            NexusAI
          </span>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#4b5058' }}>
          Multi-Agent Document Intelligence Platform · Production Build
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
