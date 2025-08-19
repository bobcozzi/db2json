/*
 * Copyright (c) 2024, R. Cozzi, Jr.
 * All rights reserved.
 * August 2025
 *
 * This source code is licensed under the MIT License
 */


#include <cstdlib>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>


#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <QZHBCGI.h>   /* For QtmhGetEnv API */
#include <qusec.h>     /* For Qus_EC_t error code structure */

#include <fcntl.h>
#include <ifs.h>

#include <except.h>
#include <qlzareq.h>
#include <qlzarls.h>
#include <qlzartv.h>
#include <qp0ztrc.h>
#include <qp0z1170.h>
#include <leod.h>
#include <leenv.h>
#include <lecond.h>
#include <qusec.h>

#include <qmhmovpm.h>
#include <qmhrsnem.h>
#include <qmhchgem.h>
#include <QWTRTVTA.h>

#include <langinfo.h>
#include <locale.h>
#include <nl_types.h>

#include <RETTHCNT.mih>
#include <sqlcli.h> // IBM i CLI header

#include <db2json/h/xlate>

#include <unistd.h> // for write()

using namespace std;


#ifndef SQL_ATTR_INVOKING_PGM
#define SQL_ATTR_INVOKING_PGM (10037)
#endif

// Use this TOASCII define to control whether or not
// quoted literals are translated to ASCII by the compiler
// Since JSON is output in UTF-8, it is recommended to
// #define TOASCII unless you HTTP server automatically
// converts EBCDIC to ASCII.
// On V7R4 and later, they support application/json and
// properly convert JSON to ASCII (UTF-8)
// But on V7R3 and earlier, you need to use "text/json" to
// enable the auto-convert.
// If you prefer to do the EBCDIC->ASCII yourself using
// this program's iconv routines, then define TOASCII directly
// without the preprocessor conditional wrapper.
// But remember, in that context, the HTTP Content-type header
// but be sent as EBCDIC not ASCII while the JSON data itself
// does need to be converted to ASCII.
// Not there is also a runtime check for this feature later on.

#if (__OS400_TGTVRM__ <= 730)
#define TOASCII
#endif

int globalError = 0;

void excp_monitor(_INTRPT_Hndlr_Parms_T * __ptr128 exp_info)
{
     char       msgKey[4];
     char       msgTypes[4][10];
     int        msgTypeCount;
     Qus_EC_t   ec;

       // Allow this routine to be call recursively, up to twice, then bail out
       //   Pass 1, globalError = 0  exit -1
       //   Pass 2, globalError = -1 exit -99
       //   Pass 3, globalError = -99, therefore bail out using CEETREC.
     if (globalError != 0)
     {
        if (globalError == -99)
          CEETREC(NULL,NULL);
        else
          globalError = -99;
     }
     else
     {
          globalError = -1;
     }
            //            1234567890
     memcpy(msgTypes[0], "*COMP     ",10);
     memcpy(msgTypes[1], "*DIAG     ",10);
     memcpy(msgTypes[2], "*INFO     ",10);
     memcpy(msgTypes[3], "*ESCAPE   ",10);
     msgTypeCount = 4;  // 3 instead of 4 means no escape msgs are pushed.
     memset((char*)msgKey,' ',sizeof(msgKey));

     Qp0zLprintf("Db2Lite: Global exception/error handler.\n");
     Qp0zLprintf("Db2Lite: Failure see joblog for details.\n");

     memset((char*)&ec,0x00,sizeof(ec));
     ec.Bytes_Provided = sizeof(Qus_EC_t);
     QMHMOVPM(msgKey, msgTypes , msgTypeCount ,
                      "*CTLBDY   " , 1 , &ec);
     QMHRSNEM(msgKey, &ec);

     globalError = 0;
     return;
}

    // Set to '1' to enable conversion to ASCII
    // Set to '0' to disable automatic EBCDIC/ASCII conversion
#ifdef TOASCII
volatile char TO_ASCII = '1';
#else
volatile char TO_ASCII = '0';
#endif

template<typename T>
inline std::string intToText(T value) {
    std::ostringstream oss;
    oss << value;
    return oss.str();
}

struct json_symbols_t {
    const char  LF;   // Linefeed
    const char* NULL_VAL;
    const char* BINARY;
    const char* QUOTE;
    const char* COLON;
    const char* COMMA;
    const char* LCURLY;
    const char* RCURLY;
    const char* LSQUARE;
    const char* RSQUARE;
    const char* BACKSLASH;
    const char* BLANK;
    const char* B;
    const char  B_ESC;
    const char* F;
    const char  F_ESC;
    const char* N;
    const char  N_ESC;
    const char* R;
    const char  R_ESC;
    const char* T;
    const char  T_ESC;
    const char* TRUE;
    const char* FALSE;
    const char* COL_NAME;
    const char* COL_TYPE;
    const char* COL_LENGTH;
    const char* COL_DECPOS;
    const char* COL_ALLOWNULL;
    const char* COL_COLHDR;
    const char* FIELDATTR;
    const char* DATA;
    const char* ERROR;
    const char* SQLSTATE;
    const char* MSGTEXT;
    const char* DB2JSON;
};


