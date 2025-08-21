/**************************************************************************
   Originally Downloaded from: http://www.mike95.com
   Copyright (c)1997 Michael Olivero
   All Rights Reserved.

   RC: Sept 2014 - Migrated 90% to C++ and IBM i-safe code
   RC: April/May 2019 - Added CGI Multipart-form (file uploads) support
   Enhancements/Changes (c) 2014 - 2019 by R. Cozzi, Jr.
***************************************************************************/

#include <pthread.h>

#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include <iostream>
#include <iomanip>
#include <fstream>
#include <utility>
#include <algorithm>
#include <vector>
#include <string>
#include <map>

#include <qp0ztrc.h>
#include <unistd.h>

#include <qsysinc/mih/triml>
#include <qsysinc/mih/cvtch>
#include <qsysinc/mih/cvthc>


#include <COZTOOLSRC/h/sysstatic>
#include <COZTOOLSRC/h/sysobj>

#include <COZTOOLSRC/h/syscgi>

#define clearStg(s) memset((char*) s, 0x00, sizeof(s))

pthread_mutex_t cgi_mutex = PTHREAD_MUTEX_INITIALIZER;

  ////////////////////////////////////////////////////////////
  //  CGI Parse constructor                                 //
  ////////////////////////////////////////////////////////////
CGIParse::CGIParse( const char* filename)
{

   m_pCGIData = NULL;
   if (filename != NULL && strlen(filename) > 0)
   {
       openlog( filename );
   }

   init();
}

CGIParse::CGIParse()
{
     m_pCGIData = NULL;
     init();
}

CGIParse::CGIParse(int option)
{
     m_pCGIData = NULL;
     if (option != 1 && option != true)
     {
       init(option);
     }
     else
     {
       m_sysTools.init();
     }
}

CGIParse::~CGIParse()
{
   cleanUp();
}


void CGIParse::close()
{
   cleanUp();
}

void CGIParse::cleanUp()
{

   int rc = 0;
   int tCount = 0;

   cgiFlush();

   while ((rc = pthread_mutex_lock(&cgi_mutex))==EBUSY && tCount < 4)
   {
     // we're going to loop up to 3 times for 3 seconds each to give the thread a chance.
      sleep(3);
      ++tCount;
   }

   m_sysTools.xLateClose( &m_hToASCII);
   m_sysTools.xLateClose( &m_hToEBCDIC);
   m_sysTools.clear();

   m_aCCSID = 0;
   m_eCCSID = 0;

   deleteCGIBuffer();

   m_webLogFile.clear();
   m_method.clear();
   m_queryStg.clear();
   m_boundary.clear();
   m_textFile.clear();
   m_contentLength = 0;

   clearStg(fieldName);
   clearStg(fileName);
   clearStg(name);
   clearStg(formData);
   clearStg(file);
   clearStg(boundary);
   clearStg(contentType);
   clearStg(dispo);
   clearStg(multiPart);
   clearStg(multiPartMixed);
   clearStg(contectEncoding);

   clearStg(asciiCRLF);
   clearStg(asciiCRLF2);
   clearStg(asciiLFCR);
   clearStg(asciiLFCR2);
   clearStg(asciiLFLF);
   clearStg(asciiCRCR);
   clearStg(asciiDashDash);


   m_mime_sent       = false;
   m_bMultipart      = false;
   m_bMultipartMixed = false;
   m_bXLateEscaped   = false;
   m_bEncodeValues   = false;

   m_nodeVariables.clear();

   if (rc == EBUSY)
       return;

   closelog();

   m_formVar.clear();
   m_formValue.clear();
   m_formField.clear();
   m_formData.clear();

   pthread_mutex_unlock(&cgi_mutex);
}

void CGIParse::closelog()
{
    if (m_webLog.is_open()) m_webLog.close();
}

void CGIParse::openlog( const char* filename)
{
     if (filename == NULL || strlen(filename) == 0)
     {
        if (m_webLogFile.empty())
        {
            m_webLogFile = "/home/iQuery/iQueryWeblog/weblog.txt";
        }
     }
     else
     {
         m_webLogFile = filename;
     }
        // Open (create) the file with ASCII CCSID(819) then
        // re-open it with job CCSID(0) so that data is auto-converted
        // from EBCDIC to ASCII.
     if (m_webLog.is_open())
         m_webLog.close();

     try {
       m_webLog.open(m_webLogFile.c_str(), std::ofstream::out | std::ofstream::app, _CCSID_T ( 819 ) );
       m_webLog.close();
       m_webLog.open(m_webLogFile.c_str(), std::ofstream::out | std::ofstream::app, _CCSID_T ( 0 ) );
     }
     catch (std::ofstream::failure e) {
        cout << "cgiParse: Exception opening weblog file: ";
        cout << filename << endl;
     }

}




