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

// Feature detection for File System Access API
if (typeof window.supportsFileSystemAccess !== 'function') {
  function supportsFileSystemAccess() {
    return window.isSecureContext &&
      typeof window.showOpenFilePicker === 'function' &&
      typeof window.showSaveFilePicker === 'function';
  }
}

// Contextual notice if Save unavailable
if (typeof window.maybeShowSaveUnsupportedNotice !== 'function') {
  function maybeShowSaveUnsupportedNotice(reason = 'context') {
    try {
      const key = reason === 'fallback' ? 'db2json_save_notice_fallback' : 'db2json_save_notice_ctx';
      if (sessionStorage.getItem(key) === '1') return;

      const msg = (reason === 'fallback')
        ? '"Save SQL Statements to local file" will be unavailable in the browser session. Use "Save As...", or use HTTPS or localhost.'
        : '"Save SQL Statements to local file" is unavailable in this browser/context. "Save As..." will save to downloads folder.';

      showToast(msg, 'warn', 12000);
      sessionStorage.setItem(key, '1');
    } catch { }
  }
}

// Hook Save button to show notice
(function hookSaveStateNotice() {
  const orig = window.updateSaveButtonsState;
  window.updateSaveButtonsState = function patchedUpdateSaveButtonsState() {
    try { if (typeof orig === 'function') orig(); } catch { }
    try { if (!supportsFileSystemAccess()) maybeShowSaveUnsupportedNotice('context'); } catch { }
  };
})();

// Hook Open fallback to show notice
(function hookOpenFallbackNotice() {
  const origOpen = window.openSqlFile;
  if (typeof origOpen === 'function') {
    window.openSqlFile = async function patchedOpenSqlFile() {
      const result = await origOpen.apply(this, arguments);
      try {
        const saveBtn = document.getElementById('saveSqlBtn');
        const noHandle = !_lastFileHandle;
        if (saveBtn && saveBtn.disabled && noHandle) {
          maybeShowSaveUnsupportedNotice('fallback');
        }
      } catch { }
      return result;
    };
  }
})();

// Trigger notice once on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try { if (!supportsFileSystemAccess()) maybeShowSaveUnsupportedNotice('context'); } catch { }
  });
} else {
  try { if (!supportsFileSystemAccess()) maybeShowSaveUnsupportedNotice('context'); } catch { }
}

// Ensure SQL file has extension
function ensureSqlExt(name) {
  name = (name || '').trim();
  if (!name) return 'db2Query.sql';
  return /\.(sql|txt)$/i.test(name) ? name : name + '.sql';
}

// === Contenteditable helpers ===
function getSqlInputText() {
  const el = document.getElementById('sqlInput');
  return el ? el.innerText : '';
}
function setSqlInputText(text) {
  const el = document.getElementById('sqlInput');
  if (el) el.innerText = text;
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

// === Prism Highlighting and Sync ===
function refreshSqlHighlight() {
  const editorEl = document.getElementById('sqlInput');
  const codeEl = document.getElementById('sqlHighlight');
  if (!editorEl || !codeEl) return;

  const text = editorEl.innerText || '';
  codeEl.textContent = text || ' '; // Ensure non-empty for Prism

  if (window.Prism) {
    Prism.highlightElement(codeEl);
  }
}

const sqlInput = document.getElementById('sqlInput');
const highlightLayer = document.getElementById('sqlHighlight')?.parentElement;

function syncHighlightScroll() {
  if (!sqlInput || !highlightLayer) return;
  highlightLayer.scrollTop = sqlInput.scrollTop;
  highlightLayer.scrollLeft = sqlInput.scrollLeft;
}

if (sqlInput) {
  sqlInput.addEventListener('input', refreshSqlHighlight);
  sqlInput.addEventListener('scroll', syncHighlightScroll);
}

refreshSqlHighlight(); // Initial call