#pragma convert(1208)
const json_symbols_t json_ascii = {
    '\n',                 // LINEFEED
    "\"<NULL>\"",         // NULL_VAL
    "\"[BINARY_DATA]\"",  // BINARY
    "\"",                 // QUOTE
    ":",                  // COLON
    ",",                  // COMMA
    "{",                  // LCURLY
    "}",                  // RCURLY
    "[",                  // LSQUARE
    "]",                  // RSQUARE
    "\\",                 // BACKSLASH
    " ",                  // BLANK
    "\\b",                // B
    '\b',                 // B_ESC
    "\\f",                // F
    '\f',                 // F_ESC
    "\\n",                // N
    '\n',                 // N_ESC
    "\\r",                // R
    '\r',                 // R_ESC
    "\\t",                // T
    '\t',                 // T_ESC
    "true",
    "false",
    "name",
    "type",
    "length",
    "decimals",
    "allownull",
    "colhdr",
    "attr",
    "data",
    "\"error\"",
    "\"sqlstate\"",
    "\"msgtext\"",
    "\"DB2JSON\""
};
#pragma convert(0)

const json_symbols_t json_job = {
    '\n',                 // LINEFEED
    "\"<NULL>\"",         // NULL_VAL
    "\"[BINARY_DATA]\"",  // BINARY
    "\"",                 // QUOTE
    ":",                  // COLON
    ",",                  // COMMA
    "{",                  // LCURLY
    "}",                  // RCURLY
    "[",                  // LSQUARE
    "]",                  // RSQUARE
    "\\",                 // BACKSLASH
    " ",                  // BLANK
    "\\b",                // B
    '\b',                 // B_ESC
    "\\f",                // F
    '\f',                 // F_ESC
    "\\n",                // N
    '\n',                 // N_ESC
    "\\r",                // R
    '\r',                 // R_ESC
    "\\t",                // T
    '\t',                 // T_ESC
    "true",
    "false",
    "name",
    "type",
    "length",
    "decimals",
    "allownull",
    "colhdr",
    "attr",
    "data",
    "\"error\"",
    "\"sqlstate\"",
    "\"msgtext\"",
    "\"DB2JSON\""
};

#define ifCheckError(_d, _x, _rc, _h, _id, _t) \
      if (checkError(_d, _x, _rc, _h, _id, _t)==1) return 0;


// Runtime pointer to selected JSON symbol set
const json_symbols_t* json = &json_ascii; // Will be assigned to &json_ascii_instance or &json_job_instance at runtime


// JSON output state flags
bool g_attrOpen = false;
bool g_dataOpen = false;


// Forward declarations
std::string jsonEscape(const std::string &input);
std::string base64Encode(const unsigned char *data, size_t len);
std::string cvtToASCII(const std::string& src, CXLate& toASCII);

bool openIFSFile(std::ofstream& ofs, const char* szFile, const char* fileOpt, int ccsid = 1208);
const char* sqlTypeToJSONText(int sqlType);

// Log a message to the IBM i joblog using Qp0zLprintf, printf-style

void logSQLMsg(const char *fmt, ...)
{
    char buffer[2048];
    va_list args;

    va_start(args, fmt);
    vsnprintf(buffer, sizeof(buffer), fmt, args);
    va_end(args);

    Qp0zLprintf("[db2json] %s\n", buffer);
}

// Constants
const size_t MAX_LOB_SIZE = 1024 * 1024; // 1MB max inline LOB size

// Describe columns
struct Column
{
    std::string name;
    std::string colhdr;
    SQLSMALLINT type;
    SQLUINTEGER size;
    SQLSMALLINT decimals;
    SQLSMALLINT nullable;
};

// Helper to close open JSON arrays/objects before error output
// Track if root object is open
bool g_rootOpen = false;
char g_fileNameBuffer[4096];  // Global file name buffer

// Helper to close open JSON arrays/objects before error output
// Returns true if root was open, false if not
bool closeJsonNode(std::ostream& output) {
    bool  rootWasOpen = g_rootOpen;
    if (g_attrOpen) {
        output << json->RSQUARE; // close attr array
        output << json->COMMA << json->LF;
        g_attrOpen = false;
    }
    if (g_dataOpen) {
        output << json->RSQUARE; // close data array
        output << json->COMMA << json->LF;
        g_dataOpen = false;
    }
    return  rootWasOpen;
}

// Helper function to check and print CLI errors, and emit JSON error node
int checkError(std::ostream& output, CXLate& toASCII, SQLRETURN rc, SQLHANDLE handle, SQLSMALLINT type, const char *msg)
{
    if (rc == SQL_SUCCESS || rc == SQL_SUCCESS_WITH_INFO)
    {
        return 0;
    }
    SQLCHAR sqlstate[6] = {0};
    SQLCHAR message[SQL_MAX_MESSAGE_LENGTH+1] = {0};
    SQLINTEGER nativeError = 0;
    SQLSMALLINT textLen = 0;
    SQLGetDiagRec(type, handle, 1, sqlstate, &nativeError, message, sizeof(message)-1, &textLen);
    message[textLen] = 0x00;
    std::string sqlstateStr = cvtToASCII(reinterpret_cast<const char*>(sqlstate), toASCII);
    std::string msgtextStr = cvtToASCII(reinterpret_cast<const char*>(message), toASCII);
    bool  rootWasOpen = closeJsonNode(output);
    logSQLMsg("Error: %5s, %s",sqlstate, message);
    if (!rootWasOpen) {
        output << json->LCURLY; // open root object if not already open
        g_rootOpen = true;
    }

    output << json->LF
         << json->ERROR << json->COLON << json->LCURLY
         << json->SQLSTATE << json->COLON
             << json->QUOTE << jsonEscape(sqlstateStr) << json->QUOTE << json->COMMA
         << json->MSGTEXT << json->COLON
             << json->QUOTE << jsonEscape(msgtextStr) << json->QUOTE
         << json->RCURLY;
    if (g_rootOpen) {
        output << json->LF << json->RCURLY << json->LF;
        g_rootOpen = false;
    }

    return 1;
}

