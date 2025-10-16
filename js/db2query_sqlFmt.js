/**
 * Checks if the match is a real SQL keyword (not a host variable like :SELECT or &WHERE).
 */
function isRealKeyword(sqlKwd, matchIndex) {
  // Look behind for the previous non-whitespace character
  let i = matchIndex - 1;
  while (i >= 0 && /\s/.test(sqlKwd[i])) i--;
  if (i >= 0 && (sqlKwd[i] === ':' || sqlKwd[i] === '&')) {
    return false;
  }
  return true;
}

function getSqlInputText() {
  const el = document.getElementById('sqlInput');
  return el ? el.textContent : '';
}

function setSqlInputText(text) {
  const el = document.getElementById('sqlInput');
  if (el) el.textContent = text;
}

function getCaretPosition(el) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(el);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  return preCaretRange.toString().length;
}
function setCaretPosition(el, pos) {
  const selection = window.getSelection();
  const range = document.createRange();
  let charIndex = 0, nodeStack = [el], node, foundStart = false;
  while ((node = nodeStack.pop())) {
    if (node.nodeType === 3) { // text node
      const nextCharIndex = charIndex + node.length;
      if (!foundStart && pos >= charIndex && pos <= nextCharIndex) {
        range.setStart(node, pos - charIndex);
        range.collapse(true);
        foundStart = true;
        break;
      }
      charIndex = nextCharIndex;
    } else {
      let i = node.childNodes.length;
      while (i--) nodeStack.push(node.childNodes[i]);
    }
  }
  if (foundStart) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function formatSQL(sql) {
  const keywords = [
    'with', 'select', 'from', 'where', 'and', 'or', 'order by', 'group by', 'having',
    'join', 'inner join', 'left join', 'right join', 'on', 'as', 'in', 'like',
    'between', 'is null', 'is not null', 'exists', 'not exists',
    'declare', 'cursor', 'for', 'prepare', 'open', 'fetch', 'close',
    'case', 'when', 'then', 'else', 'end'
  ];

  // Replace keywords only if they are real SQL keywords (not host variables)
  let formattedSQL = sql.trim().replace(/\s+/g, ' ');
  for (const keyword of keywords.sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${keyword}\\b`, 'gi');
    formattedSQL = formattedSQL.replace(re, function (match, offset) {
      if (isRealKeyword(formattedSQL, offset)) {
        return keyword.toUpperCase();
      }
      return match;
    });
  }

  // Handle DECLARE ... CURSOR FOR with line breaks
  formattedSQL = formattedSQL.replace(
    /\bDECLARE\s+(\w+)\s+CURSOR\s+FOR\s+(SELECT\b[\s\S]+)/i,
    function (_, name, select) {
      return `DECLARE ${name} CURSOR FOR\n${select.trim()}`;
    }
  );

  const eol = '\n';

  function insertEOLIfRealKeyword(pattern) {
    let result = '';
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(formattedSQL)) !== null) {
      const matchIndex = match.index;
      if (isRealKeyword(formattedSQL, matchIndex)) {
        if (matchIndex > 0) {
          result += formattedSQL.slice(lastIndex, matchIndex) + eol + match[1];
        } else {
          result += formattedSQL.slice(lastIndex, matchIndex) + match[1];
        }
      } else {
        result += formattedSQL.slice(lastIndex, pattern.lastIndex - match[1].length) + match[1];
      }
      lastIndex = pattern.lastIndex;
    }
    result += formattedSQL.slice(lastIndex);
    formattedSQL = result;
  }

  // Existing breaks
  insertEOLIfRealKeyword(/\b(SELECT|FROM|WHERE|WITH|ORDER BY|GROUP BY|HAVING|JOIN|ON)\b/gi);
  insertEOLIfRealKeyword(/\b(AND|OR)\b/gi);
  // Break before CASE/WHEN/END. THEN/ELSE will wrap only if line exceeds max width.
  insertEOLIfRealKeyword(/\b(CASE|WHEN|END)\b/gi);

  const majorKeywords = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'WITH', 'DECLARE', 'CURSOR', 'FOR', 'CASE'
  ];
  const childKeywords = [
    'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'ON', 'AND', 'OR', 'WHEN', 'THEN', 'ELSE'
  ];

  const lines = formattedSQL.split(/\n/);
  let indented = [];
  let lastMajor = null;
  let firstMajorFound = false;
  let caseIndentStack = [];

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    if (!raw.trim()) continue;
    let line = raw.trimEnd();
    let upper = line.trimStart().toUpperCase();
    let indent = '';
    let matched = false;

    // Handle END alignment for CASE
    if (upper.startsWith('END') && caseIndentStack.length) {
      indent = caseIndentStack[caseIndentStack.length - 1];
      caseIndentStack.pop();
      matched = true;
    }

    if (!matched) {
      for (const kw of majorKeywords) {
        if (upper.startsWith(kw)) {
          if (!firstMajorFound) {
            indent = '';
            firstMajorFound = true;
          } else {
            indent = '  ';
          }
          lastMajor = kw;
          matched = true;
          // If CASE, push its indent for WHEN/THEN/ELSE
          if (kw === 'CASE') {
            caseIndentStack.push(indent);
          }
          break;
        }
      }
    }

    if (!matched) {
      for (const kw of childKeywords) {
        if (upper.startsWith(kw)) {
          if (['WHEN', 'THEN', 'ELSE'].includes(kw) && caseIndentStack.length) {
            indent = caseIndentStack[caseIndentStack.length - 1] + '  ';
          } else {
            let parentLen = lastMajor ? lastMajor.length : 0;
            indent = ' '.repeat(parentLen + 1);
          }
          matched = true;
          break;
        }
      }
    }

    if (!matched && lastMajor) {
      if (indented.length > 0) {
        let prev = indented[indented.length - 1];
        let prevIndent = prev.match(/^(\s*)/)[1];
        indent = prevIndent;
      }
    }

    if (line.trimStart().length > 0) {
      indented.push(indent + line.trimStart());
    }
  }

  let result = indented.join('\n');
  // FIX: use regex instead of trimEnd(" ;")
  return result.replace(/[ \t\n;]+$/, '') + ';';
}

window.formatCurrentSqlContext = function formatCurrentSqlContext() {
  const el = document.getElementById('sqlInput');
  if (!el || typeof window.formatSQL !== 'function') return;

  const full = getSqlInputText();
  const cursor = getCaretPosition(el);

  // Helper: splice replacement (no prefix/suffix trimming)
  function replaceRange(src, start, end, insert) {
    return src.slice(0, start) + insert + src.slice(end);
  }

  // Format selected statements if any; else the one at the caret
  const selection = window.getSelection();
  let selStart = cursor, selEnd = cursor;
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.startContainer, range.startOffset);
    selStart = preRange.toString().length;
    preRange.setEnd(range.endContainer, range.endOffset);
    selEnd = preRange.toString().length;
  }

  if (selStart !== selEnd && typeof getSQLStmtsInSelection === 'function') {
    const blocks = getSQLStmtsInSelection(full, selStart, selEnd);
    if (!blocks || !blocks.length) return;

    let newValue = full;
    let delta = 0;
    blocks.forEach(b => {
      const raw = full.slice(b.start, b.end);
      const hadSemi = /;\s*$/.test(raw);
      const core = raw.replace(/;\s*$/, '').trim();
      if (!core) return;
      let formatted = window.formatSQL(core);
      if (hadSemi || /\S/.test(full.slice(b.end))) {
        if (!/;\s*$/.test(formatted)) formatted += ';';
      }
      const start = b.start + delta;
      const end = b.end + delta;
      newValue = replaceRange(newValue, start, end, formatted);
      delta += (formatted.length - (end - start));
    });

    setSqlInputText(newValue);
    if (window.refreshSqlHighlight) window.refreshSqlHighlight();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    // Place caret at end of last replaced block
    const last = blocks[blocks.length - 1];
    const caret = last.end + delta;
    setCaretPosition(el, caret);
    el.focus();
    return;
  }

  // Single statement at caret
  const loc = (typeof getSQLStmtAtCursor === 'function')
    ? getSQLStmtAtCursor(full, cursor)
    : { start: 0, end: full.length, stmt: full };

  if (!loc || !loc.stmt) return;
  const raw = full.slice(loc.start, loc.end);
  const hadSemi = /;\s*$/.test(raw);
  const core = raw.replace(/;\s*$/, '').trim();
  const formattedCore = window.formatSQL(core);
  let finalStmt = formattedCore;
  if (hadSemi || /\S/.test(full.slice(loc.end))) {
    if (!/;\s*$/.test(finalStmt)) finalStmt += ';';
  }
  const newValue = replaceRange(full, loc.start, loc.end, finalStmt);
  setSqlInputText(newValue);

  if (window.refreshSqlHighlight) window.refreshSqlHighlight();
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const newCaret = loc.start + finalStmt.length;
  setCaretPosition(el, newCaret);
  el.focus();
};


// === PATCH: Improve formatting of CASE/WHEN/THEN/ELSE and long CONCAT / column lists ===
// 1. Extend keywords list + add line breaks before CASE/WHEN/THEN/ELSE/END.
//    (Locate your existing formatSQL(sql) and replace ONLY the parts shown.)
function formatSQL(sql) {
  const keywords = [
    'with', 'select', 'from', 'where', 'and', 'or', 'order by', 'group by', 'having',
    'join', 'inner join', 'left join', 'right join', 'on', 'as', 'in', 'like',
    'between', 'is null', 'is not null', 'exists', 'not exists',
    'declare', 'cursor', 'for', 'prepare', 'open', 'fetch', 'close',
    'case', 'when', 'then', 'else', 'end'
  ];

  // Replace keywords only if they are real SQL keywords (not host variables)
  let formattedSQL = sql.trim().replace(/\s+/g, ' ');
  for (const keyword of keywords.sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${keyword}\\b`, 'gi');
    formattedSQL = formattedSQL.replace(re, function (match, offset) {
      if (isRealKeyword(formattedSQL, offset)) {
        return keyword.toUpperCase();
      }
      return match;
    });
  }

  // Handle DECLARE ... CURSOR FOR with line breaks
  formattedSQL = formattedSQL.replace(
    /\bDECLARE\s+(\w+)\s+CURSOR\s+FOR\s+(SELECT\b[\s\S]+)/i,
    function (_, name, select) {
      return `DECLARE ${name} CURSOR FOR\n${select.trim()}`;
    }
  );

  const eol = '\n';

  function insertEOLIfRealKeyword(pattern) {
    let result = '';
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(formattedSQL)) !== null) {
      const matchIndex = match.index;
      if (isRealKeyword(formattedSQL, matchIndex)) {
        if (matchIndex > 0) {
          result += formattedSQL.slice(lastIndex, matchIndex) + eol + match[1];
        } else {
          result += formattedSQL.slice(lastIndex, matchIndex) + match[1];
        }
      } else {
        result += formattedSQL.slice(lastIndex, pattern.lastIndex - match[1].length) + match[1];
      }
      lastIndex = pattern.lastIndex;
    }
    result += formattedSQL.slice(lastIndex);
    formattedSQL = result;
  }

  // Existing breaks
  insertEOLIfRealKeyword(/\b(SELECT|FROM|WHERE|WITH|ORDER BY|GROUP BY|HAVING|JOIN|ON)\b/gi);
  insertEOLIfRealKeyword(/\b(AND|OR)\b/gi);
  // Break before CASE/WHEN/END. THEN/ELSE will wrap only if line exceeds max width.
  insertEOLIfRealKeyword(/\b(CASE|WHEN|END)\b/gi);

  const majorKeywords = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'WITH', 'DECLARE', 'CURSOR', 'FOR', 'CASE'
  ];
  const childKeywords = [
    'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'ON', 'AND', 'OR', 'WHEN', 'THEN', 'ELSE'
  ];

  const lines = formattedSQL.split(/\n/);
  let indented = [];
  let lastMajor = null;
  let firstMajorFound = false;
  let caseIndentStack = [];

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    if (!raw.trim()) continue;
    let line = raw.trimEnd();
    let upper = line.trimStart().toUpperCase();
    let indent = '';
    let matched = false;

    // Handle END alignment for CASE
    if (upper.startsWith('END') && caseIndentStack.length) {
      indent = caseIndentStack[caseIndentStack.length - 1];
      caseIndentStack.pop();
      matched = true;
    }

    if (!matched) {
      for (const kw of majorKeywords) {
        if (upper.startsWith(kw)) {
          if (!firstMajorFound) {
            indent = '';
            firstMajorFound = true;
          } else {
            indent = '  ';
          }
          lastMajor = kw;
          matched = true;
          // If CASE, push its indent for WHEN/THEN/ELSE
          if (kw === 'CASE') {
            caseIndentStack.push(indent);
          }
          break;
        }
      }
    }

    if (!matched) {
      for (const kw of childKeywords) {
        if (upper.startsWith(kw)) {
          if (['WHEN', 'THEN', 'ELSE'].includes(kw) && caseIndentStack.length) {
            indent = caseIndentStack[caseIndentStack.length - 1] + '  ';
          } else {
            let parentLen = lastMajor ? lastMajor.length : 0;
            indent = ' '.repeat(parentLen + 1);
          }
          matched = true;
          break;
        }
      }
    }

    if (!matched && lastMajor) {
      if (indented.length > 0) {
        let prev = indented[indented.length - 1];
        let prevIndent = prev.match(/^(\s*)/)[1];
        indent = prevIndent;
      }
    }

    if (line.trimStart().length > 0) {
      indented.push(indent + line.trimStart());
    }
  }

  let result = indented.join('\n');
  // FIX: use regex instead of trimEnd(" ;")
  return result.replace(/[ \t\n;]+$/, '') + ';';
}

