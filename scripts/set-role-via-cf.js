/**
 * Uses the provisionUser Cloud Function (which runs with full Admin SDK permissions)
 * to update a user's role.
 * Usage: node scripts/set-role-via-cf.js <email> <displayName> <role>
 */
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const config = {};
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = (match[2] || '').trim().replace(/^["']|["']$/g, '');
      config[match[1]] = value;
    }
  });
  return config;
}

async function run() {
  const [,, email, displayName, role] = process.argv;
  if (!email || !displayName || !role) {
    console.error('Usage: node scripts/set-role-via-cf.js <email> <displayName> <role>');
    process.exit(1);
  }

  const env = loadEnv();
  const firebaseConfig = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const functions = getFunctions(app, 'us-central1');

  const adminEmail = 'testadmin@htsl.events';
  const adminPassword = env.EXPO_PUBLIC_DEFAULT_USER_PASSWORD;

  console.log(`Signing in as ${adminEmail}...`);
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

  console.log(`Calling provisionUser for ${email} with role "${role}"...`);
  const provisionUser = httpsCallable(functions, 'provisionUser');
  const result = await provisionUser({ email, displayName, role });
  console.log('Result:', result.data);
  process.exit(0);
}

run().catch(err => { console.error('Error:', err.message || err); process.exit(1); });