void returnFailure(std::ostream& output, CXLate& toASCII, const char* message)
{
    // Output error JSON with sqlstate 'DB2JSON' and msgtext from message
    logSQLMsg("Return Failure: %s", message);
    std::string msgtextStr = cvtToASCII(message, toASCII);
    bool  nodeWasOpen = closeJsonNode(output);
    output << json->COMMA << json->LF;
    // output << json->LCURLY;
    output << json->LF
           << json->ERROR << json->COLON << json->LCURLY
           << json->SQLSTATE << json->COLON
           << json->DB2JSON << json->COMMA
           << json->MSGTEXT << json->COLON
           << json->QUOTE << jsonEscape(msgtextStr) << json->QUOTE
           << json->RCURLY;
    if (g_rootOpen) {
        output << json->LF << json->RCURLY << json->LF;
        g_rootOpen = false;
    }
}

// Escape JSON special chars in strings
std::string jsonEscape(const std::string &input)
{
    std::string output;
    for (size_t i = 0; i < input.size(); ++i)
    {
        char c = input[i];
        // Use the first character of each json-> constant for comparison (ASCII/UTF-8 value)
        if (c == json->QUOTE[0]) {
            output += json->BACKSLASH;
            output += json->QUOTE;
        } else if (c == json->BACKSLASH[0]) {
            output += json->BACKSLASH;
            output += json->BACKSLASH;

        } else if (c == json->B_ESC) { // '\b'
            output += json->B;
        } else if (c == json->F_ESC) { // '\f'
            output += json->F;
        } else if (c == json->N_ESC) { // '\n'
            output += json->N;
        } else if (c == json->R_ESC) { // '\r'
            output += json->R;
        } else if (c == json->T_ESC) { // '\t'
            output += json->T;
        } else if (static_cast<unsigned char>(c) < json->BLANK[0]) {
            char buf[7];  // convert it to hex
            snprintf(buf, sizeof(buf), "\\u%04x", (unsigned char)c);
            output += buf;
        } else {
            output += c;
        }
    }
    return output;
}

// Dummy Base64 encoder placeholder (implement or use existing)
std::string base64Encode(const unsigned char *data, size_t len)
{
    // TODO: implement Base64 encoding here or link a library
    return "[BASE64_DATA]";
}

// Convert a string to ASCII using the provided CXLate object
std::string cvtToASCII(const std::string& src, CXLate& toASCII) {
    // if TO_ASCII is set off, simple return the EBCDIC JSON text to caller.
    if (src.empty() || TO_ASCII == '0') return src;
    std::string out;
    out.resize(src.size() * 4); // plenty of space for multibyte
    int len = toASCII.convert(src.c_str(), src.size(), &out[0], out.size());
    if (len < 0) {
        return src;
    }
    out.resize(len);
    return out;
}


// Helper to get the value of a query parameter
std::string getQueryParm(const std::string& query, const std::string& key) {
    std::string search = key + "=";
    size_t start = query.find(search);
    if (start == std::string::npos) return "";
    start += search.length();
    size_t end = query.find('&', start);
    return query.substr(start, end - start);
}

std::string urlDecode(const std::string& str) {
    std::string result;
    char ch;
    int i, ii;
    for (i = 0; i < str.length(); i++) {
        if (str[i] == '%') {
            sscanf(str.substr(i + 1, 2).c_str(), "%x", &ii);
            ch = static_cast<char>(ii);
            result += ch;
            i = i + 2;
        } else if (str[i] == '+') {
            result += ' ';
        } else {
            result += str[i];
        }
    }
    return result;
}


void writeMIME( const char* mime )
{
  cout << "Content-type: " << mime << endl;
  cout << endl << endl;  // terminate mime header and CGI headers (2 linefeeds)
}


extern char **environ;

void logEnv()
{
    for (char **env = environ; *env != 0; env++) {
        logSQLMsg(*env);
    }

}


/**
 * Wrapper for QtmhGetEnv
 * name   - environment variable name (null-terminated)
 * value  - output buffer
 * valLen - size of output buffer
 *
 * Returns: length of value on success, -1 on failure
 */
