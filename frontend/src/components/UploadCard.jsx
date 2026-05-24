import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle, Plus } from 'lucide-react';

const UploadCard = ({
  files,
  status,
  response,
  messages,
  fileInputRef,
  handleFileChange,
  handleUploadClick,
  handleSubmit,
}) => {
  const isDragging = useRef(false);

  const handleDragOver = e => { e.preventDefault(); };

  const handleDrop = e => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.pdf') || f.name.endsWith('.md') || f.name.endsWith('.txt')
    );
    if (dropped.length > 0) {
      const event = { target: { files: dropped } };
      handleFileChange(event);
    }
  };

  // Hidden after upload success when chat is live
  if (status === 'success' && messages.length > 0) {
    return (
      <div style={{ marginBottom: '8px' }}>
        <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept=".pdf,.md,.txt" />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        accept=".pdf,.md,.txt"
      />

      <AnimatePresence mode="wait">
        {/* Empty state — drop zone */}
        {files.length === 0 && messages.length === 0 && status !== 'uploading' && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleUploadClick}
            whileHover={{ borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.03)' }}
            style={{
              border: '1px dashed #1f2228',
              borderRadius: '12px',
              padding: '3rem',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: '#0b0d10',
            }}
          >
            <div style={{
              width: '48px', height: '48px',
              borderRadius: '12px',
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem',
              color: '#34d399',
            }}>
              <Upload size={20} />
            </div>
            <h3 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: '#e8eaed',
              marginBottom: '6px',
            }}>
              Upload Research Documents
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '12px' }}>
              Drop PDF, Markdown, or TXT files · or click to browse
            </p>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {['.pdf', '.md', '.txt'].map(ext => (
                <span key={ext} style={{
                  padding: '2px 8px',
                  background: '#1a1d22',
                  border: '1px solid #1f2228',
                  borderRadius: '4px',
                  fontSize: '0.6875rem',
                  color: '#6b7280',
                  fontFamily: 'monospace',
                }}>
                  {ext}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Files selected — ready to process */}
        {files.length > 0 && status !== 'uploading' && status !== 'success' && (
          <motion.div
            key="selected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              border: '1px solid #1f2228',
              borderRadius: '12px',
              background: '#0b0d10',
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid #1a1d22',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#c9ccd2' }}>
                {files.length} {files.length === 1 ? 'document' : 'documents'} selected
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <motion.button
                  whileHover={{ background: 'rgba(255,255,255,0.06)' }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleUploadClick}
                  style={{
                    padding: '5px 10px',
                    background: 'transparent',
                    border: '1px solid #1f2228',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#6b7280',
                    fontSize: '0.75rem',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Plus size={11} />
                  Add more
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(16,185,129,0.12)' }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  style={{
                    padding: '5px 14px',
                    background: 'linear-gradient(135deg, #059669, #0f766e)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}
                >
                  Process {files.length === 1 ? 'Document' : 'Documents'}
                </motion.button>
              </div>
            </div>
            <div style={{ padding: '8px', maxHeight: '160px', overflowY: 'auto' }}>
              {files.map((file, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '7px',
                }}>
                  <div style={{
                    width: '30px', height: '30px',
                    borderRadius: '7px',
                    background: 'rgba(16,185,129,0.06)',
                    border: '1px solid rgba(16,185,129,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <FileText size={13} color="#34d399" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#c9ccd2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: '#4b5058', marginTop: '1px' }}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Uploading / processing */}
        {status === 'uploading' && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '24px',
              border: '1px solid #1f2228',
              borderRadius: '12px',
              background: '#0b0d10',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              textAlign: 'center',
            }}
          >
            {/* Orchestration loader — 3 orbiting dots */}
            <div style={{ position: 'relative', width: '48px', height: '48px' }}>
              <div style={{
                width: '48px', height: '48px',
                borderRadius: '50%',
                border: '1px solid #1f2228',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '16px', height: '16px',
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.4)',
                }} />
              </div>
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2 + i * 0.4, repeat: Infinity, ease: 'linear', delay: i * 0.3 }}
                  style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    width: `${32 + i * 10}px`, height: `${32 + i * 10}px`,
                    marginTop: `${-(16 + i * 5)}px`, marginLeft: `${-(16 + i * 5)}px`,
                    borderRadius: '50%',
                    border: `1px dashed rgba(16,185,129,${0.4 - i * 0.1})`,
                    pointerEvents: 'none',
                  }}
                />
              ))}
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#c9ccd2', marginBottom: '4px' }}>
                Initializing Ingestion Pipeline
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                Chunking, embedding, and indexing documents…
              </div>
            </div>
            {/* Progress steps */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['Parsing', 'Chunking', 'Embedding', 'Indexing'].map((step, i) => (
                <motion.span
                  key={step}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.4 }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    color: '#34d399',
                  }}
                >
                  {step}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Success */}
        {status === 'success' && response && messages.length === 0 && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              padding: '20px 24px',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: '12px',
              background: 'rgba(16,185,129,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <CheckCircle2 size={18} color="#34d399" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8375rem', fontWeight: 600, color: '#34d399', marginBottom: '2px' }}>Documents Ingested Successfully</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{response.message}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UploadCard;
