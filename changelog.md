# Changelog

## 0.0.10 - 15-SEPT-2025
- We now close the SQL Cursor before freeing the statement handle. We also now use AUTOCOMMIT for users who insist on using the DB2JSON.PGM to run non-query statements, such as INSERT/UPDATE/DELETE/MERGE. Also the SQL CODE is returned with the SQLSTATE when an error is detected.

## 0.0.9 - 12-SEPT-2025 -
- The SQL Statement History in the Db2 Query HTML App now avoids adding duplicate entries. Once a statement has been archived in the history log, running that statement in the future avoids adding it a second time. Previously it would avoid adding duplicate statements only when they were run consecutively. Now if the SQL statement being run has been previously logged, it is not logged.
- A new "Remove Duplicates" button has been added to the SQL Statement History dialog. Note this takes effect immediately.
- The ResultSet rows and columns message is moved to the top of the result set list, next to the Copy ResultSet button.
- The resultset table of the DB2 Query example HTML page/app now allows resizing of the table by dragging its lower righthand corner.
  - This is not supported for some reason on mobile devices, however.
- On Apple devices, the SQL input area now avoids that classic Apple "autocorrect" issue that some users were experiencing.

## 0.0.7 - 10-SEPT-2025 -
- Now when Db2JSON is run, it checks for and adds the `QIBM_CLI_MUTE_SPURIOUS_JOB_MSG=Y` environment variable. This reduces the noise produced by SQL CLI by asking it to filter excessive SQ99999 / HY010 messages from being sent to the joblog. The Job-level environment attribute `QIBM_CLI_MUTE_SPURIOUS_JOB_MSG`, when set to `Y` enables this filtering. Db2JSON now automatically creates this environment variable and sets it to `Y`. If the environment variable is not already defined it will create it. If it is already defined DB2JSON does not modify it.
- Various bug fixed.
- Renamed the db2json.html file to index.html
- Updated the notes on configuration the HTTP Server on IBM i

## 0.0.6 - 09-SEPT-2025 -
- Added new Open SQL from file, Save SQL to file and Save SQL To file as... buttons. These only work on HTTPS environments unless you are access your IBM i via the http://localhost or https://localhost link. But http://<myipaddress> will disable most of this capability.
- The Copy SQL statements to clipboard icon was relocated to our new Toolbar. No all 4 icons are in one place.
- No changes were made to the host DB2JSON.cpp source.

## 0.0.5 - 08-SEPT-2025 -
- Corrected a small issue with how ASCII to EBCDIC to ASCII was handled.
- Renamed the "Copy Table" button to "Copy ResultSet" to more clearly describe its purpose.

## 0.0.4 - 04-SEPT-2025 -
- Added INTEGER/INT to the list of datatypes that are automatically right-justified in the example DB2JSON.JS logic. (This was an oversight).
- SQL Statement syntax checking was added. Now when a statement fails syntax checking, the SQL error is displayed and the cursor is placed at the error position. If possible, the "word" at the error position is selected for highlighting purposes.
- The SQL CLIENT ID is now set to the Effective User Profile. So SQL register "CURRENT CLIENT_USERID" is now returned when requested.

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
- Submit mode is now POST by Default:
  - To hide the SQL CGI requests, we moved from the default GET option to POST.  Users (developers) may modify it back to GET is that is the preference in your shop.
- Formatting SQL Statements:
  - A context menu “Format SQL” has been added to improve the layout of the SQL statement in the editor window.
  - One or more statements may be formatted at the same time.
- Multiple SQL Statements:
  - You may specify multiple SQL statements in the SQL Editor window (SQL input area) by separating the SQL statements with a semicolon. When a semicolon is used, the "Run SQL" button searches the editor box for the start and end location for the statement in which the cursor is located at the time it is pressed.
  - We currently do not support running more than one statement per "Run SQL" request.
- The DB2JSON.cpp file has been staged to support SQL syntax checking in the future. You may see references to the QSQCHKS API in it,~~but it is not yet implemented~~. (Syntax checking has been added in v0.0.4 in September 2025).

## 0.0.2 - Minor pdate - 21 AUGUST 2025
- Added support for both GET and POST CGI Form request methods.
- Added support for two POST encoding methods: `multipart-form` and `x-www-form-urlencoded`
- The new default for submitting the SQL requst is: `method="post" enctype="multipart/form-data"`

## 0.0.1 - Initial Release - 19 AUGUST 2025
- Project initialized as db2json.
- Standardized package.json for GitHub publishing.
- Initial project structure with scripts, CSS, and JavaScript modules.
