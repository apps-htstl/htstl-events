// lib/sheetAttendees.ts
// Utilities for fetching, parsing, and searching attendees from a linked Google Sheet.
//
// Architecture:
//   - Google Sheet CSV  →  source of truth for WHO is registered
//   - Firestore /sheetCheckins/{rowKey}  →  operational CHECK-IN state only
//   - Both are merged in-memory on the UI screen before rendering
//
// Sheet expected columns (case-insensitive, order-independent):
//   Customer Name | Spouse Name | Gotram | Event Name | Event Date | Event Time | Phone Number | Email

import { SheetAttendee } from './types';

// ─── Column name aliases (handles slight naming variations) ──────────────────

const COL_ALIASES: Record<string, string[]> = {
  customerName: ['Customer Name', 'Customer', 'Name', 'Full Name', 'Participant Name'],
  spouseName:   ['Spouse Name', 'Spouse'],
  gotram:       ['Gotram', 'Gothram', 'Gotra'],
  eventName:    ['Event Name', 'Event', 'Puja Name', 'Seva Name'],
  eventDate:    ['Event Date', 'Attending Date', 'Date'],
  eventTime:    ['Event Time', 'Time'],
  phone:        ['Phone Number', 'Phone', 'Mobile', 'Mobile Number'],
  email:        ['Email', 'Email Address'],
};

// ─── Text normalisation ──────────────────────────────────────────────────────

/**
 * Normalize text for search comparison.
 * Replaces punctuation (including & . , - etc.) with a SPACE rather than
 * stripping it, so tokens on either side stay separate.
 * Examples:
 *   "Ramesh & Sita"  → "ramesh   sita" → "ramesh sita"
 *   "Ramesh&Sita"    → "ramesh sita"   (not "rameshsita")
 *   "Sri.Kumar"      → "sri kumar"      (not "srikumar")
 *   "K.S. Ramesh"    → "k s  ramesh"   → "k s ramesh"
 */
