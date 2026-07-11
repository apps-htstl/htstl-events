import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD;

export const setUserDefaultPassword = onCall(async (request) => {
  const { email, password } = request.data as { email: string; password: string };
  
  if (!email || !password) {
    throw new HttpsError('invalid-argument', 'Email and password are required.');
  }

  if (!DEFAULT_PASSWORD) {
    throw new HttpsError('internal', 'Server configuration error.');
  }

  // Only allow setting if the password is the default password
  if (password !== DEFAULT_PASSWORD) {
    throw new HttpsError('permission-denied', 'Invalid password.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = getFirestore();
  
  // Verify that the user exists in our Firestore users collection (invited/active user)
  const userSnap = await db.collection('users').where('email', '==', normalizedEmail).get();
  if (userSnap.empty) {
    throw new HttpsError('not-found', 'User profile not found. Please contact an admin.');
  }

  const auth = getAuth();
  try {
    const userRecord = await auth.getUserByEmail(normalizedEmail);
    // Update the password in Firebase Auth
    await auth.updateUser(userRecord.uid, {
      password: DEFAULT_PASSWORD,
      emailVerified: true
    });
    return { success: true };
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      // Create new Auth user with the default password
      await auth.createUser({
        email: normalizedEmail,
        password: DEFAULT_PASSWORD,
        emailVerified: true
      });
      return { success: true };
    }
    throw new HttpsError('internal', error.message || 'Failed to set password.');
  }
});
