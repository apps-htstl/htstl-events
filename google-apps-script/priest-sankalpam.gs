// priest-sankalpam.gs — backend for the Priest Live Sankalpam View.
//
// Runs as a Google Apps Script Web App attached to the DESTINATION sheet.
// The two SOURCE sheets are read-only (public CSV export); all state —
// including the "Completed" flag — lives in the destination sheet, one tab
// per source. See google-apps-script/README.md for deploy steps.
//
// API (all responses are JSON; errors come back as { error }):
//   GET  {url}?action=records                     → { records: [...] }
//   POST {url}  body {action:'complete', id, name, completed} → { ok, record }
//   POST {url}  body {action:'refresh'}           → { ok, added, records }

var SOURCES = [
  {
    key: 'registrations',
    docId: '16ueNrw6aMhECKSFMUpdsV-D6B3R5eE8d-38CG-8a-UI',
    gid: '895949583',
  },
  {
    key: 'sponsors',
    docId: '1S6sltxHgDGPPnRl35zeHUAvjCT2SOLVMM2JMUM_Ngh4',
    gid: '0',
  },
];

// Destination spreadsheet (must be editable by the account deploying this script).
var DEST_ID = '11PV2KgpURj_w1erhuzBdMcaM5nlaEuPE8YvPgHPkOAI';

var HEADERS = [
  'Customer Name',
  'Spouse Name',
  'Gotram',
  'Event Name',
  'Event Date',
  'Event Time',
  'Phone Number',
  'Email',
  'Completed',
];
var COMPLETED_COL = HEADERS.indexOf('Completed') + 1; // 1-based
var NAME_COL = HEADERS.indexOf('Customer Name') + 1;

// ─── Entry points ────────────────────────────────────────────────────────────

function doGet(e) {
  return handle((e && e.parameter) || {});
}

// The app POSTs JSON as text/plain to avoid a CORS preflight, which Apps
// Script web apps cannot answer.
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ error: 'Invalid JSON body' });
  }
  return handle(body);
}

function handle(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var action = req.action || 'records';
    if (action === 'records') return json({ records: getRecords() });
    if (action === 'refresh') return json(refresh());
    if (action === 'complete') return json(complete(req));
    return json({ error: 'Unknown action: ' + action });
  } catch (err) {
    return json({ error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ─── Source sheets (read-only CSV export) ────────────────────────────────────

function fetchSourceRows(source) {
  var url =
    'https://docs.google.com/spreadsheets/d/' +
    source.docId +
    '/export?format=csv&gid=' +
    source.gid;
  var res = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('Source download failed for "' + source.key + '" (HTTP ' + res.getResponseCode() + ')');
  }
  var table = Utilities.parseCsv(res.getContentText());
  if (!table.length) return [];
  var head = table[0].map(function (h) { return clean(h); });
  var rows = [];
  for (var i = 1; i < table.length; i++) {
    var row = {};
    for (var c = 0; c < HEADERS.length; c++) {
      var idx = head.indexOf(HEADERS[c]);
      row[HEADERS[c]] = idx >= 0 ? clean(table[i][idx]) : '';
    }
    row['Completed'] = '';
    if (row['Customer Name']) rows.push(row);
  }
  return rows;
}

function clean(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

// Identity of a row for merging. If the same name+event+date+time appears N
// times in the source and M<N times in the destination, N-M rows are appended.
function rowKey(row) {
  return [row['Customer Name'], row['Event Name'], row['Event Date'], row['Event Time']]
    .map(function (v) { return v.toLowerCase(); })
    .join('|');
}

// ─── Destination sheet ───────────────────────────────────────────────────────

function destSheet(source) {
  var ss = SpreadsheetApp.openById(DEST_ID);
  var sh = ss.getSheetByName(source.key);
  if (!sh) {
    sh = ss.insertSheet(source.key);
    sh.getRange(1, 1, 1, HEADERS.length).setNumberFormat('@').setValues([HEADERS]);
  }
  return sh;
}

function readDestRows(sh) {
  var values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) { return clean(h); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = { __row: i + 1 }; // 1-based sheet row number
    for (var c = 0; c < HEADERS.length; c++) {
      var idx = head.indexOf(HEADERS[c]);
      row[HEADERS[c]] = idx >= 0 ? clean(values[i][idx]) : '';
    }
    rows.push(row);
  }
  return rows;
}

// Appended cells are forced to plain-text format so dates like 07/14/2026
// stay literal strings (otherwise Sheets reformats them and merge keys drift).
function appendRows(sh, rows) {
  if (!rows.length) return;
  var start = sh.getLastRow() + 1;
  var values = rows.map(function (r) {
    return HEADERS.map(function (col) { return r[col] || ''; });
  });
  sh.getRange(start, 1, values.length, HEADERS.length).setNumberFormat('@').setValues(values);
}

// First load: copy the full source into an empty destination tab.
function ensureLoaded(source) {
  var sh = destSheet(source);
  if (sh.getLastRow() < 2) {
    appendRows(sh, fetchSourceRows(source));
  }
  return sh;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function toClientRecord(source, row) {
  return {
    id: source.key + ':' + row.__row,
    source: source.key,
    name: row['Customer Name'],
    spouseName: row['Spouse Name'],
    gothram: row['Gotram'],
    eventName: row['Event Name'],
    eventDate: row['Event Date'],
    eventTime: row['Event Time'],
    completed: /^(yes|y|true|1)$/i.test(row['Completed']),
  };
}

function getRecords() {
  var records = [];
  SOURCES.forEach(function (source) {
    var sh = ensureLoaded(source);
    readDestRows(sh).forEach(function (row) {
      if (row['Customer Name']) records.push(toClientRecord(source, row));
    });
  });
  return records;
}

function complete(req) {
  var parts = String(req.id || '').split(':');
  var source = SOURCES.filter(function (s) { return s.key === parts[0]; })[0];
  var rowNum = Number(parts[1]);
  if (!source || !(rowNum >= 2)) throw new Error('Invalid record id: ' + req.id);

  var sh = destSheet(source);
  if (rowNum > sh.getLastRow()) throw new Error('Record not found: ' + req.id);

  // Guard: if the sheet was re-sorted since the page loaded, the row may hold
  // a different person now — refuse rather than mark the wrong name.
  var currentName = clean(sh.getRange(rowNum, NAME_COL).getDisplayValue());
  if (req.name && currentName.toLowerCase() !== clean(req.name).toLowerCase()) {
    throw new Error(
      'Row changed in the sheet (expected "' + req.name + '", found "' + currentName + '"). Refresh the page.'
    );
  }

  sh.getRange(rowNum, COMPLETED_COL).setNumberFormat('@').setValue(req.completed === false ? '' : 'Yes');
  return { ok: true };
}

function refresh() {
  var added = 0;
  SOURCES.forEach(function (source) {
    var sh = ensureLoaded(source);
    var localRows = readDestRows(sh);
    var available = {};
    localRows.forEach(function (row) {
      var k = rowKey(row);
      available[k] = (available[k] || 0) + 1;
    });
    var newRows = [];
    fetchSourceRows(source).forEach(function (row) {
      var k = rowKey(row);
      if (available[k] > 0) {
        available[k] -= 1;
      } else {
        newRows.push(row);
      }
    });
    appendRows(sh, newRows);
    added += newRows.length;
  });
  return { ok: true, added: added, records: getRecords() };
}
