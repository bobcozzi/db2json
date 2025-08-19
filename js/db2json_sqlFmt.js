// sqlFmt.js
/**
 * Checks if the match is a real SQL keyword (not a host variable like :SELECT or &WHERE).
 */
function isRealKeyword(sqlKwd, matchIndex) {
  // Look behind for the previous non-whitespace character
  let i = matchIndex - 1;
  while (i >= 0 && /\s/.test(sqlKwd[i])) i--;
  if (i >= 0 && (sqlKwd[i] === ':' || sqlKwd[i] === '&')) {
    return false;
  }
  return true;
}

function formatSQL(sql) {
  const keywords = [
    'with', 'select', 'from', 'where', 'and', 'or', 'order by', 'group by', 'having',
    'join', 'inner join', 'left join', 'right join', 'on', 'as', 'in', 'like',
    'between', 'is null', 'is not null', 'exists', 'not exists',
    'declare', 'cursor', 'for', 'prepare', 'open', 'fetch', 'close'
  ];
  // Replace keywords only if they are real SQL keywords (not host variables)
  let formattedSQL = sql.trim().replace(/\s+/g, ' ');
  for (const keyword of keywords.sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${keyword}\\b`, 'gi');
    formattedSQL = formattedSQL.replace(re, function(match, offset) {
      if (isRealKeyword(formattedSQL, offset)) {
        return keyword.toUpperCase();
      }
      return match;
    });
  }

  // Handle DECLARE ... CURSOR FOR with line breaks
  formattedSQL = formattedSQL.replace(
    /\bDECLARE\s+(\w+)\s+CURSOR\s+FOR\s+(SELECT\b[\s\S]+)/i,
    function(_, name, select) {
      return `DECLARE ${name} CURSOR FOR\n${select.trim()}`;
    }
  );

  // Use \n for EOL
  const eol = '\n';

  // Only insert EOL before real SQL keywords, not host variables
  function insertEOLIfRealKeyword(pattern) {
    let result = '';
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(formattedSQL)) !== null) {
      const matchIndex = match.index;
      if (isRealKeyword(formattedSQL, matchIndex)) {
        result += formattedSQL.slice(lastIndex, matchIndex) + eol + match[1];
      } else {
        result += formattedSQL.slice(lastIndex, pattern.lastIndex - match[1].length) + match[1];
      }
      lastIndex = pattern.lastIndex;
    }
    result += formattedSQL.slice(lastIndex);
    formattedSQL = result;
  }

  insertEOLIfRealKeyword(/\b(SELECT|FROM|WHERE|ORDER BY|GROUP BY|HAVING|JOIN|ON)\b/gi);
  insertEOLIfRealKeyword(/\b(AND|OR)\b/gi);

  // Indentation logic
  const majorKeywords = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'WITH', 'DECLARE', 'CURSOR', 'FOR'
  ];
  const childKeywords = [
    'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'ON', 'AND', 'OR'
  ];
  const lines = formattedSQL.split(/\n/);
  let indented = [];
  let lastMajor = null;
  let firstMajorFound = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimEnd();
    let upper = line.trimStart().toUpperCase();
    let indent = '';
    let matched = false;
    for (const kw of majorKeywords) {
      if (upper.startsWith(kw)) {
        if (!firstMajorFound) {
          indent = '';
          firstMajorFound = true;
        } else {
          indent = '  ';
        }
        lastMajor = kw;
        matched = true;
        break;
      }
    }
    if (!matched) {
      for (const kw of childKeywords) {
        if (upper.startsWith(kw)) {
          // Indent 1 space past the end of the parent keyword
          let parentLen = lastMajor ? lastMajor.length : 0;
          indent = ' '.repeat(parentLen + 1);
          matched = true;
          break;
        }
      }
    }
    if (!matched && lastMajor) {
      // For lines that are not keywords but are children, keep same indent as last child
      if (indented.length > 0) {
        let prev = indented[indented.length - 1];
        let prevIndent = prev.match(/^(\s*)/)[1];
        indent = prevIndent;
      }
    }
    indented.push(indent + line.trimStart());
  }
  return indented.join('\n');
}

// Export for use in other scripts if needed
// window.formatSQL = formatSQL;