int tmh_Getenv(const char *name, char *value, int valLen)
{
    Qus_EC_t errorCode = {0};
    int varNameLen = strlen(name);
    int bytesReturned = 0;

    memset(&errorCode, 0, sizeof(errorCode));
    errorCode.Bytes_Provided = sizeof(errorCode);

    ::QtmhGetEnv(value,              /* receiver buffer */
               &valLen,              /* receiver buffer size */
               &bytesReturned,       /* length returned */
               (char *)name,         /* var name */
               &varNameLen,          /* var name length */
               &errorCode);          /* error code */

    if (errorCode.Bytes_Available > 0) {
        return -1;  /* error occurred */
    }

    /* Ensure null-terminated string for safety */
    if (bytesReturned < valLen)
        value[bytesReturned] = '\0';
    else
        value[valLen - 1] = '\0';

    return bytesReturned;
}

const char *cgi_getenv(const char* name)
{
    size_t nameLen = strlen(name);

    for (char **env = environ; *env != NULL; env++) {
        if (strncmp(*env, name, nameLen) == 0 && (*env)[nameLen] == '=') {
            return *env + nameLen + 1;  /* skip past "NAME=" */
        }
    }
    return NULL;
}

bool startsWith(const std::string& str, const std::string& prefix) {
    return str.size() >= prefix.size() &&
           str.compare(0, prefix.size(), prefix) == 0;
}

