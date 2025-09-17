
      // Prototype for DB2JSON along with calling examples.
      // Delete or comment-out everything passed the // EXAMPLE line

         dcl-pr db2json extpgm('DB2JSON/DB2JSON');
            sqlStmt varchar(640) Const;
            ifs_OutFile varchar(640) Const;
            replace  char(10) Const OPTIONS(*NOPASS);
         end-pr;

      // EXAMPLE:
         dcl-s mySQL varchar(640);
         dcl-s ifsFile varchar(640);

          // Call it with hard-coded/literals:
         db2Json('Select * from qiws.qcustcdt' :
                 '/home/cozzi/custmast.json' :
                 '-r');

            // Or call it with variables
          mySQL = 'select * from qiws.qcustcdt ORDER by BALDUE DESC');
          ifsFile = '/home/CustBalances.json');
         db2Json( mySQL : ifsFile : 'r');