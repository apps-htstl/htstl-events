// app/(admin)/users.tsx
// User & Staff Management Screen — Exclusive to Super Admins.
// List all organization members (Super Admin, Event Admin, Priest/Poojari, Volunteer).
// Invite/provision new staff members with their respective roles.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeOrgUsers, updateUserProfile } from '@/lib/firestore';
import { AppUser, UserRole } from '@/lib/types';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';
import AdminHeader from '@/components/AdminHeader';
import { gsDark } from '@/constants/styles';
import { colors, fonts, fontSize, radius, spacing } from '@/constants/theme';
import { useRouter } from 'expo-router';

const ROLE_OPTIONS: { label: string; value: UserRole; color: string; bg: string }[] = [
  { label: 'Super Admin', value: 'superadmin', color: colors.primary, bg: colors.surfaceSoft },
  { label: 'Event Admin', value: 'eventadmin', color: colors.goldDeep, bg: colors.tipBg },
  { label: 'Priest (Poojari)', value: 'poojari', color: '#EA580C', bg: '#FFEDD5' },
  { label: 'Volunteer', value: 'volunteer', color: '#059669', bg: '#D1FAE5' },
];

const EMPTY_FORM = {
  displayName: '',
  email: '',
  role: 'poojari' as UserRole,
};