int CGIParse::init(int option)  // 2 == Write QUERY_STRING to joblog
{                               // 3 == Silent mode (no Init msgs)
   std::string redirect_qry;
   std::string redirect_method;

   m_sysTools.init();  // Initialize the System Interface

   cleanUp();

   strcpy(asciiCRLF2,"\r\n\r\n");
   strcpy(asciiCRLF,"\r\n");
   strcpy(asciiLFCR2,"\n\r");
   strcpy(asciiLFCR,"\n\r");
   strcpy(asciiCRCR,"\r\r");
   strcpy(asciiLFLF,"\n\n");

   memset(asciiDashDash,'-',2);

   strcpy(formData,"form-data;");
   strcpy(file,"file;");
   strcpy(fileName,"filename=");
   strcpy(name,"name=");
   strcpy(contentType,"Content-Type:");
   strcpy(dispo,"Content-Disposition:");
   strcpy(boundary,"boundary=");
   strcpy(multiPart,"multipart/form-data;");
   strcpy(multiPartMixed,"multipart/mixed;");
   strcpy(contectEncoding,"Content-Transfer-Encoding:");


       // Set up PC (ASCII) to EBCDIC Conversion
       // Set up EBCDIC to PC (ASCII) Conversion

   char* hostCCSID = std::getenv("CGI_EBCDIC_CCSID");
   unsigned int eCCSID = 0;
   if (hostCCSID != NULL)
   {
      eCCSID = atol(hostCCSID);
   }

   m_aCCSID = 1208;
   char* pcCCSID  = std::getenv("CGI_ASCII_CCSID");
   if (pcCCSID != NULL)
   {
      m_aCCSID = atol(pcCCSID);
   }

   char* pEnv = getenv("CGI_MODE");
   m_bXLateEscaped = 0;
   if (pEnv != NULL)
   {
      m_cgiMode = pEnv;
      m_bXLateEscaped = ( CSysStatic::startsWith(m_cgiMode,"%%MIXED") ||
                          CSysStatic::startsWith(m_cgiMode,"%%EBCDIC") ||
                          m_cgiMode.compare("MIXED") == 0 ||
                          m_cgiMode.compare("EBCDIC") == 0) ? 0 : 1;
   }

   // Qp0zLprintf("CCSID Web(%d) Host(%d) CGIMODE(%s) xLateESC(%d)\n",
   //            m_aCCSID, eCCSID,m_cgiMode.c_str(),m_bXLateEscaped);

      // When multipart/form data is detected, it is received untranslated.
      // Therefore, unlike other methods, we need to be able to
      // compare values in the received character set (CCSID).
      // These iconv() tables provide that support.
   m_sysTools.xLateOpenQTQ( &m_hToASCII,  eCCSID, m_aCCSID);
   m_sysTools.xLateOpenQTQ( &m_hToEBCDIC, m_aCCSID, eCCSID);

   m_sysTools.xLateiConv(&m_hToASCII, asciiDashDash, strlen(asciiDashDash), asciiDashDash, sizeof(asciiDashDash));
   m_sysTools.xLateiConv(&m_hToASCII, asciiCRLF2,    strlen(asciiCRLF2), asciiCRLF2, sizeof(asciiCRLF2));
   m_sysTools.xLateiConv(&m_hToASCII, asciiCRLF,     strlen(asciiCRLF),  asciiCRLF,  sizeof(asciiCRLF));
   m_sysTools.xLateiConv(&m_hToASCII, asciiLFCR2,    strlen(asciiLFCR2), asciiLFCR2, sizeof(asciiLFCR2));
   m_sysTools.xLateiConv(&m_hToASCII, asciiLFCR,     strlen(asciiLFCR),  asciiLFCR,  sizeof(asciiLFCR));

   if ( getenv("REDIRECT_QUERY_STRING") != NULL )
   {
      redirect_qry = getenv("REDIRECT_QUERY_STRING");
      if ( getenv("REDIRECT_REQUEST_METHOD") != NULL )
      {
        redirect_method = getenv("REDIRECT_REQUEST_METHOD");
      }
   }
   if ( HTTP_USER_AGENT == NULL )
      Qp0zLprintf("%s\n",errorString(300));


   if ( REQUEST_METHOD == NULL )
   {
    Qp0zLprintf("%s\n", errorString(103));
    m_method.clear();
   }
   else
   {
    m_method = REQUEST_METHOD;
   }
   // Qp0zLprintf("REQUEST_METHOD=%s\n",m_method.c_str());
   if (m_method.compare("GET")==0)
   {
     Qp0zLprintf("QUERY_STRING=%s\n",getenv("QUERY_STRING"));
   }

     const char *conttype = getenv("CONTENT_TYPE");
     m_bMultipart = false;

     if ( stricmp(m_method.c_str(), "POST") == 0 )
     {
      Qp0zLprintf("CONTENT_TYPE=%s\n",conttype);
      if (conttype != NULL && strlen(conttype) > 2)
      {
          std::string ct;
          ct.assign(conttype);

          size_t cType = ct.find(multiPart);
          if (cType == std::string::npos)
          {
             cType = ct.find(multiPartMixed);
             if (cType != std::string::npos)
             {
                m_bMultipartMixed = true;
             }
          }

          if (cType != std::string::npos)
          {
             size_t bLoc = ct.find(boundary, cType);
             if (bLoc != std::string::npos)
             {
                char theBoundary[256];
                memset(theBoundary, 0x00, sizeof(theBoundary));
                ct.erase(0,bLoc);

                if (sscanf(ct.c_str(),"boundary=%255s", theBoundary) >= 1)
                {
                   m_boundary = "--";
                   m_boundary.append(theBoundary);
                   Qp0zLprintf("Using Boundary=%s\n",m_boundary.c_str());
                   m_bMultipart = true;
                }
             }
          }
      }
     }


   const char* CL = CONTENT_LENGTH;
   m_bEncodeValues = false;   // UnEscape values only when GET method is used.

   if ( stricmp(m_method.c_str(), "GET") == 0 )
   {
   //===========================================
   // Get posting info from environment variable
   //===========================================

     if (QUERY_STRING == NULL)
     {
       Qp0zLprintf("QUERY_STRING is NULL\n");
       return -1;
     }

     m_queryStg = QUERY_STRING;
     if ( m_queryStg.empty() )
     {
       m_nodeVariables.clear();
       Qp0zLprintf("%s\n",errorString(101));
       return -1;
     }
     m_contentLength = m_queryStg.length();
  }
     // If POST and is NOT a MultiPart form then read from stdin
  else if ( stricmp(m_method.c_str(), "POST") == 0  && !m_bMultipart)
  {
   //===========================================
   // Get posting info from stdin
   //===========================================
    if ( CL == NULL )
    {
       Qp0zLprintf("%s\n", errorString(102));
    }
    else
    {
     m_contentLength = atoi( CL );
     if ( m_contentLength > 0 )
     {
       char *formData = new char[m_contentLength+2];
       std::cin.read(formData, m_contentLength);
       m_queryStg.append(formData, m_contentLength);
       delete [] formData;
       formData = NULL;

       if (m_webLog.is_open())
       {
          m_webLog << "CGI Start: " << cin.gcount() << " characters read from cin" << endl;
          m_webLog << "read stdin: " << m_queryStg << endl;
       }
     }
   }
  }
  else if ( stricmp(m_method.c_str(), "POST") == 0  && m_bMultipart)
  {
    if ( CL == NULL )
    {
       Qp0zLprintf("%s\n", errorString(102));
    }
    else
    {
       m_contentLength = atoi( CL );
       parseMultipart();

       // Qp0zLprintf(":: cgiParse::init() %d QUERY_STRING=%s\n",m_contentLength,m_queryStg.c_str());
    }
  }

     //==============================
     // Post-Init processing.
     // Created the SQL iQuery Session Variable pairs.
     //==============================
     std::string key;
     std::string dataValue;
     size_t start  = 0;
     size_t pos    = 0;
     size_t len    = 0;
      if (!m_bMultipart)
      {
        m_bEncodeValues = true;   // Apparently GET as well as POST need unEscaping
        while( pos < m_contentLength )
        {
         if ( (pos = m_queryStg.find('=', start)) == std::string::npos )
         {
            Qp0zLprintf("%s -- CONTENT_LENGTH=%d\n", errorString(201),m_contentLength);
            Qp0zLprintf("iQ: cgiParse::init() QUERY_STRING=%s\n",m_queryStg.c_str());
            return -1;
         }


         len = pos - start;
         key = m_queryStg.substr(start,len);
         start = pos + 1;
         if ( (pos = m_queryStg.find('&', start)) != std::string::npos )
            len = pos - start;
         else {
            len = m_queryStg.length() - start;
         }
         dataValue = m_queryStg.substr(start,len);
         start = pos+1; // Skip past the ampersand.

         addKey( key,  dataValue );

        }
        // These 3 lines log the CGI Form variables and their content to the joblog.
       // Qp0zLprintf("cgiParse::formDump METHOD=%s\n", m_method.c_str());
       // for (std::multimap<std::string,CSessionVariable>::iterator it=m_nodeVariables.begin(); it!= m_nodeVariables.end(); ++it)
       //   Qp0zLprintf("%s=%s\n", (*it).first.c_str() , (*it).second.data.c_str());
      }

 if (option == 2 && m_nodeVariables.size() > 0)
 {
    Qp0zLprintf("QUERY_STRING=%s\n",m_queryStg.c_str());
 }

 if (!m_nodeVariables.empty() && option != 3)
 {
    if (m_nodeVariables.size() == 1)
       Qp0zLprintf(" ==> 1 CGI Variable detected.\n");
    else
       Qp0zLprintf(" ==> %d CGI Variables detected.\n", m_nodeVariables.size());

 }
 else if (option != 3)
 {
    Qp0zLprintf(" ==> No CGI Variables detected.\n", m_nodeVariables.size());
 }
 return m_contentLength;
}

