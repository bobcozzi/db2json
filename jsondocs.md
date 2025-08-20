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

If an error occurs, the response includes an `error` node. Always check for `error` first, before processing `attr` or `data`. If the failure happens before any rows are retrieved, only `error` is returned. If column metadata is known but the first row fetch fails, `error` may be returned alongside `attr`. Do not assume `data` is present when `error` exists.

The `error` node contains the `sqlstate` and, when available, a human‑readable `msgtext`. For non‑SQL failures (for example, configuration, authority, or transport issues), `sqlstate` may be `"DB2JSON"` with details provided in `msgtext`.

| Property    | Type   | Description |
|-------------|--------|-------------|
| `sqlstate`  | string | SQLSTATE or error code. |
| `msgtext`   | string | Human-readable error message. |

#### Example: error only
```json
{
  "error": {
    "sqlstate": "22001",
    "msgtext": "String data, right truncation."
  }
}
```

#### Example: error with attr present (file not found)
```json
{
  "attr": [
    { "name": "CUSTNO", "type": "CHAR", "length": 6, "decimals": 0, "allownull": false, "colhdr": "Customer Number" },
    { "name": "BALANCE", "type": "DECIMAL", "length": 9, "decimals": 2, "allownull": true, "colhdr": "Balance Due" }
  ],
  "error": {
    "sqlstate": "42704",
    "msgtext": "QCUSTCDT in COZTOOLS type *FILE not found."
  }
}
```

---
The example `db2json.html` file and its related js (javascript) illustrates how to handle these error results in code.

## Notes for Developers

- Top-level node names are lowercase: `attr`, `data`, and `error`.
- Column metadata property names in `attr` are lowercase: `name`, `type`, `length`, `decimals`, `allownull`, `colhdr`.
- Row objects in `data` use keys that mirror the Db2 column names. By default Db2 returns unquoted identifiers in UPPERCASE; if you use quoted identifiers or `AS` aliases, the case will match what you specify. Do not force-case these keys—preserve them as returned.
- Numeric values may be returned as numbers or strings, depending on Db2 and CGI serialization.
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