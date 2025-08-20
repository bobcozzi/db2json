# db2json JSON Response Structure


This document describes the JSON structure returned by the db2json CGI service. It is intended for developers integrating with or consuming the output of db2json, especially those familiar with IBM i, DB2, and classic IT data paradigms.

---

## Top-Level Structure

The response is always a JSON object. The two primary successful result nodes are:
- `attr`
- `data`

An error response will contain an `error` node.

### Example (Success)
```json
{
  "attr": [ ... ],
  "data": [ ... ]
}
```

### Example (Error)
```json
{
  "error": {
    "sqlstate": "DB2JSON",
    "msgtext": "No results generated."
  }
}
```

---


## Node: `attr` (Column Metadata)

The `attr` node is an array of objects, each describing a column in the result set. Each object may contain:

| Property   | Type    | Description |
|------------|---------|-------------|
| `name`     | string  | The column name as returned by DB2. |
| `type`     | string  | SQL data type (e.g., CHAR, DECIMAL, INTEGER, etc.). |
| `length`   | number  | Length/size of the column. |
| `decimals` | number  | Number of decimal places (for numeric types). |
| `allownull`| boolean | True if the column allows NULLs. |
| `colhdr`   | string  | Column heading/label (if available). |

#### Example
```json
"attr": [
  {
    "name": "CUSTNO",
    "type": "CHAR",
    "length": 8,
    "decimals": 0,
    "allownull": false,
    "colhdr": "Customer Number"
  },
  {
    "name": "BALANCE",
    "type": "DECIMAL",
    "length": 9,
    "decimals": 2,
    "allownull": true,
    "colhdr": "Balance Due"
  }
]
```

---


## Node: `data` (Result Rows)

The `data` node is an array of objects, each representing a row. Each object’s keys correspond to the `name` values in `attr`.

#### Example
```json
"data": [
  { "CUSTNO": "1001", "BALANCE": 123.45 },
  { "CUSTNO": "1002", "BALANCE": 0.00 }
]
```

---



## Node: `error` (Error Information)

If an error occurs, the response will contain an `error` node instead of `attr`/`data`.

| Property    | Type   | Description |
|-------------|--------|-------------|
| `sqlstate`  | string | SQLSTATE or error code. |
| `msgtext`   | string | Human-readable error message. |

#### Example
```json
"error": {
  "sqlstate": "22001",
  "msgtext": "String data, right truncation."
}
```

---


## Notes for Developers

- All node and property names are uppercase by convention, but may appear in lower or mixed case depending on the DB2 environment and query.
- Numeric values may be returned as numbers or strings, depending on DB2 and CGI serialization.
- Always check for the presence of the `error` node before processing `attr`/`data`.
- The structure is designed for easy mapping to classic RPG, COBOL, or C data structures, as well as modern JavaScript/TypeScript objects.
- If you see only an `error` node, no result set was produced.

---

## Sample Full Response
```json
{
  "attr": [
    { "name": "ID", "type": "INTEGER", "length": 10, "decimals": 0, "allownull": false, "colhdr": "ID" },
    { "name": "NAME", "type": "VARCHAR", "length": 50, "decimals": 0, "allownull": true, "colhdr": "Name" }
  ],
  "data": [
    { "ID": 1, "NAME": "Alice" },
    { "ID": 2, "NAME": "Bob" }
  ]
}
```

---

The DB2JSON.PGM on IBM generates JSON very fast once the SQL statement completes and returns it to standard output (stdout or std::cout) for web use. It also optionally writes the json to the IFS in UTF-8 (CCSID: 1208) format.