// priest-sankalpam.gs — backend for the Priest Live Sankalpam View.
//
// Runs as a Google Apps Script Web App attached to the DESTINATION sheet.
// The two SOURCE sheets are read-only (public CSV export); all state —
// completion history lives in the destination sheet. Source data is fetched
// live and never modified or duplicated.
// See google-apps-script/README.md for deploy steps.
//
// API (all responses are JSON; errors come back as { error }):
//   GET  {url}?action=records
//     → { records: [...] }
//   POST {url}  body {action:'complete', id, name, completed}
//     → { ok: true }
//   POST {url}  body {action:'refresh'}
//     → { ok: true, added, records: [...] }

var SOURCES = [
  {
    key: "registrations",
    docId: "16ueNrw6aMhECKSFMUpdsV-D6B3R5eE8d-38CG-8a-UI",
    gid: "895949583",
  },
  {
    key: "sponsors",
    docId: "1S6sltxHgDGPPnRl35zeHUAvjCT2SOLVMM2JMUM_Ngh4",
    gid: "1735789377",
  },
];

// Destination spreadsheet (must be editable by the account deploying this script).
var DEST_ID = "11PV2KgpURj_w1erhuzBdMcaM5nlaEuPE8YvPgHPkOAI";

var HEADERS = [
  "Source",
  "Customer",
  "Spouse Name",
  "Gothram",
  "Event",
  "Attending Date",
  "Event Time",
  "Pledge",
  "Email",
  "Phone",
  "Address",
  "IstDevatha",
  "Completed",
];
var COMPLETED_COL = HEADERS.indexOf("Completed") + 1; // 1-based
var NAME_COL = HEADERS.indexOf("Customer") + 1;

// Sponsors (the roster tab) are available for EVERY event/date. Their
// completion is therefore not stored on the roster row, but as one row per
// (sponsor, event, date) in this ledger tab.
var COMPLETIONS_TAB = "sponsor_completions";
var COMPLETION_HEADERS = [
  "Sponsor Name",
  "Spouse Name",
  "Gotram",
  "Event Name",
  "Event Date",
  "Completed At",
  "Record Type",
  "Person Key",
];

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
    return json({ error: "Invalid JSON body" });
  }
  return handle(body);
}

