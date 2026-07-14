import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';


export const setUserDefaultPassword = onCall(async (request) => {
  const { email, password } = request.data as { email: string; password: string };
  
  if (!email || !password) {
    throw new HttpsError('invalid-argument', 'Email and password are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = getFirestore();
  
  // Verify that the user exists in our Firestore users collection (invited/active user)
  const userSnap = await db.collection('users').where('email', '==', normalizedEmail).get();
  if (userSnap.empty) {
    throw new HttpsError('not-found', 'User profile not found. Please contact an admin.');
  }

  const userData = userSnap.docs[0].data();
  const role = userData.role;

  // Determine expected password for this role
  let roleDefaultPassword = 'volunteer1234'; // fallback
  if (role === 'superadmin' || role === 'eventadmin') {
    roleDefaultPassword = 'htstleventsadmin0714';
  } else if (role === 'poojari') {
    roleDefaultPassword = 'poojari1234';
  } else if (role === 'volunteer') {
    roleDefaultPassword = 'volunteer1234';
  }

  // Only allow setting if the password is the correct default password for their role
  if (password !== roleDefaultPassword) {
    throw new HttpsError('permission-denied', 'Invalid password.');
  }

  const auth = getAuth();
  try {
    const userRecord = await auth.getUserByEmail(normalizedEmail);
    // Update the password in Firebase Auth
    await auth.updateUser(userRecord.uid, {
      password: roleDefaultPassword,
      emailVerified: true
    });
    return { success: true };
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      // Create new Auth user with the default password
      await auth.createUser({
        email: normalizedEmail,
        password: roleDefaultPassword,
        emailVerified: true
      });
      return { success: true };
    }
    throw new HttpsError('internal', error.message || 'Failed to set password.');
  }
});
