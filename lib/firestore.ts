// lib/firestore.ts
// Database access layer for interacting with Firestore.
// Compatible with Firebase v11/v12 and React Native / Expo environment.

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  arrayUnion,
  runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import { HTSLEvent, Registration, AppUser, CheckInEntry, SevaList, SevaProgress, SheetCheckin } from './types';

// Helper to convert Firestore timestamp to JS Date
const toDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
  return new Date(timestamp);
};

// Helper to sanitize Firestore event data
const mapEventDoc = (docSnap: any): HTSLEvent => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    orgId: data.orgId,
    name: data.name || '',
    date: toDate(data.date),
    venue: data.venue || '',
    status: data.status || 'draft',
    tiers: data.tiers || [],
    sections: data.sections || [],
    createdBy: data.createdBy || '',
    createdAt: toDate(data.createdAt),
    // Sheet linking (optional)
    sheetUrl: data.sheetUrl || '',
    sheetId: data.sheetId || '',
    sheetEventColumn: data.sheetEventColumn || 'Event Name',
    sheetEventFilter: data.sheetEventFilter || '',
  };
};

// Helper to sanitize Firestore registration data
const mapRegistrationDoc = (docSnap: any): Registration => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    eventId: data.eventId,
    orgId: data.orgId,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || '',
    phone: data.phone || '',
    tier: data.tier || '',
    partySize: data.partySize || 1,
    notes: data.notes || '',
    qrToken: data.qrToken || '',
    qrStatus: {
      generated: data.qrStatus?.generated || false,
      sentAt: data.qrStatus?.sentAt ? toDate(data.qrStatus.sentAt) : undefined,
      channel: data.qrStatus?.channel || undefined,
      deliveredAt: data.qrStatus?.deliveredAt ? toDate(data.qrStatus.deliveredAt) : undefined,
    },
    checkedInCount: data.checkedInCount || 0,
    checkins: (data.checkins || []).map((c: any) => ({
      checkedInAt: toDate(c.checkedInAt),
      checkedInBy: c.checkedInBy || '',
      count: c.count || 0,
      method: c.method || 'manual',
    })),
    createdAt: toDate(data.createdAt),
  };
};

/* ==========================================
   EVENT OPERATIONS
   ========================================== */