function handle(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var action = req.action || "records";
    if (action === "records")
      return json({
        records: getRecords(),
      });
    if (action === "refresh") return json(refresh());
    if (action === "complete") return json(complete(req));
    return json({ error: "Unknown action: " + action });
  } catch (err) {
    return json({ error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ─── Source sheets (read-only CSV export) ────────────────────────────────────

function fetchSourceRows(source) {
  var url =
    "https://docs.google.com/spreadsheets/d/" +
    source.docId +
    "/export?format=csv&gid=" +
    source.gid;
  var res = UrlFetchApp.fetch(url, {
    followRedirects: true,
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(
      'Source download failed for "' +
        source.key +
        '" (HTTP ' +
        res.getResponseCode() +
        ")",
    );
  }
  var table = Utilities.parseCsv(res.getContentText());
  if (!table.length) return [];
  var head = table[0].map(function (h) {
    return clean(h);
  });
  // Common alias names in various source sheets so we can map into our
  // canonical HEADERS. If the source uses slightly different column names
  // (e.g. "Name" instead of "Customer"), this preserves the data.
  var aliases = {
    Customer: ["Customer", "Name", "Full Name", "Participant Name", "Customer Name"],
    "Spouse Name": ["Spouse Name", "Spouse"],
    Gothram: ["Gothram", "Gotram"],
    Event: ["Event", "Event Name"],
    "Attending Date": ["Attending Date", "Event Date", "Date"],
    "Event Time": ["Event Time", "Time"],
    Pledge: ["Pledge"],
    Email: ["Email", "Email Address"],
    Phone: ["Phone", "Phone Number", "Mobile", "Mobile Number"],
    Address: ["Address"],
    IstDevatha: ["IstDevatha"],
    Completed: ["Completed"],
  };

  // Build a map of canonical header -> source column index (or -1)
  var idxMap = {};
  for (var h = 0; h < HEADERS.length; h++) {
    var key = HEADERS[h];
    if (key === "Source") {
      idxMap[key] = -1;
      continue;
    }
    var found = -1;
    var tryNames = aliases[key] || [key];
    for (var t = 0; t < tryNames.length; t++) {
      var n = tryNames[t];
      var p = head.indexOf(n);
      if (p >= 0) {
        found = p;
        break;
      }
    }
    idxMap[key] = found;
  }

  var rows = [];
  for (var i = 1; i < table.length; i++) {
    var row = { Source: source.key, __sourceRow: i + 1 };
    for (var c = 0; c < HEADERS.length; c++) {
      var col = HEADERS[c];
      if (col === "Source") continue;
      var idx = idxMap[col];
      row[col] = idx >= 0 ? clean(table[i][idx]) : "";
    }
    row["Completed"] = "";
    // Push rows if we have any identifying data (name or event name).
    if (row["Customer"] || row["Event"] || row["Phone"])
      rows.push(row);
  }
  return rows;
}

function clean(v) {
  return String(v == null ? "" : v)
    .replace(/\s+/g, " ")
    .trim();
}

// Identity of a row for merging. If the same name+event+date+time appears N
// times in the source and M<N times in the destination, N-M rows are appended.
function rowKey(row) {
  return [
    row["Source"] || "",
    row["Customer"],
    row["Event"],
    row["Attending Date"],
    row["Event Time"],
  ]
    .map(function (v) {
      return String(v || "").toLowerCase();
    })
    .join("|");
}

// ─── Destination sheet ───────────────────────────────────────────────────────

function destSheet(source) {
  var ss = SpreadsheetApp.openById(DEST_ID);
  var sh = ss.getSheetByName(source.key);
  if (!sh) {
    sh = ss.insertSheet(source.key);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setNumberFormat("@")
      .setValues([HEADERS]);
  }
  // If the sheet already exists (legacy), ensure the headers include
  // the `Source` column and migrate data by inserting a new column
  // at the front when necessary. This keeps existing rows aligned and
  // populates the `Source` value for legacy rows.
  var headerRange = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn()));
  var head = headerRange.getValues()[0].map(function (h) {
    return clean(h);
  });
  if (head.indexOf("Source") === -1) {
    // Insert a column at A and write the full HEADERS row.
    sh.insertColumnBefore(1);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setNumberFormat("@")
      .setValues([HEADERS]);

    // Populate the Source column for existing rows with this source key.
    var lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      var values = [];
      for (var r = 2; r <= lastRow; r++) values.push([source.key]);
      sh.getRange(2, 1, values.length, 1).setValues(values);
    }
  } else {
    // Ensure header row uses our canonical HEADERS ordering (overwrite first
    // HEADERS.length cells with the canonical values). This keeps columns
    // consistent even if the sheet had different trailing columns.
    sh.getRange(1, 1, 1, HEADERS.length)
      .setNumberFormat("@")
      .setValues([HEADERS]);
  }
  return sh;
}

function readDestRows(sh, source) {
  var values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) {
    return clean(h);
  });
  var rows = [];
  var sourceIdx = head.indexOf("Source");
  for (var i = 1; i < values.length; i++) {
    var row = { __row: i + 1 }; // 1-based sheet row number
    for (var c = 0; c < HEADERS.length; c++) {
      var idx = head.indexOf(HEADERS[c]);
      row[HEADERS[c]] = idx >= 0 ? clean(values[i][idx]) : "";
    }
    if (sourceIdx < 0) {
      row["Source"] = source.key;
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
    return HEADERS.map(function (col) {
      return r[col] || "";
    });
  });
  sh.getRange(start, 1, values.length, HEADERS.length)
    .setNumberFormat("@")
    .setValues(values);
}

