

#include <stdlib.h>
#include <stdio.h>
#include <except.h>
#include <signal.h>

#include <qp0ztrc.h> /* Qp0zLprintf() */

#include <iconv.h>
#include <qtqiconv.h>

#include <string>
#include <stdexcept>

#include <cpybytes.mih>

#include <qusec.h>
#include <QMH.H>

#include <errno.h>
#include <unistd.h>

#include <db2json/h/xlate>

#define min(a, b) (a > b) ? b : a

// Helper macro to set struct's to hex zeros
#define clearStruct(s) memset((char *)&s, 0x00, sizeof(s))

typedef _Packed struct tagFrom
{
   char IBMCCSID[8];
   char CCSID[5];
   char cvtalt[3];
   char subalt;
   char shiftState;
   char inLenOpt;
   char errCodeOpt;
   char reserved1[12];
} fromCvtCode;

typedef _Packed struct tagTo
{
   char IBMCCSID[8];
   char CCSID[5];
   char reserved2[19];
} toCvtCode;

CXLate::CXLate(int fromCCSID, int toCCSID)
{
   if (fromCCSID != toCCSID)
   {
      openIBM(fromCCSID, toCCSID);
   }
}

int CXLate::isOpen()
{
    iconv_t hConv;
    memset((char*) &hConv, 0x00, sizeof(iconv_t));
    return (cd.return_value < 0 || memcmp((const char*)&cd,(const char*)&hConv, sizeof(iconv_t))==0) ? 0 : 1;
}
int CXLate::openIBM(int fromCCSID, int toCCSID)
{
   QtqCode_T QfromCode;
   QtqCode_T QtoCode;

   fromCvtCode fromCode;
   toCvtCode toCode;
   char CCSID[6]; /* Holds the 5-digit CCSID plus the Null */

   clearStruct(fromCode);
   clearStruct(toCode);
   clearStruct(QfromCode);
   clearStruct(QtoCode);

   memset(&cd, 0x00, sizeof(cd));
   if (bUseIBM == '1')
   {
      memset(&QfromCode, 0x00, sizeof(QfromCode));
      QfromCode.CCSID = fromCCSID;

      memset(&QtoCode, 0x00, sizeof(QtoCode));
      QtoCode.CCSID = toCCSID;

      cd = QtqIconvOpen(&QtoCode, &QfromCode);
   }
   else
   {

      memset(&fromCode, '\0', sizeof(fromCvtCode));
      memset(&toCode, '\0', sizeof(toCvtCode));
      memcpy(&fromCode.IBMCCSID, "IBMCCSID", sizeof(fromCode.IBMCCSID));
      memcpy(&fromCode.CCSID, "00000", sizeof(fromCode.CCSID));
      memcpy(&fromCode.cvtalt, "000", sizeof(fromCode.cvtalt));
      fromCode.subalt = '0';
      fromCode.shiftState = '0';
      fromCode.inLenOpt = '0';
      fromCode.errCodeOpt = '0';

      memcpy(&toCode.IBMCCSID, "IBMCCSID", sizeof(toCode.IBMCCSID));
      memcpy(&toCode.CCSID, "00000", sizeof(toCode.CCSID));

      Qp0zLprintf(CCSID, "%05d", fromCCSID);
      memcpy(&fromCode.CCSID, CCSID, sizeof(fromCode.CCSID));
      Qp0zLprintf(CCSID, "%05d", toCCSID);
      memcpy(&toCode.CCSID, CCSID, sizeof(toCode.CCSID));

      cd = iconv_open((const char *)&toCode, (const char *)&fromCode);
      if (cd.return_value == -1)
      {
         Qp0zLprintf(strerror(errno));
         return -1;
      }
   }

   return cd.return_value;
}

void CXLate::close()
{
   if (cd.return_value != -1)
   {
      iconv_close(cd);
      cd.return_value = -1;
   }
   memset(&cd, 0x00, sizeof(iconv_t));
}

size_t CXLate::convert(const char *pInBuffer, size_t iLen,
                    char *pOutBuffer, size_t oLen)
{
   size_t nLen = 0;
   //   char* inp;
   //   char* out;
   char *__ptr128 inp = NULL;
   char *__ptr128 out = NULL;

   size_t nRtnBytes, inLen, outLen;

   if (cd.return_value == -1)
   {
      Qp0zLprintf(strerror(errno));
      return 0;
   }

   if (pInBuffer != NULL)
   {
      inp = (char *__ptr128)pInBuffer;
      out = (char *__ptr128)pOutBuffer;
      inLen = iLen;
      outLen = oLen;
      nRtnBytes = iconv(cd, &inp, &inLen, &out, &outLen);

      if ((int)nRtnBytes == -1)
      {
         Qp0zLprintf("iconv input len(%d) returned %d - %s\n",iLen,errno,strerror(errno));
         return 0;
      }
   }

   return (int) (out - pOutBuffer);
}