// Create a new event
export async function createEvent(
  orgId: string,
  uid: string,
  eventData: Omit<HTSLEvent, 'id' | 'orgId' | 'createdAt' | 'createdBy'>
): Promise<string> {
  const eventsRef = collection(db, 'orgs', orgId, 'events');
  const docRef = await addDoc(eventsRef, {
    orgId,
    ...eventData,
    createdBy: uid,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

// Update existing event
export async function updateEvent(
  orgId: string,
  eventId: string,
  updateData: Partial<Omit<HTSLEvent, 'id' | 'orgId' | 'createdAt' | 'createdBy'>>
): Promise<void> {
  const eventRef = doc(db, 'orgs', orgId, 'events', eventId);
  await updateDoc(eventRef, updateData);
}

// Delete an event
export async function deleteEvent(orgId: string, eventId: string): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore');
  const eventRef = doc(db, 'orgs', orgId, 'events', eventId);
  await deleteDoc(eventRef);
}

// Fetch single event
export async function getEvent(orgId: string, eventId: string): Promise<HTSLEvent | null> {
  const eventRef = doc(db, 'orgs', orgId, 'events', eventId);
  const snap = await getDoc(eventRef);
  if (!snap.exists()) return null;
  return mapEventDoc(snap);
}

// Subscribe to event list in real time
export function subscribeEvents(orgId: string, callback: (events: HTSLEvent[]) => void) {
  const eventsRef = collection(db, 'orgs', orgId, 'events');
  const q = query(eventsRef, orderBy('date', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map(mapEventDoc);
    callback(events);
  });
}

// Subscribe to single event in real time
export function subscribeEvent(orgId: string, eventId: string, callback: (event: HTSLEvent | null) => void) {
  const eventRef = doc(db, 'orgs', orgId, 'events', eventId);
  return onSnapshot(eventRef, (snap) => {
    if (!snap.exists()) {
      callback(null);
    } else {
      callback(mapEventDoc(snap));
    }
  });
}

/* ==========================================
   REGISTRATION OPERATIONS
   ========================================== */

// Add single registration
export async function addRegistration(
  orgId: string,
  eventId: string,
  regData: Omit<Registration, 'id' | 'eventId' | 'orgId' | 'createdAt' | 'checkedInCount' | 'checkins'>
): Promise<string> {
  const regsRef = collection(db, 'orgs', orgId, 'events', eventId, 'registrations');
  const docRef = await addDoc(regsRef, {
    eventId,
    orgId,
    ...regData,
    checkedInCount: 0,
    checkins: [],
    createdAt: Timestamp.now(),
    qrStatus: {
      generated: false,
    },
  });
  return docRef.id;
}

// Update single registration metadata
export async function updateRegistration(
  orgId: string,
  eventId: string,
  regId: string,
  updateData: Partial<Omit<Registration, 'id' | 'eventId' | 'orgId' | 'createdAt'>>
): Promise<void> {
  const regRef = doc(db, 'orgs', orgId, 'events', eventId, 'registrations', regId);
  await updateDoc(regRef, updateData);
}

// Subscribe to registrations list
export function subscribeRegistrations(
  orgId: string,
  eventId: string,
  callback: (registrations: Registration[]) => void
) {
  const regsRef = collection(db, 'orgs', orgId, 'events', eventId, 'registrations');
  const q = query(regsRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const regs = snapshot.docs.map(mapRegistrationDoc);
    callback(regs);
  });
}

// Subscribe to single registration
export function subscribeRegistration(
  orgId: string,
  eventId: string,
  regId: string,
  callback: (reg: Registration | null) => void
) {
  const regRef = doc(db, 'orgs', orgId, 'events', eventId, 'registrations', regId);
  return onSnapshot(regRef, (snap) => {
    if (!snap.exists()) {
      callback(null);
    } else {
      callback(mapRegistrationDoc(snap));
    }
  });
}

// Check in attendee (transaction-safe)
export async function checkInAttendee(
  orgId: string,
  eventId: string,
  regId: string,
  volunteerId: string,
  partyCount: number,
  method: 'qr' | 'manual' | 'walkin'
): Promise<void> {
  const regRef = doc(db, 'orgs', orgId, 'events', eventId, 'registrations', regId);

  await runTransaction(db, async (transaction) => {
    const regSnap = await transaction.get(regRef);
    if (!regSnap.exists()) {
      throw new Error('Registration not found');
    }

    const data = regSnap.data();
    const currentCheckedIn = data.checkedInCount || 0;
    const partySize = data.partySize || 1;

    if (currentCheckedIn + partyCount > partySize) {
      throw new Error(`Cannot check in ${partyCount}. Only ${partySize - currentCheckedIn} spots remaining.`);
    }

    const newCheckIn: CheckInEntry = {
      checkedInAt: new Date(),
      checkedInBy: volunteerId,
      count: partyCount,
      method,
    };

    transaction.update(regRef, {
      checkedInCount: currentCheckedIn + partyCount,
      checkins: arrayUnion(newCheckIn),
    });

    // Also add to audit log
    const auditRef = doc(collection(db, 'orgs', orgId, 'events', eventId, 'checkins'));
    transaction.set(auditRef, {
      registrationId: regId,
      volunteerId,
      timestamp: Timestamp.now(),
      partyCount,
      method,
    });
  });
}

/* ==========================================
   USER MANAGEMENT
   ========================================== */

// Subscribe to volunteer/user list for assigning
export function subscribeOrgUsers(orgId: string, callback: (users: AppUser[]) => void) {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('orgId', '==', orgId));
  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map((docSnap) => ({
      uid: docSnap.id,
      ...docSnap.data(),
    })) as AppUser[];
    callback(users);
  });
}

// Update user role or assigned events
export async function updateUserProfile(uid: string, updateData: Partial<AppUser>): Promise<void> {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, updateData);
}

/* ==========================================
   SEVA REGISTRY (POOJARI FEATURE)
   ========================================== */

// Map a Firestore doc to a SevaList
const mapSevaListDoc = (docSnap: any): SevaList => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    orgId: data.orgId,
    name: data.name || '',
    description: data.description || '',
    sheetUrl: data.sheetUrl || '',
    sheetId: data.sheetId || '',
    eventColumn: data.eventColumn || 'Event',
    createdBy: data.createdBy || '',
    createdAt: toDate(data.createdAt),
  };
};

// Extract Google Sheet ID from various Google Sheets URL formats
export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Build the CSV export URL for a Google Sheet
export function buildSheetCsvUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
}

// Subscribe to all Seva Lists for an org in real time
export function subscribeSevaLists(
  orgId: string,
  callback: (lists: SevaList[]) => void
) {
  const listsRef = collection(db, 'orgs', orgId, 'sevaLists');
  const q = query(listsRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(mapSevaListDoc));
  });
}

