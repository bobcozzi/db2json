

(function checkGlobalEnterPrevention() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      console.log('GLOBAL keyDOWN Enter caught', {
        target: e.target.id || e.target.className,
        defaultPrevented: e.defaultPrevented,
        phase: e.eventPhase
      });
    }
  }, true);

  document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      console.log('GLOBAL keyPRESS Enter caught', {
        target: e.target.id || e.target.className,
        defaultPrevented: e.defaultPrevented,
        phase: e.eventPhase
      });
    }
  }, true);
})();

// Keep handles if the browser supports the File System Access API
let _lastFileHandle = null;
let _lastFileName = null;

// Utilities for toasts
if (typeof window.showToast !== 'function') {
  function showToast(message, type = 'info', durationMs = 6000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-msg';
    msgSpan.textContent = message;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '×';
    el.appendChild(msgSpan);
    el.appendChild(closeBtn);
    const close = () => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 250);
    };
    closeBtn.addEventListener('click', close);
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(close, Math.max(1000, durationMs | 0));
  }
}

if (typeof window.supportsFileSystemAccess !== 'function') {
  function supportsFileSystemAccess() {
    return window.isSecureContext &&
      typeof window.showOpenFilePicker === 'function' &&
      typeof window.showSaveFilePicker === 'function';
  }
}

if (typeof window.maybeShowSaveUnsupportedNotice !== 'function') {
  function maybeShowSaveUnsupportedNotice(reason = 'context') {
    try {
      const key = reason === 'fallback' ? 'db2json_save_notice_fallback' : 'db2json_save_notice_ctx';
      if (sessionStorage.getItem(key) === '1') return;

      const msg = (reason === 'fallback')
        ? '"Save SQL Statements to local file" will be unavailable in the browser session. Use "Save As...", or use HTTPS or use Chrome/MS Edge from http://localhost to enable.'
        : '"Save SQL Statements to local file" is unavailable in this browser/context (requires HTTPS, or http://localhost in Chrome/MS Edge). "Save As..." will save to downloads folder.';

      showToast(msg, 'warn', 12000);
      sessionStorage.setItem(key, '1');
    } catch { }
  }
}

// Hook: after your Save state update, show the context toast if unsupported
(function hookSaveStateNotice() {
  const orig = window.updateSaveButtonsState;
  window.updateSaveButtonsState = function patchedUpdateSaveButtonsState() {
    try { if (typeof orig === 'function') orig(); } catch { }
    try { if (!supportsFileSystemAccess()) maybeShowSaveUnsupportedNotice('context'); } catch { }
  };
})();

// Hook: after fallback Open, show the fallback toast
(function hookOpenFallbackNotice() {
  const origOpen = window.openSqlFile;
  if (typeof origOpen === 'function') {
    window.openSqlFile = async function patchedOpenSqlFile() {
      const result = await origOpen.apply(this, arguments);
      // If Save is still disabled (likely fallback) and we don’t have a handle, notify once
      try {
        const saveBtn = document.getElementById('saveSqlBtn');
        const noHandle = !window._lastFileHandle;
        if (saveBtn && saveBtn.disabled && noHandle) {
          maybeShowSaveUnsupportedNotice('fallback');
        }
      } catch { }
      return result;
    };
  }
})();

// Also trigger the context notice once on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try { if (!supportsFileSystemAccess()) maybeShowSaveUnsupportedNotice('context'); } catch { }
  });
} else {
  try { if (!supportsFileSystemAccess()) maybeShowSaveUnsupportedNotice('context'); } catch { }
}

function ensureSqlExt(name) {
  name = (name || '').trim();
  if (!name) return 'db2Query.sql';
  return /\.(sql|txt)$/i.test(name) ? name : name + '.sql';
}

// Remove any stray tokens or truncated inserts
// (e.g., lines like "any stray to", "updateCopySqlEnabled", "st pickerOp", single "c")

/**
 * Returns the start and end indices of the SQL token (word) at the given offset.
 * If offset is out of bounds, returns {start: offset, end: offset+1}
 */
