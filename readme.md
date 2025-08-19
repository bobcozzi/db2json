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
## Build Routine:
1. Create a library on the IBM i server named DB2JSON
2. Create a source file CRTSRCPFM DB2JSON/QCSRC RCDLEN(112)
3. Create a source file CRTSRCPFM DB2JSON/H RCDLEN(112)
4. Create a source file CRTSRCPFM DB2JSON/QCLSRC RCDLEN(112)
5. Upload the following source members:
    a.  db2json.cpp -> QCLSRC
    b.  db2json.h -> H
    c.  build.clle -> QCLSRC
6. Compile the `BUILD` CL program:
`CRTBNDCL PGM(DB2JSON/BUILD) SRCFILE(DB2JSON/QCLSRC) SRCMBR(BUILD)`
7. Then call the build routine to build the DB2JSON.PGM program.
`CALL DB2JSON/BUILD`
- At this point the DB2JSON program is created. If you would like to run a test via 5250 green screen (Command Entry) then compile the DEMO CL program and call it like this:
`call db2json/demo`
You can also run the dmeo program in debug mode to easily see what is going on (assuming you know C++). To do that just:
`call db2json/debug`

## Best Test Case
The best way to try out the DB2JSON capabilities is with a web CGI request. The provided db2json.html file can be used along with the supporting javascript files and style sheet to run the demo app. The demo app is a IBM ACS RUN SQL Script style interface but completely web-driven. No java not compiled .exe just HTML/JS/CSS and the CGI program DB2JSON in the library DB2JSON. Be sure to add the above httpd.conf statement to allow it to work on your local web server.
Db2JSON can be used on the web as a CGI program or from the command entry/CL program environment. You can use it in CL to create JSON files on the IFS directly from just about any SQL query statement (note: "query statements" means SELECT, VALUES, or common table expression (CTE)).

## License
MIT
