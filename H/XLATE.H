
     // (c) 2025 - R. Cozzi, Jr.


#ifndef DBJ_XLATE_
#define DBJ_XLATE_

#include <iconv.h>
#include <qtqiconv.h>

#pragma datamodel(P128)

class CXLate
{
   iconv_t cd;
   char    bUseIBM;

public:
    CXLate() {bUseIBM = '1'; memset((char*)&cd,0x00, sizeof(cd));}
    CXLate(int fromCCSISD, int toCCSID);
    int openIBM(int fromCCSID, int toCCSID);
    size_t convert(const char *pInBuffer, size_t iLen,
               char *pOutBuffer, size_t oLen);
    int  isOpen();
    void close();

   ~CXLate() { close(); }

private:
   // Disable copy
   CXLate(const CXLate &);
   CXLate &operator=(const CXLate &);
};

#pragma datamodel(pop)

#endif
