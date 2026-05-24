import { parseInlineMarkdown } from './InlineSourceBadge';

const preprocessMarkdown = (text) => {
  if (!text) return '';
  const lines = text.split('\n');
  const processedLines = [];
  let inTabTable = false;
  let tabTableHeaders = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (inTabTable) {
        inTabTable = false;
        tabTableHeaders = null;
      }
      processedLines.push(line);
      continue;
    }

    // Check if it's a tab-separated line
    const hasTabs = line.includes('\t');
    if (hasTabs) {
      const parts = line.split('\t').map(p => p.trim());
      if (parts.length >= 2 && parts.filter(Boolean).length >= 1) {
        if (!inTabTable) {
          inTabTable = true;
          tabTableHeaders = parts;
          processedLines.push('| ' + parts.join(' | ') + ' |');
          processedLines.push('| ' + parts.map(() => '---').join(' | ') + ' |');
        } else {
          const paddedParts = [...parts];
          while (paddedParts.length < tabTableHeaders.length) {
            paddedParts.push('');
          }
          processedLines.push('| ' + paddedParts.slice(0, tabTableHeaders.length).join(' | ') + ' |');
        }
        continue;
      }
    }

    if (inTabTable && !hasTabs) {
      inTabTable = false;
      tabTableHeaders = null;
    }

    // Check for standard markdown table rows that don't start with "|"
    if (trimmed.includes('|') && !trimmed.startsWith('|')) {
      const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
      const prevLine = processedLines[processedLines.length - 1] ? processedLines[processedLines.length - 1].trim() : '';
      
      const isHeader = nextLine.includes('|') && nextLine.includes('---');
      const isBody = prevLine.includes('|');
      
      if (isHeader || isBody || trimmed.includes('---')) {
        const parts = trimmed.split('|').map(p => p.trim());
        if (parts.every(p => /^-+$/.test(p) || p === '')) {
          processedLines.push('| ' + parts.map(p => p || '---').join(' | ') + ' |');
        } else {
          processedLines.push('| ' + parts.join(' | ') + ' |');
        }
        continue;
      }
    }

    processedLines.push(line);
  }

  return processedLines.join('\n');
};

export const MarkdownRenderer = ({ content, sources, toolSources }) => {
  if (!content) return null;

  const preprocessedContent = preprocessMarkdown(content);
  const lines = preprocessedContent.split('\n');
  const elements = [];
  let currentBlock = null;

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
            const level = item.indent >= 4 ? 2 : item.indent >= 2 ? 1 : 0;
            return (
              <li
                key={i}
                className={`markdown-list-item indent-${level}`}
                style={{
                  marginLeft: level > 0 ? `${level * 1.25}rem` : undefined,
                  listStyleType: level === 0 ? 'disc' : level === 1 ? 'circle' : 'square',
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
        const headerCells = rows[0].split('|').map(c => c.trim()).filter((c, idx, arr) => {
          if (idx === 0 && c === '') return false;
          if (idx === arr.length - 1 && c === '') return false;
          return true;
        });
        const bodyRows = rows.slice(1)
          .filter(r => !r.includes('---'))
          .map(r => r.split('|').map(c => c.trim()).filter((c, idx, arr) => {
            if (idx === 0 && c === '') return false;
            if (idx === arr.length - 1 && c === '') return false;
            return true;
          }));
        elements.push(
          <div className="table-responsive" key={key}>
            <table className="comparison-table">
              <thead>
                <tr>{headerCells.map((cell, idx) => <th key={idx}>{parseInlineMarkdown(cell, sources, toolSources)}</th>)}</tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx}>{row.map((cell, cIdx) => <td key={cIdx}>{parseInlineMarkdown(cell, sources, toolSources)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      } else {
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

    if (trimmed.startsWith('```')) {
      if (currentBlock && currentBlock.type === 'code') {
        flushCurrentBlock(`code-${i}`);
      } else {
        flushCurrentBlock(`pre-code-${i}`);
        currentBlock = { type: 'code', lang: trimmed.slice(3).trim(), lines: [] };
      }
      continue;
    }
    if (currentBlock && currentBlock.type === 'code') { currentBlock.lines.push(line); continue; }
    if (!trimmed) { flushCurrentBlock(`empty-${i}`); continue; }

    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        flushCurrentBlock(`header-pre-${i}`);
        const level = match[1].length;
        const Tag = `h${level}`;
        elements.push(<Tag key={`h-${i}`} className={`markdown-h${level}`}>{parseInlineMarkdown(match[2], sources, toolSources)}</Tag>);
        continue;
      }
    }

    if (trimmed.startsWith('>')) {
      const text = trimmed.slice(1).trim();
      if (currentBlock && currentBlock.type === 'blockquote') { currentBlock.lines.push(text); }
      else { flushCurrentBlock(`quote-pre-${i}`); currentBlock = { type: 'blockquote', lines: [text] }; }
      continue;
    }

    if (trimmed.startsWith('|')) {
      if (currentBlock && currentBlock.type === 'table') { currentBlock.rows.push(line); }
      else { flushCurrentBlock(`table-pre-${i}`); currentBlock = { type: 'table', rows: [line] }; }
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[\*\-\+]\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const text = bulletMatch[2];
      if (currentBlock && currentBlock.type === 'list' && currentBlock.listType === 'ul') { currentBlock.items.push({ text, indent }); }
      else { flushCurrentBlock(`list-pre-${i}`); currentBlock = { type: 'list', listType: 'ul', items: [{ text, indent }] }; }
      continue;
    }

    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const indent = numMatch[1].length;
      const text = numMatch[3];
      if (currentBlock && currentBlock.type === 'list' && currentBlock.listType === 'ol') { currentBlock.items.push({ text, indent }); }
      else { flushCurrentBlock(`list-pre-${i}`); currentBlock = { type: 'list', listType: 'ol', items: [{ text, indent }] }; }
      continue;
    }

    if (currentBlock && currentBlock.type === 'paragraph') { currentBlock.lines.push(line); }
    else { flushCurrentBlock(`para-pre-${i}`); currentBlock = { type: 'paragraph', lines: [line] }; }
  }

  flushCurrentBlock('final');
  return <div className="markdown-body">{elements}</div>;
};

export default MarkdownRenderer;
