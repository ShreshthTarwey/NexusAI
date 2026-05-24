import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Globe, Calculator, Search, Wrench } from 'lucide-react';

export const getToolLogEntries = (msg) => {
  if (msg.toolLog && msg.toolLog.length > 0) return msg.toolLog;
  if (!msg.sources) return [];

  const entries = [];
  for (const src of msg.sources) {
    const filename = src.metadata?.source_file || '';
    if (filename.startsWith('tool:')) {
      const toolName = filename.substring(5);
      const content = src.content || '';
      const inputIdx = content.indexOf('Input:');
      const outputIdx = content.indexOf('Output:');
      let inputVal = '', outputVal = '';
      if (inputIdx !== -1 && outputIdx !== -1) {
        inputVal = content.substring(inputIdx + 6, outputIdx).trim();
        outputVal = content.substring(outputIdx + 7).trim();
      } else {
        inputVal = content;
      }
      entries.push({ name: toolName, input: inputVal, output: outputVal });
    }
  }
  return entries;
};

export const formatToolInput = (inputStr) => {
  if (!inputStr) return '';
  const match = inputStr.match(/'(?:query|expression)':\s*['"](.*?)['"]/);
  return match ? match[1] : inputStr;
};

const TOOL_META = {
  web_search: { icon: Globe, label: 'Web Search', color: '#38bdf8', bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.2)' },
  safe_calculator: { icon: Calculator, label: 'Calculator', color: '#fbbf24', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  knowledge_base_search: { icon: Search, label: 'Knowledge Search', color: '#34d399', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)' },
};

export const ToolExecutionLog = ({ entries }) => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid #1f2228',
          borderRadius: '6px',
          cursor: 'pointer',
          color: '#8b909a',
          fontSize: '0.75rem',
          fontWeight: 500,
          transition: 'all 0.2s ease',
          width: 'auto',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
          e.currentTarget.style.color = '#c9ccd2';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.color = '#8b909a';
        }}
      >
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={12} />
        </motion.span>
        <span>Tool Execution Log</span>
        <span style={{
          padding: '1px 6px',
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: '3px',
          color: '#34d399',
          fontSize: '0.6875rem',
          fontWeight: 600,
        }}>
          {entries.length} {entries.length === 1 ? 'step' : 'steps'}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              marginTop: '8px',
              border: '1px solid #1f2228',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#0b0d10',
            }}>
              {entries.map((entry, i) => {
                const meta = TOOL_META[entry.name] || {
                  icon: Wrench, label: entry.name, color: '#8b909a', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)',
                };
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.2 }}
                    style={{
                      padding: '12px 14px',
                      borderBottom: i < entries.length - 1 ? '1px solid #1a1d22' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '22px',
                        height: '22px',
                        borderRadius: '5px',
                        background: meta.bg,
                        border: `1px solid ${meta.border}`,
                        color: meta.color,
                        flexShrink: 0,
                      }}>
                        <Icon size={11} />
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: meta.color }}>{meta.label}</span>
                      <span style={{
                        marginLeft: 'auto',
                        fontSize: '0.6875rem',
                        color: '#4b5058',
                        fontVariantNumeric: 'tabular-nums',
                      }}>Step {i + 1}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '30px' }}>
                      <div>
                        <span style={{ fontSize: '0.6875rem', color: '#4b5058', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Input</span>
                        <div style={{
                          marginTop: '3px',
                          padding: '6px 8px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid #1a1d22',
                          borderRadius: '5px',
                          fontSize: '0.78rem',
                          color: '#8b909a',
                          fontFamily: 'monospace',
                          wordBreak: 'break-all',
                        }}>
                          {String(entry.input)}
                        </div>
                      </div>
                      {entry.output && (
                        <div>
                          <span style={{ fontSize: '0.6875rem', color: '#4b5058', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Output</span>
                          <div style={{
                            marginTop: '3px',
                            padding: '6px 8px',
                            background: `${meta.bg}`,
                            border: `1px solid ${meta.border}`,
                            borderRadius: '5px',
                            fontSize: '0.78rem',
                            color: meta.color,
                            fontFamily: 'monospace',
                            wordBreak: 'break-all',
                            maxHeight: '80px',
                            overflow: 'hidden',
                          }}>
                            {String(entry.output).substring(0, 300)}{String(entry.output).length > 300 ? '…' : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ToolExecutionLog;
