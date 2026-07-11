// scripts/seed-events-sheet.js
// Script to parse downloaded events sheet and seed Firestore with the parsed events.

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, addDoc, Timestamp } = require('firebase/firestore');

const DEFAULT_EMAIL = 'testadmin@htsl.events';
const DEFAULT_PASSWORD = 'htstleventsadmin0714';

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env.local file not found at ' + envPath);
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const config = {};
  
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] ? match[2].trim() : '';
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

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function run() {
  console.log('Loading environment...');
  const env = loadEnv();

  const firebaseConfig = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };

  const orgId = env.EXPO_PUBLIC_ORG_ID || 'hindu-temple-stl';

  console.log('Initializing Firebase App and Auth...');
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  // Authenticate admin user
  console.log(`Authenticating as ${DEFAULT_EMAIL}...`);
  const userCredential = await signInWithEmailAndPassword(auth, DEFAULT_EMAIL, DEFAULT_PASSWORD);
  const adminUid = userCredential.user.uid;
  console.log(`Successfully authenticated! UID: ${adminUid}`);

  // Wait for 2 seconds to ensure token propagates to Firestore client context
  console.log('Waiting for auth token synchronization (2s)...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('Initializing Firestore...');
  const db = getFirestore(app);

  // Path to downloaded CSV
  const csvPath = '/Users/garuda/.gemini/antigravity-ide/brain/c2e68f46-f1f9-494b-9eff-671d7a8e5fd5/.system_generated/steps/9/content.md';
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading CSV content from ${csvPath}...`);
  const fileContent = fs.readFileSync(csvPath, 'utf8');
  const lines = fileContent.split(/\r?\n/);

  let currentDateStr = '';
  let currentSession = '';
  let previousTime = '';
  const parsedEvents = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Check for date header
    const dateMatch = line.match(/(Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/);
    if (dateMatch) {
      currentDateStr = dateMatch[2]; // e.g. "July 14, 2026"
      previousTime = ''; // Reset time on new date
      console.log(`\n--- Parsing Date: ${currentDateStr} ---`);
      continue;
    }

    // Check for session header
    const sessionMatch = line.match(/^(Morning|Afternooon|Session\s+\d+)/i);
    if (sessionMatch) {
      currentSession = sessionMatch[1];
      console.log(`  [Session: ${currentSession}]`);
      continue;
    }

    // Parse CSV line
    const parts = parseCsvLine(line);
    if (parts.length < 2) continue;

    const rawTime = parts[0] ? parts[0].trim() : '';
    const rawName = parts[1] ? parts[1].trim() : '';
    const rawLocation = parts[2] ? parts[2].trim() : '';

    // Clean name and location
    const cleanedName = rawName.replace(/^["']|["']$/g, '').trim();
    const cleanedLocation = rawLocation.replace(/^["']|["']$/g, '').trim();

    const locationLower = cleanedLocation.toLowerCase();
    
    // We filter rows that have a valid Temple venue
    if (
      cleanedName && 
      (locationLower === 'temple' || locationLower === 'yagashala' || locationLower === 'cec')
    ) {
      // Determine time
      let timeStr = rawTime;
      if (!timeStr) {
        if (cleanedName.toLowerCase().includes('ankurarpana')) {
          timeStr = '6:45 PM'; // After Dwaja Arohanam at 6:30 PM
        } else if (cleanedName.toLowerCase().includes('mahanyasa')) {
          timeStr = '8:15 AM'; // Between Go Puja (8 AM) and Rudra Homam (8:30 AM)
        } else if (previousTime) {
          timeStr = previousTime;
        } else {
          timeStr = '8:00 AM';
        }
      } else {
        previousTime = timeStr;
      }

      // Format clean time
      const cleanedTimeStr = timeStr.replace(/\s+/g, ' ').trim();
      const timeMatch = cleanedTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

      let eventDate;
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const ampm = timeMatch[3].toUpperCase();
        if (ampm === 'PM' && hours < 12) {
          hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
          hours = 0;
        }

        // Fix potential typo "1:00 AM, Theertha Prasadam, CEC" on Friday to 1:00 PM
        if (currentDateStr.includes('July 17') && cleanedName.toLowerCase().includes('prasadam') && hours === 1) {
          hours = 13;
        }

        eventDate = new Date(`${currentDateStr} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
      } else {
        eventDate = new Date(`${currentDateStr} 08:00:00`);
      }

      // Map venue
      let venueName = 'Hindu Temple of St. Louis';
      if (locationLower === 'temple') {
        venueName = 'Hindu Temple of St. Louis - Temple';
      } else if (locationLower === 'yagashala') {
        venueName = 'Hindu Temple of St. Louis - Yagashala';
      } else if (locationLower === 'cec') {
        venueName = 'Hindu Temple of St. Louis - Community Center (CEC)';
      }

      parsedEvents.push({
        name: cleanedName,
        date: eventDate,
        venue: venueName,
        status: 'active',
      });

      console.log(`    -> Parsed Event: "${cleanedName}" | Date: ${eventDate.toISOString()} | Venue: ${venueName}`);
    }
  }

  console.log(`\nSuccessfully parsed ${parsedEvents.length} events from CSV!`);

  // Default seating capacity configuration
  const sections = [
    { id: 'front-rows', name: 'Front Rows (1-5)', capacity: 100, color: '#A855F7' },
    { id: 'rows-6-12', name: 'Rows 6-12', capacity: 200, color: '#F59E0B' },
    { id: 'rows-13-20', name: 'Rows 13-20', capacity: 300, color: '#3B82F6' },
    { id: 'general-standing', name: 'General Standing', capacity: 500, color: '#10B981' },
  ];

  const tiers = [
    { id: 'platinum', name: 'Platinum', color: '#A855F7', sectionIds: ['front-rows'] },
    { id: 'gold', name: 'Gold', color: '#F59E0B', sectionIds: ['rows-6-12'] },
    { id: 'silver', name: 'Silver', color: '#3B82F6', sectionIds: ['rows-13-20'] },
    { id: 'general', name: 'General', color: '#10B981', sectionIds: ['general-standing'] },
  ];

  console.log('Writing events to Firestore...');
  const eventsCollectionRef = collection(db, 'orgs', orgId, 'events');

  for (const event of parsedEvents) {
    const payload = {
      orgId,
      name: event.name,
      date: Timestamp.fromDate(event.date),
      venue: event.venue,
      status: event.status,
      tiers,
      sections,
      createdBy: adminUid,
      createdAt: Timestamp.now(),
    };

    const docRef = await addDoc(eventsCollectionRef, payload);
    console.log(`Created Event ID: ${docRef.id} for "${event.name}"`);
  }

  console.log('\nSeeding completed successfully!');
}

run().catch((err) => {
  console.error('Seeding failed with error:', err);
  process.exit(1);
});