// First load: copy the full source into an empty destination tab.
// For sponsors: duplicate each sponsor for every (event, date) from registrations.
function ensureLoaded(source) {
  var sh = destSheet(source);
  if (sh.getLastRow() < 2) {
    var rows = fetchSourceRows(source);
    // For sponsors, duplicate for each distinct (event, date) from registrations
    if (source.key === "sponsors") {
      rows = expandSponsorsForEvents(rows);
    }
    appendRows(sh, rows);
  }
  return sh;
}

// Extract all distinct (eventName, eventDate) from registrations source
function getDistinctEvents() {
  var regSource = SOURCES[0]; // registrations source
  var rows = fetchSourceRows(regSource);
  var events = {};
  rows.forEach(function (row) {
    var key = (row["Event"] || "") + "|" + (row["Attending Date"] || "");
    if (key !== "|") events[key] = true;
  });
  var result = [];
  for (var key in events) {
    var parts = key.split("|");
    result.push({ eventName: parts[0], eventDate: parts[1] });
  }
  return result;
}

// Duplicate each sponsor row for every (event, date)
function expandSponsorsForEvents(sponsorRows) {
  var events = getDistinctEvents();
  if (!events.length) return sponsorRows; // no events yet
  var expanded = [];
  sponsorRows.forEach(function (sponsor) {
    events.forEach(function (ev) {
      var row = {};
      for (var key in sponsor) {
        row[key] = sponsor[key];
      }
      row["Event"] = ev.eventName;
      row["Attending Date"] = ev.eventDate;
      row["Event Time"] = ""; // sponsors have no specific time
      row["Completed"] = "";
      expanded.push(row);
    });
  });
  return expanded;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function toClientRecord(source, row) {
  var key = personKey(row);
  return {
    id: source.key + ":" + key + ":" + (row.__sourceRow || row.__row || ""),
    personKey: key,
    source: source.key,
    name: row["Customer"],
    spouseName: row["Spouse Name"],
    gothram: row["Gothram"],
    eventName: row["Event"],
    eventDate: row["Attending Date"],
    eventTime: row["Event Time"],
    completed: false,
    completedEventKeys: [],
  };
}

function normalizedPart(value) {
  return clean(value).toLowerCase();
}

function personKey(row) {
  return [row["Customer"], row["Spouse Name"], row["Gothram"], row["Email"], row["Phone"]]
    .map(normalizedPart)
    .join("|");
}

function eventKey(eventName, eventDate) {
  return normalizedPart(eventName) + "|" + normalizeDateValue(eventDate);
}

function normalizeDateValue(value) {
  var date = clean(value);
  var slash = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return slash[3] + "-" + ("0" + slash[1]).slice(-2) + "-" + ("0" + slash[2]).slice(-2);
  }
  var iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  return normalizedPart(date);
}

// ─── Sponsor completion ledger ───────────────────────────────────────────────

function completionsSheet() {
  var ss = SpreadsheetApp.openById(DEST_ID);
  var sh = ss.getSheetByName(COMPLETIONS_TAB);
  if (!sh) {
    sh = ss.insertSheet(COMPLETIONS_TAB);
    sh.getRange(1, 1, 1, COMPLETION_HEADERS.length)
      .setNumberFormat("@")
      .setValues([COMPLETION_HEADERS]);
  } else {
    // Upgrade the legacy sponsor ledger with type and stable identity columns.
    sh.getRange(1, 1, 1, COMPLETION_HEADERS.length)
      .setNumberFormat("@")
      .setValues([COMPLETION_HEADERS]);
  }
  return sh;
}

function readCompletions() {
  var sh = completionsSheet();
  var values = sh.getDataRange().getDisplayValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {
      name: clean(values[i][0]),
      spouseName: clean(values[i][1]),
      gothram: clean(values[i][2]),
      eventName: clean(values[i][3]),
      eventDate: clean(values[i][4]),
      recordType: clean(values[i][6]) || "sponsors",
      personKey: clean(values[i][7]),
      __row: i + 1,
    };
    if (row.name) rows.push(row);
  }
  return rows;
}

