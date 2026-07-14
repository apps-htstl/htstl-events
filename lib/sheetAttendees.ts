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
    .replace(/[^\w\s]/g, '')   // strip punctuation
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
    // Phone-only key: phone + eventName + eventDate
    return `phone:${norm(attendee.phone)}|${norm(attendee.eventName)}|${norm(attendee.eventDate)}`;
  }
  if (attendee.email) {
    // Email-only key
    return `email:${norm(attendee.email)}|${norm(attendee.eventName)}|${norm(attendee.eventDate)}`;
  }
  // Name-based key (least stable — warn in UI if this is the only option)
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
  // gviz/tq endpoint returns CSV and works without OAuth for publicly shared sheets
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
}

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch the CSV from a publicly-shared Google Sheet, parse all rows,
 * and optionally filter to only rows matching `eventFilter` in the event column.
 *
 * @param sheetId  - Google Sheet ID
 * @param eventFilter - If provided, only return rows where Event Name == eventFilter
 *                      (case-insensitive). Pass null to return all rows.
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

    // Skip rows with no identifying data
    if (!customerName && !phone && !email) continue;

    // Filter by event name if provided
    if (normFilter && normalizeText(eventName) !== normFilter) continue;

    const base = { customerName, spouseName, gotram, eventName, eventDate, eventTime, phone, email };
    attendees.push({ rowKey: buildRowKey(base), ...base });
  }

  return attendees;
}

// ─── Fuzzy / typo-tolerant search ────────────────────────────────────────────
//
// Strategy (no external deps):
//   1. Exact substring match  → score 1.0
//   2. All tokens of query appear (in any order) → score 0.8
//   3. Levenshtein distance <= 2 per token → score 0.5
//
// We search across: customerName + spouseName + gotram + phone + email

/** Compute Levenshtein distance between two short strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
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

export interface SearchResult {
  attendee: SheetAttendee;
  score: number;          // 0–1, higher = better match
  matchedField: string;   // which field triggered the match
}

/**
 * Search attendees by name / phone / email with typo tolerance.
 * Returns results sorted by score descending. Results with score < 0.3 are dropped.
 */
export function searchAttendees(attendees: SheetAttendee[], query: string): SearchResult[] {
  if (!query.trim()) return attendees.map((a) => ({ attendee: a, score: 1, matchedField: '' }));

  const normQuery = normalizeText(query);
  const queryTokens = normQuery.split(' ').filter(Boolean);

  const results: SearchResult[] = [];

  for (const attendee of attendees) {
    const searchTargets: [string, string][] = [
      [normalizeText(attendee.customerName), 'Customer Name'],
      [normalizeText(attendee.spouseName),   'Spouse Name'],
      [normalizeText(attendee.gotram),       'Gotram'],
      [attendee.phone,                       'Phone'],
      [normalizeText(attendee.email),        'Email'],
    ];

    let bestScore = 0;
    let bestField = '';

    for (const [target, fieldLabel] of searchTargets) {
      if (!target) continue;

      let score = 0;

      // 1. Exact substring match
      if (target.includes(normQuery)) {
        score = target === normQuery ? 1.0 : 0.9;
      }
      // 2. All query tokens appear in target
      else if (queryTokens.every((t) => target.includes(t))) {
        score = 0.8;
      }
      // 3. Fuzzy per-token match (Levenshtein)
      else {
        const targetTokens = target.split(' ').filter(Boolean);
        let tokenScore = 0;
        let matched = 0;
        for (const qt of queryTokens) {
          // Find the closest target token
          const minDist = Math.min(...targetTokens.map((tt) => levenshtein(qt, tt)));
          // Allow up to 2 edits for longer tokens, 1 for short ones
          const threshold = qt.length <= 3 ? 1 : 2;
          if (minDist <= threshold) {
            tokenScore += 1 - minDist / Math.max(qt.length, 1) * 0.3;
            matched++;
          }
        }
        if (matched > 0) {
          score = (tokenScore / queryTokens.length) * 0.6;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestField = fieldLabel;
      }
    }

    if (bestScore >= 0.3) {
      results.push({ attendee, score: bestScore, matchedField: bestField });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Detect whether a rowKey is name-based (less stable) vs phone/email based.
 * Used to warn the user in the UI.
 */
export function isNameBasedKey(rowKey: string): boolean {
  return rowKey.startsWith('name:');
}
