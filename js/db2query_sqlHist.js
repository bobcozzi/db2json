// sqlHistoryUI.js
// This file contains the dropdown resizing and wrapper sync logic for SQL history UI.

// Helper: insert a history statement after the current SQL statement,
// ensuring a terminating semicolon and newline if needed.
function insertHistoryStatement(stmt) {
  const textarea = document.getElementById('sqlInput');
  if (!textarea) return;
  const input = textarea.value || '';
  const cursor = (typeof textarea.selectionEnd === 'number') ? textarea.selectionEnd : input.length;

  // Use app’s smarter parser if available
  let start = cursor, end = cursor;
  if (typeof window.getSQLStmtAtCursor === 'function') {
    try {
      const res = window.getSQLStmtAtCursor(input, cursor);
      start = res?.start ?? cursor;
      end   = res?.end   ?? cursor;
    } catch {}
  } else {
    // Fallback: go to next semicolon or end of text
    const nextSemi = input.indexOf(';', cursor);
    end = (nextSemi >= 0) ? nextSemi + 1 : input.length;
  }

  let insertPos = end;

  // Determine if we need a separator before inserting:
  // - If there is any non-whitespace before insertPos and the last non-ws char
  //   is not ';', add ';\n'
  // - If the last non-ws is ';', ensure at least one newline.
  let i = insertPos - 1;
  while (i >= 0 && /\s/.test(input[i])) i--;
  const hasExistingContent = i >= 0 && input.slice(0, insertPos).trim().length > 0;

  let sep = '';
  if (hasExistingContent) {
    if (input[i] === ';') {
      const trailing = input.slice(i + 1, insertPos);
      if (!/\n/.test(trailing)) sep = '\n';
    } else {
      sep = ';\n';
    }
  }

  const before = input.slice(0, insertPos);
  const after  = input.slice(insertPos);
  const textToInsert = sep + stmt;

  textarea.value = before + textToInsert + after;

  const caret = (before + textToInsert).length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('sqlInput');
  const wrapper = textarea && textarea.closest('.sqlInput-copy-wrapper');
  const dropdown = document.getElementById('sqlHistoryDropdown');

  // Clear any legacy inline height that may remain from prior versions
  if (wrapper) wrapper.style.height = '';

  // Keep wrapper width in sync with textarea resize (do NOT force height)
  if (textarea && wrapper) {
    const syncWrapperSize = () => {
      wrapper.style.width = textarea.offsetWidth + 'px';
      // Don't force height; wrapper must grow to contain submit row, etc.
      // wrapper.style.height = textarea.offsetHeight + 'px';
    };
    syncWrapperSize();
    const observerWrap = new ResizeObserver(syncWrapperSize);
    observerWrap.observe(textarea);
    window.addEventListener('resize', syncWrapperSize);
  }

  // Keep dropdown width in sync with wrapper
  if (wrapper && dropdown) {
    const syncDropdownWidth = () => {
      dropdown.style.width = wrapper.offsetWidth + 'px';
    };
    syncDropdownWidth();
    const observerDropdown = new ResizeObserver(syncDropdownWidth);
    observerDropdown.observe(wrapper);
    window.addEventListener('resize', syncDropdownWidth);
  }

  // Use the smarter insertion logic; guard against double-wiring
  if (dropdown && textarea && !dropdown._cursorInsertWired) {
    dropdown.addEventListener('change', function () {
      const val = dropdown.value;
      if (!val) return;
      insertHistoryStatement(val);
      dropdown.selectedIndex = 0;
    });
    dropdown._cursorInsertWired = true;
  }
});

// History constants (scoped here)
const MAX_SQL_HISTORY = 512;
const HISTORY_KEY = 'db2json_SQL_History';

// Split SQL by semicolons not in quotes
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

// Case-insensitive, whitespace-normalized key (outside quotes only)
function normalizeSqlKey(input) {
  if (!input) return '';
  let s = String(input).replace(/;\s*$/, '').trim(); // drop trailing semicolon
  let inSingle = false, inDouble = false;
  let out = '';
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; out += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; out += ch; continue; }
    if (!inSingle && !inDouble) {
      if (/\s/.test(ch)) {
        if (!prevSpace) { out += ' '; prevSpace = true; }
      } else {
        out += ch.toLowerCase();
        prevSpace = false;
      }
    } else {
      out += ch; // keep case/spacing inside quotes
    }
  }
  return out.trim();
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