// Preserve completion state written by older deployments into the duplicated
// registrations/sponsors tabs. These tabs are now read-only compatibility data;
// all new completion writes go to the ledger above.
function readLegacyCompletions() {
  var ss = SpreadsheetApp.openById(DEST_ID);
  var rows = [];
  SOURCES.forEach(function (source) {
    var sh = ss.getSheetByName(source.key);
    if (!sh || sh.getLastRow() < 2) return;
    readDestRows(sh, source).forEach(function (row) {
      if (!/^(yes|y|true|1)$/i.test(row["Completed"])) return;
      rows.push({
        name: row["Customer"],
        spouseName: row["Spouse Name"],
        gothram: row["Gothram"],
        eventName: row["Event"],
        eventDate: row["Attending Date"],
        recordType: source.key,
        personKey: personKey(row),
      });
    });
  });
  return rows;
}

function completionKeyFor(recordType, key, ev) {
  return [recordType, key, ev.eventName, ev.eventDate]
    .map(normalizedPart)
    .join("|");
}

function writeCompletion(req) {
  var recordType = clean(req.recordType);
  var key = clean(req.personKey);
  var ev = { eventName: clean(req.eventName), eventDate: clean(req.eventDate) };
  if (recordType !== "sponsors" && recordType !== "registrations")
    throw new Error("Invalid record type");
  if (!key || !clean(req.name)) throw new Error("Missing person identity");
  if (!ev.eventName || !ev.eventDate)
    throw new Error("Select a specific event and date before completing a record");

  var existing = readCompletions();
  var existingKeys = {};
  existing.forEach(function (c) {
    var legacyKey = c.personKey || [c.name, c.spouseName, c.gothram]
      .map(normalizedPart).join("|");
    existingKeys[completionKeyFor(c.recordType, legacyKey, c)] = c.__row;
  });

  var ledger = completionsSheet();
  var completionKey = completionKeyFor(recordType, key, ev);
  if (req.completed === false) {
    if (existingKeys[completionKey]) ledger.deleteRow(existingKeys[completionKey]);
  } else if (!existingKeys[completionKey]) {
    ledger.getRange(ledger.getLastRow() + 1, 1, 1, COMPLETION_HEADERS.length)
      .setNumberFormat("@")
      .setValues([[
        clean(req.name), clean(req.spouseName), clean(req.gothram),
        ev.eventName, ev.eventDate, new Date().toISOString(), recordType, key,
      ]]);
  }
  return { ok: true };
}

function getRecords() {
  var records = [];
  var completions = readCompletions().concat(readLegacyCompletions());
  SOURCES.forEach(function (source) {
    fetchSourceRows(source).forEach(function (row) {
      if (!row["Customer"]) return;
      var record = toClientRecord(source, row);
      completions.forEach(function (completion) {
        var legacyKey = [completion.name, completion.spouseName, completion.gothram]
          .map(normalizedPart).join("|");
        var recordLegacyKey = [record.name, record.spouseName, record.gothram]
          .map(normalizedPart).join("|");
        var identityMatches = completion.personKey
          ? completion.personKey === record.personKey
          : legacyKey === recordLegacyKey;
        if (completion.recordType !== source.key || !identityMatches)
          return;
        var completedEvent = eventKey(completion.eventName, completion.eventDate);
        record.completedEventKeys.push(completedEvent);
        if (source.key === "registrations" &&
            completedEvent === eventKey(record.eventName, record.eventDate)) {
          record.completed = true;
        }
      });
      records.push(record);
    });
  });
  return records;
}

function complete(req) {
  return writeCompletion(req);
}

function refresh() {
  // Both source sheets are read live; destination stores completion history only.
  return { ok: true, records: getRecords() };
}