export function normalizeText(v: string): string {
  return (v || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')   // replace punctuation with space (not strip)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip only extra whitespace (preserve casing) for display purposes. */
function cleanCell(v: string): string {
  return String(v == null ? '' : v)
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── rowKey builder ──────────────────────────────────────────────────────────
//
// Priority:
//   1. phone  (most stable and unique)
//   2. email  (fallback)
//   3. name + gotram + eventDate  (last resort — may drift on typo fix)
//
// The key is scoped per (event + date) so the same person in two events gets
// two distinct check-in documents.

export function buildRowKey(attendee: Omit<SheetAttendee, 'rowKey'>): string {
  const norm = normalizeText;

  if (attendee.phone) {
    return `phone:${norm(attendee.phone)}|${norm(attendee.eventName)}|${norm(attendee.eventDate)}`;
  }
  if (attendee.email) {
    return `email:${norm(attendee.email)}|${norm(attendee.eventName)}|${norm(attendee.eventDate)}`;
  }
  return `name:${norm(attendee.customerName)}|${norm(attendee.gotram)}|${norm(attendee.eventName)}|${norm(attendee.eventDate)}`;
}

// ─── CSV parser ──────────────────────────────────────────────────────────────

/** Safe CSV parser that handles double-quoted fields with embedded commas/newlines. */
export function parseCsv(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let cell = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') { cell += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      row.push(cell.trim()); cell = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some((x) => x !== '')) result.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((x) => x !== '')) result.push(row);
  }
  return result;
}

// ─── Header mapping ──────────────────────────────────────────────────────────

function resolveColumnIndex(headers: string[], field: string): number {
  const aliases = COL_ALIASES[field] || [field];
  const normHeaders = headers.map(normalizeText);
  for (const alias of aliases) {
    const idx = normHeaders.indexOf(normalizeText(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ─── Main fetch + parse ──────────────────────────────────────────────────────

export function buildSheetCsvUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
}

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch the CSV from a publicly-shared Google Sheet, parse all rows,
 * and optionally filter to only rows matching `eventFilter` in the event column.
 */
export async function fetchSheetAttendees(
  sheetId: string,
  eventFilter: string | null,
): Promise<SheetAttendee[]> {
  const url = buildSheetCsvUrl(sheetId);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet (HTTP ${res.status}). Make sure the sheet is shared publicly.`);
  }
  const text = await res.text();
  const table = parseCsv(text);
  if (table.length < 2) return [];

  const headers = table[0];
  const idx = {
    customerName: resolveColumnIndex(headers, 'customerName'),
    spouseName:   resolveColumnIndex(headers, 'spouseName'),
    gotram:       resolveColumnIndex(headers, 'gotram'),
    eventName:    resolveColumnIndex(headers, 'eventName'),
    eventDate:    resolveColumnIndex(headers, 'eventDate'),
    eventTime:    resolveColumnIndex(headers, 'eventTime'),
    phone:        resolveColumnIndex(headers, 'phone'),
    email:        resolveColumnIndex(headers, 'email'),
  };

  const get = (row: string[], col: number) => (col >= 0 ? cleanCell(row[col]) : '');
  const normFilter = eventFilter ? normalizeText(eventFilter) : null;

  const attendees: SheetAttendee[] = [];

  for (let i = 1; i < table.length; i++) {
    const row = table[i];

    const customerName = get(row, idx.customerName);
    const spouseName   = get(row, idx.spouseName);
    const gotram       = get(row, idx.gotram);
    const eventName    = get(row, idx.eventName);
    const eventDate    = get(row, idx.eventDate);
    const eventTime    = get(row, idx.eventTime);
    const phone        = get(row, idx.phone);
    const email        = get(row, idx.email);

    if (!customerName && !phone && !email) continue;
    if (normFilter && normalizeText(eventName) !== normFilter) continue;

    const base = { customerName, spouseName, gotram, eventName, eventDate, eventTime, phone, email };
    attendees.push({ rowKey: buildRowKey(base), ...base });
  }

  return attendees;
}

// ─── Levenshtein distance ────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  attendee: SheetAttendee;
  score: number;
  matchedField: string;
}

/**
 * Search attendees with typo-tolerant, cross-field token matching.
 *
 * ALL fields (name, spouse, gotram, phone, email) are joined into ONE
 * combined string per attendee. The query is split into tokens and every
 * token must appear somewhere in that combined string — either as an exact
 * substring OR within Levenshtein distance 2 of any word in it.
 *
 * Examples that now work correctly:
 *   "Ramesh Vatsal"   → finds name="Ramesh Kumar"  gotram="Vatsal"
 *   "Sita Kashyap"    → finds name="Sita Devi"     gotram="Kashyap"
 *   "9876"            → finds phone containing 9876
 *   "Ramsh"           → fuzzy matches "Ramesh"
 */
export function searchAttendees(attendees: SheetAttendee[], query: string): SearchResult[] {
  if (!query.trim()) {
    return attendees.map((a) => ({ attendee: a, score: 1, matchedField: '' }));
  }

  const normQuery   = normalizeText(query);
  const queryTokens = normQuery.split(' ').filter(Boolean);

  const results: SearchResult[] = [];

  for (const attendee of attendees) {
    // Build one combined normalized string for this attendee
    const combined = normalizeText(
      [
        attendee.customerName,
        attendee.spouseName,
        attendee.gotram,
        attendee.phone,
        attendee.email,
      ].join(' ')
    );
    const combinedWords = combined.split(' ').filter(Boolean);

    // Every query token must match something in the combined string
    let totalScore = 0;
    let allMatched = true;

    for (const qt of queryTokens) {
      // 1. Exact substring in combined → best score
      if (combined.includes(qt)) {
        totalScore += 1.0;
        continue;
      }

      // 2. Fuzzy: find the closest word in the combined string
      const threshold = qt.length <= 3 ? 1 : 2;
      let minDist = Infinity;
      for (const cw of combinedWords) {
        const d = levenshtein(qt, cw);
        if (d < minDist) minDist = d;
        if (minDist === 0) break;
      }

      if (minDist <= threshold) {
        // distance 0→1.0  1→0.8  2→0.6
        totalScore += 1.0 - minDist * 0.2;
      } else {
        // This token has no match → skip the whole attendee
        allMatched = false;
        break;
      }
    }

    if (!allMatched || queryTokens.length === 0) continue;

    const score = totalScore / queryTokens.length;

    // Determine primary matched field for display hint
    let matchedField = 'Multiple fields';
    if (normalizeText(attendee.customerName).includes(normQuery)) matchedField = 'Name';
    else if (normalizeText(attendee.spouseName).includes(normQuery))  matchedField = 'Spouse';
    else if (normalizeText(attendee.gotram).includes(normQuery))      matchedField = 'Gotram';
    else if ((attendee.phone || '').includes(normQuery))              matchedField = 'Phone';
    else if (normalizeText(attendee.email).includes(normQuery))       matchedField = 'Email';

    results.push({ attendee, score, matchedField });
  }

  // Higher score first; ties broken alphabetically
  return results.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : a.attendee.customerName.localeCompare(b.attendee.customerName)
  );
}

/**
 * Detect whether a rowKey is name-based (less stable) vs phone/email based.
 */
export function isNameBasedKey(rowKey: string): boolean {
  return rowKey.startsWith('name:');
}
