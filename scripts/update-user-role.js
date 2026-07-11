/**
 * Utility script to update a user's role in Firestore via Admin SDK.
 * Usage: node scripts/update-user-role.js <email> <role>
 * Example: node scripts/update-user-role.js jangak@gmail.com volunteer
 */
const admin = require('firebase-admin');
const serviceAccount = require('../pc-api-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function updateRole(email, role) {
  const ALLOWED_ROLES = ['superadmin', 'eventadmin', 'poojari', 'volunteer'];
  if (!ALLOWED_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Must be one of: ${ALLOWED_ROLES.join(', ')}`);
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Try by UID first (look up Auth user)
  let uid;
  try {
    const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    uid = userRecord.uid;
    console.log(`Found Auth user: ${uid}`);
  } catch {
    console.error(`No Firebase Auth user found for ${normalizedEmail}`);
    process.exit(1);
  }

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();

  if (snap.exists()) {
    await userRef.update({ role, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`✅ Updated ${normalizedEmail} (${uid}) to role: "${role}"`);
    console.log('Previous data:', snap.data());
  } else {
    // Fall back to email-keyed doc
    const q = db.collection('users').where('email', '==', normalizedEmail);
    const res = await q.get();
    if (!res.empty) {
      await res.docs[0].ref.update({ role, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`✅ Updated placeholder doc for ${normalizedEmail} to role: "${role}"`);
    } else {
      console.error(`No Firestore profile found for ${normalizedEmail}`);
      process.exit(1);
    }
  }
}

const [,, email, role] = process.argv;
if (!email || !role) {
  console.error('Usage: node scripts/update-user-role.js <email> <role>');
  process.exit(1);
}

updateRole(email, role).then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
