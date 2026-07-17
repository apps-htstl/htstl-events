// functions/src/provisionUser.ts
// Cloud Function callable by superadmins to instantly create a Firebase Auth user
// + their Firestore profile. The account is active immediately — no signup link needed.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';


export const provisionUser = onCall(async (request) => {
  // 1. Must be authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  // 2. Caller must be superadmin
  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists || callerSnap.data()?.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Only superadmins can provision staff accounts.');
  }
  const callerOrgId: string = callerSnap.data()?.orgId;

  // 3. Validate inputs
  const { displayName, email, role } = request.data as {
    displayName: string;
    email: string;
    role: string;
  };

  if (!displayName?.trim()) throw new HttpsError('invalid-argument', 'displayName is required.');
  if (!email?.trim() || !email.includes('@')) throw new HttpsError('invalid-argument', 'Valid email is required.');

  const ALLOWED_ROLES = ['superadmin', 'eventadmin', 'poojari', 'volunteer'];
  if (!ALLOWED_ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', `Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}.`);
  }

  const auth = getAuth();
  const normalizedEmail = email.trim().toLowerCase();

  // 4. Check if a Firebase Auth user with this email already exists
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(normalizedEmail);
    // Auth user exists — update password to default and update their Firestore profile role
    uid = existing.uid;

    // Determine expected password for this role
    let roleDefaultPassword = 'volunteer1234'; // fallback
    if (role === 'superadmin' || role === 'eventadmin') {
      roleDefaultPassword = 'htstleventsadmin';
    } else if (role === 'poojari') {
      roleDefaultPassword = 'poojari1234';
    } else if (role === 'volunteer') {
      roleDefaultPassword = 'volunteer1234';
    }

    // Always reset password to default when an admin provisions/updates a user
    await auth.updateUser(uid, { password: roleDefaultPassword });
    const userRef = db.collection('users').doc(uid);
    const firestoreSnap = await userRef.get();

    if (firestoreSnap.exists) {
      // Update role and display name in existing doc
      await userRef.update({
        role,
        displayName: displayName.trim(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // Auth user exists but no Firestore doc — create it
      await userRef.set({
        uid,
        displayName: displayName.trim(),
        email: normalizedEmail,
        role,
        orgId: callerOrgId,
        assignedEvents: [],
        invitedBy: request.auth.uid,
        invitedAt: FieldValue.serverTimestamp(),
        lastLogin: null,
      });
    }

    // Also delete any stale email-keyed placeholder doc if it exists
    const emailDocRef = db.collection('users').doc(normalizedEmail);
    const emailDocSnap = await emailDocRef.get();
    if (emailDocSnap.exists) {
      await emailDocRef.delete();
    }

    return { success: true, uid, message: `Existing account updated to ${role}.` };

  } catch (err: any) {
    if (err.code !== 'auth/user-not-found') {
      // Unexpected error
      throw new HttpsError('internal', err.message || 'Failed to look up existing user.');
    }

    // 5. No existing auth user — create one with the default password.
    //    The user can sign in with this password right away.
    // Determine expected password for this role
    let roleDefaultPassword = 'volunteer1234'; // fallback
    if (role === 'superadmin' || role === 'eventadmin') {
      roleDefaultPassword = 'htstleventsadmin';
    } else if (role === 'poojari') {
      roleDefaultPassword = 'poojari1234';
    } else if (role === 'volunteer') {
      roleDefaultPassword = 'volunteer1234';
    }

    let newUser;
    try {
      newUser = await auth.createUser({
        email: normalizedEmail,
        displayName: displayName.trim(),
        password: roleDefaultPassword,
        emailVerified: false,
      });
    } catch (createErr: any) {
      throw new HttpsError('internal', createErr.message || 'Failed to create Firebase Auth user.');
    }

    uid = newUser.uid;

    // 6. Create Firestore profile keyed by the real UID
    await db.collection('users').doc(uid).set({
      uid,
      displayName: displayName.trim(),
      email: normalizedEmail,
      role,
      orgId: callerOrgId,
      assignedEvents: [],
      invitedBy: request.auth.uid,
      invitedAt: FieldValue.serverTimestamp(),
      lastLogin: null,
    });

    // 7. Clean up any stale email-keyed placeholder doc
    const emailDocRef = db.collection('users').doc(normalizedEmail);
    const emailDocSnap = await emailDocRef.get();
    if (emailDocSnap.exists) {
      await emailDocRef.delete();
    }

    return { success: true, uid, message: `Account created successfully for ${normalizedEmail}.` };
  }
});


