// functions/src/checkin.ts
// Cloud Function to validate scanned QR tokens, perform double-scan checks, and record transactional check-in.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { decryptToken } from './qr';

const QR_ENCRYPTION_SECRET = defineSecret('QR_ENCRYPTION_SECRET');

export const validateAndCheckIn = onCall(
  {
    secrets: [QR_ENCRYPTION_SECRET],
  },
  async (request) => {
    // 1. Authenticate Volunteer
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Volunteer must be authenticated to check in attendees.');
    }

    const volunteerId = request.auth.uid;
    const db = getFirestore();

    // Verify volunteer role
    const userSnap = await db.collection('users').doc(volunteerId).get();
    if (!userSnap.exists) {
      throw new HttpsError('permission-denied', 'Volunteer profile not found.');
    }
    const volunteerData = userSnap.data()!;
    if (volunteerData.role !== 'volunteer' && volunteerData.role !== 'eventadmin' && volunteerData.role !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Not authorized to perform check-ins.');
    }

    // 2. Validate Parameters
    const { token, orgId, eventId, partyCount } = request.data as {
      token: string;
      orgId: string;
      eventId: string;
      partyCount: number;
    };

    if (!token || !orgId || !eventId || typeof partyCount !== 'number') {
      throw new HttpsError('invalid-argument', 'Missing token, orgId, eventId, or partyCount.');
    }

    // 3. Decrypt Token
    let decryptedPayload: string;
    try {
      const secret = QR_ENCRYPTION_SECRET.value();
      decryptedPayload = decryptToken(token, secret);
    } catch (err) {
      throw new HttpsError('invalid-argument', 'Invalid or forged QR Code ticket.');
    }

    // Parse payload
    let payload: { regId: string; eventId: string; partySize: number; tier: string; nonce: string };
    try {
      payload = JSON.parse(decryptedPayload);
    } catch (err) {
      throw new HttpsError('invalid-argument', 'Malformed token payload.');
    }

    // Verify event matching
    if (payload.eventId !== eventId) {
      throw new HttpsError('invalid-argument', 'This ticket belongs to a different event.');
    }

    const regRef = db
      .collection('orgs')
      .doc(orgId)
      .collection('events')
      .doc(eventId)
      .collection('registrations')
      .doc(payload.regId);

    // 4. Perform Atomic Firestore Transaction
    try {
      const result = await db.runTransaction(async (transaction) => {
        const regSnap = await transaction.get(regRef);
        if (!regSnap.exists) {
          throw new Error('Registration not found in database.');
        }

        const regData = regSnap.data()!;
        const currentCheckedIn = regData.checkedInCount || 0;
        const totalPartySize = regData.partySize || 1;

        // Double scan check / capacity limit check
        if (currentCheckedIn >= totalPartySize) {
          return {
            success: false,
            code: 'ALREADY_CHECKED_IN',
            message: `Already checked in: All ${totalPartySize} guests in this party have checked in.`,
            regId: payload.regId,
            attendeeName: `${regData.firstName} ${regData.lastName}`,
            email: regData.email || '',
            phone: regData.phone || '',
            tier: regData.tier,
            checkedInCount: currentCheckedIn,
            partySize: totalPartySize,
            checkins: regData.checkins || [],
          };
        }

        if (currentCheckedIn + partyCount > totalPartySize) {
          return {
            success: false,
            code: 'EXCEEDS_PARTY_SIZE',
            message: `Over limit: Checking in ${partyCount} guests would exceed the remaining group capacity. (Remaining: ${totalPartySize - currentCheckedIn})`,
            regId: payload.regId,
            attendeeName: `${regData.firstName} ${regData.lastName}`,
            email: regData.email || '',
            phone: regData.phone || '',
            tier: regData.tier,
            checkedInCount: currentCheckedIn,
            partySize: totalPartySize,
          };
        }

        // Add check-in record
        const checkInEntry = {
          checkedInAt: Timestamp.now(),
          checkedInBy: volunteerId,
          count: partyCount,
          method: 'qr',
        };

        transaction.update(regRef, {
          checkedInCount: currentCheckedIn + partyCount,
          checkins: FieldValue.arrayUnion(checkInEntry),
        });

        // Add to audit log collection
        const auditLogRef = db
          .collection('orgs')
          .doc(orgId)
          .collection('events')
          .doc(eventId)
          .collection('checkins')
          .doc();

        transaction.set(auditLogRef, {
          registrationId: payload.regId,
          volunteerId,
          timestamp: Timestamp.now(),
          partyCount,
          method: 'qr',
        });

        return {
          success: true,
          code: 'SUCCESS',
          regId: payload.regId,
          attendeeName: `${regData.firstName} ${regData.lastName}`,
          email: regData.email || '',
          phone: regData.phone || '',
          tier: regData.tier,
          checkedInCount: currentCheckedIn + partyCount,
          partySize: totalPartySize,
          newCheckIn: checkInEntry,
        };
      });

      return result;
    } catch (err: any) {
      console.error('Check-in transaction failed:', err);
      throw new HttpsError('internal', err?.message || 'Check-in failed due to server error.');
    }
  }
);