// Skip duplicates anywhere in history (case-insensitive, space/semicolon agnostic)
function saveSqlToHistory(stmt) {
  if (!stmt || typeof stmt !== 'string') return;
  const s = stmt; // preserve original text
  const key = normalizeSqlKey(s);
  let history = getSqlHistory();

  // Remove any existing entry with the same normalized key
  history = history.filter(h => normalizeSqlKey(h) !== key);

  // Insert the new statement at the top
  history.unshift(s);

  if (history.length > MAX_SQL_HISTORY) history = history.slice(0, MAX_SQL_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { }
}

function populateSqlHistoryDropdown() {
  const dropdown = document.getElementById('sqlHistoryDropdown');
  const actions = document.querySelector('.history-actions');
  if (!dropdown) return;

  const history = getSqlHistory();
  dropdown.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = history.length ? '-- Previous SQL statements --' : '-- No history yet --';
  dropdown.appendChild(defaultOpt);
  dropdown.disabled = history.length === 0;

  if (actions) {
    const edit = actions.querySelector('#editSqlHistoryBtn');
    const clear = actions.querySelector('#clearSqlHistoryBtn');
    if (edit) edit.disabled = false;
    if (clear) clear.disabled = history.length === 0;
  }

  // Fit labels to current width
  let maxChars = 80;
  const style = window.getComputedStyle(dropdown);
  const fontSizePx = parseFloat(style.fontSize) || 14;
  const avgChar = fontSizePx * 0.55;
  const widthPx = dropdown.offsetWidth || 400;
  maxChars = Math.max(20, Math.min(400, Math.floor(widthPx / avgChar)));

  for (let idx = 0; idx < history.length; idx++) {
    const stmt = history[idx];
    const opt = document.createElement('option');
    opt.value = stmt;
    const label = (stmt || '').replace(/\s+/g, ' ').trim();
    opt.textContent = label.length > maxChars ? label.slice(0, maxChars - 3) + '...' : label;
    if (idx === 0) opt.classList.add('last-stmt'); // highlight first
    dropdown.appendChild(opt);
  }

  // Attach one-time change listener if not already attached
  if (dropdown && !dropdown._cursorInsertWired) {
    dropdown.addEventListener('change', function () {
      const textarea = document.getElementById('sqlInput');
      if (!textarea) return;
      const val = dropdown.value;
      if (!val) return;
      insertHistoryStatement(val);
      dropdown.selectedIndex = 0;
    });
    dropdown._cursorInsertWired = true;
  }

  // Attach one-time resize observer to keep labels fitting
  if (!dropdown._resizeObserverAttached) {
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => populateSqlHistoryDropdown());
      ro.observe(dropdown);
      dropdown._resizeObserverAttached = true;
    } else if (!dropdown._windowResizeHandlerAttached) {
      window.addEventListener('resize', populateSqlHistoryDropdown);
      dropdown._windowResizeHandlerAttached = true;
    }
  }
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
    if (e.key === 'Escape') {
      closeEditHistoryModal();
      document.removeEventListener('keydown', escHandler);
    }
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

function dedupeSqlHistoryCaseInsensitive() {
  let history = getSqlHistory();
  if (!Array.isArray(history) || history.length < 2) return { removed: 0, total: history?.length || 0 };

  const seen = new Set();
  const out = [];
  let removed = 0;

  // Keep most-recent entries (history[0] is newest)
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

// Keep these:
function onHistoryDedupeClick() {
  const res = window.dedupeSqlHistoryCaseInsensitive?.();
  // Refresh textarea with updated history
  const ta = document.getElementById('historyTextarea');
  if (ta) {
    const history = getSqlHistory();
    ta.value = history.map(s => (s.endsWith(';') ? s : s + ';')).join('\n\n');
  }
  const msg = res && res.removed
    ? `Removed ${res.removed} duplicate${res.removed === 1 ? '' : 's'}`
    : 'No duplicates found';
  if (window.showToast) showToast(msg);
  else alert(msg);
}

document.addEventListener('DOMContentLoaded', () => {
  const dedupeBtn = document.getElementById('historyDedupeBtn');
  console.log('[sqlHist] DOMContentLoaded, dedupeBtn present:', !!dedupeBtn);
  if (dedupeBtn && !dedupeBtn._wired) {
    dedupeBtn.addEventListener('click', onHistoryDedupeClick);
    dedupeBtn._wired = true;
  }
});

// Delegated fallback (keeps working if modal content is injected later)
document.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest && e.target.closest('#historyDedupeBtn');
  if (!btn) return;
  onHistoryDedupeClick();
});

// Expose as globals so existing calls in db2json.js continue to work
Object.assign(window, {
  getSqlHistory,
  saveSqlToHistory,
  populateSqlHistoryDropdown,
  clearSqlHistory,
  openEditHistoryModal,
  closeEditHistoryModal,
  saveEditedHistory,
  dedupeSqlHistoryCaseInsensitive
});