void CGIParse::getQueryString(std::string& qs)
{
    qs = m_queryStg;
}

void CGIParse::endMessage( const char* title, const char* message )
{
 //non-browser messages
 if ( title == NULL )
 {
  cerr << message << "\n\n";
  exit(0);
 }

 //prints web error message and terminates application
 //===================================================
 printMime(); //send mime-type if not sent yet

 cout
  << "<table border=\"1\" width=\"415\">\n"
  << "    <tr bgcolor=\"000088\">\n"
  << "        <td><font face=\"Arial\" size=\"2\" color=\"ffffff\">"
  << "<b>" << title << "</b></font></td>\n"
  << "    </tr>\n"
  << "    <tr>\n"
  << "        <td>\n"
  << "            <font face=Arial><i>" << message << "</i></font>\n"
  << "            <hr noshade>\n"
  << "            <font face=Arial size=1>Please report this issue to: "
  << " (<a href=\"mailto:support@sqliQuery.com\">email SQL iQuery Support</a>)</font>\n"
  << "        </td>\n"
  << "    </tr>\n"
  << "</table>" << endl;

  exit( 0 );

}

char* CGIParse::getCGIBuffer()
{
   if (m_cgiVector.empty())
   {
      return (char*)NULL;
   }
       // IBM C++ doesn't have the :data() method to return a ptr to the vector data. :(
   return (char*) &m_cgiVector[0];
}

char*  CGIParse::setCGIBufferSize( int bufSize )
{
   if (m_cgiVector.empty() || bufSize > m_cgiVector.size())
   {
      m_cgiVector.resize( bufSize + 1, 0x00);
   }
   m_pCGIData = getCGIBuffer();
   return m_pCGIData;
}

void  CGIParse::deleteCGIBuffer( )
{
   if (!m_cgiVector.empty())
   {
      m_cgiVector.clear();
   }
   m_pCGIData = NULL;
}

size_t CGIParse::cgiOut( const std::string& buffer, int lineFeedCount)
{

      int  rc = pthread_mutex_lock(&cgi_mutex);
      size_t rtnVal = fwrite(buffer.c_str(),1,buffer.length(),stdout);
      for (int i = 0 ; i < lineFeedCount ; i++)
      {
        fwrite("\n",1,1,stdout);
      }
      pthread_mutex_unlock(&cgi_mutex);
      return rtnVal;
}

size_t CGIParse::cgiOutHdr( const std::string& buffer, int lineFeedCount)
{
      int  rc = pthread_mutex_lock(&cgi_mutex);
      size_t rtnVal = 0;
      if (!buffer.empty() && buffer.length() != 0)
      {
        rtnVal = fwrite(buffer.c_str(),1,buffer.length(),stdout);
      }
      for (int i = 0 ; i < lineFeedCount ; i++)
      {
        fwrite("\n",1,1,stdout);
      }
      pthread_mutex_unlock(&cgi_mutex);
      return rtnVal;
}

void CGIParse::cgiLineFeed(int lineFeedCount)
{
      int  rc = pthread_mutex_lock(&cgi_mutex);
      for (int i = 0 ; i < lineFeedCount ; i++)
      {
        fwrite("\n",1,1,stdout);
      }
      pthread_mutex_unlock(&cgi_mutex);
}

void CGIParse::cgiFlush(int lineFeedCount)
{
      int  rc = pthread_mutex_lock(&cgi_mutex);
      for (int i = 0 ; i < lineFeedCount ; i++)
      {
        fwrite("\n",1,1,stdout);
      }
      fflush(stdout);
      pthread_mutex_unlock(&cgi_mutex);
}

