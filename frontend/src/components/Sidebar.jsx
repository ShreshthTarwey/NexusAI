import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, MessageSquare, Network, User, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';

const Sidebar = ({
  sessions,
  currentSession,
  setCurrentSession,
  currentUser,
  handleNewChat,
  handleDeleteSession,
  handleLogout,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredSession, setHoveredSession] = useState(null);

  return (
    <motion.aside
      animate={{ width: collapsed ? '60px' : '240px' }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      style={{
        height: '100vh',
        background: '#0b0d10',
        borderRight: '1px solid #1a1d22',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{
        padding: collapsed ? '16px 10px' : '16px',
        borderBottom: '1px solid #1a1d22',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        height: '60px',
        flexShrink: 0,
      }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '7px',
          background: 'linear-gradient(135deg, #059669, #0f766e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Network size={14} color="white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '0.9375rem',
                letterSpacing: '-0.02em',
                color: '#f1f2f4',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              NexusAI
            </motion.span>
          )}
        </AnimatePresence>
        <motion.button
          onClick={() => setCollapsed(c => !c)}
          whileHover={{ background: 'rgba(255,255,255,0.06)' }}
          style={{
            marginLeft: 'auto',
            width: '24px', height: '24px',
            borderRadius: '5px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#4b5058',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </motion.button>
      </div>

      {/* New Chat Button */}
      <div style={{ padding: collapsed ? '10px 8px' : '10px 10px', flexShrink: 0 }}>
        <motion.button
          whileHover={{ background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' }}
          whileTap={{ scale: 0.97 }}
          onClick={handleNewChat}
          style={{
            width: '100%',
            padding: collapsed ? '8px' : '8px 12px',
            background: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.15)',
            borderRadius: '7px',
            cursor: 'pointer',
            color: '#34d399',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            transition: 'all 0.15s ease',
            fontSize: '0.8125rem',
            fontWeight: 600,
          }}
        >
          <Plus size={14} style={{ flexShrink: 0 }} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
              >
                New Chat
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Sessions list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: collapsed ? '4px 8px' : '4px 10px',
      }}>
        {!collapsed && sessions.length > 0 && (
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            color: '#4b5058',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            padding: '8px 4px 6px',
          }}>
            Conversations
          </div>
        )}

        {sessions.map(s => {
          const isActive = currentSession === s.session_id;
          const isHovered = hoveredSession === s.session_id;

          return (
            <motion.div
              key={s.session_id}
              whileHover={{ background: isActive ? undefined : 'rgba(255,255,255,0.03)' }}
              onClick={() => setCurrentSession(s.session_id)}
              onMouseEnter={() => setHoveredSession(s.session_id)}
              onMouseLeave={() => setHoveredSession(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: collapsed ? '8px' : '7px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: isActive ? 'rgba(16,185,129,0.08)' : 'transparent',
                border: isActive ? '1px solid rgba(16,185,129,0.15)' : '1px solid transparent',
                marginBottom: '2px',
                transition: 'all 0.15s ease',
                justifyContent: collapsed ? 'center' : 'flex-start',
                position: 'relative',
              }}
            >
              <MessageSquare
                size={13}
                style={{ color: isActive ? '#34d399' : '#4b5058', flexShrink: 0 }}
              />
              {!collapsed && (
                <>
                  <span style={{
                    flex: 1,
                    fontSize: '0.8rem',
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? '#e8eaed' : '#8b909a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.title || 'New Chat'}
                  </span>
                  {isHovered && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={e => handleDeleteSession(e, s.session_id)}
                      style={{
                        width: '20px', height: '20px',
                        borderRadius: '4px',
                        border: 'none',
                        background: 'rgba(239,68,68,0.1)',
                        color: '#f87171',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={10} />
                    </motion.button>
                  )}
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Profile footer */}
      <div style={{
        padding: collapsed ? '12px 8px' : '12px 10px',
        borderTop: '1px solid #1a1d22',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div style={{
            width: '28px', height: '28px',
            borderRadius: '7px',
            background: '#1a1d22',
            border: '1px solid #1f2228',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <User size={13} color="#8b909a" />
          </div>
          {!collapsed && (
            <>
              <span style={{
                flex: 1,
                fontSize: '0.8rem',
                fontWeight: 500,
                color: '#8b909a',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {currentUser}
              </span>
              <motion.button
                whileHover={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}
                onClick={handleLogout}
                title="Log out"
                style={{
                  width: '26px', height: '26px',
                  borderRadius: '5px',
                  border: 'none',
                  background: 'transparent',
                  color: '#4b5058',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                <LogOut size={13} />
              </motion.button>
            </>
          )}
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
