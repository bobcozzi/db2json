# db2json User Guide

## Overview

The **db2json** HTML page provides a simple interface for entering, editing, and running SQL statements against IBM i databases. It features syntax checking, error highlighting, statement history, and a toolbar for file and clipboard operations. The results of SELECT, CTE, or VALUES (commonly referred to as "query statements") are display in a scrolling table. That resultSet table has a copy button that copies the entire contents to the Clipboard. You can consider this demonstration app as a `lightweight RUN SQL`.

## Features

### SQL Input Area

- Enter or paste your SQL statements in the main textarea.
- Multi-line statements are supported.
- Syntax errors are automatically detected and highlighted.

### Syntax Checking & Error Messages

- When you submit SQL, the page checks for syntax errors.
- If an error is found:
  - The error message appears above the results area.
  - The problematic token or character is highlighted in the input.
  - SQLSTATE and detailed error info are shown for non-syntax errors.

### Statement History

- The history dropdown lets you quickly recall previous SQL statements.
- Use the **Edit History** button to manage or clean up your saved statements.
- **Clear History** removes all saved SQL statements from your browser.

### Toolbar Buttons

- **Open**: Load a SQL file from your computer.
  - On Chrome/Edge over HTTPS or localhost, you can re-save to the same file.
  - On other browsers, or if not secure, use "Save As" to export.
- **Save**: Save changes back to the opened file.
  - Only available on Chrome/Edge over HTTPS or localhost, and after opening a file via the picker.
- **Save As**: Export the current SQL to a new file.
  - Always available; prompts for a filename.
  - In some cases this saves the SQL source to a file in the browser's downloads folder.
- **Copy**: Copy the current SQL to your clipboard.
  - Shows a checkmark when successful.

#### Limitations

- **Save** is disabled unless you open a file using the browser's file picker in a secure context (HTTPS or localhost).
- On Firefox, Safari, or insecure contexts, use **Save As** instead.
- A notification will appear if Save is unavailable, explaining why.

---

## Error Handling

- Syntax errors are highlighted directly in the SQL input.
- Non-syntax errors display SQLSTATE and a descriptive message.
- The input caret moves to the error location for easy correction.

---

## Tips

- For best results, use Chrome or Edge over HTTPS or http://localhost.
- Use the history dropdown to quickly switch between recent statements.
- If you see a toast notification about Save limitations, use "Save As" to export your SQL.