function getNextSqlTokenRange(sql, offset, stmtStart, stmtEnd) {
  // Clamp offset inside the statement
  offset = Math.max(stmtStart, Math.min(stmtEnd - 1, offset));
  // Find token boundaries (word characters or underscores)
  const re = /[\w$#@]+/g;
  let match;
  let tokenStart = offset, tokenEnd = offset + 1;
  while ((match = re.exec(sql)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset < end) {
      tokenStart = start;
      tokenEnd = end;
      break;
    }
  }
  return { start: stmtStart + tokenStart, end: stmtStart + tokenEnd };
}


function initDb2jsonUI() {
  if (window._db2jsonInited) return;
  window._db2jsonInited = true;

  const sqlForm = document.getElementById('sqlForm');
  const sqlInputArea = document.getElementById('sqlInput');
  const submitModeEncoding = document.getElementById('submitMode');
  const copySqlInputBtn = document.getElementById('copySqlInputBtn');
  const copyBtnRow = document.getElementById('copyBtnRow');
  const copyBtnTable = document.getElementById('copyBtnTable');
  const copyBtnPage = document.getElementById('copyBtnPage');

  // History UI
  const dropdown = document.getElementById('sqlHistoryDropdown');
  const clearBtn = document.getElementById('clearSqlHistoryBtn');
  const editBtn = document.getElementById('editSqlHistoryBtn');
  const modal = document.getElementById('historyModal');
  const saveHistBtn = document.getElementById('historySaveBtn');
  const cancelBtn = document.getElementById('historyCancelBtn');

  // File toolbar
  const openBtn = document.getElementById('openSqlFileBtn');
  const saveBtn = document.getElementById('saveSqlBtn');
  const saveAsBtn = document.getElementById('saveSqlFileBtn');

  // Initial state
  if (copyBtnRow) copyBtnRow.classList.add('is-hidden');

  if (copyBtnPage) {
    copyBtnPage.addEventListener('click', () => copyCurrentPageToClipboard(document.getElementById('results')));
  }
  if (copyBtnTable) {
    copyBtnTable.addEventListener('click', () => copyTableToClipboard(document.getElementById('results')));
  }

  // Form submit handler - SIMPLIFIED (no keypress listener needed)
  if (sqlForm) {
    sqlForm.addEventListener('submit', handleSqlSubmit);
  }

  // Wire "Run SQL" button to submit the form
  const runSqlBtn = document.querySelector('.run-sql-btn');
  if (runSqlBtn) {
    runSqlBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (sqlForm) {
        // Dispatch submit event (which calls handleSqlSubmit)
        sqlForm.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
  }

  // Copy SQL input
  if (copySqlInputBtn) copySqlInputBtn.addEventListener('click', copySqlInput);

  // Submit mode
  if (submitModeEncoding) {
    submitModeEncoding.addEventListener('change', () => {
      const form = document.getElementById('sqlForm');
      if (!form) return;
      const mode = submitModeEncoding.value || 'GET';
      if (mode === 'GET') {
        form.method = 'get';
        form.enctype = 'application/x-www-form-urlencoded';
      } else if (mode === 'POST_URLENC') {
        form.method = 'post';
        form.enctype = 'application/x-www-form-urlencoded';
      } else {
        form.method = 'post';
        form.enctype = 'multipart/form-data';
      }
    });
    submitModeEncoding.dispatchEvent(new Event('change'));
  }

  // History dropdown + actions
  populateSqlHistoryDropdown();
  if (dropdown) {
    dropdown.addEventListener('change', () => {
      if (dropdown.value) document.getElementById('sqlInput').value = dropdown.value;
      updateCopySqlEnabled();
    });
  }
  if (clearBtn) clearBtn.addEventListener('click', clearSqlHistory);
  if (editBtn) editBtn.addEventListener('click', openEditHistoryModal);
  if (saveHistBtn) saveHistBtn.addEventListener('click', saveEditedHistory);
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditHistoryModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeEditHistoryModal(); });

  // sqlInputArea state and layout
  if (sqlInputArea) {
    sqlInputArea.addEventListener('input', updateCopySqlEnabled);
    updateCopySqlEnabled();
  }
  attachSqlInputResizeSync();
  hardenSqlTextarea();

  // File Open/Save/Save As (non-destructive: keep existing SVG/img/icon markup)
  function wireFileButton(btn, { label, onClick }) {
    if (!btn) return;
    // Detect if it already contains any element child (svg, img, span, etc.)
    const hasElementChild = btn.querySelector('*') !== null;

    // Do NOT overwrite existing icon markup
    if (!hasElementChild) {
      // Only add fallback text if there is no meaningful text already
      const onlyWhitespace = !btn.textContent || /^\s*$/.test(btn.textContent);
      if (onlyWhitespace) btn.textContent = label;
    }

    // Accessibility
    btn.title = label;
    btn.setAttribute('aria-label', label);

    if (!btn._wiredClick) {
      btn.addEventListener('click', onClick);
      btn._wiredClick = true;
    }
  }

  wireFileButton(openBtn, {
    label: 'Open SQL File...',
    onClick: openSqlFile
  });
  wireFileButton(saveBtn, {
    label: 'Save',
    onClick: async () => {
      const ok = await saveSqlToCurrentFile();
      if (!ok) await saveSqlAsFile();
    }
  });
  wireFileButton(saveAsBtn, {
    label: 'Save SQL As...',
    onClick: saveSqlAsFile
  });

  // Enable/disable Save appropriately; also triggers the context toast via the hook
  updateSaveButtonsState();

  if (typeof updateCopySqlEnabled === 'function') {
    updateCopySqlEnabled();
  }
}

// Initialize once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDb2jsonUI);
} else {
  initDb2jsonUI();
}

function buildColTitle(col) {
  if (!col) return '';
  let typeStr = col.type;
  let length = Number(col.length) || 0;
  let decimals = Number(col.decimals) || 0;

  if (/^(DECIMAL|DEC|NUMERIC|DECFLOAT|ZONED)$/i.test(col.type))
    typeStr += `(${length},${decimals})`;
  else if (/^(INT|INTEGER|SMALLINT|BIGINT|TINYINT)$/i.test(col.type))
    typeStr += length ? `(${length})` : '';
  else if (/^(CHAR|VARCHAR|GRAPHIC|VARGRAPHIC|CLOB|BLOB|DBCLOB|XML|UTF8_CHAR|WCHAR|WVARCHAR|WLONGVARCHAR)$/i.test(col.type))
    typeStr += length ? `(${length})` : '';

  let colhdr = (col.colhdr || col.name).replace(/\s+/g, ' ').trim();
  return `Name: ${col.name}\nType: ${typeStr}\nNullable: ${col.allownull}\nCCSID: ${col.ccsid}\nColHdr: ${colhdr}`;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Extracts the SQL statement at the cursor position, skipping quoted semicolons
function getSQLStmtAtCursor(input, cursorPos) {
  if (!input) return { stmt: '', start: 0, end: 0 };

  // Clamp cursor position
  cursorPos = Math.max(0, Math.min(input.length, cursorPos));

  // Find start - search backwards from cursor
  let inSingle = false, inDouble = false;
  let start = 0;

  for (let i = cursorPos - 1; i >= 0; i--) {
    const c = input[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ';' && !inSingle && !inDouble) {
      start = i + 1;
      break;
    }
  }

  // Find end - search forwards from cursor
  inSingle = false;
  inDouble = false;
  let end = input.length;

  for (let i = cursorPos; i < input.length; i++) {
    const c = input[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ';' && !inSingle && !inDouble) {
      end = i + 1;
      break;
    }
  }

  // Extract statement and trim
  let stmt = input.slice(start, end).trim();

  // Remove trailing semicolon for cleaner UX
  if (stmt.endsWith(';')) {
    stmt = stmt.slice(0, -1).trim();
  }

  return { stmt, start, end };
}

function getSQLStmtsInSelection(input, selectionStart, selectionEnd) {
  const selected = input.slice(selectionStart, selectionEnd);
  const stmts = [];
  let inSingle = false, inDouble = false;
  let stmtStart = 0;
  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ';' && !inSingle && !inDouble) {
      const stmtText = selected.slice(stmtStart, i).trim();
      if (stmtText) {
        stmts.push({
          stmt: stmtText,
          start: selectionStart + stmtStart,
          end: selectionStart + i + 1 // include semicolon
        });
      }
      stmtStart = i + 1;
    }
  }
  // Last statement (if any)
  const lastStmt = selected.slice(stmtStart).trim();
  if (lastStmt) {
    stmts.push({
      stmt: lastStmt,
      start: selectionStart + stmtStart,
      end: selectionStart + selected.length
    });
  }
  return stmts;
}

