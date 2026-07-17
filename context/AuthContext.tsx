// context/AuthContext.tsx
// Provides Firebase Auth state and the current user's Firestore profile (with role)
// to the entire app via React Context.

import { app, auth, db } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AppUser } from '@/lib/types';
import {
  ActionCodeSettings,
  User,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const ORG_ID = process.env.EXPO_PUBLIC_ORG_ID ?? 'hindu-temple-stl';

// The URL Firebase will redirect to after the user clicks the magic link.
// Must be whitelisted in Firebase Console → Authentication → Authorized domains.
const ACTION_CODE_SETTINGS: ActionCodeSettings = {
  url: `https://${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  handleCodeInApp: true,
  iOS: {
    bundleId: 'com.htsl.events',
  },
  android: {
    packageName: 'com.htsl.events',
    installApp: true,
    minimumVersion: '12',
  },
};

interface AuthContextValue {
  firebaseUser: User | null;
  appUser: AppUser | null;
  isLoading: boolean;
  sendMagicLink: (email: string) => Promise<void>;
  completeSignIn: (email: string, link: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the Firestore user profile (role, assignedEvents, etc.)
  const fetchAppUser = useCallback(async (uid: string, email: string) => {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      // Update last login timestamp
      await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
      setAppUser({ uid, ...snap.data() } as AppUser);
    } else {
      // Check if there is an invited user placeholder doc (query by email)
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
      const emailSnap = await getDocs(q);

      if (!emailSnap.empty) {
        // Invite found! Migrate it to the UID key
        const inviteDoc = emailSnap.docs[0];
        const inviteData = inviteDoc.data();

        const newUser: Omit<AppUser, 'uid'> = {
          displayName: inviteData.displayName || email.split('@')[0],
          email: email.toLowerCase(),
          role: inviteData.role || 'volunteer',
          orgId: inviteData.orgId || ORG_ID,
          assignedEvents: inviteData.assignedEvents || [],
          invitedAt: inviteData.invitedAt ? inviteData.invitedAt.toDate() : new Date(),
          lastLogin: new Date(),
        };

        // Create new UID doc
        await setDoc(userRef, { ...newUser, lastLogin: serverTimestamp() });

        // Delete old placeholder doc
        await deleteDoc(doc(db, 'users', inviteDoc.id));

        setAppUser({ uid, ...newUser });
      } else {
        // First-time sign-in without pre-existing invite
        const newUser: Omit<AppUser, 'uid'> = {
          displayName: email.split('@')[0],
          email: email.toLowerCase(),
          role: 'volunteer',
          orgId: ORG_ID,
          assignedEvents: [],
          invitedAt: new Date(),
          lastLogin: new Date(),
        };
        await setDoc(userRef, { ...newUser, lastLogin: serverTimestamp() });
        setAppUser({ uid, ...newUser });
      }
    }
  }, []);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && user.email) {
        await fetchAppUser(user.uid, user.email);
      } else {
        setAppUser(null);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, [fetchAppUser]);

  // Step 1: Send the magic link email to the user
  const sendMagicLink = useCallback(async (email: string) => {
    await sendSignInLinkToEmail(auth, email, ACTION_CODE_SETTINGS);
  }, []);

  // Step 2: Complete sign-in using the link opened from the email
  const completeSignIn = useCallback(
    async (email: string, link: string) => {
      if (!isSignInWithEmailLink(auth, link)) {
        throw new Error('Invalid sign-in link');
      }
      const result = await signInWithEmailLink(auth, email, link);
      if (result.user.email) {
        await fetchAppUser(result.user.uid, result.user.email);
      }
    },
    [fetchAppUser],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        if (result.user.email) {
          await fetchAppUser(result.user.uid, result.user.email);
        }
      } catch (err: any) {
        // If password is one of the default passwords and the sign-in failed,
        // attempt to initialize/reset the password using Cloud Function.
        const defaultPasswords = [
          'htstleventsadmin',
          'poojari1234',
          'volunteer1234',
          process.env.EXPO_PUBLIC_DEFAULT_USER_PASSWORD
        ].filter(Boolean);
        
        if (
          defaultPasswords.includes(password) &&
          (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found')
        ) {
          try {
            const functions = getFunctions(app, 'us-central1');
            const setDefaultPass = httpsCallable(functions, 'setUserDefaultPassword');
            await setDefaultPass({ email, password });
            
            // Retry sign in after password has been set
            const result = await signInWithEmailAndPassword(auth, email, password);
            if (result.user.email) {
              await fetchAppUser(result.user.uid, result.user.email);
            }
            return;
          } catch (innerErr) {
            // Throw original error if the recovery attempt failed
            throw err;
          }
        }
        throw err;
      }
    },
    [fetchAppUser]
  );

  const logout = useCallback(async () => {
    await signOut(auth);
    setAppUser(null);
    setFirebaseUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        isLoading,
        sendMagicLink,
        completeSignIn,
        signInWithPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
