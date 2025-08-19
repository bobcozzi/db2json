// Maximum number of SQL statements to keep in history
const MAX_SQL_HISTORY = 512;
const HISTORY_KEY = 'db2json_SQL_History';

function initDb2jsonUI() {
    if (window._db2jsonInited) return;
    window._db2jsonInited = true;
    const copyTableBtn = document.getElementById('copyTableBtn');
    const sqlForm = document.getElementById('sqlForm');
    const copySqlInputBtn = document.getElementById('copySqlInputBtn');
    const textarea = document.getElementById('sqlInput');

    // Hide copy table button initially
    if (copyTableBtn) copyTableBtn.classList.add('is-hidden');

    // Register event handlers
    if (sqlForm) sqlForm.addEventListener('submit', handleSqlSubmit);
    if (copySqlInputBtn) copySqlInputBtn.addEventListener('click', copySqlInput);

    // Sticky tfoot/table resize
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        window.addEventListener('resize', () => adjustTableMaxHeight(resultsDiv));
    }

    // --- SQL History Dropdown ---
    populateSqlHistoryDropdown();
    const dropdown = document.getElementById('sqlHistoryDropdown');
    if (dropdown) {
        dropdown.addEventListener('change', function() {
            if (dropdown.value) {
                document.getElementById('sqlInput').value = dropdown.value;
            }
            // Update copy button enabled/disabled when selection changes
            updateCopySqlEnabled();
        });
    }

    // Keep copy button disabled when textarea empty
    function updateCopySqlEnabled() {
        const btn = document.getElementById('copySqlInputBtn');
        const ta = document.getElementById('sqlInput');
        if (!btn || !ta) return;
        const hasText = (ta.value || '').trim().length > 0;
        btn.disabled = !hasText;
        btn.setAttribute('aria-disabled', String(!hasText));
    }
    if (textarea) {
        textarea.addEventListener('input', updateCopySqlEnabled);
        // Initialize state on load
        updateCopySqlEnabled();
    }
    // History actions
    const clearBtn = document.getElementById('clearSqlHistoryBtn');
    const editBtn = document.getElementById('editSqlHistoryBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearSqlHistory);
    if (editBtn) editBtn.addEventListener('click', openEditHistoryModal);

    const modal = document.getElementById('historyModal');
    const saveBtn = document.getElementById('historySaveBtn');
    const cancelBtn = document.getElementById('historyCancelBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveEditedHistory);
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditHistoryModal);
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) closeEditHistoryModal();
    });
}

// Run init now if DOM is ready; otherwise wait for DOMContentLoaded
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
    else if (/^(INTEGER|SMALLINT|BIGINT|TINYINT)$/i.test(col.type))
        typeStr += length ? `(${length})` : '';
    else if (/^(CHAR|VARCHAR|GRAPHIC|VARGRAPHIC|CLOB|BLOB|DBCLOB|XML|UTF8_CHAR|WCHAR|WVARCHAR|WLONGVARCHAR)$/i.test(col.type))
        typeStr += length ? `(${length})` : '';

    let colhdr = (col.colhdr || col.name).replace(/\s+/g, ' ').trim();
    return `Name: ${col.name}\nType: ${typeStr}\nNullable: ${col.allownull}\nLabel: ${colhdr}`;
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
function getSqlStatementAtCursor(input, cursorPos) {
    // Find start
    let inSingle = false, inDouble = false;
    let start = 0;
    for (let i = cursorPos - 1; i >= 0; i--) {
        const c = input[i];
        if (c === "'" && !inDouble) inSingle = !inSingle;
        else if (c === '"' && !inSingle) inDouble = !inDouble;
        else if (c === ';' && !inSingle && !inDouble) { start = i + 1; break; }
    }
    // Find end
    inSingle = false; inDouble = false;
    let end = input.length;
    for (let i = cursorPos; i < input.length; i++) {
        const c = input[i];
        if (c === "'" && !inDouble) inSingle = !inSingle;
        else if (c === '"' && !inSingle) inDouble = !inDouble;
        else if (c === ';' && !inSingle && !inDouble) { end = i + 1; break; }
    }
    let stmt = input.slice(start, end).trim();
    // Remove trailing semicolon for cleaner UX
    if (stmt.endsWith(';')) stmt = stmt.slice(0, -1).trim();
    return stmt;
}