int CGIParse::parseHex( std::string& urlStg )
{
   size_t start = 0;
   size_t pos   = 0;
   int count   = 0;

   std::replace( urlStg.begin(), urlStg.end(), '+', ' '); // UnEscape Plus+ to blanks
   char hex[8];
   char eValue[4];
   char aValue[4];
   memset(hex,0x00,sizeof(hex));
   memset(aValue,0x00,sizeof(aValue));
   memset(eValue,0x00,sizeof(eValue));

  while( (pos = urlStg.find('%', pos)) != std::string::npos )
  {
   count++;
   _CPYBYTES(hex, urlStg.substr(pos+1,2).c_str(), 2);
   aValue[0] = convertFromHex( hex );
   if (m_bXLateEscaped)
   {    //Convert 1 byte from ASCII to EBCDIC

     m_sysTools.xLateiConv((iconv_t*)&m_hToEBCDIC, aValue, strlen(aValue), eValue, strlen(aValue));
     Qp0zLprintf("CCSID unEscape: Hex(%s) char(%s) toEBCDIC(%s)\n",hex,aValue,eValue);
   }
   else
   {
      eValue[0] = aValue[0];
   }
   urlStg.replace(pos,3,1, eValue[0]);
   pos++;  // skip past the converted symbol in case it is a % sign.
  }
  return count;
}



  //  e.g., findRepl( "&FROMDATE", "2015-06-10", orgValue);
  //  Replaces all occurrances of &FROMDATE with date for June 10, 2015 in the std::string orgValue)
void CGIParse::findRepl(const std::string& from, const std::string& toValue, std::string& orgStg)
{
    if(from.empty())
        return;

    size_t pos = 0;
    while((pos = orgStg.find(from, pos)) != std::string::npos) {
        if (toValue.empty())
          orgStg.erase(pos,from.length());
        else;
          orgStg.replace(pos, from.length(), toValue);
        pos += toValue.length(); // In case 'to' contains 'from', like replacing 'x' with 'yx'
    }
}

const char CGIParse::convertFromHex( const char* what ) const
{
    // "UnHex" char<-Hex or X'F3' to '3'.
    // The MI function is left-to-right and the length is always
    // the number of hex characters (2 for each single character).
    //   cvtch( 1-byte-charResult,  2-byte-HexValue, num-hex-characters );
     register char digit;
     cvtch(&digit, what, 2);
     return digit;
}

void CGIParse::addKey( std::string& cgiVar, std::string& cgiValue)
{
   m_formVar   = cgiVar;
   m_formValue = cgiValue;
   size_t      pos = 0;

   int rc = 0;
   rc = pthread_mutex_lock(&cgi_mutex);
   if (rc == EBUSY)
        return;
     if (m_bEncodeValues)
     {
       parseHex( cgiVar );    // Really NOT sure this is necessary
       m_formVar   = cgiVar;
       parseHex( cgiValue );
       m_formValue = cgiValue;
     }

     pos = m_formVar.find_first_not_of("& ");
     if (pos != std::string::npos && pos > 0)
        m_formVar.erase(0,pos);

     pos = m_formVar.find_last_not_of(' ');
     if ((pos != std::string::npos) && (pos + 1 < m_formVar.length()))
        m_formVar.erase(pos+1);

          // All CGI Form Variable names are stored as Lower Case characters only.
     std::transform(m_formVar.begin(), m_formVar.end(), m_formVar.begin(), ::tolower);

     CSessionVariable formData;
     formData.assign(m_formValue);
     m_nodeVariables.insert( std::pair<string,CSessionVariable>(m_formVar, formData) );
   //     abcdefg
   //   rc = pthread_mutex_lock(&cgi_mutex);
     pthread_mutex_unlock(&cgi_mutex);

}

void CGIParse::addKey( const char* cgiVar, const char* cgiValue)
{
  m_formVar   = cgiVar;
  m_formValue = cgiValue;

  addKey( cgiVar, cgiValue);
}

//properly formats a neat HTML table of key/value pairs stored in the object
//==========================================================================
void CGIParse::formDump()
{

  if ( !m_nodeVariables.empty() && m_webLog.is_open())
  {
     m_webLog << "cgiParse::formDump METHOD=" << m_method << "\r\n";
     Qp0zLprintf("cgiParse::formDump METHOD=%s\n", m_method.c_str());
     for (std::multimap<string,CSessionVariable>::iterator it=m_nodeVariables.begin(); it!= m_nodeVariables.end(); ++it) {
         Qp0zLprintf("cgiParse::formDump METHOD=%s\n", m_method.c_str());
          m_webLog << (*it).first << "=" << (*it).second.data << "\r\n";
     }
  }
}

  // GetFirstFile returns a pointer to the first file uploaded
  // It also returns the CGI Variabel name to the first(required) parameter
CSessionVariable& CGIParse::getFirstFile(std::string& varName)
{
     m_cgiVariable.clear();     // empty/dumy CGI var returned when no value exists

     if ( !m_nodeVariables.empty() )
     {
       m_itr = m_nodeVariables.begin();
       if ((*m_itr).second.pFileData != NULL)
       {
         varName = (*m_itr).first;   // returns variable name
         return (*m_itr).second;
       }
     }
     return m_cgiVariable;
}

CSessionVariable& CGIParse::getFirstVar(std::string& varName)
{
    m_cgiVariable.clear();
    if ( !m_nodeVariables.empty() )
    {
      m_itr = m_nodeVariables.begin();
      varName = (*m_itr).first;   // returns variable name
      return (*m_itr).second;
    }
    return m_cgiVariable;
}

const char* CGIParse::getFirstVarValue(std::string& varName)
{
    if ( !m_nodeVariables.empty() )
    {
      m_itr = m_nodeVariables.begin();
      varName = (*m_itr).first;   // returns variable name
      return (*m_itr).second.data.c_str();
    }
    return NULL;
}

const char* CGIParse::getNextVarValue(std::string& varName,cgicvt cvtVarCase,cgicvt cvtValCase)
{
     if ( !m_nodeVariables.empty() && m_itr != m_nodeVariables.end())
     {
       m_formVar  = (*m_itr).first;   // returns variable's name
       m_formData = (*m_itr).second.data;  // returns variable's value
       m_itr++;

       if (cvtVarCase==toupper) // Return the Variable ID as UPPER CASE text?
          std::transform(m_formVar.begin(), m_formVar.end(), m_formVar.begin(), ::toupper);
       else if (cvtVarCase==tolower) // Return the Variable ID as lower case text?
          std::transform(m_formVar.begin(), m_formVar.end(), m_formVar.begin(), ::tolower);

       if (cvtValCase==toupper) // Return the value as UPPER CASE text?
          std::transform(m_formData.begin(), m_formData.end(), m_formData.begin(), ::toupper);
       else if (cvtValCase==tolower) // Return the value as lower case text?
          std::transform(m_formData.begin(), m_formData.end(), m_formData.begin(), ::tolower);

       varName = m_formVar;  // RC: 09July2016 - was incorrectly copying the value/data into the Variable name.
       return m_formData.c_str();
     }

     return (const char*)NULL;
}