export default function UsersManagementScreen() {
  const router = useRouter();
  const { appUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  // Invite modal
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  // Edit modal
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', role: 'poojari' as UserRole });
  const [isEditSaving, setIsEditSaving] = useState(false);

  // Subscribe to all users in the same organization
  useEffect(() => {
    if (!appUser?.orgId) return;

    setIsLoading(true);
    const unsub = subscribeOrgUsers(appUser.orgId, (fetchedUsers) => {
      // Sort users by role hierarchy, then by name
      const roleOrder: Record<UserRole, number> = {
        superadmin: 1,
        eventadmin: 2,
        poojari: 3,
        volunteer: 4,
      };

      const sorted = [...fetchedUsers].sort((a, b) => {
        const orderA = roleOrder[a.role] ?? 99;
        const orderB = roleOrder[b.role] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return (a.displayName || '').localeCompare(b.displayName || '');
      });

      setUsers(sorted);
      setIsLoading(false);
    });

    return () => unsub();
  }, [appUser?.orgId]);

  const handleCreateUser = async () => {
    const email = form.email.trim().toLowerCase();
    const name = form.displayName.trim();
    const role = form.role;

    if (!name) {
      Alert.alert('Validation Error', 'Please enter a name.');
      return;
    }
    if (!email) {
      Alert.alert('Validation Error', 'Please enter an email address.');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Validation Error', 'Please enter a valid email address.');
      return;
    }

    // Check if user already exists in local list
    const existing = users.find((u) => u.email.toLowerCase() === email);
    if (existing) {
      Alert.alert('User Exists', `A user with email ${email} already exists as a ${existing.role}.`);
      return;
    }

    if (!appUser?.orgId || !appUser?.uid) return;
    setIsSaving(true);

    try {
      // Call provisionUser Cloud Function — uses Firebase Admin SDK to
      // immediately create the Auth user + Firestore profile.
      const functions = getFunctions(app, 'us-central1');
      const provisionUser = httpsCallable(functions, 'provisionUser');
      const result = await provisionUser({ displayName: name, email, role }) as any;

      setModalVisible(false);
      setForm(EMPTY_FORM);
      Alert.alert(
        '✅ Staff Added',
        `${name} has been added as ${ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role}.

They can log in with ${email} right away — no sign-up needed.`
      );
    } catch (err: any) {
      const msg = err?.message || err?.details || 'Failed to provision user.';
      Alert.alert('Error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRole = async (userId: string, currentName: string, currentRole: UserRole) => {
    const changeRole = async (newRole: UserRole) => {
      try {
        await updateUserProfile(userId, { role: newRole });
        Alert.alert('Success', `Updated ${currentName}'s role to ${newRole}`);
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to update role.');
      }
    };

    const options = ROLE_OPTIONS.filter((r) => r.value !== currentRole).map((r) => ({
      text: r.label,
      onPress: () => changeRole(r.value),
    }));

    if (Platform.OS === 'web') {
      const roleStr = ROLE_OPTIONS.map((r) => `${r.value}: ${r.label}`).join('\n');
      const response = window.prompt(
        `Update role for ${currentName}. Current role: ${currentRole}\n\nEnter new role (superadmin, eventadmin, poojari, volunteer):`
      );
      if (response) {
        const cleaned = response.trim().toLowerCase() as UserRole;
        if (['superadmin', 'eventadmin', 'poojari', 'volunteer'].includes(cleaned)) {
          changeRole(cleaned);
        } else {
          alert('Invalid role entered.');
        }
      }
    } else {
      Alert.alert(
        'Change Role',
        `Select new role for ${currentName}:`,
        [
          ...options,
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true }
      );
    }
  };

  const handleDeleteUser = (item: AppUser) => {
    const performDelete = async () => {
      try {
        await deleteDoc(doc(db, 'users', item.uid));
        Alert.alert('Success', 'User deleted successfully.');
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to delete user.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete user ${item.displayName || item.email}?`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Delete User',
        `Are you sure you want to delete user ${item.displayName || item.email}? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  // ── Edit existing user ────────────────────────────────────────────────────
  const openEditModal = (item: AppUser) => {
    setEditTarget(item);
    setEditForm({ displayName: item.displayName || '', role: item.role });
  };

  const handleEditUser = async () => {
    if (!editTarget) return;
    const name = editForm.displayName.trim();
    if (!name) {
      Alert.alert('Validation Error', 'Please enter a name.');
      return;
    }
    setIsEditSaving(true);
    try {
      await updateUserProfile(editTarget.uid, {
        displayName: name,
        role: editForm.role,
      });
      setEditTarget(null);
      Alert.alert('✅ Updated', `${name}'s details have been saved.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update user.');
    } finally {
      setIsEditSaving(false);
    }
  };

  // Filter users based on query
  const filteredUsers = users.filter((u) => {
    const query = searchQuery.toLowerCase();
    return (
      (u.displayName || '').toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      u.role.toLowerCase().includes(query)
    );
  });

  const getRoleStyle = (role: UserRole) => {
    const opt = ROLE_OPTIONS.find((r) => r.value === role);
    return {
      color: opt?.color || '#374151',
      backgroundColor: opt?.bg || '#F3F4F6',
      label: opt?.label || role,
    };
  };

  const renderItem = ({ item }: { item: AppUser }) => {
    const roleStyle = getRoleStyle(item.role);
    const isSelf = item.uid === appUser?.uid;

    return (
      <View style={styles.userCard}>
        <View style={styles.userIconWrap}>
          <Ionicons name="person-circle-outline" size={36} color={roleStyle.color} />
        </View>
        <View style={styles.userBody}>
          <View style={styles.userTitleRow}>
            <Text style={styles.userName}>
              {item.displayName || 'No Name'} {isSelf && <Text style={styles.selfTag}>(You)</Text>}
            </Text>
            <View style={[styles.roleBadge, { backgroundColor: roleStyle.backgroundColor }]}>
              <Text style={[styles.roleBadgeText, { color: roleStyle.color }]}>
                {roleStyle.label}
              </Text>
            </View>
          </View>
          <Text style={styles.userEmail}>{item.email}</Text>
          {item.invitedAt && !item.lastLogin && (
            <Text style={styles.pendingText}>Pending invitation</Text>
          )}
        </View>
        
        {!isSelf && (
          <View style={styles.actionsColumn}>
            {/* Edit button — opens the Edit modal */}
            <TouchableOpacity
              onPress={() => openEditModal(item)}
              style={styles.editBtn}
            >
              <Ionicons name="pencil-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDeleteUser(item)}
              style={styles.deleteBtn}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <AdminHeader
        subtitle="Navakundathmaka Shatha Chandi Sahitha Rudra Yagam · User Directory"
        meta="Manage administrative staff, priests, and volunteers"
        right={
          <TouchableOpacity onPress={() => router.replace('/home' as any)}>
            <Text style={gsDark.link}>← Back</Text>
          </TouchableOpacity>
        }
      />

      {/* Search and primary action */}
      <View style={styles.toolbar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, email, or role..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.inviteBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="person-add" size={18} color={colors.dark.bg} />
          <Text style={styles.inviteBtnText}>Invite Staff</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={72} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No Users Found</Text>
          <Text style={styles.emptyText}>
            Try adjusting your search query, or tap "Invite Staff" to add new team members.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filteredUsers}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        />
      )}

      {/* ── Edit User Modal ─────────────────────────────────── */}
      <Modal
        visible={editTarget !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditTarget(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditTarget(null)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={colors.gold} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Staff Member</Text>
            <TouchableOpacity
              onPress={handleEditUser}
              style={[styles.modalSaveBtn, isEditSaving && styles.modalSaveBtnDisabled]}
              disabled={isEditSaving}
            >
              {isEditSaving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.modalSaveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {/* Email — read-only display */}
            {editTarget && (
              <View style={styles.infoBox}>
                <Ionicons name="mail-outline" size={18} color="#4F46E5" />
                <Text style={styles.infoText}>
                  Editing account for: <Text style={{ fontWeight: '800' }}>{editTarget.email}</Text>
                </Text>
              </View>
            )}

            {/* Display Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Full Name</Text>
              <TextInput
                style={styles.formInput}
                value={editForm.displayName}
                onChangeText={(v) => setEditForm((f) => ({ ...f, displayName: v }))}
                placeholder="Full name"
                placeholderTextColor={colors.muted}
              />
            </View>

            {/* Role */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Role Assignment</Text>
              <View style={styles.roleGrid}>
                {ROLE_OPTIONS.map((opt) => {
                  const isSelected = editForm.role === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.roleChip,
                        { borderColor: opt.color },
                        isSelected && { backgroundColor: opt.bg },
                      ]}
                      onPress={() => setEditForm((f) => ({ ...f, role: opt.value }))}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={16}
                        color={opt.color}
                      />
                      <Text style={[styles.roleChipText, { color: opt.color }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      {/* \u2500\u2500 Invite Staff Modal \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={colors.gold} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Invite Staff Member</Text>
            <TouchableOpacity
              onPress={handleCreateUser}
              style={[styles.modalSaveBtn, isSaving && styles.modalSaveBtnDisabled]}
              disabled={isSaving}
            >
              {isSaving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.modalSaveBtnText}>Invite</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.infoBox}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#4F46E5" />
              <Text style={styles.infoText}>
                Staff accounts are created instantly — they can log in right away with their email.
              </Text>
            </View>

            {/* Display Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Full Name *</Text>
              <TextInput
                style={styles.formInput}
                value={form.displayName}
                onChangeText={(v) => setForm((f) => ({ ...f, displayName: v }))}
                placeholder="e.g. Pandit Ji / Hrushi Admin"
                placeholderTextColor={colors.muted}
              />
            </View>

            {/* Email */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email Address *</Text>
              <TextInput
                style={styles.formInput}
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                placeholder="email@example.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            {/* Role selection */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Role Assignment *</Text>
              <View style={styles.roleGrid}>
                {ROLE_OPTIONS.map((opt) => {
                  const isSelected = form.role === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.roleChip,
                        { borderColor: opt.color },
                        isSelected && { backgroundColor: opt.bg },
                      ]}
                      onPress={() => setForm((f) => ({ ...f, role: opt.value }))}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={16}
                        color={opt.color}
                      />
                      <Text style={[styles.roleChipText, { color: opt.color }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontFamily: fonts.serif, fontSize: fontSize.h2, fontWeight: '800', color: colors.heading },
  headerSub: { fontFamily: fonts.sans, fontSize: fontSize.small, color: colors.muted, marginTop: 2 },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.sm + 2,
    gap: spacing.sm,
    marginTop: 0,
  },
  inviteBtnText: { fontFamily: fonts.sans, color: colors.dark.bg, fontWeight: '700', fontSize: fontSize.body },
  toolbar: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.sm,
  },
  searchContainer: {
    flex: 1,
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    gap: spacing.sm,
  },
  searchIcon: { marginRight: 2 },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: fontSize.body, color: colors.heading, padding: 0 },
  list: { flex: 1, minHeight: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontFamily: fonts.serif, fontSize: fontSize.h2, fontWeight: '700', color: colors.heading, textAlign: 'center' },
  emptyText: { fontFamily: fonts.sans, fontSize: fontSize.label, color: colors.body, textAlign: 'center', lineHeight: 18 },
  listContent: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: spacing.xl, gap: spacing.md, paddingBottom: 40 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userIconWrap: { justifyContent: 'center', alignItems: 'center' },
  userBody: { flex: 1, gap: 4 },
  userTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  userName: { fontFamily: fonts.serif, fontSize: fontSize.h3, fontWeight: '700', color: colors.primary },
  selfTag: { fontFamily: fonts.sans, fontSize: fontSize.small, fontWeight: '500', color: colors.muted },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  userEmail: { fontFamily: fonts.sans, fontSize: fontSize.label, color: colors.body },
  pendingText: { fontSize: 11, color: '#EA580C', fontWeight: '600', fontStyle: 'italic' },
  actionsColumn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBtn: {
    padding: 8,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.sm,
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
  },

  // Modal
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.dark.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gold,
  },
  modalCloseBtn: { padding: 6 },
  modalTitle: { fontFamily: fonts.serif, fontSize: fontSize.h3, fontWeight: '700', color: colors.dark.text },
  modalSaveBtn: {
    backgroundColor: colors.gold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: { opacity: 0.6 },
  modalSaveBtnText: { color: colors.dark.bg, fontWeight: '700', fontSize: fontSize.label },
  modalContent: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.xl, gap: spacing.lg, paddingBottom: 40 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.tipBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.tipBorder,
  },
  infoText: { flex: 1, fontFamily: fonts.sans, fontSize: fontSize.label, color: colors.body, lineHeight: 18 },
  formGroup: { gap: 6 },
  formLabel: { fontFamily: fonts.sans, fontSize: fontSize.label, fontWeight: '700', color: colors.body },
  formInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.heading,
  },
  roleGrid: { gap: 10, marginTop: 4 },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  roleChipText: { fontFamily: fonts.sans, fontSize: fontSize.body, fontWeight: '700' },
});