async function handleSqlSubmit(e) {
    e.preventDefault();
    const textarea = document.getElementById('sqlInput');
    const input = textarea.value;
    const cursor = textarea.selectionStart;
    const errorDiv = document.getElementById('error');
    const resultsDiv = document.getElementById('results');
    const copyTableBtn = document.getElementById('copyTableBtn');

    errorDiv.textContent = 'Running your request...';
    errorDiv.style.background = 'none';
    errorDiv.style.color = '#008800'; // dark 5250 green
    resultsDiv.innerHTML = '';
    copyTableBtn.classList.add('is-hidden');

    // Get the statement at the cursor
    const query = getSqlStatementAtCursor(input, cursor);
    try {
        const url = `/db2json?q=${encodeURIComponent(query)}&v=${Date.now()}`;
        const response = await fetch(url);
    errorDiv.textContent = 'Loading resultSet...';
    errorDiv.style.background = 'none';
    errorDiv.style.color = '#008800'; // dark 5250 green
        let text = await response.text();

        if (text.startsWith('%')) text = text.substring(1);
        if (text.endsWith('%')) text = text.slice(0, -1);

        const json = JSON.parse(text);

        if (json.error) {
            errorDiv.textContent = `SQLSTATE: ${json.error.sqlstate || 'ERROR'} - ${json.error.msgtext || 'An error occurred.'}`;
            return;
        }

        // Save to history
        saveSqlToHistory(query);
        populateSqlHistoryDropdown();

        renderTable(json, resultsDiv);
    errorDiv.textContent = '';  // remove loading resultset message
    errorDiv.style.background = 'none';
    errorDiv.style.color = '#B71C1C'; // revert to red text
        copyTableBtn.classList.remove('is-hidden');
        copyTableBtn.onclick = () => copyTableToClipboard(resultsDiv);
    } catch (err) {
        errorDiv.textContent = err.message || 'Error running query.';
        errorDiv.style.background = 'none';
        errorDiv.style.color = '#B71C1C'; // revert to red text
    }
}

