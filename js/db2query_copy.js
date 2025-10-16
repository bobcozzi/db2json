// === Fallback copy for insecure contexts ===
function fallbackCopy(text, cb) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  if (typeof cb === 'function') cb();
  else feedbackCopySuccess();
}

// === Feedback for SQL copy (checkmark animation) ===
function feedbackCopySuccess() {
  const btn = document.getElementById('copySqlInputBtn') || document.getElementById('copyBtnTable');
  if (!btn) return;
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

// === Feedback for table page copy ===
function feedbackCopyCurrentPageSuccess() {
  const btn = document.getElementById('copyBtnPage');
  if (!btn) return;
  btn.innerText = 'Copied!';
  setTimeout(() => { btn.innerText = 'Copy Page'; }, 1200);
}

// === Main copy function for SQL input (contenteditable) ===
function copySqlInput() {
  const el = document.getElementById('sqlInput');
  if (!el) return;

  // Use textContent for contenteditable (preserves line breaks better)
  const text = el.textContent || '';
  if (!text.trim()) return;

  // Provide visual feedback by selecting all content
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);

  // Copy using modern API
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showCopySqlCheckmark();
      // Restore focus to contenteditable
      el.focus();
    }).catch(err => {
      console.error('Clipboard write failed:', err);
      // Fallback to execCommand
      document.execCommand('copy');
      showCopySqlCheckmark();
      el.focus();
    });
  } else {
    // Fallback for insecure contexts
    try {
      document.execCommand('copy');
      showCopySqlCheckmark();
      el.focus();
    } catch (err) {
      console.error('Copy failed:', err);
      // Last resort: use fallback
      fallbackCopy(text, showCopySqlCheckmark);
      el.focus();
    }
  }
}

// === Show checkmark feedback specifically for SQL input copy ===
function showCopySqlCheckmark() {
  const btn = document.getElementById('copySqlInputBtn');
  if (!btn) return;

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

// === Main copy function for table ===
function copyTableToClipboard(resultsDiv) {
  const delimiter = {
    tab: '\t',
    comma: ',',
    pipe: '|'
  }[document.getElementById('copyBtnOption')?.value || 'tab'];

  // Try to use last rendered columns/rows if available
  const columns = window._lastRenderedColumns;
  const rows = window._lastRenderedRows;
  if (Array.isArray(columns) && Array.isArray(rows)) {
    let tsv = columns.join(delimiter) + '\n';
    rows.forEach(row => {
      const cells = columns.map(col => {
        let val = row[col];
        if (val == null) return '';
        let s = String(val).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        if (delimiter === ',' && (s.includes(',') || s.includes('"'))) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
      tsv += cells.join(delimiter) + '\n';
    });
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(tsv).then(() => feedbackCopySuccess());
    } else {
      fallbackCopy(tsv, feedbackCopySuccess);
    }
    return;
  }

  // Fallback: copy only visible rows
  const table = resultsDiv.querySelector('table');
  if (!table) return;
  let tsv = '';
  const headers = Array.from(table.querySelectorAll('thead th')).map(th =>
    th.innerText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  );
  tsv += headers.join(delimiter) + '\n';

  table.querySelectorAll('tbody tr').forEach(tr => {
    const cells = Array.from(tr.children).map(td =>
      (td.innerText ?? '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    );
    tsv += cells.join(delimiter) + '\n';
  });

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(tsv).then(() => feedbackCopySuccess());
  } else {
    fallbackCopy(tsv, feedbackCopySuccess);
  }
}

// === Main copy function for current table page ===
function copyCurrentPageToClipboard(resultsDiv) {
  const delimiter = {
    tab: '\t',
    comma: ',',
    pipe: '|'
  }[document.getElementById('copyBtnOption')?.value || 'tab'];

  const table = resultsDiv.querySelector('table');
  if (!table) return;

  let tsv = '';
  const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());
  tsv += headers.join(delimiter) + '\n';

  table.querySelectorAll('tbody tr').forEach(tr => {
    const cells = Array.from(tr.children).map(td => {
      let s = (td.innerText ?? '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (delimiter === ',' && (s.includes(',') || s.includes('"'))) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    });
    tsv += cells.join(delimiter) + '\n';
  });

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(tsv).then(() => feedbackCopyCurrentPageSuccess());
  } else {
    fallbackCopy(tsv, feedbackCopyCurrentPageSuccess);
  }
}

// === Enable/disable copy SQL button based on content ===
function updateCopySqlEnabled() {
  const btn = document.getElementById('copySqlInputBtn');
  const textarea = document.getElementById('sqlInput');
  if (!btn || !textarea) return;
  const hasContent = (textarea.textContent || '').trim().length > 0;
  btn.disabled = !hasContent;
}