CSessionVariable& CGIParse::getNextVar(std::string& varName, cgicvt cvtVarCase,cgicvt cvtValCase)
{
     m_cgiVariable.clear();

     if ( !m_nodeVariables.empty() && m_itr != m_nodeVariables.end())
     {
       m_formVar  = (*m_itr).first;        // returns variable's name
       m_formData = (*m_itr).second.data;  // returns variable's value
       m_cgiVariable = (*m_itr).second;    // returns variable object

       m_itr++;

       if (cvtVarCase==toupper) // Return the Variable ID as UPPER CASE text?
          std::transform(m_formVar.begin(), m_formVar.end(), m_formVar.begin(), ::toupper);
       else if (cvtVarCase==tolower) // Return the Variable ID as lower case text?
          std::transform(m_formVar.begin(), m_formVar.end(), m_formVar.begin(), ::tolower);

       if (cvtValCase==toupper) // Return the value as UPPER CASE text?
          std::transform(m_cgiVariable.data.begin(), m_cgiVariable.data.end(), m_cgiVariable.data.begin(), ::toupper);
       else if (cvtValCase==tolower) // Return the value as lower case text?
          std::transform(m_cgiVariable.data.begin(), m_cgiVariable.data.end(), m_cgiVariable.data.begin(), ::tolower);

       varName = m_formVar;  // RC: 09July2016 - was incorrectly copying the value/data into the Variable name.
     }

     return m_cgiVariable;
}

unsigned int CGIParse::getVarCount( const char* cgiVar )
{
    int len;
    int pos;
    std::string varKey;

    if (cgiVar != NULL && strlen(cgiVar) > 0) {
       varKey = cgiVar;
       len = varKey.find_last_not_of(' ');
       if ((len != std::string::npos) && (len + 1 < varKey.length()))
         varKey.erase(len+1);
       pos = varKey.find_first_not_of("& ");
       if (pos == std::string::npos)
          varKey.clear();
        else if (pos > 0)
          varKey.erase(0,pos);

            // Make variable ID lower case
       std::transform(varKey.begin(), varKey.end(), varKey.begin(), ::tolower);

       if (!varKey.empty())
          return m_nodeVariables.count(varKey);
    }
    return m_nodeVariables.size();
}

const char* CGIParse::getVarValue(const char* cgiVar,int occurs, cgicvt cvtValueCase /* = none */)
{
     int i, len;
     size_t pos = 0;

     std::multimap<string,CSessionVariable>::iterator itr;
     std::pair <std::multimap<string,CSessionVariable>::iterator,
                std::multimap<string,CSessionVariable>::iterator> ref;

     m_formData.clear();

        // callers of this function may specify variable names
        // using either "MYVAR" or "&MYVAR" syntax.
        // we strip off the leading "&" if specified and use
        // only the variable name portion.
     m_formVar = cgiVar;
     CSysStatic::triml(m_formVar, "& ");
     CSysStatic::trimr(m_formVar);

          // Since we store the CGI variable IDs in lower case, we convert
          // the target variable ID to lower case for search purposes.
     std::transform(m_formVar.begin(), m_formVar.end(), m_formVar.begin(), ::tolower);


     ref = m_nodeVariables.equal_range(m_formVar);
     if (ref.first != ref.second && m_nodeVariables.count(m_formVar) >= occurs) {
       itr = ref.first;
       for (i = 1; i < occurs ; i++)
          itr++;
       if (itr != ref.second)
         m_formData = itr->second.data;
     }
     if (cvtValueCase==toupper) // Return the value as UPPER CASE text?
        std::transform(m_formData.begin(), m_formData.end(), m_formData.begin(), ::toupper);
     else if (cvtValueCase==tolower) // Return the value as lower case text?
        std::transform(m_formData.begin(), m_formData.end(), m_formData.begin(), ::tolower);

     return m_formData.c_str();
}


CSessionVariable& CGIParse::getVar(const char* cgiVar, int occurs)
{
     int i, len;
     size_t pos = 0;

     std::multimap<string,CSessionVariable>::iterator itr;
     std::pair <std::multimap<string,CSessionVariable>::iterator,
                std::multimap<string,CSessionVariable>::iterator> ref;

     m_formData.clear();

        // callers of this function may specify variable names
        // using either "MYVAR" or "&MYVAR" syntax.
        // we strip off the leading "&" if specified and use
        // only the variable name portion.
     m_formVar = cgiVar;
     CSysStatic::triml(m_formVar, "& ");
     CSysStatic::trimr(m_formVar);

          // Since we store the CGI variable IDs in lower case, we convert
          // the target variable ID to lower case for search purposes.
     std::transform(m_formVar.begin(), m_formVar.end(), m_formVar.begin(), ::tolower);


     ref = m_nodeVariables.equal_range(m_formVar);

     if (ref.first != ref.second && m_nodeVariables.count(m_formVar) >= occurs) {
       itr = ref.first;
       for (i = 1; i < occurs ; i++)
          itr++;
       if (itr != ref.second)
         m_cgiVariable = itr->second;
     }

     return m_cgiVariable;
}