function renderTable(json, resultsDiv) {
    let columns = [], rows = [], tblname = '', libname = '', colMeta = null;
    const copyTableBtn = document.getElementById('copyTableBtn');

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
        if (copyTableBtn) copyTableBtn.classList.add('is-hidden');
        return;
    }
    if (copyTableBtn) copyTableBtn.classList.remove('is-hidden');

    let fontSize = '1em';
    if (columns.length > 10 && columns.length <= 20) fontSize = '0.9em';
    else if (columns.length > 20 && columns.length <= 30) fontSize = '0.8em';
    else if (columns.length > 30) fontSize = '0.7em';
    resultsDiv.style.setProperty('--table-font-size', fontSize);

    let html = '<div class="scroll-table-wrapper">';
    html += '<table class="scroll-table"><colgroup></colgroup><thead><tr>';

    const isRightAlignType = t => /^(DECIMAL|DEC|NUMERIC|DECFLOAT|ZONED|INTEGER|SMALLINT|BIGINT|TINYINT|FLOAT|REAL|DOUBLE|DATE|TIME|TIMESTAMP)$/i.test(t);

    if (colMeta) {
        for (const col of colMeta) {
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
            let thClass = isRightAlignType(col.type) ? ' class="right"' : '';
            html += `<th${thClass} title="${thTitle.replace(/"/g, '&quot;')}">${hdr}</th>`;
        }
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
            // Always use colMeta (from attr) for type, as in thead
            let tdClass = '';
            if (colMeta && colMeta[colIdx] && isRightAlignType(colMeta[colIdx].type)) {
                tdClass = ' class="right"';
            }
            // Extract the cell data for this row/column
            const cellData = row[colName] ?? '';
            // Escape the cell data for HTML safety
            const safeCellData = escapeHTML(cellData);
            html += `<td${tdClass}>${safeCellData}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody>';

    html += `<tfoot><tr><td colspan="${columns.length}" class="table-footer-info"><b>Rows: ${rows.length} &nbsp; &nbsp; Columns: ${columns.length}`;
    if (tblname) html += ` &nbsp; &nbsp; Table: ${tblname}`;
    if (libname) html += ` &nbsp; &nbsp; Library: ${libname}`;
    html += '</b></td></tr></tfoot>';
    html += '</table></div>';

    resultsDiv.innerHTML = html;
    // Debug: Log the generated HTML to check for <tfoot>
    console.log('Generated table HTML:', html);
    // Wait for DOM update before measuring and setting max-height
    window.requestAnimationFrame(() => {
        adjustTableMaxHeight(resultsDiv);
        syncColWidths(resultsDiv);
    });

    // Remove any previous resize event to avoid duplicates, then set a fresh one
    if (window._db2jsonResizeHandler) {
        window.removeEventListener('resize', window._db2jsonResizeHandler);
    }
    window._db2jsonResizeHandler = () => adjustTableMaxHeight(resultsDiv);
    window.addEventListener('resize', window._db2jsonResizeHandler);
}

function copyTableToClipboard(resultsDiv) {
    const table = resultsDiv.querySelector('table');
    if (!table) return;

    let tsv = '';
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());
    tsv += headers.join('\t') + '\n';

    table.querySelectorAll('tbody tr').forEach(tr => {
        const cells = Array.from(tr.children).map(td => (td.innerText ?? '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());
        tsv += cells.join('\t') + '\n';
    });

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(tsv).then(() => feedbackCopySuccess());
    } else {
        fallbackCopy(tsv);
    }
}

function feedbackCopySuccess() {
    const btn = document.getElementById('copyTableBtn');
    btn.innerText = 'Copied!';
    setTimeout(() => { btn.innerText = 'Copy Table'; }, 1200);
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    feedbackCopySuccess();
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
    const table = resultsDiv.querySelector('.scroll-table');
    if (table) {
        const headerCells = table.querySelectorAll('thead th');
        const maxColWidthCh = 150;
        let colWidths = [];

        headerCells.forEach((th, colIdx) => {
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

            table.querySelectorAll('tbody tr').forEach(tr => {
                const td = tr.children[colIdx];
                if (td) {
                    const cellLen = (td.textContent || '').trim().length;
                    if (cellLen > maxWidthCh) maxWidthCh = cellLen;
                }
            });

            if (maxWidthCh > maxColWidthCh) maxWidthCh = maxColWidthCh;

            // If numeric, don’t let the column balloon too wide
            if (isNumeric) {
                if (maxWidthCh > 20) maxWidthCh = 20;
                maxWidthCh += 2; // add a little extra space for right alignment
            }
            colWidths.push(maxWidthCh);
        });

        let colgroupHtml = '';
        for (let w of colWidths) {
            // colgroupHtml += `<col style="min-width: ${w}ch; max-width: ${w}ch;">`;
            colgroupHtml += `<col style="min-width: ${w}ch;">`;
        }
        table.querySelector('colgroup').innerHTML = colgroupHtml;
    }
}

function copySqlInput() {
    const textarea = document.getElementById('sqlInput');
    // Guard: do nothing if empty
    if (!textarea || (textarea.value || '').trim().length === 0) return;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const wasFocused = document.activeElement === textarea;
    textarea.select();
    document.execCommand('copy');
    if (wasFocused) {
        textarea.setSelectionRange(selectionStart, selectionEnd);
        textarea.focus();
    }

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
    const textarea = document.getElementById('sqlInput');
    if (!textarea) return;

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

    textarea.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
        menu.style.display = 'block';
    });

    menu.addEventListener('contextmenu', e => e.preventDefault());

    menu.querySelector('#formatSqlMenuItem').addEventListener('click', function() {
        menu.style.display = 'none';
        // Get the statement at the cursor
        const input = textarea.value;
        const cursor = textarea.selectionStart;
        const stmt = getSqlStatementAtCursor(input, cursor);
        if (!stmt) return;
        // Format it
        if (typeof formatSQL !== 'function') {
            alert('SQL formatter not loaded.');
            return;
        }
        const formatted = formatSQL(stmt);
        // Replace the statement in the textarea
        // Find statement bounds
        let inSingle = false, inDouble = false;
        let start = 0;
        for (let i = cursor - 1; i >= 0; i--) {
            const c = input[i];
            if (c === "'" && !inDouble) inSingle = !inSingle;
            else if (c === '"' && !inSingle) inDouble = !inDouble;
            else if (c === ';' && !inSingle && !inDouble) { start = i + 1; break; }
        }
        inSingle = false; inDouble = false;
        let end = input.length;
        for (let i = cursor; i < input.length; i++) {
            const c = input[i];
            if (c === "'" && !inDouble) inSingle = !inSingle;
            else if (c === '"' && !inSingle) inDouble = !inDouble;
            else if (c === ';' && !inSingle && !inDouble) { end = i + 1; break; }
        }
        textarea.value = input.slice(0, start) + formatted + input.slice(end);
        // Optionally, move cursor to end of formatted statement
        textarea.selectionStart = textarea.selectionEnd = start + formatted.length;
        textarea.focus();
    });
})();



function getSqlHistory() {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    // Happy path: valid JSON array
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === 'string') return parsed ? [parsed] : [];
    } catch (_) {
        // fall through to legacy parsing
    }
    // Legacy/self-heal: attempt to split raw string into statements
    let arr = [];
    if (typeof raw === 'string') {
        // Prefer semicolon-based splitting to match editor and textarea behavior
        try {
            arr = splitSqlStatementsBySemicolon(raw)
                .map(s => s.replace(/;\s*$/,'').trim())
                .filter(Boolean);
        } catch (_) { arr = []; }
        // Fallback to splitting on blank lines if semicolons weren't present
        if (arr.length === 0) {
            arr = raw.replace(/\r\n/g,'\n')
                .split(/\n\s*\n+/)
                .map(s => s.trim())
                .filter(Boolean);
        }
    }
    // Persist back as proper JSON array for future loads
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); } catch (_) {}
    return arr;
}

function saveSqlToHistory(stmt) {
    if (!stmt || typeof stmt !== 'string') return;
    let history = getSqlHistory();
    // Avoid saving if same as last
    if (history.length > 0 && history[0] === stmt) return;
    history.unshift(stmt);
    if (history.length > MAX_SQL_HISTORY) history = history.slice(0, MAX_SQL_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function populateSqlHistoryDropdown() {
    const dropdown = document.getElementById('sqlHistoryDropdown');
    const actions = document.querySelector('.history-actions');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    const history = getSqlHistory();
    if (history.length === 0) {
        // Hide dropdown when no history
        dropdown.style.display = 'none';
        // Keep actions visible: enable Edit, disable Clear
        if (actions) {
            const edit = actions.querySelector('#editSqlHistoryBtn');
            const clear = actions.querySelector('#clearSqlHistoryBtn');
            if (edit) edit.disabled = false;
            if (clear) clear.disabled = true;
        }
        return;
    }
    // Show dropdown when there is history
    dropdown.style.display = '';
    if (actions) {
        const edit = actions.querySelector('#editSqlHistoryBtn');
        const clear = actions.querySelector('#clearSqlHistoryBtn');
        if (edit) edit.disabled = false;
        if (clear) clear.disabled = false;
    }
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- Previous SQL statements --';
    dropdown.appendChild(defaultOpt);
    // Estimate max chars based on dropdown width and font size
    let maxChars = 80;
    if (dropdown) {
        // Get computed font size in pixels
        const style = window.getComputedStyle(dropdown);
        const fontSizePx = parseFloat(style.fontSize) || 14;
        // Estimate average char width (monospace: 0.6, proportional: 0.5)
        const avgCharWidth = fontSizePx * 0.55;
        // Use dropdown width (in px) to estimate
        const widthPx = dropdown.offsetWidth || 400;
        maxChars = Math.floor(widthPx / avgCharWidth);
        if (maxChars < 20) maxChars = 20;
        if (maxChars > 400) maxChars = 400;
    }
    for (const stmt of history) {
        const opt = document.createElement('option');
        opt.value = stmt;
        const label = (stmt || '').replace(/\s+/g, ' ').trim();
        if (label.length > maxChars) {
            opt.textContent = label.slice(0, maxChars - 3) + '...';
        } else {
            opt.textContent = label;
        }
        dropdown.appendChild(opt);
    }

    // --- Resize observer for dropdown ---
    if (!dropdown._resizeObserverAttached) {
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                // Rerender dropdown options on resize
                populateSqlHistoryDropdown();
            });
            ro.observe(dropdown);
            dropdown._resizeObserverAttached = true;
        } else {
            // Fallback: listen for window resize if ResizeObserver not available
            if (!dropdown._windowResizeHandlerAttached) {
                window.addEventListener('resize', populateSqlHistoryDropdown);
                dropdown._windowResizeHandlerAttached = true;
            }
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
    // Join statements with a semicolon + blank line to reflect semicolon separation
    ta.value = history.map(s => s.endsWith(';') ? s : s + ';').join('\n\n');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'block';
    ta.focus();
    // Allow ESC to close while modal is open
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
    const ta = document.getElementById('historyTextarea');
    if (!modal || !ta) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
}

function saveEditedHistory() {
    const ta = document.getElementById('historyTextarea');
    if (!ta) return;
    // Split on unquoted semicolons to preserve multi-line statements
    let blocks = splitSqlStatementsBySemicolon(ta.value.replace(/\r\n/g, '\n'))
        .map(s => s.replace(/;\s*$/,'').trim())
        .filter(Boolean);
    if (blocks.length > MAX_SQL_HISTORY) blocks = blocks.slice(0, MAX_SQL_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(blocks));
    closeEditHistoryModal();
    populateSqlHistoryDropdown();
}

// Split by semicolons that are not inside single or double quotes
function splitSqlStatementsBySemicolon(input) {
    const out = [];
    let inSingle = false, inDouble = false;
    let start = 0;
    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (c === "'" && !inDouble) {
            inSingle = !inSingle;
        } else if (c === '"' && !inSingle) {
            inDouble = !inDouble;
        } else if (c === ';' && !inSingle && !inDouble) {
            const part = input.slice(start, i).trim();
            if (part) out.push(part);
            start = i + 1;
        }
    }
    const last = input.slice(start).trim();
    if (last) out.push(last);
    return out;
}