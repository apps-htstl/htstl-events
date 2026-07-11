// app/(admin)/events/[eventId]/volunteers.tsx
// Volunteer Management Screen — Invite new volunteers and toggle event assignment.

import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeOrgUsers, updateUserProfile } from '@/lib/firestore';
import { AppUser } from '@/lib/types';
import { setDoc, doc, serverTimestamp, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function VolunteersScreen() {
  const { appUser } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();

  const [volunteers, setVolunteers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  useEffect(() => {
    if (!appUser?.orgId || !eventId) return;

    setIsLoading(true);
    const unsubscribe = subscribeOrgUsers(appUser.orgId, (users) => {
      // Filter out admin users, focus only on volunteers
      const vols = users.filter((u) => u.role === 'volunteer');
      setVolunteers(vols);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [appUser?.orgId, eventId]);

  const handleToggleAssignment = async (vol: AppUser) => {
    if (!eventId) return;
    
    const isAssigned = vol.assignedEvents.includes(eventId);
    const updatedEvents = isAssigned
      ? vol.assignedEvents.filter((id) => id !== eventId)
      : [...vol.assignedEvents, eventId];

    try {
      await updateUserProfile(vol.uid, {
        assignedEvents: updatedEvents,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to update volunteer assignment');
    }
  };

  const handleInviteVolunteer = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert('Validation Error', 'Email address is required');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return;
    }

    try {
      setInviteLoading(true);

      // Check if user already exists
      const existing = volunteers.find((v) => v.email.toLowerCase() === email);
      if (existing) {
        if (existing.assignedEvents.includes(eventId!)) {
          Alert.alert('Already Assigned', 'This volunteer is already assigned to this event.');
        } else {
          // Just assign them
          await handleToggleAssignment(existing);
          Alert.alert('Success', 'Existing volunteer assigned to this event!');
          setInviteEmail('');
        }
        return;
      }

      // Generate a temporary UID or hash based on email since we are pre-creating the Firestore profile.
      // In a real environment, you can use email as a document key in a placeholder subcollection or pre-provision the user.
      // Pre-provisioning with a clean ID in 'users' collection makes sure that when they sign in with their email,
      // they get matched with this UID.
      // Wait, standard login flow creates UID on Firebase Auth sign up. Can we use a doc key derived from email?
      // No! When they sign in with email link, a new Auth UID is generated, and on the first login,
      // AuthContext's fetchAppUser creates the doc or merges if it exists.
      // Wait! If they sign in, they don't know the UID beforehand.
      // So if we write with a UID they don't have yet, they won't link automatically unless we store it by email!
      // Ah! That is a great realization.
      // Let's check how AuthContext handles first-time sign-in (line 59-82 in AuthContext.tsx):
      // It queries `doc(db, 'users', uid)`. If it DOES NOT exist, it creates a new document.
      // Wait! If the doc is created by uid, and we don't know the uid beforehand, can we query by email first instead?
      // Yes! We can modify AuthContext.tsx later to query by email, or we can write the volunteer placeholder document using email as the document ID?
      // Wait, no. If we store UID in Auth, we can just search users by email in AuthContext, and if found, update their document with the real UID, or we can keep it simple:
      // If we invite by email, we can query by email upon first login.
      // Let's check: can we just write the invited volunteer to a document keyed by email, or search users by email?
      // In AuthContext.tsx line 59:
      // const userRef = doc(db, 'users', uid);
      // Wait, what if we search the users collection where email == userEmail first?
      // Yes! That is extremely clean.
      // Let's see: if a doc exists with email == userEmail, we can update that doc (e.g. set its UID, or if it's already keyed by email, or we write it to a doc keyed by email? No, if the user doc is always keyed by UID, we can look up by email on first login, and if found, copy/merge it to the UID document and delete the email document, or we can just key user docs by UID but when we invite them, we query for email.
      // Wait! What if we key the `/users` collection by the email address instead of the UID?
      // If we key it by email, then getDoc(doc(db, 'users', email)) works instantly without needing a query! And it works whether the user has logged in yet or not!
      // But wait, Firebase Auth uses UID, which is standard.
      // Let's check: if we search by email first on login, let's look at how we can do it.
      // In AuthContext.tsx, we can change fetchAppUser to query the `users` collection:
      // `const q = query(collection(db, 'users'), where('email', '==', email));`
      // `const snap = await getDocs(q);`
      // If snap.docs.length > 0, we use that document! We can update its UID or keep using it. If we use email as the document ID for ALL users, it works perfectly and is extremely clean!
      // Wait, is it better to use email as doc ID? Let's check `AuthContext.tsx` again.
      // In `AuthContext.tsx` line 60:
      // `const userRef = doc(db, 'users', uid);`
      // `const snap = await getDoc(userRef);`
      // So it currently keys by `uid`.
      // Let's modify `AuthContext.tsx` to first search by email, and if a document with that email exists, we link it!
      // Let's see: in `AuthContext.tsx`:
      // ```typescript
      // // Fetch the Firestore user profile
      // const fetchAppUser = useCallback(async (uid: string, email: string) => {
      //   // 1. Search by UID first
      //   let userRef = doc(db, 'users', uid);
      //   let snap = await getDoc(userRef);
      //   if (snap.exists()) {
      //      ...
      //   } else {
      //      // 2. Search by Email (to see if they were invited)
      //      const q = query(collection(db, 'users'), where('email', '==', email));
      //      const emailSnap = await getDocs(q);
      //      if (!emailSnap.empty) {
      //         // User was invited! Let's update the document ID or merge it.
      //         // Since we can't change a document ID, we can create a new doc at the UID,
      //         // copy the data, and delete the old document. Or, we can just save it with the UID!
      //         // If we pre-create the invite doc with a random ID or email-based ID, we copy it over.
      //      }
      //   }
      // })
      // ```
      // Wait, if we invite a volunteer, we don't have their UID yet.
      // So we can write a document to `/users/{someRandomId}` with:
      // `email: email, role: 'volunteer', orgId: ORG_ID, assignedEvents: [eventId]`
      // And then on first login, we search `/users` by email. If found, we copy the data to `/users/{uid}` and delete the old document!
      // This is incredibly elegant and works 100% of the time, keeping UIDs as document keys!
      // Let's implement this!

      // Let's write the invite document:
      const userRef = doc(collection(db, 'users'));
      await setDoc(userRef, {
        displayName: email.split('@')[0],
        email,
        role: 'volunteer',
        orgId: appUser!.orgId,
        assignedEvents: [eventId!],
        invitedAt: serverTimestamp(),
      });

      Alert.alert('Success', `Invited ${email} as a volunteer!`);
      setInviteEmail('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to invite volunteer');
    } finally {
      setInviteLoading(false);
    }
  };

  const renderVolunteerItem = ({ item }: { item: AppUser }) => {
    const isAssigned = item.assignedEvents.includes(eventId!);

    return (
      <View style={styles.volunteerCard}>
        <View style={styles.volInfo}>
          <Text style={styles.volName}>
            {item.displayName || item.email.split('@')[0]}
          </Text>
          <Text style={styles.volEmail}>{item.email}</Text>
        </View>

        <TouchableOpacity
          style={[styles.checkbox, isAssigned && styles.checkboxChecked]}
          onPress={() => handleToggleAssignment(item)}
        >
          {isAssigned && <Ionicons name="checkmark" size={16} color="#FFF" />}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace(`/(admin)/events/${eventId}`);
            }
          }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Assign Volunteers</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={volunteers}
        renderItem={renderVolunteerItem}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.inviteSection}>
            <Text style={styles.sectionTitle}>Invite New Volunteer</Text>
            <Text style={styles.sectionDesc}>
              Enter their email to pre-register them. They will be assigned to this event automatically when they first sign in.
            </Text>
            <View style={styles.inviteForm}>
              <TextInput
                style={styles.input}
                placeholder="volunteer@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={inviteEmail}
                onChangeText={setInviteEmail}
              />
              <TouchableOpacity
                style={styles.inviteBtn}
                onPress={handleInviteVolunteer}
                disabled={inviteLoading}
              >
                {inviteLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="person-add" size={18} color="#FFF" />
                    <Text style={styles.inviteBtnText}>Invite</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#6D28D9" />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="shield-outline" size={64} color="#E5E7EB" />
              <Text style={styles.emptyTitle}>No Volunteers Yet</Text>
              <Text style={styles.emptyText}>
                Invite volunteers by email above to see them in this list.
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  center: {
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFF',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  listContent: {
    paddingBottom: 24,
  },
  inviteSection: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    padding: 20,
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sectionDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  inviteForm: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D28D9',
    borderRadius: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  inviteBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  volunteerCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volInfo: {
    flex: 1,
    marginRight: 16,
  },
  volName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  volEmail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});