// Create a new Seva List
export async function createSevaList(
  orgId: string,
  uid: string,
  data: { name: string; sheetUrl: string; sheetId: string; eventColumn: string; description?: string }
): Promise<string> {
  const ref = collection(db, 'orgs', orgId, 'sevaLists');
  const docRef = await addDoc(ref, {
    orgId,
    ...data,
    createdBy: uid,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

// Delete a Seva List
export async function deleteSevaList(orgId: string, listId: string): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore');
  const listRef = doc(db, 'orgs', orgId, 'sevaLists', listId);
  await deleteDoc(listRef);
}

// Read the Poojari progress for a specific Seva List
export async function getSevaProgress(
  orgId: string,
  listId: string,
  poojariUid: string
): Promise<SevaProgress | null> {
  const progressRef = doc(db, 'orgs', orgId, 'sevaLists', listId, 'progress', poojariUid);
  const snap = await getDoc(progressRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    poojariUid,
    seenRowKeys: data.seenRowKeys || [],
    lastUpdated: toDate(data.lastUpdated),
  };
}

// Save (upsert) the Poojari progress for a specific Seva List
export async function saveSevaProgress(
  orgId: string,
  listId: string,
  poojariUid: string,
  seenRowKeys: string[]
): Promise<void> {
  const progressRef = doc(db, 'orgs', orgId, 'sevaLists', listId, 'progress', poojariUid);
  await setDoc(progressRef, {
    poojariUid,
    seenRowKeys,
    lastUpdated: Timestamp.now(),
  });
}

/* ==========================================
   SHEET-BASED ATTENDEE CHECK-IN
   ==========================================
   Firestore path: /orgs/{orgId}/events/{eventId}/sheetCheckins/{rowKey}
   The sheet remains the source of truth for WHO is registered.
   Only check-in/check-out state is stored here.
   ========================================== */

/** Link (or update) a Google Sheet to an event. */
export async function updateEventSheet(
  orgId: string,
  eventId: string,
  sheetUrl: string,
  sheetId: string,
  sheetEventFilter: string,
  sheetEventColumn: string = 'Event Name',
): Promise<void> {
  const eventRef = doc(db, 'orgs', orgId, 'events', eventId);
  await updateDoc(eventRef, { sheetUrl, sheetId, sheetEventFilter, sheetEventColumn });
}

/** Map a Firestore sheetCheckin doc to a SheetCheckin object. */
const mapSheetCheckinDoc = (docSnap: any): SheetCheckin => {
  const d = docSnap.data();
  return {
    rowKey:        docSnap.id,
    attendeeName:  d.attendeeName  || '',
    spouseName:    d.spouseName    || '',
    gotram:        d.gotram        || '',
    eventName:     d.eventName     || '',
    phone:         d.phone         || '',
    email:         d.email         || '',
    checkedInAt:   toDate(d.checkedInAt),
    checkedInBy:   d.checkedInBy   || '',
    checkedOutAt:  d.checkedOutAt  ? toDate(d.checkedOutAt) : undefined,
    checkedOutBy:  d.checkedOutBy  || undefined,
    note:          d.note          || undefined,
  };
};

/** Real-time subscription to all sheet check-ins for an event. */
export function subscribeSheetCheckins(
  orgId: string,
  eventId: string,
  callback: (checkins: SheetCheckin[]) => void,
) {
  const ref = collection(db, 'orgs', orgId, 'events', eventId, 'sheetCheckins');
  return onSnapshot(ref, (snap) => {
    callback(snap.docs.map(mapSheetCheckinDoc));
  });
}

/** Record a check-in for a sheet attendee. Idempotent — safe to call again. */
export async function writeSheetCheckin(
  orgId: string,
  eventId: string,
  rowKey: string,
  payload: {
    attendeeName: string;
    spouseName?: string;
    gotram?: string;
    eventName: string;
    phone?: string;
    email?: string;
    volunteerId: string;
    note?: string;
  },
): Promise<void> {
  const ref = doc(db, 'orgs', orgId, 'events', eventId, 'sheetCheckins', rowKey);
  await setDoc(ref, {
    rowKey,
    attendeeName:  payload.attendeeName,
    spouseName:    payload.spouseName  || '',
    gotram:        payload.gotram      || '',
    eventName:     payload.eventName,
    phone:         payload.phone       || '',
    email:         payload.email       || '',
    checkedInAt:   Timestamp.now(),
    checkedInBy:   payload.volunteerId,
    checkedOutAt:  null,
    checkedOutBy:  null,
    note:          payload.note        || '',
  }, { merge: false }); // always overwrite to reset any previous checkout
}

/** Record a check-out for a sheet attendee. */
export async function writeSheetCheckout(
  orgId: string,
  eventId: string,
  rowKey: string,
  volunteerId: string,
): Promise<void> {
  const ref = doc(db, 'orgs', orgId, 'events', eventId, 'sheetCheckins', rowKey);
  await updateDoc(ref, {
    checkedOutAt: Timestamp.now(),
    checkedOutBy: volunteerId,
  });
}

/** Undo a check-in (delete the document entirely). */
export async function undoSheetCheckin(
  orgId: string,
  eventId: string,
  rowKey: string,
): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore');
  const ref = doc(db, 'orgs', orgId, 'events', eventId, 'sheetCheckins', rowKey);
  await deleteDoc(ref);
}

