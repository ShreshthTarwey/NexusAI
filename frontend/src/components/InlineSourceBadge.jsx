import { useState, useRef, useCallback } from 'react';

// Inline SVG icons
const GlobeIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const CalcIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2"/>
    <line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/>
    <line x1="8" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/>
    <line x1="15" y1="16" x2="17" y2="14"/><line x1="17" y1="16" x2="15" y2="14"/>
    <line x1="15" y1="18" x2="17" y2="18"/>
  </svg>
);

const DocIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

// Export icon components for external use
export { GlobeIcon, CalcIcon, DocIcon };

// Helper to find the actual content chunk associated with a citation value
export const findSourceChunk = (sourceVal, sourcesList = [], toolSourcesList = []) => {
  const allSources = [...(sourcesList || []), ...(toolSourcesList || [])];
  const isWeb = sourceVal.startsWith('web:');
  const isCalc = sourceVal.startsWith('calc:') || sourceVal.startsWith('math:');

  if (isWeb) {
    const queryTerm = sourceVal.slice(4).trim();
    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:web_search') {
        const content = src.content || '';
        if (content.toLowerCase().includes(queryTerm.toLowerCase())) {
          const idx = content.indexOf('Output:');
          if (idx !== -1) return content.substring(idx + 7).trim();
          return content;
        }
      }
    }
    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:web_search') {
        const content = src.content || '';
        const idx = content.indexOf('Output:');
        if (idx !== -1) return content.substring(idx + 7).trim();
        return content;
      }
    }
  } else if (isCalc) {
    const exprTerm = sourceVal.split(':')[1]?.trim() || '';
    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:safe_calculator') {
        const content = src.content || '';
        if (!exprTerm || content.toLowerCase().includes(exprTerm.toLowerCase())) {
          const idx = content.indexOf('Output:');
          if (idx !== -1) return `${exprTerm} = ${content.substring(idx + 7).trim()}`;
          return content;
        }
      }
    }
    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:safe_calculator') return src.content || '';
    }
  } else {
    let targetFile = sourceVal;
    let targetPage = null;
    const commaIdx = sourceVal.indexOf(',');
    if (commaIdx !== -1) {
      targetFile = sourceVal.substring(0, commaIdx).trim();
      const pagePart = sourceVal.substring(commaIdx + 1).trim();
      const pageMatch = pagePart.match(/(?:Page|Pages):\s*(\d+)/i);
      if (pageMatch) targetPage = parseInt(pageMatch[1], 10);
    }

    if (targetPage !== null) {
      for (const src of allSources) {
        if (src.metadata?.source_file === targetFile) {
          const srcPage = src.metadata?.page;
          if (srcPage !== undefined && (srcPage === targetPage || srcPage === targetPage - 1 || String(srcPage) === String(targetPage))) {
            return src.content;
          }
        }
      }
    }

    for (const src of allSources) {
      if (src.metadata?.source_file === targetFile) return src.content;
    }

    for (const src of allSources) {
      if (src.metadata?.source_file === 'tool:knowledge_base_search') {
        const content = src.content || '';
        const idx = content.indexOf('Output:');
        if (idx !== -1) {
          const outputText = content.substring(idx + 7);
          const blocks = outputText.split(/\n+\-\-\-\n+/);
          for (const block of blocks) {
            if (block.includes(`[Source: ${targetFile}`)) {
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

// ─── Shared Tooltip Popover ────────────────────────────────────────────────
// Used by both InlineSourceBadge and ChatSection context badges
export const SourceTooltipContent = ({
  typeLabel, color, bg, border, IconComponent,
  sourceName, chunkContent, page,
}) => (
  <div style={{
    width: '320px',
    background: 'linear-gradient(145deg, #0f1117 0%, #0b0d10 100%)',
    border: `1px solid ${border}`,
    borderRadius: '13px',
    boxShadow: `0 20px 60px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03), 0 0 30px ${bg}`,
    overflow: 'hidden',
  }}>
    {/* Header stripe */}
    <div style={{
      padding: '11px 14px',
      background: `linear-gradient(135deg, ${bg}, transparent)`,
      borderBottom: `1px solid ${border}`,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      <div style={{
        width: '28px', height: '28px',
        borderRadius: '7px',
        background: bg,
        border: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color,
        flexShrink: 0,
      }}>
        <IconComponent size={13} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {typeLabel}
        </div>
        <div style={{
          fontSize: '0.72rem', color: '#6b7280', marginTop: '1px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '220px',
        }}>
          {page ? `${sourceName} · p.${page}` : sourceName}
        </div>
      </div>
      {page && (
        <div style={{
          padding: '2px 7px',
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '99px',
          fontSize: '0.65rem',
          fontWeight: 700,
          color,
          flexShrink: 0,
        }}>
          p.{page}
        </div>
      )}
    </div>

    {/* Content preview */}
    <div style={{ padding: '12px 14px' }}>
      {chunkContent ? (
        <p style={{
          fontSize: '0.79rem',
          color: '#9ca3af',
          lineHeight: 1.65,
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: 6,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {chunkContent}
        </p>
      ) : (
        <p style={{ fontSize: '0.79rem', color: '#3d4149', margin: 0, fontStyle: 'italic' }}>
          No preview available.
        </p>
      )}
    </div>

    {/* Footer */}
    <div style={{
      padding: '8px 14px',
      borderTop: `1px solid rgba(255,255,255,0.04)`,
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
    }}>
      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, opacity: 0.6 }} />
      <span style={{ fontSize: '0.65rem', color: '#3d4149', fontWeight: 500 }}>
        Hover to read · Retrieved context
      </span>
    </div>
  </div>
);

// ─── SmartTooltip wrapper ──────────────────────────────────────────────────
// Handles: delay-based dismiss (so mouse can travel to tooltip),
// smart left/right positioning (avoids sidebar clipping),
// pointer-events on the tooltip itself.
export const SmartTooltip = ({ children, tooltipContent, placement = 'top' }) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const hideTimer = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const TOOLTIP_W = 320;
  const TOOLTIP_H = 230; // approximate
  const GAP = 8;

  const clearHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimer.current = setTimeout(() => setVisible(false), 150);
  }, []);

  const handleMouseEnterBadge = useCallback(() => {
    clearHide();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: center on badge, but clamp to viewport with 16px margins
    // Avoid the sidebar (typically ~240px wide on the left)
    const SIDEBAR_SAFE = 260; // safe minimum left edge
    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    // Clamp right
    left = Math.min(left, vw - TOOLTIP_W - 16);
    // Clamp left (respect sidebar)
    left = Math.max(left, SIDEBAR_SAFE);

    // Vertical: prefer above, fall back to below
    let top = rect.top - TOOLTIP_H - GAP;
    if (top < 60) {
      // not enough room above — place below
      top = rect.bottom + GAP;
    }

    setPos({ left, top });
    setVisible(true);
  }, []);

  return (
    <span
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={handleMouseEnterBadge}
      onMouseLeave={scheduleHide}
    >
      {children}

      {visible && (
        <div
          ref={tooltipRef}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            zIndex: 9999,
            pointerEvents: 'all', // ← mouse can enter the tooltip
            animation: 'tooltipIn 0.15s ease forwards',
          }}
        >
          {tooltipContent}
        </div>
      )}

      <style>{`
        @keyframes tooltipIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </span>
  );
};

// ─── InlineSourceBadge ─────────────────────────────────────────────────────
export const InlineSourceBadge = ({ sourceVal, sources, toolSources }) => {
  const isWeb  = sourceVal.startsWith('web:');
  const isCalc = sourceVal.startsWith('calc:') || sourceVal.startsWith('math:');

  const color  = isWeb ? '#38bdf8' : isCalc ? '#fbbf24' : '#34d399';
  const bg     = isWeb ? 'rgba(14,165,233,0.10)' : isCalc ? 'rgba(245,158,11,0.10)' : 'rgba(16,185,129,0.10)';
  const border = isWeb ? 'rgba(14,165,233,0.28)' : isCalc ? 'rgba(245,158,11,0.28)' : 'rgba(16,185,129,0.28)';
  const typeLabel = isWeb ? 'Web Search' : isCalc ? 'Calculator' : 'Document';
  const IconComponent = isWeb ? GlobeIcon : isCalc ? CalcIcon : DocIcon;

  const displayLabel = isWeb
    ? sourceVal.slice(4).substring(0, 22) + (sourceVal.slice(4).length > 22 ? '…' : '')
    : isCalc
    ? (sourceVal.split(':')[1] || sourceVal).substring(0, 20)
    : sourceVal.substring(0, 26) + (sourceVal.length > 26 ? '…' : '');

  const chunkContent = findSourceChunk(sourceVal, sources, toolSources);
  const sourceName = isWeb
    ? `Query: "${sourceVal.slice(4)}"`
    : isCalc
    ? (sourceVal.split(':')[1] || sourceVal)
    : sourceVal;

  const tooltipContent = (
    <SourceTooltipContent
      typeLabel={typeLabel}
      color={color}
      bg={bg}
      border={border}
      IconComponent={IconComponent}
      sourceName={sourceName}
      chunkContent={chunkContent}
    />
  );

  return (
    <SmartTooltip tooltipContent={tooltipContent}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 8px 2px 6px',
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '5px',
          fontSize: '0.72rem',
          fontWeight: 600,
          color,
          cursor: 'default',
          verticalAlign: 'middle',
          marginLeft: '3px',
          marginRight: '3px',
          lineHeight: 1.6,
          whiteSpace: 'nowrap',
          transition: 'background 0.15s ease',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <IconComponent />
        </span>
        <span>{displayLabel}</span>
      </span>
    </SmartTooltip>
  );
};

// ─── Inline markdown parser ────────────────────────────────────────────────
export const parseInlineMarkdown = (text, sources, toolSources) => {
  if (!text) return '';
  const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\)|\[Source:\s*.*?\])/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} style={{ color: '#e8eaed', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('[Source:') && part.endsWith(']')) {
      const sourceVal = part.slice(8, -1).trim();
      return <InlineSourceBadge key={index} sourceVal={sourceVal} sources={sources} toolSources={toolSources} />;
    }
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (match) {
        const url = match[2].trim();
        const isSafe = !url.toLowerCase().startsWith('javascript:') &&
          (!/^[a-z]+:/i.test(url) || url.startsWith('http') || url.startsWith('https') || url.startsWith('mailto:'));
        if (isSafe) {
          return <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="markdown-link">{match[1]}</a>;
        }
        return <span key={index} style={{ textDecoration: 'line-through', opacity: 0.5 }}>{match[1]}</span>;
      }
    }
    return part;
  });
};