// Bridge: make sure window.formatSQL is set before the enhancer wraps it
if (typeof window.formatSQL !== 'function' && typeof formatSQL === 'function') {
  window.formatSQL = formatSQL;
}

// 2. Enhance post-wrap to also split very long CONCAT / WHEN ... THEN lines.
//    (Locate the enhanceSqlFormatter IIFE below and replace its inner helpers applyLineWrap + add wrapConcatLine.)
(function enhanceSqlFormatter() {
  if (typeof window.formatSQL !== 'function') return;

  const stored = parseInt(localStorage.getItem('db2json_sql_fmt_width'), 10);
  const config = {
    maxLineWidth: Number.isFinite(stored) && stored > 40 ? stored : 80
  };

  window.setSqlFormatOptions = function setSqlFormatOptions(opts = {}) {
    if (opts && Number.isFinite(+opts.maxLineWidth) && +opts.maxLineWidth >= 40) {
      config.maxLineWidth = +opts.maxLineWidth;
      localStorage.setItem('db2json_sql_fmt_width', String(config.maxLineWidth));
    }
  };

  const origFormat = window.formatSQL;

  window.formatSQL = function formatSQLWrapped(sql) {
    let out = origFormat(sql);
    out = applyLineWrap(out, config.maxLineWidth);
    return out;
  };

  function applyLineWrap(formatted, maxWidth) {
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return formatted;
    return formatted
      .split('\n')
      .map(line => wrapCommaLine(line, maxWidth))
      .map(line => wrapConcatLine(line, maxWidth))
      .map(line => wrapCaseWhenThen(line, maxWidth))
      .map(line => wrapElseLine(line, maxWidth))   // NEW
      .join('\n');
  }

  // Existing comma-based wrapper
  function wrapCommaLine(line, maxWidth) {
    if (line.length <= maxWidth) return line;
    if (line.indexOf(',') === -1) return line;

    const trimmedU = line.trimStart().toUpperCase();
    const commaCount = (line.match(/,/g) || []).length;
    if (
      commaCount < 2 &&
      !/SELECT\s/i.test(trimmedU) &&
      !/WITH\s/i.test(trimmedU) &&
      !/\(.*,.+\)/.test(line)
    ) return line;

    const indent = line.match(/^\s*/)[0] || '';
    const continuationIndent = indent + '  ';
    let current = line;
    const pieces = [];

    while (current.length > maxWidth) {
      const slice = current.slice(0, maxWidth + 1);
      const breakPos = findBestCommaBreak(slice);
      if (breakPos <= 0) break;
      pieces.push(current.slice(0, breakPos + 1).replace(/\s+$/, ''));
      current = continuationIndent + current.slice(breakPos + 1).trimStart();
    }
    pieces.push(current);
    return pieces.join('\n');
  }

  function findBestCommaBreak(slice) {
    let inSingle = false, inDouble = false;
    let depth = 0;
    let lastDepth0 = -1;
    let lastDepth1 = -1;
    for (let i = 0; i < slice.length; i++) {
      const c = slice[i];
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (!inSingle && !inDouble) {
        if (c === '(') depth++;
        else if (c === ')') depth = Math.max(0, depth - 1);
        else if (c === ',') {
          if (depth === 0) lastDepth0 = i;
          else if (depth === 1) lastDepth1 = i;
        }
      }
    }
    return lastDepth1 >= 0 ? lastDepth1 : lastDepth0;
  }

  // NEW: wrap long CONCAT chains (look for multiple ' CONCAT ' tokens)
  function wrapConcatLine(line, maxWidth) {
    if (line.length <= maxWidth) return line;
    const concatMatches = line.match(/(\s+CONCAT\s+)/gi);
    if (!concatMatches || concatMatches.length < 2) return line;

    const indent = line.match(/^\s*/)[0] || '';
    const continuationIndent = indent + '  ';
    let current = line;
    const pieces = [];

    while (current.length > maxWidth) {
      // Find last CONCAT before limit
      const slice = current.slice(0, maxWidth + 1);
      const idx = slice.toUpperCase().lastIndexOf(' CONCAT ');
      if (idx <= 0) break;
      pieces.push(current.slice(0, idx).replace(/\s+$/, ''));
      current = continuationIndent + current.slice(idx).trimStart();
    }
    pieces.push(current);
    return pieces.join('\n');
  }

  // Break WHEN ... THEN only if line is too long (already present)
  function wrapCaseWhenThen(line, maxWidth) {
    if (line.length <= maxWidth) return line;
    const upper = line.toUpperCase();
    if (!upper.trimStart().startsWith('WHEN')) return line;
    const thenPos = upper.indexOf(' THEN ');
    if (thenPos > 0 && thenPos > maxWidth * 0.6) {
      const indent = line.match(/^\s*/)[0] || '';
      const head = line.slice(0, thenPos).replace(/\s+$/, '');
      const tail = line.slice(thenPos + 1);
      return head + '\n' + indent + '  ' + tail.trimStart();
    }
    return line;
  }

  // NEW: Break ELSE <expr> only if line exceeds max width
  function wrapElseLine(line, maxWidth) {
    if (line.length <= maxWidth) return line;
    const upper = line.toUpperCase();
    if (!upper.trimStart().startsWith('ELSE ')) return line;
    const indent = line.match(/^\s*/)[0] || '';
    const expr = line.trimStart().slice('ELSE'.length).trimStart();
    return 'ELSE\n' + indent + '  ' + expr;
  }

})(); // end enhanceSqlFormatter IIFE