int main(int argc, char *argv[])
{

    // Get IBM i Version and Release as an int (e.g., 720 = V7R2M0)
      _INT4      IBMiVer = 0;
      _INT4      platform = 0;
      _FEEDBACK  fc;

     CEEGPID( &IBMiVer, &platform, &fc);
    long long int rows = 0;

    char*       pIFSFile = NULL;
    std::string szIFSOption;

    char*   pReqMeth = ::getenv("REQUEST_METHOD");
    char*   pQuery   = ::getenv("QUERY_STRING");

    char*   pClientCCSID = ::getenv("CGI_ASCII_CCSID");
    char*   pHostCCSID   = ::getenv("CGI_EBCDIC_CCSID");
    int     clientCCSID = pClientCCSID ? atoi(pClientCCSID) : 0;
    int     hostCCSID = pHostCCSID ? atoi(pHostCCSID) : 0;
    int     bXLate = false;
    int     bIFSOutput = false;

    std::ofstream outFile;

    CXLate toASCII;
    CXLate toEBCDIC;

    logSQLMsg("REQUEST_METHOD: %s", pReqMeth);
    logSQLMsg("QUERY_STING: %s", pQuery);

    std::ostringstream jsonOut;  // buffer to debug the JSON output content
    std::string sqlStmt;
    char reqMeth[32];
    tmh_Getenv("REQUEST_METHOD", reqMeth, sizeof(reqMeth));
    logSQLMsg("tmh_REQ_METH: %s", reqMeth);

    if (argc >= 2) {
        // When directing output to an IFS file then:
        //  turn off all CCSID conversions
        //  get the file name  (parm 2)
        //  get the file append/replace option (parm 3)
        _INT4 p_datatype;
        _INT4 p_curlen;
        _INT4 p_maxlen;
        std::string path;
        int p1Len = 0;
        int p2Len = 0;
        int p3Len = 0;
        int p4Len = 0;
        int p = 0;

                // When calling this from CL or command entry
                // we have to have an expected parameter length
                // for the input SQL statement and the output file name.
                // I've selected 640 bytes max for both.
                // If you wish to increase either, be sure
                // the CL variables you pass to this program
                // are declared at that length or unpredicable results will occur.
        constexpr size_t MAX_SQL_LEN = 640;  // Parm 1 SQL stmt, declared length
        constexpr size_t MAX_PATH_LEN = 640; // Parm 2 IFS outfile path, declared length

        if (argc >= 2)
        {
           bIFSOutput = true;
           p = 1;
           sqlStmt.assign(argv[p], MAX_SQL_LEN);
           sqlStmt.erase(sqlStmt.find_last_not_of(' ') + 1);
        }
        if (argc >= 3)
        {
           p = 2;

           path.assign(argv[p], MAX_PATH_LEN);
           path.erase(path.find_last_not_of(' ') + 1);
           strcpy(g_fileNameBuffer, path.c_str());
           pIFSFile = g_fileNameBuffer;
           bXLate = 0;  // Don't need to xlate when writing to the IFS
        }
        if (argc >= 4)
        {
           p = 3;  // short parms are padded to 32 bytes so 16 is a safe length
           szIFSOption.assign(argv[p], 16);
           szIFSOption.erase(szIFSOption.find_last_not_of(' ') + 1);
           bXLate = 0;
        }
        logSQLMsg("cmdline use detected:");
        logSQLMsg("  Query parm 1: %s", sqlStmt.c_str());
        logSQLMsg("  Outfile parm 2: %s",pIFSFile);
        logSQLMsg("  Add/Replace IFS outfile parm 3: %s",szIFSOption.c_str());

        TO_ASCII = '0';
        json = &json_job;  // Use job CCSID for JSON synmbols instead of ASCII
    }
    else {
        char* pEnv = getenv("CGI_MODE");
        TO_ASCII = '1';
        json = &json_ascii;  // Use ASCII for JSON synmbols instead of job CCSID


            // TODO: Need more testing on other CGI_MODE environments
            // to determine if conversion to ASCII for JSON is required
            // if not, then set TO_ASCII to '0' and assign json_job to the json pointer

        if (pEnv != NULL)
        {
            std::string cgiMode = pEnv;
            bXLate = bXLate &&
                       (!startsWith(cgiMode,"%%MIXED") &&
                        !startsWith(cgiMode,"%%EBCDIC") &&
                        !startsWith(cgiMode,"MIXED") &&
                        !startsWith(cgiMode,"EBCDIC")) ? 1 : 0;
       }
        // CGI mode: extract from QUERY_STRING
        const char* qs = cgi_getenv("QUERY_STRING");
        logSQLMsg("cgi_QRY_STG:  %s", qs);

        std::string query = qs ? qs : "";
        std::string qValue = getQueryParm(query, "q"); // get sql stmt (q) CGI variable value
        sqlStmt = urlDecode(qValue);

        // Assume sqlStmt is your input std::string (UTF-8)
        const char* pInBuffer = sqlStmt.c_str();
        int iLen = sqlStmt.length();
        // Prepare output vector, size at least iLen * 4 (iconv best practice for UTF-8 to EBCDIC)

        // Convert use iconv if HTTP server doesn't do it automatically
        if (bXLate) {
            std::vector<char> ebcdicData(iLen * 4);
            if (toEBCDIC.convert(pInBuffer, iLen, &ebcdicData[0], ebcdicData.size()) >= 0)
            {
                sqlStmt.assign(ebcdicData.begin(), ebcdicData.end());
            }
        }


        if (clientCCSID != hostCCSID) {
            // Create conversion tables using iconv
            // (NOTE: They are auto-closed/released in their ~destructor)
            toASCII.openIBM( hostCCSID , clientCCSID);
            toEBCDIC.openIBM( clientCCSID , hostCCSID );
            bXLate = true;
        }
        else
        {
            bXLate = false;  // Same CCSID, then no xlate needed.
        }
    }
      // IBM i requires JSON to be written to the browser/stdout as ASCII
        // but the content type must be in EBCDIC.
        // These rules apply when CGI_MODE = EBCDIC or %%EBCDIC%%
    if (bIFSOutput && pIFSFile && strlen(pIFSFile) > 0)
    {
        openIFSFile(outFile, pIFSFile, szIFSOption.c_str());
    }
    else
    {
        std::cout << "Content-Type: application/json" << endl << endl;
    }

    std::ostream& output = (bIFSOutput && pIFSFile && strlen(pIFSFile) > 0) ?
                            static_cast<std::ostream&>(outFile) : std::cout;


    if (sqlStmt.empty()) {
        returnFailure(output, toASCII, "No results generated.");
        return 0;
    }

    // Efficiently trim trailing spaces and semicolons from SQL statement
    size_t endPos = sqlStmt.find_last_not_of("; \t\n\r");
    if (endPos == std::string::npos) {
        sqlStmt.clear();
    } else if (endPos + 1 < sqlStmt.length()) {
        sqlStmt.erase(endPos + 1);
    }

    // Replace all CRLF, LFCR, CR, and LF pairs or singles in sqlStmt with a single blank
    std::string cleaned;
    for (size_t i = 0; i < sqlStmt.size(); ) {
        if ((sqlStmt[i] == '\r' && i + 1 < sqlStmt.size() && sqlStmt[i + 1] == '\n') ||
            (sqlStmt[i] == '\n' && i + 1 < sqlStmt.size() && sqlStmt[i + 1] == '\r')) {
            cleaned += ' ';
            i += 2;
        } else if (sqlStmt[i] == '\n' || sqlStmt[i] == '\r') {
            cleaned += ' ';
            i += 1;
        } else {
            cleaned += sqlStmt[i];
            i += 1;
        }
    }
    sqlStmt.swap(cleaned);

    logSQLMsg("Query: %s - q=%s",reqMeth, sqlStmt.c_str());
    SQLRETURN rc = 0;
    SQLHENV hEnv = NULL;
    SQLHDBC hDbc = NULL;
    SQLHSTMT hStmt = NULL;
    SQLINTEGER attr = 0;
    SQLINTEGER invEntry = 1;
    static int bFractionalResulSet = 0;  // Set off until implemented
    static int bFirstCall = 1;


    rc = SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &hEnv);      // Req.SeqLink-+

    if (rc < SQL_SUCCESS)
    {
        logSQLMsg("%d = SQLAllocHandle(SQL_HANDLE_ENV... with %d - %s) failed.",
                        rc, errno, strerror(errno));
        returnFailure(output, toASCII,"Could not allocate SQL hEnv handle. Request cancelled.");
        return 0;
    }

  // SQL_ATTR_INVOKING_PGM is mostly used for *SRVPGM implementations
  // to avoid closing SQL Cursors and program end.
  // In *PGM objects, if ACTGRP(*NEW) is used, it as no impact since
  // cursors are also closed at the end of the activation group or sooner.
  // If we implement a "get more rows" fractional return of the result set,
  // then incorporating SQL_ATTR_INVOKING_PGM into this program would be helpful.
  // For now, this is just stubbed-out not implemented
    if (bFractionalResulSet && bFirstCall)
    {
      bFirstCall = 0;
      rc = SQLSetEnvAttr((SQLHENV)hEnv,SQL_ATTR_INVOKING_PGM,(SQLPOINTER)&invEntry,0);  // Req.SeqLink-
      if (rc != SQL_SUCCESS)
      {
        char szError[256];
        sprintf(szError,"%d = SQLSetEnvAttr(%d,SQL_ATTR_INVOKING_PGM) Failed with errno(%d) - %s", rc,(int)hEnv , errno, strerror(errno));
        logSQLMsg(szError);
        returnFailure(output, toASCII,szError);
        return 0;
      }
    }


    attr = SQL_FALSE;  // Don't return Null-Terminated Strings from SQL APIs
    rc = SQLSetEnvAttr((SQLHENV)hEnv,SQL_ATTR_OUTPUT_NTS,(SQLPOINTER)&attr,0);

    attr = SQL_TRUE;  // Track hEnv handle allocations
    SQLSetEnvAttr(hEnv,SQL_ATTR_ENVHNDL_COUNTER,&attr,0);

    attr = SQL_FALSE;  // Return Success_with_Info when Truncation occurs on Fetch.
    rc = SQLSetEnvAttr((SQLHENV)hEnv,SQL_ATTR_TRUNCATION_RTNC,&attr,0);

    // Allocate connection handle
    rc = SQLAllocHandle(SQL_HANDLE_DBC, hEnv, &hDbc);
    ifCheckError(output, toASCII, rc, hDbc, SQL_HANDLE_DBC, "AllocateConn");

    attr = SQL_TRUE;   // Allow extended attributes via SQLColAttribute
    rc = SQLSetConnectAttr(hDbc,SQL_ATTR_EXTENDED_COL_INFO, (SQLPOINTER)&attr,0);
    ifCheckError(output, toASCII, rc, hDbc, SQL_HANDLE_DBC, "SetConnAttr");

    // Connect to the database (null means use default)
    rc = SQLConnect(hDbc, NULL, 0, NULL, 0, NULL, 0);
    if (rc != SQL_SUCCESS && rc != SQL_SUCCESS_WITH_INFO)
    {
        ifCheckError(output, toASCII, rc, hDbc, SQL_HANDLE_DBC, "Connect");
    }

    // Allocate statement handle
    rc = SQLAllocHandle(SQL_HANDLE_STMT, hDbc, &hStmt);
    ifCheckError(output, toASCII, rc, hStmt, SQL_HANDLE_STMT, "AllocStmt");

    // Prepare statement
    rc = SQLPrepare(hStmt, (SQLCHAR *)sqlStmt.c_str(), SQL_NTS);
    ifCheckError(output, toASCII, rc, hStmt, SQL_HANDLE_STMT, "Prepare");

    // Execute statement
    rc = SQLExecute(hStmt);
    if (rc != SQL_SUCCESS && rc != SQL_SUCCESS_WITH_INFO)
    {
        ifCheckError(output, toASCII, rc, hStmt, SQL_HANDLE_STMT, "Execute");
    }

    // Get number of columns
    SQLSMALLINT numCols = 0;
    rc = SQLNumResultCols(hStmt, &numCols);
    ifCheckError(output, toASCII, rc, hStmt, SQL_HANDLE_STMT, "NumResultCols");
    logSQLMsg("Columns returned: %d",numCols);

        // Create column vector
    std::vector<Column> columns;
    for (SQLUSMALLINT i = 1; i <= numCols; ++i)
    {
        SQLCHAR     colName[128];
        SQLSMALLINT nameLen = 0;
        SQLSMALLINT rtnLen = 0;
        SQLSMALLINT dataType = 0;
        SQLINTEGER  colSize = 0;
        SQLINTEGER  numAttr = 0;
        SQLSMALLINT decimalDigits = 0;
        SQLSMALLINT nullable = 0;
        SQLCHAR     colHdr[128];  // COLHDG or Array of 3x20 text values

        rc = SQLDescribeCol(hStmt, i, colName, sizeof(colName), &nameLen,
                             &dataType, &colSize, &decimalDigits, &nullable);
        ifCheckError(output, toASCII, rc, hStmt, SQL_HANDLE_STMT, "DescribeCol");

            // get column headings
        rc = SQLColAttribute( hStmt, i, SQL_DESC_LABEL,
                                colHdr, sizeof(colHdr),
                                &rtnLen, &numAttr);

        Column col;
        col.name = std::string((char *)colName, nameLen);
        col.colhdr = std::string((char *)colHdr, rtnLen);
        col.type = dataType;
        col.size = colSize;
        col.decimals = decimalDigits;
        col.nullable = (nullable == SQL_NULLABLE) ? 1 : 0;
        columns.push_back(col);
    }


    // Start root object
    output << json->LCURLY;  // Start of root JSON
    g_rootOpen = true;

    // begin "attr" property
    output << json->QUOTE << json->FIELDATTR << json->QUOTE << json->COLON;
    output << json->LSQUARE;
    g_attrOpen = true;

    // Build the 'attr' array of column metadata (field attributes)
    for (size_t i = 0; i < columns.size(); ++i) {
        if (i > 0) output << json->COMMA  << json->LF;
        const Column &col = columns[i];
        output << json->LCURLY
            << json->QUOTE << json->COL_NAME << json->QUOTE << json->COLON << json->QUOTE
            << jsonEscape(cvtToASCII(col.name, toASCII)) << json->QUOTE << json->COMMA
            << json->QUOTE << json->COL_TYPE << json->QUOTE << json->COLON <<
                    cvtToASCII(sqlTypeToJSONText(col.type), toASCII) << json->COMMA
            << json->QUOTE << json->COL_LENGTH << json->QUOTE << json->COLON <<
                cvtToASCII(intToText(col.size), toASCII) << json->COMMA
            << json->QUOTE << json->COL_DECPOS << json->QUOTE << json->COLON <<
                cvtToASCII(intToText(col.decimals), toASCII) << json->COMMA
            << json->QUOTE << json->COL_ALLOWNULL << json->QUOTE << json->COLON
            << (col.nullable ? json->TRUE : json->FALSE) << json->COMMA
            << json->QUOTE << json->COL_COLHDR << json->QUOTE << json->COLON << json->QUOTE
            << jsonEscape(cvtToASCII(col.colhdr, toASCII)) << json->QUOTE
            << json->RCURLY;
    }
    output << json->RSQUARE << json->COMMA  << json->LF;
    g_attrOpen = false;
    // end column attributes "attr"

    // start data values "data"
    output << json->QUOTE << json->DATA << json->QUOTE << json->COLON;
    g_dataOpen = true;
    // Build the 'data' array for row data
    output << json->LSQUARE;
    bool firstRow = true;
    char buf[4096];
    while ((rc = SQLFetch(hStmt)) != SQL_NO_DATA)
    {
        rows++;  // row counter
        ifCheckError(output, toASCII, rc, hStmt, SQL_HANDLE_STMT, "Fetch");
        if (!firstRow)
            output << json->COMMA  << json->LF;
        firstRow = false;
        output << json->LCURLY;
        for (size_t i = 0; i < columns.size(); ++i)
        {
            if (i > 0)
                output << json->COMMA;
            const Column &col = columns[i];
            output << json->QUOTE << jsonEscape(cvtToASCII(col.name, toASCII)) << json->QUOTE << json->COLON;
            memset(buf, 0x00, sizeof(buf));
            SQLINTEGER indicator = 0;
            switch (col.type)
            {
            case SQL_CHAR:
            case SQL_VARCHAR:
            case SQL_CLOB:
            {
                std::string val;
                val.clear();
                do {
                    rc = SQLGetData(hStmt, (SQLUSMALLINT)(i + 1), SQL_C_CHAR, buf, sizeof(buf), &indicator);
                    if (indicator == SQL_NULL_DATA) {
                        val.clear();
                        break;
                    }
                    if ((rc == SQL_SUCCESS || rc == SQL_SUCCESS_WITH_INFO) && indicator > 0) {
                        size_t chunkLen = (indicator < (SQLINTEGER)sizeof(buf)) ? indicator : sizeof(buf) - 1;
                        // Trim trailing spaces if we got the whole value in one chunk (not for CLOB)
                        if (col.type != SQL_CLOB && indicator < (SQLINTEGER)sizeof(buf)) {
                            while (chunkLen > 0 && buf[chunkLen - 1] == ' ')
                                --chunkLen;
                        }
                        val.append(buf, chunkLen);
                    }
                } while (rc == SQL_SUCCESS_WITH_INFO);
                if (indicator == SQL_NULL_DATA) {
                    output << json->NULL_VAL;
                } else {
                    output << json->QUOTE << jsonEscape(cvtToASCII(val, toASCII)) << json->QUOTE;
                }
                break;
            }
            case SQL_INTEGER:
            case SQL_SMALLINT:
            case SQL_TINYINT:
            {
                int ival = 0;
                rc = SQLGetData(hStmt, (SQLUSMALLINT)(i + 1), SQL_C_LONG, &ival, sizeof(ival), &indicator);
                if (indicator == SQL_NULL_DATA)
                {
                    output << json->NULL_VAL;
                }
                else
                {
                    std::ostringstream oss;
                    oss << ival;
                    std::string ivalStr = oss.str();
                    std::string asciiInt = cvtToASCII(ivalStr, toASCII);
                    output << asciiInt;
                }
                break;
            }
            case SQL_DOUBLE:
            case SQL_FLOAT:
            case SQL_REAL:
            {
                double dval = 0.0;
                rc = SQLGetData(hStmt, (SQLUSMALLINT)(i + 1), SQL_C_DOUBLE, &dval, sizeof(dval), &indicator);
                if (indicator == SQL_NULL_DATA)
                {
                    output << json->NULL_VAL;
                }
                else
                {
                    std::ostringstream oss;
                    oss << dval;
                    std::string dblStr = oss.str();
                    std::string asciiDouble = cvtToASCII(dblStr, toASCII);
                    output << asciiDouble;
                }
                break;
            }
            case SQL_BINARY:
            case SQL_VARBINARY:
            {
                unsigned char binaryBuf[MAX_LOB_SIZE];
                size_t totalLen = 0;
                rc = SQLGetData(hStmt, (SQLUSMALLINT)(i + 1), SQL_C_BINARY, binaryBuf, sizeof(binaryBuf), &indicator);
                if (indicator == SQL_NULL_DATA)
                {
                    output << json->NULL_VAL;
                }
                else
                {
                    output << json->BINARY;
                }
                break;
            }

            default:
            {
                rc = SQLGetData(hStmt, (SQLUSMALLINT)(i + 1), SQL_C_CHAR, buf, sizeof(buf), &indicator);
                if (indicator == SQL_NULL_DATA)
                {
                   output << json->NULL_VAL;
                }
                else
                {
                    std::string val(buf);
                    output << json->QUOTE << jsonEscape(cvtToASCII(val, toASCII)) << json->QUOTE;
                }
                break;
            }
            }
        }
        output << json->RCURLY;
    }
    output << json->RSQUARE;
    g_dataOpen = false;

    if (rows == 0) {
        returnFailure(output, toASCII, "0 Rows returned");
    }
    else {
        output << json->LF << json->RCURLY;
    }
    g_rootOpen = false;

    // Cleanup
    if (hStmt)
        SQLFreeHandle(SQL_HANDLE_STMT, hStmt);
    if (hDbc)
        SQLDisconnect(hDbc);
    if (hDbc)
        SQLFreeHandle(SQL_HANDLE_DBC, hDbc);
    if (hEnv)
        SQLFreeHandle(SQL_HANDLE_ENV, hEnv);

    return 0;
}


