DB2JSON:    CMD        PROMPT('Bob Cozzi''s DB2JSON Output')

            PARM       KWD(SQL) TYPE(*CHAR) LEN(2048) MIN(1) +
                         EXPR(*YES) VARY(*YES *INT2) CASE(*MIXED) +
                         PROMPT('SQL Statement')

            PARM       KWD(STMF) TYPE(*PNAME) LEN(640) MIN(1) +
                         EXPR(*YES) VARY(*YES *INT2) CASE(*MIXED) +
                         PROMPT('IF Stream output file name')

            PARM       KWD(STMFOPTION) TYPE(*CHAR) LEN(10) +
                         RSTD(*YES) DFT(*APPEND) SPCVAL((*ADD 'A') +
                         (*APPEND 'A') (*REPLACE 'R')) EXPR(*YES) +
                         PROMPT('Output stmf data option')