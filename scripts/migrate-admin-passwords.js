#!/usr/bin/env node
// scripts/migrate-admin-passwords.js
// Resets all superadmin & eventadmin Firebase Auth passwords via
// the provisionUser Cloud Function (which already has admin credentials).

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { initializeApp }              = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

// ── Helpers ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const text = fs.readFileSync(envPath, 'utf8');
  const cfg = {};
  text.split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?/);
    if (!m) return;
    let v = (m[2] || '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    cfg[m[1]] = v;
  });
  return cfg;
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
const NEW_PASSWORD   = 'htstleventsadmin';
const ADMIN_ROLES    = ['superadmin', 'eventadmin'];
const ADMIN_EMAIL    = 'testadmin@htsl.events';
const ADMIN_PASSWORD = NEW_PASSWORD; // sign in with the already-known super admin

async function run() {
  const env = loadEnv();
  const apiKey = env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    console.error('Missing EXPO_PUBLIC_FIREBASE_API_KEY or EXPO_PUBLIC_FIREBASE_PROJECT_ID in .env.local');
    process.exit(1);
  }

  // Init client SDK to query Firestore for the list of users
  const app = initializeApp({
    apiKey,
    authDomain:        env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket:     env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             env.EXPO_PUBLIC_FIREBASE_APP_ID,
  });
  const db = getFirestore(app);
  const auth = getAuth(app);

  // Sign in as the super admin to get an ID token for calling Cloud Functions
  console.log(`\n🔐 Signing in as ${ADMIN_EMAIL}…`);
  let idToken;
  try {
    const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
    idToken = await cred.user.getIdToken();
    console.log('   ✅ Signed in\n');
  } catch (err) {
    console.error('   ❌ Could not sign in:', err.message);
    console.error('\nPlease ensure the super admin account is already set to the new password.');
    process.exit(1);
  }

  let migrated = 0, skipped = 0, errors = 0;

  for (const role of ADMIN_ROLES) {
    console.log(`── Role: ${role} ──`);
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', role)));
    if (snap.empty) { console.log('  (none found)'); continue; }

    for (const docSnap of snap.docs) {
      const { email, displayName } = docSnap.data();
      const label = `${displayName || email} (${email})`;
      if (!email) { console.log(`  ⚠️  no email — skipping`); skipped++; continue; }

      // Call provisionUser Cloud Function which resets the password to the role default
      const cfUrl = `https://us-central1-${projectId}.cloudfunctions.net/provisionUser`;
      const res = await httpsPost(cfUrl, {
        data: { email, displayName: displayName || email, role },
      });

      if (res.status === 200) {
        console.log(`  ✅  ${label}`);
        migrated++;
      } else {
        const msg = res.body?.error?.message || JSON.stringify(res.body);
        console.error(`  ❌  ${label} — ${msg}`);
        errors++;
      }
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅  Migrated : ${migrated}`);
  console.log(`⚪  Skipped  : ${skipped}`);
  console.log(`❌  Errors   : ${errors}`);
  console.log(`\nAll affected admins must now sign in with: "${NEW_PASSWORD}"\n`);
  process.exit(errors > 0 ? 1 : 0);
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