async function handleSqlSubmit(e) {
  e.preventDefault();
  const sqlInputArea = document.getElementById('sqlInput');
  const input = sqlInputArea.textContent;
  const cursor = getCaretPosition(sqlInputArea);
  const errorDiv = document.getElementById('error');
  const resultsDiv = document.getElementById('results');
  const copyBtnRow = document.getElementById('copyBtnRow');
  const resultsMeta = document.getElementById('resultsMeta');
  const copyBtnTable = document.getElementById('copyBtnTable');
  const copyBtnPage = document.getElementById('copyBtnPage');
  const copyBtnOption = document.getElementById('copyBtnOption');

  errorDiv.textContent = 'Running your request...';
  errorDiv.style.background = 'none';
  errorDiv.style.color = '#008800';
  resultsDiv.innerHTML = '';
  if (copyBtnRow) copyBtnRow.classList.add('is-hidden');

  const { stmt: query, start: start, end: end } = getSQLStmtAtCursor(input, cursor);

  if (!query || query.trim() === '') {
    errorDiv.textContent = 'No statement selected';
    errorDiv.style.background = 'none';
    errorDiv.style.color = '#B71C1C';
    // === ADD FOCUS RESTORATION ===
    sqlInputArea.focus();
    // === END ===
    return;
  }

  try {
    const submitMode = (document.getElementById('submitMode')?.value) || 'GET';
    let response;
    if (submitMode === 'GET') {
      const url = `/db2json?q=${encodeURIComponent(query)}&v=${Date.now()}`;
      response = await fetch(url);
    } else if (submitMode === 'POST_URLENC') {
      const body = `q=${encodeURIComponent(query)}`;
      response = await fetch('/db2json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      });
    } else {
      const fd = new FormData();
      fd.append('q', query);
      response = await fetch('/db2json', {
        method: 'POST',
        body: fd
      });
    }

    errorDiv.textContent = 'Loading resultSet...';
    errorDiv.style.background = 'none';
    errorDiv.style.color = '#008800';
    let text = await response.text();

    if (text.trim().startsWith('<!DOCTYPE')) {
      errorDiv.innerHTML = text;
      errorDiv.style.background = '#fff';
      errorDiv.style.color = '#B71C1C';
      // === ADD FOCUS RESTORATION ===
      sqlInputArea.focus();
      // === END ===
      return;
    }

    let json;
    try {
      let cleanText = text.trim();
      if (cleanText.startsWith('%') && cleanText.endsWith('%')) {
        cleanText = cleanText.slice(1, -1).trim();
      }
      json = JSON.parse(cleanText);
    } catch (err) {
      errorDiv.textContent = text;
      errorDiv.style.background = '#fff';
      errorDiv.style.color = '#B71C1C';
      // === ADD FOCUS RESTORATION ===
      sqlInputArea.focus();
      // === END ===
      return;
    }

    if (json.error) {
      if (String(json.error.sqlstate).toUpperCase() != 'SYNTAX') {
        errorDiv.textContent = `SQLSTATE: ${json.error.sqlstate || 'ERROR'} - ${json.error.msgtext || 'An error occurred.'}`;
      } else {
        errorDiv.textContent = `SYNTAX ERROR at pos: ${json.error.msgtext || 'An error occurred.'}`;
        const ta = document.getElementById('sqlInput');
        if (ta) {
          let pos = 0;
          if (typeof json.error.position === 'number' && isFinite(json.error.position)) {
            pos = json.error.position;
          } else {
            const m = String(json.error.msgtext || '').match(/^\s*(\d+)\s*,/);
            if (m) pos = parseInt(m[1], 10);
          }

          let offset = start;
          if (pos > 0) {
            offset = Math.max(start, Math.min(end, start + (pos - 1)));
          }

          const { start: selStart, end: selEnd } = getNextSqlTokenRange(ta.value, offset, start, end);

          ta.focus();
          const range = document.createRange();
          const textNode = ta.firstChild || ta;
          const safeStart = Math.min(selStart, textNode.textContent?.length || 0);
          const safeEnd = Math.min(selEnd, textNode.textContent?.length || 0);
          range.setStart(textNode, safeStart);
          range.setEnd(textNode, safeEnd);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      // === ADD FOCUS RESTORATION ===
      sqlInputArea.focus();
      // === END ===
      return;
    }

    // Save to history
    saveSqlToHistory(query);
    populateSqlHistoryDropdown();

    renderTable(json, resultsDiv);
    errorDiv.textContent = '';
    errorDiv.style.background = 'none';
    errorDiv.style.color = '#B71C1C';
    if (copyBtnRow) copyBtnRow.classList.remove('is-hidden');

    if (copyBtnTable) {
      copyBtnTable.onclick = () => copyTableToClipboard(resultsDiv);
    }
    if (copyBtnPage) {
      copyBtnPage.onclick = () => copyCurrentPageToClipboard(resultsDiv);
    }

    // === ADD FOCUS RESTORATION AT END OF SUCCESS PATH ===
    sqlInputArea.focus();
    // === END ===
  } catch (err) {
    errorDiv.textContent = err.message || 'Error running query.';
    errorDiv.style.background = 'none';
    errorDiv.style.color = '#B71C1C';
    // === ADD FOCUS RESTORATION ===
    sqlInputArea.focus();
    // === END ===
  }
}

// Helper: snap to allowed per-page values
function snapPerPage(n, maxRows) {
  const allowed = [5, 10, 15, 20, 25, 50, 100, 200, 500];
  let v = Math.max(1, Math.floor(n));
  // snap down to nearest multiple of 5
  v = Math.max(1, v - (v % 5));
  if (v < 5) v = 5;
  if (maxRows && v > maxRows) v = maxRows;
  // if not in allowed, add it so it appears in the dropdown
  const perPageSelect = allowed.includes(v) ? allowed : [...allowed, v].sort((a, b) => a - b);
  return { v, perPageSelect };
}

function setWrapperHeight(wrapper, gapPx = 12) {
  const viewportH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const top = wrapper.getBoundingClientRect().top;
  let avail = Math.floor(viewportH - top - gapPx);

  // Subtract vertical padding + borders so content fits precisely
  const cs = getComputedStyle(wrapper);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBot = parseFloat(cs.paddingBottom) || 0;
  const borTop = parseFloat(cs.borderTopWidth) || 0;
  const borBot = parseFloat(cs.borderBottomWidth) || 0;
  const chrome = padTop + padBot + borTop + borBot;

  avail = Math.max(100, avail - chrome);
  wrapper.style.height = avail + 'px';
  wrapper.style.maxHeight = avail + 'px';
  return avail;
}

function measureHeights(wrapper, tableEl) {
  // Must be called after DataTable init to include top/bottom bars
  const topBar = wrapper.querySelector('.datatable-top') || wrapper.querySelector('.dataTable-top');
  const bottomBar = wrapper.querySelector('.datatable-bottom') || wrapper.querySelector('.dataTable-bottom');
  const thead = tableEl.tHead;
  const firstRow = tableEl.querySelector('tbody tr');

  const topH = topBar ? Math.ceil(topBar.getBoundingClientRect().height) : 0;
  const botH = bottomBar ? Math.ceil(bottomBar.getBoundingClientRect().height) : 0;
  const headH = thead ? Math.ceil(thead.getBoundingClientRect().height) : 0;
  const rowH = firstRow ? Math.max(20, Math.ceil(firstRow.getBoundingClientRect().height)) : 24;

  return { topH, botH, headH, rowH };
}

function debounced(ms, fn) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function renderTable(json, resultsDiv) {
  let columns = [], rows = [], tblname = '', libname = '', colMeta = null;
  const copyBtnRow = document.getElementById('copyBtnRow');
  const copyBtnTable = document.getElementById('copyBtnTable');
  const copyBtnPage = document.getElementById('copyBtnPage');

  if (json.dataset) {
    columns = json.dataset.attr.map(col => col.name);
    colMeta = json.dataset.attr;
    rows = json.dataset.rows;
    tblname = json.dataset.tblname || '';
    libname = json.dataset.libname || '';
  } else if (json.attr) {
    columns = json.attr.map(col => col.name);
    colMeta = json.attr;
    rows = json.data;
  } else if (Array.isArray(json) && json.length) {
    columns = Object.keys(json[0]);
    rows = json;
  } else {
    resultsDiv.textContent = 'No results.';
    if (copyBtnRow) copyBtnRow.classList.add('is-hidden');
    return;
  }
  if (copyBtnRow) copyBtnRow.classList.remove('is-hidden');

  // Build HTML with a fixed ID
  let html = '<table id="resultSetTable" class="scroll-table"><colgroup></colgroup><thead><tr>';

  const isRightAlignType = t => /^(DECIMAL|DEC|NUMERIC|DECFLOAT|ZONED|INT|INTEGER|SMALLINT|BIGINT|TINYINT|FLOAT|REAL|DOUBLE|DATE|TIME|TIMESTAMP)$/i.test(t);

  // Determine which columns to wrap (LOBs always; long char types > 250)
  const wrapCols = new Set();
  if (Array.isArray(colMeta)) {
    colMeta.forEach((c, i) => {
      const len = Number(c.length) || 0;
      const t = String(c.type || '');
      const isLob = /CLOB|DBCLOB|BLOB|XML/i.test(t);
      const isLongChar = len > 250 && /(CHAR|VARCHAR|GRAPHIC|VARGRAPHIC)/i.test(t);
      if (isLob || isLongChar) wrapCols.add(i);
    });
  }

  if (Array.isArray(colMeta)) {
    colMeta.forEach((col, idx) => {
      let hdr = col.colhdr || col.name;
      if (hdr.length > 20) {
        let lines = [];
        for (let i = 0; i < 60 && i < hdr.length; i += 20) {
          let part = hdr.substr(i, 20).trim();
          if (part) lines.push(part);
        }
        hdr = lines.join('<br />');
      }
      let thTitle = buildColTitle(col);
      const thClasses = [];
      if (isRightAlignType(col.type)) thClasses.push('right');
      if (wrapCols.has(idx)) thClasses.push('wrap');
      const thClassAttr = thClasses.length ? ` class="${thClasses.join(' ')}"` : '';
      html += `<th${thClassAttr} title="${thTitle}">${hdr}</th>`;
    });
  } else {
    for (const col of columns) {
      html += `<th>${col}</th>`;
    }
  }

  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (let colIdx = 0; colIdx < columns.length; ++colIdx) {
      const colName = columns[colIdx];
      const classes = [];
      if (colMeta && colMeta[colIdx] && isRightAlignType(colMeta[colIdx].type)) classes.push('right');
      if (wrapCols.has(colIdx)) classes.push('wrap');
      const tdClassAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
      const cellData = row[colName] ?? '';
      const safeCellData = escapeHTML(cellData);
      // Add title for full value on hover
      html += `<td${tdClassAttr} title="${escapeHTML(String(cellData))}">${safeCellData}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';

  html += '</table>';

  // Inject into an existing wrapper (preserve wrapper DOM)
  const wrapper = resultsDiv.querySelector('.scroll-table-wrapper') || (() => {
    const d = document.createElement('div');
    d.className = 'scroll-table-wrapper';
    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(d);
    return d;
  })();
  wrapper.innerHTML = html;

  // 1) Cap wrapper height from its current top to viewport bottom
  const avail = setWrapperHeight(wrapper, 12);

  const tableEl = wrapper.querySelector('#resultSetTable');

  // Clean up previous instance
  if (resultsDiv._dt) {
    try { resultsDiv._dt.destroy(); } catch { }
    resultsDiv._dt = null;
  }

  // 2) Compute perPage BEFORE initializing DataTable (no inner scroll)
  let perPage = 25;
  let perPageSelect = [5, 10, 15, 20, 25, 50, 100, 200, 500];
  if (tableEl) {
    // Force a layout so sizes are accurate
    void tableEl.offsetHeight;

    const theadH = tableEl.tHead ? Math.ceil(tableEl.tHead.getBoundingClientRect().height || 0) : 0;
    const firstRow = tableEl.querySelector('tbody tr');
    const rowH = firstRow ? Math.max(20, Math.ceil(firstRow.getBoundingClientRect().height || 24)) : 24;

    // Reserve space for Simple-DataTables top and bottom bars
    const controlsReserve = 84; // tweak if needed (top ~40 + bottom ~44)

    const bodyAvail = Math.max(0, avail - theadH - controlsReserve);
    const totalRows = rows.length;

    const estRows = Math.max(1, Math.floor(bodyAvail / rowH));
    const snap = (n, max) => {
      let v = Math.max(1, Math.floor(n));
      v = v - (v % 5); if (v < 5) v = 5;
      if (max && v > max) v = max;
      if (!perPageSelect.includes(v)) perPageSelect = [...perPageSelect, v].sort((a, b) => a - b);
      return v;
    };
    perPage = snap(estRows, totalRows);
  }

  // 3) Initialize Simple-DataTables ONCE with the computed perPage
  if (tableEl && window.simpleDatatables?.DataTable) {
    // Wait for the table to be painted and visible
    requestAnimationFrame(() => {
      // Defensive: check again after paint
      const theadH = tableEl.tHead ? Math.ceil(tableEl.tHead.getBoundingClientRect().height || 0) : 0;
      const firstRow = tableEl.querySelector('tbody tr');
      const rowH = firstRow ? Math.max(20, Math.ceil(firstRow.getBoundingClientRect().height || 24)) : 24;
      const avail = setWrapperHeight(wrapper, 12);
      const controlsReserve = 84;
      const bodyAvail = Math.max(0, avail - theadH - controlsReserve);
      const totalRows = rows.length;
      const estRows = Math.max(1, Math.floor(bodyAvail / rowH));
      const snap = (n, max) => {
        let v = Math.max(1, Math.floor(n));
        v = v - (v % 5); if (v < 5) v = 5;
        if (max && v > max) v = max;
        if (!perPageSelect.includes(v)) perPageSelect = [...perPageSelect, v].sort((a, b) => a - b);
        return v;
      };
      const finalPerPage = snap(estRows, totalRows);

      resultsDiv._dt = new simpleDatatables.DataTable(tableEl, {
        searchable: true,
        perPage: finalPerPage,
        perPageSelect
      });

      // Precisely fit perPage once bars exist
      requestAnimationFrame(() => {
        try { adjustPerPageToFit(resultsDiv, wrapper, tableEl); } catch { }
      });

      // Recompute on browser resize; avoid multiple handlers
      if (resultsDiv._dtResizeHandler) {
        window.removeEventListener('resize', resultsDiv._dtResizeHandler);
        if (window.visualViewport) window.visualViewport.removeEventListener('resize', resultsDiv._dtResizeHandler);
      }
      resultsDiv._dtResizeHandler = debounced(150, () => {
        try { adjustPerPageToFit(resultsDiv, wrapper, tableEl); } catch { }
      });
      window.addEventListener('resize', resultsDiv._dtResizeHandler, { passive: true });
      if (window.visualViewport) window.visualViewport.addEventListener('resize', resultsDiv._dtResizeHandler, { passive: true });
    });
  }

  setResultsMeta({ rowsCount: rows.length, colsCount: columns.length, tblname, libname });
  document.getElementById('copyBtnRow')?.classList.remove('is-hidden');
  document.getElementById('resultsMeta')?.classList.remove('is-hidden');

  // Keep wrapper height correct after paint
  requestAnimationFrame(() => { try { sizeResultsViewport(); } catch { } });
}



function adjustTableMaxHeight(resultsDiv) {
  const wrapper = resultsDiv.querySelector('.scroll-table-wrapper');
  if (wrapper) {
    const rect = wrapper.getBoundingClientRect();
    const margin = 16;
    let available = window.innerHeight - rect.top - margin;
    // Subtract thead height (if present), with a small buffer
    const thead = wrapper.querySelector('thead');
    if (thead) {
      const theadRect = thead.getBoundingClientRect();
      const theadHeight = theadRect.height || 0;
      available -= (theadHeight > 8 ? theadHeight - 8 : theadHeight);
    }
    // Subtract tfoot height (if present), with a small buffer
    const tfoot = wrapper.querySelector('tfoot');
    if (tfoot) {
      const tfootRect = tfoot.getBoundingClientRect();
      const tfootHeight = tfootRect.height || 0;
      available -= (tfootHeight > 8 ? tfootHeight - 8 : tfootHeight);
    }
    wrapper.style.maxHeight = available > 100 ? available + 'px' : '100px';
  }
}


function syncColWidths(resultsDiv) {
  const table = resultsDiv?.querySelector?.('.scroll-table');
  if (!table) return;
  const thead = table.tHead;
  const headerRow = thead?.rows?.[0];
  if (!headerRow) return;
  const headerCells = headerRow.cells;
  const maxColWidthCh = 150;
  let colWidths = [];
  Array.from(headerCells).forEach((th, colIdx) => {
    const isNumeric = th.classList.contains('right');
    // Calculate header width based on the longest line after splitting on <br>
    let headerLines = (th.innerHTML || '').split(/<br\s*\/?/i);
    let headerLen = 0;
    for (let line of headerLines) {
      // Remove any HTML tags and trim
      let text = line.replace(/<[^>]+>/g, '').trim();
      if (text.length > headerLen) headerLen = text.length;
    }
    let maxWidthCh = headerLen;

    const bodyRows = table.tBodies?.[0]?.rows || [];
    Array.from(bodyRows).forEach(tr => {
      const td = tr.cells?.[colIdx];
      if (!td) return;
      const cellLen = (td.textContent || '').trim().length;
      if (cellLen > maxWidthCh) maxWidthCh = cellLen;
    });

    if (maxWidthCh > maxColWidthCh) maxWidthCh = maxColWidthCh;

    // If numeric, don’t let the column balloon too wide
    if (isNumeric) {
      if (maxWidthCh > 20) maxWidthCh = 20;
      maxWidthCh += 2; // add a little extra space for right alignment
    } else {
      maxWidthCh += 2; // small cushion for proportional fonts so 20 chars don’t wrap early
    }
    colWidths.push(maxWidthCh);
  });

  let colgroupHtml = '';
  for (let w of colWidths) {
    // colgroupHtml += `<col style="min-width: ${w}ch; max-width: ${w}ch;">`;
    colgroupHtml += `<col style="min-width: ${w}ch;">`;
  }
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }
  colgroup.innerHTML = colgroupHtml;
}

function copySqlInput() {
  const sqlInputArea = document.getElementById('sqlInput');
  if (!sqlInputArea || (sqlInputArea.textContent || '').trim().length === 0) return; // Changed from value to innerText

  // For contenteditable, select all content
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(sqlInputArea);
  selection.removeAllRanges();
  selection.addRange(range);

  document.execCommand('copy');
  sqlInputArea.focus();

  const btn = document.getElementById('copySqlInputBtn');
  const copyIcon = btn.querySelector('.copy-icon');
  const checkSpan = btn.querySelector('.copy-checkmark-feedback');
  if (copyIcon) copyIcon.style.visibility = 'hidden';
  if (checkSpan) {
    checkSpan.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;">
                <polyline points="12.6,23.4 18,28.8 28.8,14.4" fill="none" stroke="#4caf50" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    checkSpan.style.visibility = 'visible';
  }
  setTimeout(() => {
    if (copyIcon) copyIcon.style.visibility = 'visible';
    if (checkSpan) {
      checkSpan.innerHTML = '';
      checkSpan.style.visibility = 'hidden';
    }
  }, 1000);
}

// Context menu for formatting SQL statement
(function setupSqlContextMenu() {
  const sqlInputArea = document.getElementById('sqlInput');
  if (!sqlInputArea) return;

  // Create the custom menu
  const menu = document.createElement('div');
  menu.style.position = 'absolute';
  menu.style.zIndex = 10000;
  menu.style.background = '#fff';
  menu.style.border = '1px solid #bbb';
  menu.style.padding = '4px 0';
  menu.style.boxShadow = '0 2px 8px #888';
  menu.style.display = 'none';
  menu.style.minWidth = '160px';
  menu.style.fontFamily = 'inherit';
  menu.style.fontSize = '0.75em';
  menu.innerHTML = '<div style="padding: 6px 16px; cursor: pointer;" id="formatSqlMenuItem">Format SQL Statement</div>';
  document.body.appendChild(menu);

  // Hide menu on click elsewhere
  document.addEventListener('click', () => { menu.style.display = 'none'; });
  window.addEventListener('blur', () => { menu.style.display = 'none'; });

  sqlInputArea.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.style.display = 'block';
  });

  menu.addEventListener('contextmenu', e => e.preventDefault());

  // find the context menu click handler:
  menu.querySelector('#formatSqlMenuItem').addEventListener('click', function () {
    menu.style.display = 'none';
    if (window.formatCurrentSqlContext) formatCurrentSqlContext();
  });
})();


function attachSqlInputResizeSync() {
  // Tear down any previous observers/listeners
  if (window._db2jsonRO && window._db2jsonRO.disconnect) window._db2jsonRO.disconnect();
  window._db2jsonRO = null;
  if (window._db2jsonWinResize) {
    window.removeEventListener('resize', window._db2jsonWinResize);
    window._db2jsonWinResize = null;
  }

  const ta = document.getElementById('sqlInput');
  const container = document.querySelector('.textarea-btn-container');
  if (!ta) return;

  // Remove stale inline sizes that cap growth
  ta.style.removeProperty('width');       // let CSS width:min(80vw,1200px) apply
  ta.style.removeProperty('height');      // let CSS height:30vh apply
  if (container) container.style.removeProperty('width'); // let inline-block shrink-wrap

  // Make sqlInputArea the only resizable element
  ta.style.maxWidth = '100%';
  ta.style.resize = 'both';
  ta.style.overflow = 'auto';

  // No ResizeObserver, no window resize handler. CSS controls layout now.
}


// Open: load a .sql/.txt file into the sqlInputArea
async function openSqlFile() {
  const ta = document.getElementById('sqlInput');
  if (!ta) return;

  if (window.showOpenFilePicker && window.isSecureContext) {
    try {
      const [handle] = await window.showOpenFilePicker({
        id: 'db2json-sql',
        multiple: false,
        types: [{ description: 'SQL Files', accept: { 'text/plain': ['.sql', '.txt'] } }],
        excludeAcceptAllOption: false
      });
      _lastFileHandle = handle;
      const file = await handle.getFile();
      _lastFileName = file.name;
      const text = await file.text();

      ta.value = text;
      ta.focus();
      ta.setSelectionRange(0, 0);
      updateCopySqlEnabled();
      updateSaveButtonsState();
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
      console.error('openSqlFile picker failed:', e);
      // fall through
    }
  }

  // Fallback: hidden <input type="file">
  const input = document.getElementById('sqlFileInput');
  if (!input) return false;
  return await new Promise(resolve => {
    input.value = '';
    input.onchange = async () => {
      try {
        const file = input.files && input.files[0];
        if (!file) return resolve(false);
        _lastFileHandle = null;               // no persistent handle in fallback
        _lastFileName = file.name;
        const text = await file.text();
        ta.value = text;
        ta.focus();
        ta.setSelectionRange(0, 0);
        updateCopySqlEnabled();
        updateSaveButtonsState();             // Save stays disabled in fallback
        maybeShowSaveUnsupportedNotice('fallback');
        resolve(true);
      } catch (err) {
        console.error('openSqlFile fallback failed:', err);
        resolve(false);
      }
    };
    input.click();
  });
}

// Save As: native dialog when available; fallback uses last file name
async function saveSqlAsFile() {
  const ta = document.getElementById('sqlInput');
  if (!ta) return false;
  const text = ta.value ?? '';
  const suggestedName = (_lastFileHandle?.name) || _lastFileName || 'db2Query.sql';

  if (window.showSaveFilePicker && window.isSecureContext) {
    try {
      const handle = await window.showSaveFilePicker({
        id: 'db2json-sql',
        suggestedName,
        types: [{ description: 'SQL Files', accept: { 'text/plain': ['.sql', '.txt'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([text], { type: 'text/plain' }));
      await writable.close();
      _lastFileHandle = handle;               // now we have a handle → Save can enable
      _lastFileName = handle.name;
      updateSaveButtonsState();
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
      console.error('saveSqlAsFile picker failed:', e);
    }
  }

  // Fallback: download-style, but use last/opened name
  const nameInput = prompt('Save SQL as filename:', suggestedName);
  if (nameInput === null) return false;
  const finalName = ensureSqlExt(nameInput);
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    _lastFileName = finalName;
    updateSaveButtonsState();
    return true;
  } catch (err) {
    console.error('saveSqlAsFile download failed:', err);
    return false;
  }
}

// True “Save” to the opened file (no dialog), when permitted
async function saveSqlToCurrentFile() {
  if (!(_lastFileHandle && window.isSecureContext)) return false;
  const ta = document.getElementById('sqlInput');
  if (!ta) return false;
  try {
    if (typeof _lastFileHandle.requestPermission === 'function') {
      const perm = await _lastFileHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
    }
    const writable = await _lastFileHandle.createWritable();
    await writable.write(new Blob([ta.value ?? ''], { type: 'text/plain' }));
    await writable.close();
    return true;
  } catch (e) {
    console.error('saveSqlToCurrentFile failed:', e);
    return false;
  }
}

// History actions
const clearBtn = document.getElementById('clearSqlHistoryBtn');
const editBtn = document.getElementById('editSqlHistoryBtn');
if (clearBtn) clearBtn.addEventListener('click', clearSqlHistory);
if (editBtn) editBtn.addEventListener('click', openEditHistoryModal);

const modal = document.getElementById('historyModal');
const saveHistBtn = document.getElementById('historySaveBtn');
const cancelBtn = document.getElementById('historyCancelBtn');
if (saveHistBtn) saveHistBtn.addEventListener('click', saveEditedHistory);
if (cancelBtn) cancelBtn.addEventListener('click', closeEditHistoryModal);
if (modal) modal.addEventListener('click', (e) => {
  if (e.target === modal) closeEditHistoryModal();
});

// Attach sqlInputArea → controls width sync after UI is in the DOM
attachSqlInputResizeSync();



// Harden SQL sqlInputArea against unwanted features
function hardenSqlTextarea() {
  const ta = document.getElementById('sqlInput');
  if (!ta) return;

  // Always safe
  try { ta.autocomplete = 'off'; } catch { }
  try { ta.spellcheck = false; } catch { try { ta.setAttribute('spellcheck', 'false'); } catch { } }

  // Only set if supported to avoid Safari warnings
  try { if ('autocapitalize' in ta) ta.autocapitalize = 'off'; } catch { }
  try {
    if ('autocorrect' in ta) {
      ta.autocorrect = 'off';
    } else {
      // Some iOS builds accept the attribute even without a property
      ta.setAttribute('autocorrect', 'off');
    }
  } catch { }

  // inputMode property (fallback to attribute)
  try {
    if ('inputMode' in ta) ta.inputMode = 'text';
    else ta.setAttribute('inputmode', 'text');
  } catch { }

  // Disable grammar/extension helpers if present
  try { ta.setAttribute('data-gramm', 'false'); } catch { }
  try { ta.setAttribute('data-enable-grammarly', 'false'); } catch { }

  // Prevent translation (e.g., by browser or extensions)
  try { ta.setAttribute('translate', 'no'); } catch { }
}

// Ensure it runs after your existing init
(function patchInitForHarden() {
  const orig = window.initDb2jsonUI;
  window.initDb2jsonUI = function patchedInit() {
    if (typeof orig === 'function') orig();
    hardenSqlTextarea();
  };
})();

// If initDb2jsonUI already ran, still harden now
if (document.readyState !== 'loading') {
  try { hardenSqlTextarea(); } catch { }
} else {
  document.addEventListener('DOMContentLoaded', () => { try { hardenSqlTextarea(); } catch { } });
}

// Precisely cap the results viewport so its bottom stays inside the window with a ~0.25" gap
function sizeResultsViewport() {
  const wrap = document.querySelector('#results .scroll-table-wrapper');
  if (!wrap || !wrap.firstChild) return; // nothing to size yet

  // Visual viewport (accounts for mobile toolbars) else fallback
  const viewportH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;

  // Desired bottom gap ≈ 0.25in (~24 CSS px)
  const GAP_PX = 24;

  // Distance from top of viewport to wrapper
  const top = wrap.getBoundingClientRect().top;

  // Available space
  let avail = Math.floor(viewportH - top - GAP_PX);
  if (!Number.isFinite(avail)) return;
  if (avail < 100) avail = 100;

  // Apply cap; if current height exceeds cap (or unset), pin to cap
  wrap.style.maxHeight = avail + 'px';

  const curH = parseFloat(getComputedStyle(wrap).height) || 0;
  if (!wrap.style.height || curH > avail + 1) {
    wrap.style.height = avail + 'px';
  }
}

(function initResultsViewportSizing() {
  // Replace the old `run` with this combined version
  const run = () => {
    try {
      // 1) Cap wrapper to viewport remainder
      sizeResultsViewport();

      // 2) Also recompute perPage to fit between the bars
      const resultsDiv = document.getElementById('results');
      const wrapper = resultsDiv?.querySelector('.scroll-table-wrapper');
      const tableEl = wrapper?.querySelector('#resultSetTable');
      if (resultsDiv && wrapper && tableEl) {
        // Debounce to avoid thrashing while dragging the sqlInputArea resizer
        if (!window._db2jsonAdjustDebounced) {
          window._db2jsonAdjustDebounced = debounced(100, () => {
            try { adjustPerPageToFit(resultsDiv, wrapper, tableEl); } catch { }
          });
        }
        window._db2jsonAdjustDebounced();
      }
    } catch { }
  };

  // Recompute when window/viewport changes
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', run);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', run);

  // Recompute when the SQL input area changes size
  const ta = document.getElementById('sqlInput');
  if (ta && 'ResizeObserver' in window) {
    const ro = new ResizeObserver(run);
    ro.observe(ta);
  }

  // Hook after results are rendered
  const origRender = window.renderTable;
  if (typeof origRender === 'function') {
    window.renderTable = function patchedRenderTable(json, resultsDiv) {
      const r = origRender.apply(this, arguments);
      requestAnimationFrame(run);
      return r;
    };
  } else {
    if (document.readyState !== 'loading') run();
    else document.addEventListener('DOMContentLoaded', run);
  }
})();

function setResultsMeta({ rowsCount, colsCount, tblname, libname }) {
  const meta = document.getElementById('resultsMeta');
  if (!meta) return;
  let txt = `Rows: ${rowsCount}    Columns: ${colsCount}`;
  if (tblname) txt += `    Table: ${tblname}`;
  if (libname) txt += `    Library: ${libname}`;
  // Use escapeHTML if already defined in your file
  meta.innerHTML = `<b>${typeof escapeHTML === 'function' ? escapeHTML(txt) : txt}</b>`;
  meta.title = txt;
}

function sanitizePerPageDropdown(wrapper, perPage) {
  const sel =
    wrapper.querySelector('.datatable-dropdown select') ||
    wrapper.querySelector('.dataTable-dropdown select');
  if (!sel) return;

  const seen = new Set();
  const opts = Array.from(sel.options)
    .map(o => Number(o.value))
    .filter(v => Number.isFinite(v) && v >= 5 && !seen.has(v) && seen.add(v))
    .sort((a, b) => a - b);

  if (!opts.includes(perPage)) {
    opts.push(perPage);
    opts.sort((a, b) => a - b);
  }

  sel.innerHTML = '';
  for (const v of opts) {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = String(v);
    sel.appendChild(opt);
  }
  sel.value = String(perPage); // do NOT dispatch change
}

function adjustPerPageToFit(resultsDiv, wrapper, tableEl) {
  // prevent re-entrancy while layout is in flux
  if (adjustPerPageToFit._running) return;
  adjustPerPageToFit._running = true;

  try {
    const dt = resultsDiv?._dt;
    if (!dt || !wrapper || !tableEl) return;

    const avail = setWrapperHeight(wrapper, 12);

    const { topH, botH, headH, rowH } = measureHeights(wrapper, tableEl);
    const safeRowH = Number.isFinite(rowH) && rowH > 0 ? rowH : 24;
    const safeTop = Number.isFinite(topH) ? topH : 0;
    const safeBot = Number.isFinite(botH) ? botH : 0;
    const safeHead = Number.isFinite(headH) ? headH : 0;

    const fudge = 2;
    const bodyAvail = Math.max(0, avail - safeTop - safeBot - safeHead - fudge);
    let rowsThatFit = Math.floor(bodyAvail / safeRowH);
    if (!Number.isFinite(rowsThatFit) || rowsThatFit <= 0) rowsThatFit = 5;

    const totalRows = tableEl.tBodies[0]?.rows?.length || 0;
    const { v: perPage, perPageSelect } = snapPerPage(rowsThatFit, totalRows);

    if (perPage !== dt.options.perPage) {
      dt.options.perPage = perPage;
      if (Array.isArray(perPageSelect)) dt.options.perPageSelect = perPageSelect;
      if (typeof dt.setPage === 'function') dt.setPage(1);
      if (typeof dt.update === 'function') dt.update();
    }

    // Keep the dropdown in sync without firing change (avoids plugin re-read glitches)
    sanitizePerPageDropdown(wrapper, perPage);
  } finally {
    requestAnimationFrame(() => { adjustPerPageToFit._running = false; });
  }
}

// Wire Format button (idempotent) – direct call, not via menuItem.click()
(function wireFormatButton() {
  function attempt() {
    const btn = document.getElementById('formatSqlBtn');
    if (!btn || btn._wired) return !!btn;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.formatCurrentSqlContext) {
        formatCurrentSqlContext();
      } else {
        console.warn('formatCurrentSqlContext not available yet.');
      }
    });
    btn._wired = true;
    return true;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!attempt()) setTimeout(attempt, 150); // retry if button injected late
    });
  } else {
    if (!attempt()) setTimeout(attempt, 150);
  }
})();

// === Clean Contenteditable Setup with <br> normalization ===
(function initContenteditableHighlighting() {
  const sqlInput = document.getElementById('sqlInput');
  const codeEl = document.getElementById('sqlHighlight');

  if (!sqlInput || !codeEl) {
    console.warn('Missing sqlInput or sqlHighlight elements');
    return;
  }

  // Remove any existing handlers to avoid duplicates
  if (sqlInput._highlightWired) return;

  function updateHighlight() {
    // Use innerText to normalize <br>/<div> to \n across browsers
    const text = sqlInput.innerText || '';
    codeEl.textContent = text || ' ';

    if (window.Prism && typeof Prism.highlightElement === 'function') {
      try {
        Prism.highlightElement(codeEl);
      } catch (error) {
        console.error('Prism highlight error:', error);
      }
    }

    syncScroll();
  }

  function syncScroll() {
    const highlightLayer = codeEl.parentElement;
    if (highlightLayer) {
      highlightLayer.scrollTop = sqlInput.scrollTop;
      highlightLayer.scrollLeft = sqlInput.scrollLeft;
    }
  }

  // Handle Enter manually - insert <br> instead of text node
  console.log('Attaching keydown handler to sqlInput');

 sqlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    e.stopPropagation();

    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    // 1️⃣ Insert the spacer first
    const spacer = document.createTextNode('\u200B');
    range.insertNode(spacer);

    // 2️⃣ Then insert the <br> *before* the spacer
    const br = document.createElement('br');
    spacer.parentNode.insertBefore(br, spacer);

    // 3️⃣ Move caret after spacer (after the <br>)
    range.setStartAfter(spacer);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    // 4️⃣ Update highlight
    updateHighlight();
  }
});

  // Single input event for all other changes
  sqlInput.addEventListener('input', updateHighlight);
  sqlInput.addEventListener('scroll', syncScroll);

  // Clean up trailing whitespace when focus leaves
  sqlInput.addEventListener('blur', () => {
    const text = sqlInput.innerText || '';
    const trimmed = text.replace(/\n+$/, '');
    if (text !== trimmed) {
      // Use innerText for setting too, to maintain consistency
      const lines = trimmed.split('\n');
      sqlInput.innerHTML = lines.map(line =>
        line ? document.createTextNode(line).textContent : ''
      ).join('<br>');
      updateHighlight();
    }
  });

  sqlInput._highlightWired = true;

  // Initial setup
  setTimeout(() => {
    updateHighlight();
    sqlInput.focus();

    // Place cursor at end
    const range = document.createRange();
    const sel = window.getSelection();
    const lastNode = sqlInput.lastChild || sqlInput;
    if (lastNode.nodeType === Node.TEXT_NODE) {
      range.setStart(lastNode, lastNode.textContent?.length || 0);
    } else {
      range.selectNodeContents(sqlInput);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }, 200);

  console.log('Contenteditable highlighting initialized with auto-focus');
})();

// Add getSQLStmtAtCursor to any existing window assignments
Object.assign(window, {
  getSQLStmtAtCursor,
  getSQLStmtsInSelection
});
