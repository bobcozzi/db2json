# db2json

A tool to convert DB2 data to JSON format.

## Overview
- Converts the output from any SQL query statement over an IBM i DB2 for i database into JSON format.
- Output can be directed to the web via standare out (stdout or std::cout) or to the IFS.


## Getting Started
1. Clone the repository.
2. Copy the .html, .css, and .js files to your own HTTP server location.
3. launch the db2json.html page to run a test case.

## HTTP Configuration
- Add the following (customized to your shop) to your httpd.conf file of your web server.
- Assume for example, you webserver is named "cozziweb". Then do the following:
1. Copy db2json.js to /www/cozziweb/docs/js/db2json.js
2. Copy db2json_sqlFmt.js to /www/cozziweb/docs/js/db2json_sqlFmt.js
3. Copy db2json_sqlHist.js to to /www/cozziweb/docs/js/db2json_sqlHist.js
4. Copy db2json.css to to /www/cozziweb/docs/css/db2json.css
5. Copy db2json.html to to /www/cozziweb/docs/db2json.html
6. Add the following to your HTTPD.CONF file for your webserver
```
AliasMatch   ^/db2json/(.*)   /www/<cozziweb>/docs/db2json/$1
ScriptAlias  /db2json  /qsys.lib/db2json.lib/db2json.pgm
<Location /db2json>
    AuthType Basic
    AuthName "Sign in with your IBM i profile"
    UserID %%CLIENT%%
    Require valid-user
    PasswdFile %%SYSTEM%%
    Options +ExecCGI +Includes
</Location>
```

## Build Routine
1. Create a library on the IBM i server named `DB2JSON`.
2. Create a source file: `CRTSRCPFM DB2JSON/QCSRC RCDLEN(112)`
3. Create a source file: `CRTSRCPFM DB2JSON/H RCDLEN(112)`
4. Create a source file: `CRTSRCPFM DB2JSON/QCLSRC RCDLEN(112)`
5. Upload the following source members:
     - `db2json.cpp` → `QCSRC`
     - `db2json.h` → `H`
     - `build.clle` → `QCLSRC`
6. Compile the `BUILD` CL program:
    ```
    CRTBNDCL PGM(DB2JSON/BUILD) SRCFILE(DB2JSON/QCLSRC) SRCMBR(BUILD)
    ```
7. Call the build routine to create the `DB2JSON.PGM` program:
    ```
    CALL DB2JSON/BUILD
    ```

At this point, the `DB2JSON` program is created. If you would like to run a test via 5250 green screen (Command Entry), compile the `DEMO` CL program and call it like this:
    ```
    CALL DB2JSON/DEMO
    ```
You can also run the demo program in debug mode to easily see what is going on (assuming you know C++):
    ```
    CALL DB2JSON/DEBUG
    ```


## Best Test Case

The best way to try out DB2JSON is with a web CGI request. Use the provided `db2json.html` file along with the supporting JavaScript and CSS files to run the demo app. This demo web page offers a simple interface, similar to IBM ACS RUN SQL Scripts, but is entirely web-driven—no Java or PC programs required, just HTML, JS, CSS, and the host CGI program `DB2JSON` in the `DB2JSON` library.

**To test via the web:**
- Ensure your HTTP server is configured as described above.
- Open `db2json.html` in your browser. You can run SQL queries (SELECT, VALUES, or CTE) and see the JSON output directly in the browser.

**To test via CL/5250:**
- Compile and call the `DEMO` CL program included in `QCLSRC`. This program calls `DB2JSON` from CL and writes the output of `QIWS/QCUSTCDT` to the IFS as JSON.
- The demo program also writes a DSPF command to your job, so you can use F9 to retrieve that command and then instantly view your JSON result file.

**Usage notes:**
- DB2JSON can be used as a CGI program on the web or from a CL/Command Entry environment.
- You can use it in CL program that creates JSON files on the IFS from almost any SQL query statement (SELECT, VALUES, or CTE), or send the JSON to the web via CGI output so your web pages can process the data from IBM i Db2 for i files.

## License
MIT