bool openIFSFile(std::ofstream& ofs, const char* szFile, const char* fileOpt, int ccsid )
{
    std::ios_base::openmode mode = std::ios::out;
    // Set file_option: if fileOpt is "R" (case-insensitive), use trunc else app
    int optOffset = (fileOpt && (fileOpt[0] == '-' || fileOpt[0]=='/' || fileOpt[0]=='*')) ? 1 : 0;
    if (fileOpt && (fileOpt[optOffset] == 'R' || fileOpt[optOffset] == 'r' ||
                   fileOpt[optOffset] == 'T' || fileOpt[optOffset] == 't' ||
                   fileOpt[optOffset] == 'Y' || fileOpt[optOffset] == 'y')) {
        mode |= std::ios::trunc;

        if (access(szFile, R_OK) == 0) {
            unlink(szFile);
        }
        int    fFlags = O_WRONLY | O_TEXTDATA | O_CCSID;
        mode_t fmode  = S_IRWXU | S_IRWXO | S_IRWXG;
        unsigned int file_ccsid = ccsid;
        unsigned int open_ccsid = 0;
        fFlags += O_TEXT_CREAT + O_CREAT;  // Create the file
        int hIFS = open(szFile, fFlags, fmode, file_ccsid, open_ccsid);
        close (hIFS );

    } else {
        logSQLMsg("IFS output file APPEND mode db2JSON (..., ..., '%s') detected.", fileOpt);
        mode |= std::ios::app;
    }

    ofs.open(szFile, mode | ios_base::_occsid);
    if (!ofs.is_open()) {
        logSQLMsg("IFS File open() failed %d - %s for file %s",errno, strerror(errno),
                  szFile);
        return false;
    }
    return true;
}


