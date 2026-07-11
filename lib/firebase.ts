// lib/firebase.ts
// Firebase client SDK initialization (Firebase 12 / Expo SDK 56 compatible).
//
// Platform-aware auth persistence:
//   - On native (iOS/Android): uses AsyncStorage-backed persistence via
//     getReactNativePersistence (required for React Native).
//   - On web: uses browserLocalPersistence so the session survives page refreshes.

import { Platform } from 'react-native';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  getFirestore,
  Firestore,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

// Prevent duplicate app initialization during hot-reload in development
let app: FirebaseApp;
let auth: Auth;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);

  if (Platform.OS === 'web') {
    // Web: use browser's localStorage for session persistence
    auth = initializeAuth(app, {
      persistence: browserLocalPersistence,
    });
  } else {
    // Native (iOS / Android): AsyncStorage persistence
    // Dynamic require keeps this import out of the web bundle entirely
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const { getReactNativePersistence } = require('firebase/auth');
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
} else {
  app = getApp();
  try {
    auth = getAuth(app);
  } catch {
    auth = initializeAuth(app, {
      persistence: Platform.OS === 'web' ? browserLocalPersistence : undefined,
    });
  }
}

// Firestore — persistentLocalCache works on web (IndexedDB) and native (SQLite)
let db: Firestore;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache(),
  });
} catch {
  // Already initialized (hot reload) — just get the existing instance
  db = getFirestore(app);
}

// Firebase Storage (for CSV uploads)
const storage: FirebaseStorage = getStorage(app);

export { app, auth, db, storage };
