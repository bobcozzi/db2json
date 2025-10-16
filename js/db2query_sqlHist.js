// db2query_sqlHist.js
// Updated to work with contenteditable SQL input (#sqlInput) instead of textarea

const MAX_SQL_HISTORY = 640;
const HISTORY_KEY = 'db2Query_RUNSQL_History';
window.HISTORY_KEY = HISTORY_KEY;

/* --- Caret helpers for contenteditable --- */
function getCaretPosition(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(el);
  range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return range.toString().length;
}

function setCaretPosition(el, pos) {
  const sel = window.getSelection();
  const range = document.createRange();
  let charIndex = 0, nodeStack = [el], node, found = false;
  while ((node = nodeStack.pop())) {
    if (node.nodeType === 3) { // text node
      const nextIndex = charIndex + node.length;
      if (!found && pos >= charIndex && pos <= nextIndex) {
        range.setStart(node, pos - charIndex);
        range.collapse(true);
        found = true;
        break;
      }
      charIndex = nextIndex;
    } else {
      let i = node.childNodes.length;
      while (i--) nodeStack.push(node.childNodes[i]);
    }
  }
  if (found) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/* --- Insert statement at current cursor location --- */
function insertHistoryStatement(stmt) {
  const editor = document.getElementById('sqlInput');
  if (!editor || !stmt) return;

  const input = editor.textContent || '';

  // Add semicolon if statement doesn't end with one
  let finalStmt = stmt.trim();
  if (finalStmt && !finalStmt.endsWith(';')) {
    finalStmt += ';';
  }

  let newContent, caretPos;

  if (!input.trim()) {
    // Empty input - just insert the statement
    newContent = finalStmt;
    caretPos = finalStmt.length;
  } else {
    // Use getSQLStmtAtCursor if available
    const cursor = getCaretPosition(editor);

    if (typeof window.getSQLStmtAtCursor === 'function') {
      // Use the helper function to get current statement info
      const { stmt: currentStmt, start, end } = window.getSQLStmtAtCursor(input, cursor);

      // Find the end of the current statement
      let insertPos = end;
      let separator = '';

      // Check if we need to add a semicolon to the current statement
      const textAtEnd = input.slice(Math.max(0, end - 1), end);
      if (textAtEnd !== ';' && currentStmt.trim()) {
        separator = ';\n';
      } else {
        separator = '\n';
      }

      // Build new content
      const before = input.substring(0, insertPos);
      const after = input.substring(insertPos);
      newContent = before + separator + finalStmt + after;
      caretPos = (before + separator + finalStmt).length;
    } else {
      // Fallback to current behavior if getSQLStmtAtCursor not available
      const before = input.substring(0, cursor);
      const after = input.substring(cursor);
      let sep = '';
      if (before.trim() && !before.trim().endsWith(';')) {
        sep = '\n';
      } else if (before.trim()) {
        sep = '\n';
      }
      newContent = before + sep + finalStmt + after;
      caretPos = (before + sep + finalStmt).length;
    }
  }

  editor.textContent = newContent;
  // Set caret INSIDE the inserted statement (before the semicolon)
  if (typeof setCaretPosition === 'function') {
    // Place caret before the semicolon of the inserted statement
    const finalCaretPos = caretPos - 1; // Position before the trailing semicolon
    setCaretPosition(editor, Math.max(0, finalCaretPos));
  }
  editor.focus();

  // Force highlighting refresh
  if (window.refreshHighlight || typeof refreshHighlight === 'function') {
    setTimeout(() => {
      if (window.refreshHighlight) window.refreshHighlight();
      else if (typeof refreshHighlight === 'function') refreshHighlight();
    }, 10);
  }

  const event = new Event('input', { bubbles: true });
  editor.dispatchEvent(event);
}

/* --- History storage & normalization --- */
function normalizeSqlKey(input) {
  if (!input) return '';
  let s = String(input).replace(/;\s*$/, '').trim();
  let inSingle = false, inDouble = false;
  let out = '', prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; out += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; out += ch; continue; }
    if (!inSingle && !inDouble) {
      if (/\s/.test(ch)) { if (!prevSpace) { out += ' '; prevSpace = true; } }
      else { out += ch.toLowerCase(); prevSpace = false; }
    } else out += ch;
  }
  return out.trim();
}

function splitSqlStatementsBySemicolon(input) {
  const out = [];
  let inSingle = false, inDouble = false, start = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ';' && !inSingle && !inDouble) {
      const part = input.slice(start, i).trim();
      if (part) out.push(part);
      start = i + 1;
    }
  }
  const last = input.slice(start).trim();
  if (last) out.push(last);
  return out;
}

function getSqlHistory() {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') return parsed ? [parsed] : [];
  } catch { }
  // Legacy self-heal
  let arr = [];
  try {
    arr = splitSqlStatementsBySemicolon(String(raw))
      .map(s => s.replace(/;\s*$/, '').trim())
      .filter(Boolean);
  } catch { arr = []; }
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); } catch { }
  return arr;
}