const char* sqlTypeToJSONText(int sqlType) {
    switch (sqlType) {
        case SQL_CHAR:            return "\"CHAR\"";
        case SQL_NUMERIC:         return "\"ZONED\"";
        case SQL_DECIMAL:         return "\"DEC\"";
        case SQL_INTEGER:         return "\"INT\"";
        case SQL_SMALLINT:        return "\"SMALLINT\"";
        case SQL_FLOAT:           return "\"FLOAT\"";
        case SQL_REAL:            return "\"REAL\"";
        case SQL_DOUBLE:          return "\"DOUBLE\"";
        case SQL_DATETIME:        return "\"DATETIME\"";
        case SQL_VARCHAR:         return "\"VARCHAR\"";
        case SQL_BLOB:            return "\"BLOB\"";
        case SQL_CLOB:            return "\"CLOB\"";
        case SQL_DBCLOB:          return "\"DBCLOB\"";
        case SQL_DATALINK:        return "\"DATALINK\"";
        case SQL_WCHAR:           return "\"WCHAR\"";
        case SQL_WVARCHAR:        return "\"WVARCHAR\"";
        case SQL_BIGINT:          return "\"BIGINT\"";
        case SQL_BLOB_LOCATOR:    return "\"BLOB_LOCATOR\"";
        case SQL_CLOB_LOCATOR:    return "\"CLOB_LOCATOR\"";
        case SQL_DBCLOB_LOCATOR:  return "\"DBCLOB_LOCATOR\"";
        case SQL_UTF8_CHAR:       return "\"UTF8_CHAR\"";
        case SQL_GRAPHIC:         return "\"GRAPHIC\"";
        case SQL_VARGRAPHIC:      return "\"VARGRAPHIC\"";
        case SQL_BINARY:          return "\"BINARY\"";
        case SQL_VARBINARY:       return "\"VARBINARY\"";
        case SQL_DATE:            return "\"DATE\"";
        case SQL_TIME:            return "\"TIME\"";
        case SQL_TIMESTAMP:       return "\"TIMESTAMP\"";
        case SQL_DECFLOAT:        return "\"DECFLOAT\"";
        case SQL_XML:             return "\"XML\"";
        default:                  return "\"UNKNOWN\"";
    }
}