void  CGIParse::envDump( )
{
 const char* user_agent = HTTP_USER_AGENT;
 if ( user_agent != NULL )
 {
  printMime();

  cout
   << "<table border=\"1\" width=\"100%\">\n"
   << "    <tr valign=\"top\">\n"
   << "        <th bgcolor=\"000000\" colspan=\"2\">"
   << "<font color=\"ffffff\">CGI Enviroment Variable Dump</font></th>\n"
   << "    </tr>\n"
   << "    <tr valign=\"top\">\n"
   << "        <th bgcolor=\"ff0000\"><b>Variable<b></th>"
   << "<th bgcolor=\"ff0000\"><b>Value</b></th>\n"
   << "    </tr>\n" << endl;
 }
 else
 {
  cout << setw(25) << ios::left << "Environment Variable"
   << setw(55) << "Value\n"
   << setw(25) << "===================="
   << setw(55) << "====================" << endl;
 }

 //Standard ENV vars returned for others
 //=====================================
 char* temp[] = { "AUTH_TYPE", "GATEWAY_INTERFACE", "LOGON_USER",
     "REQUEST_METHOD", "QUERY_STRING", "CONTENT_LENGTH",
     "CONTENT_TYPE", "DOCUMENT", "DOCUMENT_URI",
     "DOCUMENT_ROOT", "HTTP_ACCEPT", "HTTP_ACCEPT_LANGUAGE",
     "HTTP_CONNECTION", "HTTP_HOST", "HTTP_REFERER",
     "HTTP_USER_AGENT", "HTTP_COOKIE", "REMOTE_ADDR",
     "REMOTE_HOST", "REMOTE_USER", "REMOTE_IDENT",
     "SCRIPT_FILENAME", "SCRIPT_NAME", "SERVER_ADMIN",
     "SERVER_PORT", "SERVER_PROTOCOL", "SERVER_SOFTWARE",
     "SERVER_NAME", "PATH", "PATH_INFO",
     "PATH_TRANSLATED" };

 const UINT size = sizeof(temp) / sizeof(char*);
 for( UINT i = 0; i < size; i++ )
 {
  const char* value = getenv(temp[i]);
  if ( value != NULL )
  {
   if ( user_agent != NULL )
    cout << "    <tr><td bgcolor=\"00aaff\"><b>" << temp[i]
     << "</b></td><td>" << value << "</td></tr>" << endl;
   else
    printf("%-40s%-40s\n", temp[i], value);
  }
 }

 if ( user_agent != NULL )
  cout << "</table>" << endl;
}

//sends mime type to client, default mime type is "text/html"
//to terminate the mime heading for the client, either one of
//of the following forms of printMime must be called:
// printMime();
// printMime( "text/html" ); //same as previous
// printMime( "other mime", true ); //true signals mime is complete
//=====================================================================
void CGIParse::printMime( const char* mime, bool isLast )
{
 if ( !m_mime_sent )
 {
  cout << "Content-type: " << mime << endl;
  m_mime_sent = true;

  if ( isLast || strcmp(mime, "text/html") == 0 )
  {
   cout << endl << endl;  // terminate mime header and CGI headers (2 linefeeds)
  }
 }
}

//custom error messages for CGIParse class
//========================================

const char* CGIParse::errorString( const UINT number ) const
{
 switch( number )
 {
 case 100:
  return "QUERY_STRING is formated incorrectly";
 case 101:
  return "QUERY_STRING enviornment is NULL";
 case 102:
  return "CONTENT_LENGTH enviornment is NULL";
 case 103:
  return "REQUEST_METHOD enviornment is NULL";
 case 201:
  return "Value string is missing in a [key=value] pair";
 case 300:
  return "Must be executed by a browser with a QUERY or FORM";

 default:
  return "No Message Specified";
 }
}


void CGIParse::sendError( const char* errmsg, const char* addlText)
{
      if (errmsg == NULL || strlen(errmsg)==0)
         return;

      Qp0zLprintf("cgiParse: Error - >>%s<<\n", errmsg);
      cout << "<span style=\"color:blue; font-size:medium;\">"
           << errmsg << "</span>" << endl;
      if (addlText != NULL) {
         cout << "<span style=\"color:red; font-size:large;\">"
              << addlText << "</span>\"" << endl;
      }
      cout << "<br /><span style=\"color:blue; font-size:medium;\">"
           << "Press the back button on your browser.</span>" << endl;

}

