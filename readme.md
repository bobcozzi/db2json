
# db2json

A tool to convert DB2 data to JSON format.

## Overview
- Converts the output from any SQL query statement over an IBM i DB2 for i database into JSON format.
- Output can be directed to the web via standard out (stdout or std::cout) or to an IFS file.


## Getting Started
1. Clone the repository.
2. Copy the .html, .css, and .js files to your own HTTP server location.
3. launch the db2json.html page to run a test case. (Okay, this HTML is really a fully enabled SQL query app)

For a description of the JSON that is produced look here: [JSON Structure Documentation](jsondocs.md)

## HTTP Configuration
- Add the following (after customizing for to your shop) to your httpd.conf file of your IBM i HTTP web server.
- Assume for example, that your webserver is named "apachedft". Then do the following:
1. Copy db2json.js to /www/apachedft/docs/js/db2json.js
2. Copy db2json_sqlFmt.js to /www/apachedft/docs/js/db2json_sqlFmt.js
3. Copy db2json_sqlHist.js to to /www/apachedft/docs/js/db2json_sqlHist.js
4. Copy db2json.css to to /www/apachedft/docs/css/db2json.css
5. Copy db2json.html to to /www/apachedft/docs/db2json.html
6. Add the following to your HTTPD.CONF file. If using the default instance, then that file is located at: `/www/apachedft/conf/httpd.conf` and may be edited by entering this Command:
   `edtf /www/apachedft/conf/httpd.conf`

```
AliasMatch  ^/db2json/(.*)   /www/apachedft/docs/db2json/$1
ScriptAlias  /db2json        /qsys.lib/db2json.lib/db2json.pgm
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
2. Create a source file: `CRTSRCPF DB2JSON/QCSRC  RCDLEN(112)`
3. Create a source file: `CRTSRCPF DB2JSON/H      RCDLEN(112)`
4. Create a source file: `CRTSRCPF DB2JSON/QCLSRC RCDLEN(112)`
5. Upload the following source members:
     - `db2json.cpp` → `QCSRC`
     - `db2json.h` → `H`
     - `build.clle` → `QCLSRC`
6. Compile the `BUILD` CL program:
    ```
    CRTBNDCL PGM(DB2JSON/BUILD) SRCFILE(DB2JSON/QCLSRC) SRCMBR(BUILD)
    ```
7. Call the build routine to easily compile the `DB2JSON.PGM` program:
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
- Open `db2json.html` in your browser. You can run SQL queries (SELECT, VALUES, or CTE) and see the JSON output formatted nicely in the browser.

**To test via CL/5250:**
- Compile and call the `DEMO` CL program included in `QCLSRC`. This program calls `DB2JSON` from CL and writes the output of `QIWS/QCUSTCDT` to the IFS as JSON.
- The demo program also writes a DSPF command to your job, so you can use F9 to retrieve that command and then instantly view your JSON result file.

**Usage notes:**
- DB2JSON can be used as a CGI program on the web or from a CL/Command Entry environment.
- You can use it in CL program that creates JSON files on the IFS from almost any SQL query statement (SELECT, VALUES, or CTE), or send the JSON to the web via CGI output so your web pages can process the data from IBM i Db2 for i files.

## Call-level usage (non-CGI)

When the CGI environment is not detected, DB2JSON runs in call-level mode and writes the JSON output to an IFS file.

Example CL call:

```
CALL       PGM(DB2JSON/DB2JSON) PARM(&SQL &MYOUTPUT '*REPLACE')
```

To run DB2JSON in batch or interactively, you need to provide up to 3 parameters. The first two parameters are required.  Note that in CGI/Web invocations of the program, no parameters are passed since communications is done via the CGI environment's stdin, stdout and environment variables.

**Parameters (in order)**:

1) SQL statement to run
- A character string containing a valid SQL statement (SELECT, VALUES, CTE, etc.).
For call-level interfaces this is a TYPE(*CHAR) LEN(640) parameter (in CL) or a CHAR(640) CONST parameter in RPG IV. Note in CGI/Web there is no practical limit to the SQL statement length. You can increase this for your shop by adjusting the value of the `MAX_SQL_LEN` variable in the `DB2JSON.CPP` source member before creating the *PGM object.

2) IFS output file
- Fully qualified IFS path to the JSON output file (for example: '/tmp/outdata.json').
For call-level interfaces this is a TYPE(*CHAR) LEN(640) parameter (in CL) or a CHAR(640) CONST parameter in RPG IV. Note in CGI/Web This parameter does not apply. You can increase this for your shop by adjusting the value of the `MAX_PATH_LEN` variable in the `DB2JSON.CPP` source member before creating the *PGM object.

3) Replace/Append option (optional) DEFAUT(*APPEND/*ADD)
- Up to the first two characters of the paramete value are used; case-insensitive.
- If the first character is `*` or `-` then the 2nd character must contain the replace/append flag. If the first character is not `*` or `-` then the 1st character must contain the replace/append flag.
- The replace/append flag must be:
- For REPLACE the flag can be `r`, `t`, or `y`.
- For APPEND (add) the flag can be `a`, `n` or unspecified. This is the default.
If the file does not exist, it is created with CCSID(1208) UTF‑8.

## Calling from RPG IV
Here is the prototype and example calling convension to call DB2JSON from RPG IV:
```
  dcl-pr db2json extpgm('DB2JSON/DB2JSON');
     sqlStmt char(640) Const;
     ifs_OutFile char(640) Const;
     replace  char(16) Const OPTIONS(*NOPASS);
  end-pr;

  dcl-s mySQL varchar(640);
  dcl-s ifsFile varchar(640);

   // Call it with hard-coded/literals:
  db2Json('Select * from qiws.qcustcdt' :
          '/home/cozzi/custmast.json' :
          '-r');

     // Or call it with variables
   mySQL = 'select * from qiws.qcustcdt ORDER by BALDUE DESC');
   ifsFile = '/home/CustBalances.json');
  db2Json( mySQL : ifsFile : '*REPLACE');
```

## Compatibility

**IBM i:**
- Supported on IBM i (formerly AS/400, iSeries) systems running IBM i OS version V7R1 or later. (V7R3 or later recommnded) No PTFs or special options required-—just a working IBM i C/C++ compiler. For web output the HTTP server powered by Apache is also required.

**PC/Mac/Linux:**
- The example web UI files (HTML/JS/CSS) are compatible with any contemporary PC operating system (Windows, macOS, Linux) and any modern web browser. No special requirements—just a standard web browser.

This tool is designed for classic IBM i environments and modern desktop/server platforms alike. If you can run a browser and connect to an IBM i HTTP server, you are good to go.


## License
MIT
