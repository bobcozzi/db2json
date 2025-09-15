# db2json Query (Db2QUERY) Web App User Guide

## Overview

The **DB2Query** Web app is a sample web app that lets you experience the DB2JSON program's capabilities. In fact, you might consider it to be an HTML-based, lightweight `RUN SQL Scripts`.
It is an interface for entering, editing, and running SQL statements against IBM i databases. It features syntax checking, error highlighting, statement history, and a toolbar for file and clipboard operations. The results of SELECT, CTE, or VALUES (commonly referred to as “query statements”) are displayed in a scrolling table. That result set table has a copy button that copies the entire contents to the clipboard. This is a demonstration of how to use the DB2JSON C++ program that runs on your IBM i server to convert SQL query statements into JSON. While it is just an example, it is a very robust application.

### Requirements
- An IBM i server running V7R2 or later.
- The open source DB2JSON program compiled on your IBM i server. This is used as both the JSON generator and the CGI processor.
- The IBM HTTP Server Powered by Apache with the configurations outlined in our [README file](https://github.com/bobcozzi/db2json#readme)

## Features

### SQL Input Area

- Enter or paste your SQL statements in the main textarea.
- Multi-line statements are supported.
- Separate individual statements with a semicolon.
- Syntax errors are automatically detected and highlighted.

### Syntax Checking & Error Messages

- When you Run SQL, the page checks for syntax errors.
- If an error is found:
  - The error message appears below the SQL statement input area.
  - If detected, the problematic token or character is highlighted in the input area.
  - SQLSTATE and detailed error info are shown for non-syntax errors.

### Statement History

Your SQL statement history is stored locally in your browser and can be used to retrieve SQL statements that were previously run. We set an arbitrary limit of 512 SQL statements. You can change that in the code if you prefer. To access the history, use the history dropdown and select from your previously run statements. You can also edit statement history and clear the history at any time.

- The history dropdown lets you quickly recall previous SQL statements.
- Use the **Edit History** button to manage or clean up your saved statements.
- Use the **Clear History** button to remove all saved SQL statements from your browser (a confirmation dialog prompts you to confirm).
- De-Dup SQL Statement History.
  - Only unique statements are saved to the SQL statement history. That way if you run the same statement multiples times, it is only logged to your history file, once. However in some rare cases duplicates may occur. When that happens, if you prefer to remove those duplicates, use the "Remove Duplicates" button on the Edit History dialog. This takes effect immediately and is non-reverseable. But as mentioned, it is highly unlikely that this will ever be needed.

### Open/Save SQL Statements from Local File

The toolbar near the top‑right of the SQL statement input provides Open, Save, Save As, and Copy functionality.

- Open
  - Chrome / Microsoft Edge over HTTPS or http://localhost: uses the file picker and retains a file handle so you can Save back to the same file.
  - Other browsers or non‑secure contexts: uses a fallback file chooser (no persistent handle). You can open files, but Save will be disabled; use Save As.

- Save
  - Enabled only after you opened a file via the picker in Chrome/Edge over HTTPS or http://localhost (i.e., when a file handle is available).
  - Writes changes back to the same file without prompting.

- Save As
  - Chrome / Microsoft Edge over HTTPS or http://localhost: shows the native Save dialog (you choose folder and filename).
  - Other browsers or non‑secure contexts: triggers a download. Depending on browser settings, you may be prompted for the filename and location, or it will save to your Downloads folder.

- Copy
  - Copies the SQL statement input area to the clipboard and shows a brief checkmark confirmation.

### Copy Results Table

- A Copy button appears in the results area when a query returns rows.
- Clicking it copies the entire contents of the results table to your clipboard (suitable for pasting into a spreadsheet or editor).
- A brief checkmark confirmation appears on success; if copying is blocked, a toast notification explains the issue and suggests retrying.
- Very large results may take a moment to copy depending on your browser and device.

### ResultSet Stats

- When a resultSet table is generated, the number of rows returned by the query is shown along with the number of columns returned. An example might look like `Rows: 5382  Columns: 38`. This status bar appears immediately to the left of the Copy ResultSet table button.

### Limitations

- Save is disabled unless you open a file using the browser’s file picker in a secure context (HTTPS or http://localhost in Chrome/Edge).
- On Firefox, Safari, or insecure contexts, use Save As instead.
- A notification will appear if Save is unavailable, explaining why.

### Error Handling
- Syntax errors are highlighted directly in the SQL input.
- Non-syntax errors display SQLSTATE and a descriptive message.
- The input caret moves to the syntax error location for easy correction.

## Tips

- For best results, use Chrome or Edge over HTTPS or at http://localhost.
- Use the history dropdown to quickly switch between recent statements.
- If you see a toast notification about Save limitations, use “Save As” to export your SQL.