void CGIParse::parseMultipart()
{

   char* formData = NULL;

   char* asciiBoundary = NULL;
   char* eBoundary = NULL;
   char* pHeader = NULL;
   char* pEndHdr  = NULL;
   char* pNextHdr = NULL;

   unsigned char* pValue = NULL;
   unsigned char* pData  = NULL;
   int   nEndSize = 0;
   int   offset = 0;
   int   endOfData = 0;
   bool  bFinished = false;

     std::string multiPartHeader;
     std::string ct = CONTENT_TYPE;

     size_t pos = ct.find( boundary );

     Qp0zLprintf("iQWeb: Multipart/Form Data with boundary=%s\n",m_boundary.c_str());

        ////////////////////////////////////////////////////////////////////
        // Temporary variables for Multi-Part Form Data Boundary marker.
        ////////////////////////////////////////////////////////////////////
        // Make AscII boundary string
     asciiBoundary = new char[m_boundary.length()+3];
     eBoundary     = new char[m_boundary.length()+3];
     memset(eBoundary,0x00,m_boundary.length()+3);
     strcpy(eBoundary,m_boundary.c_str());
     memset(asciiBoundary,0x00,m_boundary.length()+3);

     m_sysTools.xLateiConv(&m_hToASCII, eBoundary, strlen(eBoundary), asciiBoundary, m_boundary.length()+2);
     m_boundary.clear();
       // Assign the ASCII boundary to the member variable for faster access
     m_boundary.assign(asciiBoundary);

        // Delete Boundary
     delete [] asciiBoundary;
     delete [] eBoundary;
     asciiBoundary = NULL;
     eBoundary = NULL;

     deleteCGIBuffer();
     m_pCGIData = setCGIBufferSize(m_contentLength+1);

     std::cin.read(m_pCGIData, m_contentLength);  // READ CGI Data from StdIn

     int bytesRead = std::cin.gcount();          // Bytes read from StdIn

     Qp0zLprintf("Content Length: %d - Bytes Read %d\n", m_contentLength, bytesRead);

     offset = 0;
     bFinished = false;
     formData = getCGIBuffer();

   while ( !bFinished )
   {
     pEndHdr = NULL;
     pNextHdr = NULL;
     pData = NULL;
     pValue = NULL;
     nEndSize = 0;

     pHeader = fastScan(m_boundary.c_str(), formData+offset, m_contentLength-offset);

     if (pHeader == NULL)
     {
        Qp0zLprintf("pHeader boundary scan returned NULL\n");
        bFinished = true;
        break;
     }

     pHeader += m_boundary.length();  // Skip past boundary marker.

          // Note: I did it this way to avoid complex nesting conditions
     pEndHdr = fastScan(asciiCRLF2, pHeader, m_contentLength);
     if (pEndHdr != NULL)
     {
         nEndSize = strlen(asciiCRLF2);   //  \r\n\r\n is 4 long
     }
     else
     {
       pEndHdr = fastScan(asciiLFLF, pHeader, m_contentLength);
       if (pEndHdr != NULL)
       {
           nEndSize = strlen(asciiLFLF);   //  \r\n\r\n is 4 long
       }
       else
       {
         pEndHdr = fastScan(asciiCRCR, pHeader, m_contentLength);
         if (pEndHdr != NULL)
         {
             nEndSize = strlen(asciiCRCR);   //  \r\n\r\n is 4 long
         }
         else
         {
           pEndHdr = fastScan(asciiLFCR2, pHeader, m_contentLength);
           if (pEndHdr != NULL)
           {
               nEndSize = strlen(asciiLFCR2);   //  \r\n\r\n is 4 long
           }
         }
       }
     }

     if (pEndHdr == NULL)
     {
       Qp0zLprintf("Invalid CGI Header detected in Multipart Form data.\n");
       bFinished = true;
       break;
     }

     CSessionVariable fileUpload;
     m_formField.clear();
     m_formValue.clear();
     char dataF1[256];
     memset(dataF1,0x00,sizeof(dataF1));

     if (pHeader != NULL && pEndHdr != NULL)
     {

       pValue = (unsigned char*)(pEndHdr + nEndSize);
       int len = ((char*)pValue) - formData;  // Length used through start of Value

       // Convert the header to EBCDIC
       int hdrLen =  pEndHdr - pHeader;
       multiPartHeader.assign(pHeader, pEndHdr - pHeader);
       char* eHeader = new char[multiPartHeader.length()*2];
       if (eHeader != NULL)
       {
         strcpy(eHeader,multiPartHeader.c_str());
         m_sysTools.xLateiConv(&m_hToEBCDIC, eHeader, strlen(eHeader), eHeader, multiPartHeader.length());
         multiPartHeader.assign(eHeader);
         delete [] eHeader;
         eHeader = NULL;
       }

          // Parse the Header                    ///////////////////////////
       if (parseMPHdr( multiPartHeader ) == 1)   // File Upload ?         //
       {                                         ///////////////////////////
           // At this point we should have the Field Name and file Name (if any)
           // Next extract the uploaded file.
           len = m_contentLength - len;
           char* pEndOfValue = fastScan(m_boundary.c_str(), (const char*)pValue, len);


           if (pEndOfValue != NULL)
           {
             offset = pEndOfValue - formData;

             size_t dataLen = pEndOfValue - (const char*)pValue;

             std::transform(m_formField.begin(), m_formField.end(), m_formField.begin(), ::tolower);

             fileUpload.setFileBuffer(pValue);
             fileUpload.setFileLength(dataLen);
             fileUpload.setFileName(m_fieldFileName);
             fileUpload.setContentType(m_fieldContentType);
             fileUpload.setCCSID( m_aCCSID );
             fileUpload.setDataType(CSessionVariable::file);

             memset(dataF1,0x00,sizeof(dataF1));
             sprintf(dataF1,"*FILE Var: %s FileName: %s Length: %d",m_formField.c_str(),m_fieldFileName.c_str(),dataLen);
             fileUpload.setTextValue(dataF1);
             Qp0zLprintf("CGI Parse detected FILE upload %s\n",dataF1);

             parseHex( m_formField );   // highly unlikely m_formField name is %xy escaped.
             m_nodeVariables.insert( std::pair<string,CSessionVariable>(m_formField, fileUpload) );

             m_formValue.assign(dataF1);

             ///////////////////////////////////////////////////////
             //  addKey( m_formField, m_formValue );
             ////////
             //  REMOVE THE FOLLOWING WHEN File Upload logic is working.
             //  Placeholder for file upload logic.
             ///////////////////////////////////////////////////////
                 if (!m_queryStg.empty() && !m_formField.empty())
                 {
                    m_queryStg.append(1,'&');
                 }

                 if (!m_formField.empty())
                 {
                   m_queryStg.append(m_formField);
                   m_queryStg.append(1,'=');

                   size_t found = m_formValue.find_last_not_of(" \r\n");
                   if (found == std::string::npos)
                      m_formValue.clear();   // The string is all blanks, so clear it.
                   else if (found+1 < m_formValue.length())
                      m_formValue.erase(found+1);

                   m_queryStg.append(m_formValue);
                 }
             ////////
           }
           else
           {
              // Are we done?
              bFinished = true;
           }
      }
      else  // Normal Form Field/Value pair.
      {
           // At this point we should have the Field Name
           // The value should follow the header and continue until the next "boundary".
           // For some reason, I'm seeing a trailing CR/LF at the end of the Value
           // Which puts it before the boundary. So perhaps CR/LF/Boundary should be
           // scanned for, for the end of the Value? I'll have to read the spec again.

           len = m_contentLength - len;
           char* pEndOfValue = fastScan(m_boundary.c_str(), (const char*)pValue, len);

     //    Qp0zLprintf("CGI Parse detected form field upload\n");
           if (pEndOfValue != NULL)
           {
             offset = pEndOfValue - formData;
             len = pEndOfValue - (const char*)pValue;
             char* value = new char[len+2];
             memset(value,0x00,len+2);
             memcpy(value,pValue,len);
             m_sysTools.xLateiConv(&m_hToEBCDIC, value, len, value, len);
             m_formValue.assign(value);
             delete [] value;
             value = NULL;

              // Are we done?
             CSessionVariable formData;
             parseHex( m_formField );
             parseHex( m_formValue );
             CSysStatic::trimr(m_formValue, " \r\n");
             formData.assign(m_formValue);
             formData.setDataType(CSessionVariable::text);
             m_nodeVariables.insert( std::pair<string,CSessionVariable>(m_formField, formData) );
           }
           else
           {
             Qp0zLprintf("Is formField pEndOfValue is NULL\n");
             bFinished = true;
           }

           if (!m_queryStg.empty() && !m_formField.empty())
           {
              m_queryStg.append(1,'&');
           }

           if (!m_formField.empty())
           {
             m_queryStg.append(m_formField);
             m_queryStg.append(1,'=');

             CSysStatic::trimr(m_formValue, " \r\n");
             m_queryStg.append(m_formValue);
           }
      }
    }
    else
    {
       // Qp0zLprintf("bFinished=True (A)\n");
       bFinished = true;
    }
    endOfData = offset + m_boundary.length();
    if (endOfData >= m_contentLength)
    {
       // Qp0zLprintf("bFinished=True (B)\n");
       bFinished = true;
    }
    else if (memcmp(formData+endOfData,asciiDashDash,strlen(asciiDashDash)) == 0)  // end of boundaries? We're done!
    {
       // Qp0zLprintf("bFinished=True (C)\n");
       bFinished = true;
    }
   }

}