function saveSqlToHistory(stmt) {
  if (!stmt || typeof stmt !== 'string') return;
  const key = normalizeSqlKey(stmt);
  let history = getSqlHistory();
  history = history.filter(h => normalizeSqlKey(h) !== key);
  history.unshift(stmt);
  if (history.length > MAX_SQL_HISTORY) history = history.slice(0, MAX_SQL_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { }
}

/* --- Populate history dropdown --- */
function populateSqlHistoryDropdown() {
  const dropdown = document.getElementById('sqlHistoryDropdown');
  console.log('populateSqlHistoryDropdown called');
  if (!dropdown) {
    console.log('Dropdown not found');
    return;
  }
  const raw = localStorage.getItem(HISTORY_KEY);
  console.log('Raw history from localStorage:', raw);
  const history = JSON.parse(raw || '[]');
  console.log('Parsed history:', history);
  dropdown.innerHTML = '';
  if (!history.length) {
    console.log('No history found, adding "No history yet" option');
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No SQL Stmt History yet';
    opt.selected = true;
    dropdown.appendChild(opt);
    dropdown.disabled = true;
    return;
  }
  dropdown.disabled = false;
  // Add label option (make it selected and NOT disabled)
  const labelOpt = document.createElement('option');
  labelOpt.value = '';
  labelOpt.textContent = 'Previous SQL Statements:';
  labelOpt.selected = true;
  dropdown.appendChild(labelOpt);
  // Add history entries
  history.forEach((stmt, idx) => {
    console.log(`Adding history entry [${idx}]:`, stmt);
    const opt = document.createElement('option');
    opt.value = stmt;
    opt.textContent = stmt.length > 80 ? stmt.slice(0, 77) + '...' : stmt;
    dropdown.appendChild(opt);
  });
  console.log('Dropdown options:', Array.from(dropdown.options).map(o => o.textContent));
  console.log('Dropdown selectedIndex:', dropdown.selectedIndex);
}

function clearSqlHistory() {
  if (!confirm('Clear all saved SQL statements from this browser?')) return;
  localStorage.removeItem(HISTORY_KEY);
  populateSqlHistoryDropdown();
}

function openEditHistoryModal() {
  const modal = document.getElementById('historyModal');
  const ta = document.getElementById('historyTextarea');
  if (!modal || !ta) return;
  const history = getSqlHistory();
  ta.value = history.map(s => (s.endsWith(';') ? s : s + ';')).join('\n\n');
  modal.setAttribute('aria-hidden', 'false');
  modal.style.display = 'block';
  ta.focus();
  const escHandler = (e) => {
    if (e.key === 'Escape') { closeEditHistoryModal(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
}

function closeEditHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';
}

function saveEditedHistory() {
  const ta = document.getElementById('historyTextarea');
  if (!ta) return;
  let blocks = splitSqlStatementsBySemicolon(ta.value.replace(/\r\n/g, '\n'))
    .map(s => s.replace(/;\s*$/, '').trim())
    .filter(Boolean);
  if (blocks.length > MAX_SQL_HISTORY) blocks = blocks.slice(0, MAX_SQL_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(blocks)); } catch { }
  closeEditHistoryModal();
  populateSqlHistoryDropdown();
}

/* --- Dedupe --- */
function dedupeSqlHistoryCaseInsensitive() {
  let history = getSqlHistory();
  if (!Array.isArray(history) || history.length < 2) return { removed: 0, total: history?.length || 0 };
  const seen = new Set();
  const out = [];
  let removed = 0;
  for (const entry of history) {
    const key = normalizeSqlKey(entry);
    if (seen.has(key)) { removed++; continue; }
    seen.add(key);
    out.push(entry);
  }
  if (removed > 0) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(out)); } catch { }
    try { populateSqlHistoryDropdown(); } catch { }
  }
  return { removed, total: out.length };
}

function onHistoryDedupeClick() {
  const res = dedupeSqlHistoryCaseInsensitive();
  const ta = document.getElementById('historyTextarea');
  if (ta) {
    const history = getSqlHistory();
    ta.value = history.map(s => (s.endsWith(';') ? s : s + ';')).join('\n\n');
  }
  const msg = res && res.removed ? `Removed ${res.removed} duplicate${res.removed === 1 ? '' : 's'}` : 'No duplicates found';
  if (window.showToast) showToast(msg); else alert(msg);
}

/* --- DOM Wiring --- */
const dedupeBtn = document.getElementById('historyDedupeBtn');
if (dedupeBtn && !dedupeBtn._wired) {
  dedupeBtn.addEventListener('click', onHistoryDedupeClick);
  dedupeBtn._wired = true;
}

// Wrapper sizing
const editor = document.getElementById('sqlInput');
const wrapper = editor?.closest('.sqlInput-copy-wrapper');
const dropdown = document.getElementById('sqlHistoryDropdown');
if (editor && wrapper) {
  const syncWrapper = () => wrapper.style.width = editor.offsetWidth + 'px';
  syncWrapper();
  const ro = new ResizeObserver(syncWrapper);
  ro.observe(editor);
  window.addEventListener('resize', syncWrapper);
}

if (wrapper && dropdown) {
  const syncDropdown = () => dropdown.style.width = wrapper.offsetWidth + 'px';
  syncDropdown();
  const ro2 = new ResizeObserver(syncDropdown);
  ro2.observe(wrapper);
  window.addEventListener('resize', syncDropdown);
}

// Attach history dropdown event listener immediately
const sqlHistoryDropdown = document.getElementById('sqlHistoryDropdown');
if (sqlHistoryDropdown) {
  sqlHistoryDropdown.addEventListener('change', function () {
    // Ignore placeholder option (index 0)
    if (this.selectedIndex === 0) {
      console.log('Placeholder option selected (index 0), ignoring');
      return;
    }

    const value = this.value;
    if (value && value.trim()) {
      console.log('History selected:', value);
      insertHistoryStatement(value);
    }
  });
}

/* --- Expose globals --- */
Object.assign(window, {
  getSqlHistory,
  saveSqlToHistory,
  populateSqlHistoryDropdown,
  clearSqlHistory,
  openEditHistoryModal,
  closeEditHistoryModal,
  saveEditedHistory,
  dedupeSqlHistoryCaseInsensitive,
  insertHistoryStatement
});