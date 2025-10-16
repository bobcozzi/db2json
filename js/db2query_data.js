function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
function setResultsMeta({ rowsCount, colsCount, tblname, libname }) {
    const meta = document.getElementById('resultsMeta');
    if (!meta) return;
    let txt = `Rows: ${rowsCount}    Columns: ${colsCount}`;
    if (tblname) txt += `    Table: ${tblname}`;
    if (libname) txt += `    Library: ${libname}`;
    meta.innerHTML = `<b>${escapeHTML(txt)}</b>`;
    meta.title = txt;
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
            html += `<td${tdClassAttr} title="${escapeHTML(String(cellData))}">${safeCellData}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    // Inject into an existing wrapper (preserve wrapper DOM)
    const wrapper = resultsDiv.querySelector('.scroll-table-wrapper') || (() => {
        const d = document.createElement('div');
        d.className = 'scroll-table-wrapper';
        resultsDiv.innerHTML = '';
        resultsDiv.appendChild(d);
        return d;
    })();
    wrapper.innerHTML = html;

    // Cap wrapper height from its current top to viewport bottom
    setWrapperHeight(wrapper, 12);

    const tableEl = wrapper.querySelector('#resultSetTable');

    // DataTable integration (Simple-DataTables)
    if (tableEl && window.simpleDatatables?.DataTable) {
        // Remove previous instance if any
        if (wrapper._datatable) {
            wrapper._datatable.destroy();
            wrapper._datatable = null;
        }
        wrapper._datatable = new window.simpleDatatables.DataTable(tableEl, {
            searchable: true,
            fixedHeight: false,
            perPage: 25,
            perPageSelect: [10, 15, 20, 25, 50, 100, 250],
            labels: {
                placeholder: "Search...",
                perPage: "rows per page",
                noRows: "No rows found",
                info: "Showing {start} to {end} of {rows} rows"
            }
        });
    }
    setResultsMeta({
        rowsCount: rows.length,
        colsCount: columns.length,
        tblname,
        libname
    });
}

