import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, Globe, Search, Calculator, User, Cpu, FileText } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { ToolExecutionLog, getToolLogEntries, formatToolInput } from './ToolExecutionLog';
import { SmartTooltip, SourceTooltipContent, DocIcon as DocIconSm } from './InlineSourceBadge';

const TOOL_META = {
  web_search:            { icon: Globe,       label: 'Searching the web',      color: '#38bdf8', rgb: '14,165,233' },
  knowledge_base_search: { icon: Search,      label: 'Searching knowledge base', color: '#34d399', rgb: '16,185,129' },
  safe_calculator:       { icon: Calculator,  label: 'Computing expression',   color: '#fbbf24', rgb: '245,158,11' },
};

// Active tool pulse animation during streaming
const ToolPulse = ({ tool }) => {
  const meta = TOOL_META[tool.name] || { icon: Cpu, label: tool.name, color: '#a78bfa', rgb: '167,139,250' };
  const Icon = meta.icon;
  const query = formatToolInput(tool.input);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 12, scale: 0.95 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        background: `rgba(${meta.rgb}, 0.07)`,
        border: `1px solid rgba(${meta.rgb}, 0.25)`,
        borderRadius: '10px',
        maxWidth: '480px',
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: '32px', height: '32px',
          borderRadius: '8px',
          background: `rgba(${meta.rgb}, 0.12)`,
          border: `1px solid rgba(${meta.rgb}, 0.35)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: meta.color,
        }}>
          <Icon size={15} />
        </div>
        {/* Ripple ring */}
        <motion.span
          animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{
            position: 'absolute', inset: 0,
            borderRadius: '8px',
            border: `1.5px solid ${meta.color}`,
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: meta.color, marginBottom: '2px' }}>
          {meta.label}
        </div>
        {query && (
          <div style={{
            fontSize: '0.72rem', color: '#6b7280',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '320px',
          }}>
            "{query}"
          </div>
        )}
      </div>

      {/* EQ bars */}
      <div style={{ display: 'flex', gap: '3px', marginLeft: 'auto', alignItems: 'center', flexShrink: 0 }}>
        {[0, 1, 2, 3].map(i => (
          <motion.span
            key={i}
            animate={{ scaleY: [0.3, 1, 0.3] }}
            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
            style={{
              display: 'block',
              width: '3px', height: '14px',
              borderRadius: '99px',
              background: meta.color,
              opacity: 0.8,
              transformOrigin: 'bottom',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
};

// Thinking loader — NexusAI orchestrating
const ThinkingLoader = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
  >
    <div style={{
      width: '32px', height: '32px', borderRadius: '8px',
      background: 'rgba(16,185,129,0.08)',
      border: '1px solid rgba(16,185,129,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Cpu size={15} color="#34d399" />
    </div>
    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.22 }}
          style={{ display: 'block', width: '5px', height: '5px', borderRadius: '50%', background: '#34d399' }}
        />
      ))}
    </div>
    <span style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>Orchestrating…</span>
  </motion.div>
);

// GlobeIconSm and DocIconSm are now imported from InlineSourceBadge

const ChatSection = ({
  messages,
  status,
  currentSession,
  isQuerying,
  activeTool,
  query,
  setQuery,
  handleQuerySubmit,
  handleUploadClick,
}) => {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if ((status !== 'success' && messages.length === 0) || currentSession === 'default') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Message thread */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => {
            const messageSources = msg.sources || [];
            const allSessionSources = messages.reduce((acc, m) => {
              if (m.sources) {
                for (const src of m.sources) {
                  if (!acc.some(e => e.content === src.content)) acc.push(src);
                }
              }
              return acc;
            }, [...messageSources]);

            const toolLogEntries = getToolLogEntries(msg);
            const isUser = msg.role === 'user';
            const isStreaming = index === messages.length - 1 && isQuerying && !isUser;
            const docSources = msg.sources?.filter(s => !s.metadata?.source_file?.startsWith('tool:')) || [];

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '0 2px',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '30px', height: '30px',
                  borderRadius: '8px',
                  background: isUser
                    ? 'rgba(99,102,241,0.12)'
                    : 'rgba(16,185,129,0.10)',
                  border: isUser
                    ? '1px solid rgba(99,102,241,0.25)'
                    : '1px solid rgba(16,185,129,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: '2px',
                }}>
                  {isUser
                    ? <User size={13} color="#818cf8" />
                    : <Cpu size={13} color="#34d399" />}
                </div>

                {/* Bubble / content */}
                <div style={{
                  maxWidth: isUser ? '68%' : '100%',
                  flex: isUser ? '0 0 auto' : 1,
                  minWidth: 0,
                }}>
                  {isUser ? (
                    /* User bubble */
                    <div style={{
                      padding: '11px 15px',
                      background: 'rgba(99,102,241,0.08)',
                      border: '1px solid rgba(99,102,241,0.2)',
                      borderRadius: '12px 3px 12px 12px',
                      fontSize: '0.9rem',
                      color: '#d4d6db',
                      lineHeight: 1.65,
                    }}>
                      {msg.content}
                    </div>
                  ) : (
                    /* Assistant block */
                    <div style={{ minWidth: 0 }}>
                      {/* Markdown content */}
                      <div className={isStreaming && msg.content ? 'typing-cursor' : ''}>
                        <MarkdownRenderer
                          content={msg.content}
                          sources={allSessionSources}
                          toolSources={msg.toolSources}
                        />
                      </div>

                      {/* Tool execution log */}
                      {toolLogEntries.length > 0 && (
                        <ToolExecutionLog entries={toolLogEntries} />
                      )}

                      {/* Retrieved Contexts */}
                      {docSources.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{ marginTop: '14px' }}
                        >
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '7px',
                          }}>
                            <div style={{
                              width: '14px', height: '14px',
                              display: 'flex', alignItems: 'center',
                              color: '#6b7280',
                            }}>
                              <DocIconSm size={11} />
                            </div>
                            <span style={{
                              fontSize: '0.6875rem', fontWeight: 700,
                              color: '#4b5058',
                              textTransform: 'uppercase', letterSpacing: '0.09em',
                            }}>
                              Retrieved Contexts
                            </span>
                            <span style={{
                              padding: '1px 6px',
                              background: 'rgba(16,185,129,0.08)',
                              border: '1px solid rgba(16,185,129,0.15)',
                              borderRadius: '99px',
                              fontSize: '0.625rem',
                              fontWeight: 700,
                              color: '#34d399',
                            }}>
                              {docSources.length}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {docSources.map((src, idx) => {
                              const pageVal = src.metadata?.page;
                              const hasPage = pageVal !== undefined && pageVal !== null && !isNaN(Number(pageVal));
                              const displayPage = hasPage ? Number(pageVal) + 1 : null;
                              // Alternate accent: even=teal, odd=indigo
                              const isEven = idx % 2 === 0;
                              const badgeColor = isEven ? '#34d399' : '#818cf8';
                              const badgeBg = isEven ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.09)';
                              const badgeBorder = isEven ? 'rgba(16,185,129,0.22)' : 'rgba(99,102,241,0.22)';
                              const sourceFile = src.metadata?.source_file || 'Unknown';

                              const tooltipContent = (
                                <SourceTooltipContent
                                  typeLabel="Document"
                                  color={badgeColor}
                                  bg={badgeBg}
                                  border={badgeBorder}
                                  IconComponent={(p) => <DocIconSm size={p.size || 11} />}
                                  sourceName={sourceFile}
                                  chunkContent={src.content}
                                  page={displayPage}
                                />
                              );

                              return (
                                <SmartTooltip key={idx} tooltipContent={tooltipContent}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '3px 9px 3px 7px',
                                    background: badgeBg,
                                    border: `1px solid ${badgeBorder}`,
                                    borderRadius: '5px',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    color: badgeColor,
                                    cursor: 'default',
                                    maxWidth: '210px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    transition: 'background 0.15s ease, border-color 0.15s ease',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = isEven ? 'rgba(16,185,129,0.14)' : 'rgba(99,102,241,0.14)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = badgeBg; }}
                                  >
                                    <span style={{ flexShrink: 0, color: badgeColor, display: 'flex', alignItems: 'center' }}>
                                      <DocIconSm size={10} />
                                    </span>
                                    <span>
                                      {sourceFile}{displayPage ? `, p.${displayPage}` : ''}
                                    </span>
                                  </span>
                                </SmartTooltip>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Active query state */}
        {isQuerying && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '0 2px' }}
          >
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginTop: '2px',
            }}>
              <Cpu size={13} color="#34d399" />
            </div>
            <AnimatePresence mode="wait">
              {activeTool
                ? <ToolPulse key="tool" tool={activeTool} />
                : <ThinkingLoader key="thinking" />}
            </AnimatePresence>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input dock */}
      <div style={{ padding: '14px 0 2px', borderTop: '1px solid #1a1d22', flexShrink: 0 }}>
        <form
          onSubmit={handleQuerySubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            background: '#0e1115',
            border: '1px solid #252830',
            borderRadius: '12px',
            transition: 'border-color 0.2s ease',
          }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)'; }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = '#252830'; }}
        >
          <motion.button
            type="button"
            whileHover={{ color: '#c9ccd2', background: 'rgba(255,255,255,0.07)' }}
            whileTap={{ scale: 0.93 }}
            onClick={handleUploadClick}
            title="Attach document"
            style={{
              padding: '7px', borderRadius: '7px', border: 'none',
              background: 'transparent', color: '#4b5058', cursor: 'pointer',
              display: 'flex', alignItems: 'center', flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
          >
            <Paperclip size={16} />
          </motion.button>

          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={isQuerying}
            placeholder={isQuerying ? 'Orchestrating response…' : 'Ask anything about your documents…'}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#e8eaed', fontSize: '0.9rem', lineHeight: 1.5, padding: '4px 0',
            }}
          />

          <motion.button
            type="submit"
            disabled={!query.trim() || isQuerying}
            whileHover={!isQuerying && query.trim() ? { scale: 1.06, boxShadow: '0 0 18px rgba(16,185,129,0.25)' } : {}}
            whileTap={!isQuerying && query.trim() ? { scale: 0.94 } : {}}
            style={{
              width: '36px', height: '36px', borderRadius: '8px', border: 'none',
              background: !query.trim() || isQuerying ? '#1a1d22' : 'linear-gradient(135deg, #059669, #0f766e)',
              color: !query.trim() || isQuerying ? '#4b5058' : 'white',
              cursor: !query.trim() || isQuerying ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.2s ease',
            }}
          >
            <Send size={14} />
          </motion.button>
        </form>
        <p style={{ textAlign: 'center', fontSize: '0.6875rem', color: '#363a42', marginTop: '8px' }}>
          NexusAI uses multi-agent orchestration · Responses may be validated by the Critic agent
        </p>
      </div>
    </div>
  );
};

export default ChatSection;
