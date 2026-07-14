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

/** Normalize a string: lowercase, collapse whitespace, strip punctuation. */
export function normalizeText(v: string): string {
  return (v || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
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

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  attendee: SheetAttendee;
  score: number;
  matchedField: string;
}

/**
 * Predictable, highly stable search with cross-field token matching.
 * Handles digits, ampersands, leading/trailing spaces, and honorifics correctly.
 */
export function searchAttendees(attendees: SheetAttendee[], query: string): SearchResult[] {
  if (!query || !query.trim()) {
    return attendees.map((a) => ({ attendee: a, score: 1, matchedField: '' }));
  }

  // 1. Split query into clean tokens, replacing punctuation with spaces
  const cleanQuery = query.toLowerCase().replace(/[^\w\s]/g, ' ');
  const queryTokens = cleanQuery.split(/\s+/).filter(Boolean);

  if (queryTokens.length === 0) {
    return attendees.map((a) => ({ attendee: a, score: 1, matchedField: '' }));
  }

  const results: SearchResult[] = [];

  for (const attendee of attendees) {
    // 2. Prepare search fields for this attendee
    const customerNameLower = (attendee.customerName || '').toLowerCase();
    const spouseNameLower   = (attendee.spouseName || '').toLowerCase();
    const gotramLower       = (attendee.gotram || '').toLowerCase();
    const emailLower        = (attendee.email || '').toLowerCase();
    const phoneDigits       = (attendee.phone || '').replace(/\D/g, ''); // strip non-digits

    // Combine all text tokens (names, gotram, email)
    const combinedText = `${customerNameLower} ${spouseNameLower} ${gotramLower} ${emailLower}`;
    const combinedTokens = combinedText.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);

    let allMatched = true;
    let totalScore = 0;

    for (const qt of queryTokens) {
      let tokenMatched = false;
      let tokenScore = 0;

      // Case A: numeric token -> check phone digits substring
      if (/^\d+$/.test(qt)) {
        if (phoneDigits.includes(qt)) {
          tokenMatched = true;
          // exact or high-matching score
          tokenScore = qt.length / Math.max(phoneDigits.length, 1);
        }
      }

      // Case B: textual token -> check if it matches any attendee text token
      // Check prefix/substring in the attendee's words
      for (const cw of combinedTokens) {
        if (cw.startsWith(qt)) {
          tokenMatched = true;
          tokenScore = Math.max(tokenScore, 1.0); // Highest priority: startsWith
        } else if (cw.includes(qt)) {
          tokenMatched = true;
          tokenScore = Math.max(tokenScore, 0.7); // Substring match
        }
      }

      // If it still hasn't matched, check direct substring of normalized fields (handles multi-word subsets)
      if (!tokenMatched) {
        const normCombined = combinedText.replace(/[^\w\s]/g, ' ');
        if (normCombined.includes(qt)) {
          tokenMatched = true;
          tokenScore = 0.5;
        }
      }

      if (tokenMatched) {
        totalScore += tokenScore;
      } else {
        allMatched = false;
        break; // All query tokens must match
      }
    }

    if (allMatched) {
      const score = totalScore / queryTokens.length;

      // Determine display hint field
      let matchedField = 'Name';
      if (customerNameLower.includes(cleanQuery.trim())) matchedField = 'Name';
      else if (spouseNameLower.includes(cleanQuery.trim())) matchedField = 'Spouse';
      else if (gotramLower.includes(cleanQuery.trim())) matchedField = 'Gotram';
      else if (phoneDigits.includes(cleanQuery.trim())) matchedField = 'Phone';
      else if (emailLower.includes(cleanQuery.trim())) matchedField = 'Email';
      else matchedField = 'Multiple fields';

      results.push({ attendee, score, matchedField });
    }
  }

  // Sort: highest score first (preferring prefix matches over substrings),
  // then sort alphabetically by customer name
  return results.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) {
      return b.score - a.score;
    }
    return a.attendee.customerName.localeCompare(b.attendee.customerName);
  });
}

/**
 * Detect whether a rowKey is name-based (less stable) vs phone/email based.
 */
export function isNameBasedKey(rowKey: string): boolean {
  return rowKey.startsWith('name:');
}
