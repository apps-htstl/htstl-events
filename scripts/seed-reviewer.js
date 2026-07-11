// scripts/seed-reviewer.js
// Standalone Node.js script to seed the reviewer/admin user in Firebase Auth & Firestore.
// Uses credentials from .env.local to initialize Firebase.

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

const DEFAULT_EMAIL = 'testadmin@htsl.events';
const DEFAULT_PASSWORD = 'HtstlEvents2026!';

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env.local file not found at ' + envPath);
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const config = {};
  
  envContent.split(/\r?\n/).forEach((line) => {
    // Match line containing VAR=VAL, ignoring comments
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] ? match[2].trim() : '';
      // Strip quotes if any
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      config[match[1]] = value;
    }
  });

  return config;
}

async function run() {
  console.log('Loading environment variables...');
  const env = loadEnv();

  const firebaseConfig = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };

  // Validate presence of config
  const missing = Object.keys(firebaseConfig).filter(k => !firebaseConfig[k]);
  if (missing.length > 0) {
    console.error('Error: Missing Firebase environment variables in .env.local:', missing.join(', '));
    process.exit(1);
  }

  const orgId = env.EXPO_PUBLIC_ORG_ID || 'hindu-temple-stl';

  console.log('Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid;
  try {
    console.log(`Creating auth user: ${DEFAULT_EMAIL} ...`);
    const cred = await createUserWithEmailAndPassword(auth, DEFAULT_EMAIL, DEFAULT_PASSWORD);
    uid = cred.user.uid;
    console.log(`Created new auth user with UID: ${uid}`);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log('Auth user already exists. Attempting sign-in to retrieve UID...');
      try {
        const cred = await signInWithEmailAndPassword(auth, DEFAULT_EMAIL, DEFAULT_PASSWORD);
        uid = cred.user.uid;
        console.log(`Retrieved existing auth user UID: ${uid}`);
      } catch (signErr) {
        console.error('\nError: Could not authenticate existing user. The password in Firebase might be different.');
        console.error('If you want to reset the password, please delete the user from the Firebase Authentication console and run this script again.\n');
        process.exit(1);
      }
    } else if (err.code === 'auth/operation-not-allowed') {
      console.error('\nError: Email/Password sign-in provider is disabled in Firebase console.');
      console.error('Please go to Firebase Console -> Authentication -> Sign-in method, enable "Email/Password", and try again.\n');
      process.exit(1);
    } else {
      console.error('Error creating user:', err.message);
      process.exit(1);
    }
  }

  try {
    console.log(`Seeding Firestore user profile for UID ${uid} with superadmin role...`);
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
      email: DEFAULT_EMAIL.toLowerCase(),
      role: 'superadmin',
      displayName: 'App Store Reviewer',
      orgId: orgId,
      assignedEvents: [],
      invitedAt: new Date(),
      lastLogin: serverTimestamp(),
    }, { merge: true });

    console.log('\n=============================================');
    console.log('SUCCESS: Reviewer account seeded successfully!');
    console.log('---------------------------------------------');
    console.log(`Email:    ${DEFAULT_EMAIL}`);
    console.log(`Password: ${DEFAULT_PASSWORD}`);
    console.log(`Role:     superadmin`);
    console.log(`UID:      ${uid}`);
    console.log('=============================================\n');
  } catch (err) {
    console.error('Error seeding Firestore document:', err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
