// lib/types.ts
// Shared TypeScript types for HTSL Events app

export type UserRole = 'superadmin' | 'eventadmin' | 'volunteer' | 'poojari';

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string;
  phone?: string;
  role: UserRole;
  orgId: string;
  assignedEvents: string[];
  invitedBy?: string;
  invitedAt?: Date;
  lastLogin?: Date;
}

export type EventStatus = 'draft' | 'active' | 'closed';

export interface Tier {
  id: string;
  name: string;
  color: string;           // hex color, e.g. '#A855F7'
  sectionIds: string[];
}

export interface Section {
  id: string;
  name: string;
  capacity: number;
  color?: string;
}

export interface HTSLEvent {
  id: string;
  orgId: string;
  name: string;
  date: Date;
  venue: string;
  status: EventStatus;
  tiers: Tier[];
  sections: Section[];
  createdBy: string;
  createdAt: Date;
  // Linked Google Sheet for sheet-based attendee lookup
  sheetUrl?: string;    // Full Google Sheets URL pasted by admin
  sheetId?: string;     // Extracted spreadsheet ID
  sheetEventColumn?: string; // Column header to filter rows by event name (default 'Event Name')
  sheetEventFilter?: string; // The value to match in the event column (default = event.name)
}

export type QRChannel = 'email' | 'sms';

export interface QRStatus {
  generated: boolean;
  sentAt?: Date;
  channel?: QRChannel;
  deliveredAt?: Date;
}

export interface CheckInEntry {
  checkedInAt: Date;
  checkedInBy: string;      // volunteer uid
  count: number;            // number checked in during this scan
  method: 'qr' | 'manual' | 'walkin';
}

export interface Registration {
  id: string;
  eventId: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tier: string;             // tier name
  partySize: number;
  notes?: string;
  qrToken?: string;         // AES-encrypted server token
  qrStatus: QRStatus;
  checkedInCount: number;   // running total checked in
  checkins: CheckInEntry[]; // audit trail — supports fractional arrival
  createdAt: Date;
}

export interface CheckInRecord {
  id: string;
  registrationId: string;
  volunteerId: string;
  timestamp: Date;
  partyCount: number;
  method: 'qr' | 'manual' | 'walkin';
  deviceId?: string;
}

export interface Org {
  id: string;
  name: string;
  timezone: string;
  contactEmail: string;
  contactPhone: string;
}

// ── Seva Registry (Poojari feature) ─────────────────────────────────────────

/**
 * A SevaList is a link to a Google Sheet that the receptionist/event-admin
 * maintains. It contains people registering for one or more puja events.
 * The sheet must be shared publicly ("Anyone with link can view").
 */
export interface SevaList {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  sheetUrl: string;           // Original Google Sheets URL pasted by admin
  sheetId: string;            // Extracted from URL (the ID between /d/ and /edit)
  eventColumn: string;        // Column header holding the puja/event name (default "Event")
  createdBy: string;
  createdAt: Date;
}

/**
 * A single row fetched from the Google Sheet CSV.
 * columns = the column headers; values = the row cell values (parallel arrays).
 * rowKey = deterministic fingerprint for seen-state tracking.
 */
export interface SevaEntry {
  rowKey: string;             // fingerprint: first 3 cell values joined with '|'
  columns: string[];          // header names
  values: string[];           // cell values (parallel to columns)
  eventValue: string;         // value from the eventColumn field
}

/**
 * Tracks which rows a specific Poojari has marked as "seen" for a Seva List.
 */
export interface SevaProgress {
  poojariUid: string;
  seenRowKeys: string[];
  lastUpdated: Date;
}

// ── Sheet-Based Attendee Check-in ─────────────────────────────────────────────

/**
 * A single row parsed from the event's linked Google Sheet CSV.
 * Represents one person registered for a specific puja/event session.
 * Columns: Customer Name | Spouse Name | Gotram | Event Name | Event Date | Event Time | Phone Number | Email
 */
export interface SheetAttendee {
  rowKey: string;        // Deterministic fingerprint — stable across sheet edits
  customerName: string;  // "Customer Name" column
  spouseName: string;    // "Spouse Name" column
  gotram: string;        // "Gotram" column
  eventName: string;     // "Event Name" column
  eventDate: string;     // "Event Date" column (raw string, e.g. "07/14/2026")
  eventTime: string;     // "Event Time" column
  phone: string;         // "Phone Number" column (may be empty)
  email: string;         // "Email" column (may be empty)
}

/**
 * Stored in Firestore ONLY when an attendee is checked in.
 * Path: /orgs/{orgId}/events/{eventId}/sheetCheckins/{rowKey}
 * The sheet remains the source of truth for who is registered.
 * This document is the lightweight operational state layer.
 */
export interface SheetCheckin {
  rowKey: string;
  attendeeName: string;   // denormalized Customer Name for display & audit
  spouseName?: string;
  gotram?: string;
  eventName: string;
  phone?: string;
  email?: string;
  checkedInAt: Date;
  checkedInBy: string;    // volunteer uid
  checkedOutAt?: Date;
  checkedOutBy?: string;
  note?: string;
}
