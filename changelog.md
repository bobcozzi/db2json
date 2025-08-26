# Changelog

## 0.0.3 - UI/UX Updates - 25 AUGUST 2025
- SQL Editor resizing:
  - The SQL input area resizes both horizontally and vertically using your mouse.
  - The SQL input area responds fluidly to browser window resizing.
- Copy SQL button:
  - You can copy the SQL statement(s) in the SQL input area to the clipboard using the provided Copy button. (Top-right corner)
- Copy ResultSet to Clipboard/Excel:
  - You can copy the result set table's data to the clipboard by pressing the "Copy Table" button. This places the contents into the Clipboard so it can be pasted into spreadsheet program such as Excel, Docs, and others.
- SQL Statement History:
  - SQL statement History is now available via a dropdown. Select any previously run SQL statement to insert it into the SQL input area.
  - The SQL statements are saved to the browsers local storage.
  - The last (up to) 512 SQl statements are saved for easy recall.
  - Users may edit they SQL statement History or Clear the History via the two Edit/Clear buttons.
- Submit mode is not POST by Default:
  - To hide the SQL CGI requests, we moved from the default GET option to POST.  Users (developers) may modify it back to GET is that is the preference in your shop.
- Formatting SQL Statements:
  - A context menu “Format SQL” has been added to improve the layout of the SQL statement in the editor window.
  - One or more statements may be formatted at the same time.
- Multiple SQL Statements:
  - You may specify multiple SQL statements in the SQL Editor window (SQL input area) by separating the SQL statements with a semicolon. When a semicolon is used, the "Run SQL" button searches the editor box for the start and end location for the statement in which the cursor is located at the time it is pressed.
  - We currently do not support running more than one statement per "Run SQL" request.
- The DB2JSON.cpp file has been staged to support SQL syntax checking in the future. You may see references to the QSQCHKS API in it, but it is not yet implemented.

## 0.0.2 - Minor pdate - 21 AUGUST 2025
- Added support for both GET and POST CGI Form request methods.
- Added support for the following 2 POST encoding methods: `multipart-form` and `x-www-form-urlencoded`
- The new default for submitting the SQL requst is: `method="post" enctype="multipart/form-data"`

## 0.0.1 - Initial Release - 19 AUGUST 2025
- Project initialized as db2json.
- Standardized package.json for GitHub publishing.
- Initial project structure with scripts, CSS, and JavaScript modules.