int   CGIParse::parseMPHdr( const std::string& hdr )
{
     int  nType = 0;

//const char CGIParse::formData[] = "form-data;";
//const char CGIParse::name[] = "name=";
//const char CGIParse::file[] = "file;";
//const char CGIParse::fileName[] = "filename=";
//const char CGIParse::boundary[] = "boundary=";
//const char CGIParse::contentType[] = "Content-Type:";
//const char CGIParse::dispo[] = "Content-Disposition:";
//const char CGIParse::multiPart[] = "multipart/form-data;";
//const char CGIParse::multiPartMixed[] = "multipart/mixed;";
//const char CGIParse::contectEncoding[] = "Content-Transfer-Encoding:";

     size_t pos = std::string::npos;   // Position of tag name
     size_t start = std::string::npos; // Start of tag entry's value
     size_t end = std::string::npos;   // Ending position of tag entry's value
     size_t eqPos = std::string::npos;    // Ending position of tag entry's value
     size_t qtStart = std::string::npos;  // Ending position of tag entry's value
     size_t qtEnd = std::string::npos;    // Ending position of tag entry's value
     size_t cdPos = std::string::npos;    // Position of Content-Disposition: (Form field info)
     size_t ctPos = std::string::npos;    // Position of Content-type: value
     size_t fnPos = std::string::npos;    // Position of filename=
     size_t nPos  = std::string::npos;    // Position of name=

     cdPos = hdr.find(dispo);         // Position of the embedded Content-Disposition: keyword
     ctPos = hdr.find(contentType);   // An embedded=Content-Type usually means File Upload
     fnPos = hdr.find(fileName);      // filename=
     nPos  = hdr.find(name);          // name=

     char c_fieldName[256];
     char c_fileName[2046];
     char c_contentType[256];
     char c_contentDispo[256];
     memset(c_fieldName,0x00,sizeof(c_fieldName));
     memset(c_fileName,0x00,sizeof(c_fileName));
     memset(c_contentDispo,0x00,sizeof(c_contentDispo));
     memset(c_contentType,0x00,sizeof(c_contentType));

     if (fnPos != std::string::npos) // File (upload) name
     {
         fnPos += strlen(fileName);
         size_t fnStart = fnPos + 1;  // skip first quote
         size_t fnEnd = hdr.find_first_of('\"',fnStart);  // find last quote
         size_t fnLen = fnEnd - fnStart;
         fnLen = std::min<size_t>(fnLen,sizeof(c_fileName));
         memcpy(c_fileName, hdr.substr(fnStart, fnLen).c_str(),fnLen);
     }
     if (nPos != std::string::npos)  // HTML Form Field Name
     {
         nPos += strlen(name);
         size_t nStart = nPos;  // skip first quote
         if (hdr[nStart] == '\"')
         {
           nStart++;
           size_t nEnd = hdr.find_first_of('\"',nStart);  // find last quote
           size_t nLen = nEnd - nStart;
           nLen = std::min<size_t>(nLen,sizeof(c_fileName));
           memcpy(c_fieldName, hdr.substr(nStart, nLen).c_str(), nLen);
         }
         else
         {
           sscanf(hdr.c_str()+nPos,"name=%255s", c_fieldName);
         }
     }

     if (ctPos != std::string::npos)
       sscanf(hdr.c_str()+ctPos,"Content-Type: %255s", c_contentType);
     if (cdPos != std::string::npos)
       sscanf(hdr.c_str()+cdPos,"Content-Disposition: %255s", c_contentDispo);

   //   Qp0zLprintf(">>Parsing Header...\n");
   //   Qp0zLprintf(" ::Header: %s\n",hdr.c_str());
   //   Qp0zLprintf("   name=%s\n",c_fieldName);
   //     Qp0zLprintf("   Content-Disposition: %s\n",c_contentDispo);
   //   Qp0zLprintf("   filename=%s\n",c_fileName);
   //     Qp0zLprintf("   Content-Type: %s\n",c_contentType);

     if (nPos != std::string::npos)
     {
       m_fieldName = c_fieldName;
       CSysStatic::trim(m_fieldName," \";");
       m_formField = m_fieldName;
     }

     if (fnPos != std::string::npos && strlen(c_fileName) > 0)
     {
       m_fieldFileName = c_fileName;
       CSysStatic::trim(m_fieldFileName," \";");
       m_formValue = m_fieldFileName;  // TEMP ACTION until upload storage routine is completed.
       nType = 1;  // Means it has a file upload to process
     }
     if (cdPos != std::string::npos && strlen(c_contentDispo) > 0)
     {
       m_fieldDispo = c_contentDispo;
       CSysStatic::trimr(m_fieldDispo," \";");
     }
     if (ctPos != std::string::npos && strlen(c_contentType) > 0)
     {
       m_fieldContentType = c_contentType;
       CSysStatic::trim(m_fieldContentType," \";");
     }

   return nType;
}

char* CGIParse::fastScan(const char* pattern, const char* pData, unsigned int dataLen)
{
     m_pValue = NULL;
     char* pLoc = NULL;
     char  searchByte;
     int   nLocation = 0;  // Reserved
     int   nPatLen = 0;
     if (pattern != NULL || strlen(pattern) > 0)
     {
       nPatLen = strlen(pattern);
     }

     if (nPatLen == 0) return NULL;

     searchByte = pattern[0];
     pLoc=(char*)memchr(pData,searchByte, dataLen);

     while (pLoc != NULL)
     {
           if (memcmp(pattern, pLoc, nPatLen)==0)   // Match!
           {
               break;
           }
           if ((pLoc + nPatLen) > (pData + dataLen))
           {
                pLoc = NULL;
                break;
           }
           pLoc++;
           pLoc=(char*)memchr(pLoc,searchByte, dataLen);
     }

     if (pLoc != NULL)
     {
       m_pValue = pLoc;
     }
     return  m_pValue;
}
