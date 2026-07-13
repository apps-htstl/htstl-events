// app/(admin)/seva-registry.tsx
// Admin Seva Registry — manage Seva Lists (Google Sheet links) for the Poojari.
// Receptionist/Event Admin can add new sheets and delete existing ones.

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
import AdminHeader from '@/components/AdminHeader';
import { gsDark } from '@/constants/styles';
import { colors, fonts, fontSize, radius, spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import {
  subscribeSevaLists,
  createSevaList,
  deleteSevaList,
  extractSheetId,
  buildSheetCsvUrl,
} from '@/lib/firestore';
import { SevaList } from '@/lib/types';

interface PreviewState {
  loading: boolean;
  rowCount: number | null;
  events: string[];
  error: string | null;
}

const EMPTY_FORM = {
  name: '',
  sheetUrl: '',
  eventColumn: 'Event',
  description: '',
};

export default function AdminSevaRegistryScreen() {
  const { appUser } = useAuth();
  const router = useRouter();
  const isSuperAdmin = appUser?.role === 'superadmin';
  const [sevaLists, setSevaLists] = useState<SevaList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({
    loading: false,
    rowCount: null,
    events: [],
    error: null,
  });

  useEffect(() => {
    if (!appUser?.orgId) return;
    const unsub = subscribeSevaLists(appUser.orgId, (lists) => {
      setSevaLists(lists);
      setIsLoading(false);
    });
    return () => unsub();
  }, [appUser?.orgId]);

  // Preview — fetch CSV and extract events
  const handlePreview = async () => {
    const sheetId = extractSheetId(form.sheetUrl.trim());
    if (!sheetId) {
      setPreview({ loading: false, rowCount: null, events: [], error: 'Invalid Google Sheets URL. Could not extract Sheet ID.' });
      return;
    }
    setPreview({ loading: true, rowCount: null, events: [], error: null });
    try {
      const csvUrl = buildSheetCsvUrl(sheetId);
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} — is the sheet shared publicly?`);
      const text = await response.text();
      // Simple CSV parse for headers + count
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) throw new Error('Sheet has no data rows.');
      const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
      const eventColIdx = headers.findIndex(
        (h) => h.toLowerCase() === (form.eventColumn || 'event').toLowerCase()
      );
      const events = new Set<string>();
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (eventColIdx >= 0 && cols[eventColIdx]) {
          const val = cols[eventColIdx].replace(/^"|"$/g, '').trim();
          if (val) events.add(val);
        }
      }
      setPreview({
        loading: false,
        rowCount: lines.length - 1,
        events: Array.from(events).sort(),
        error: null,
      });
    } catch (err: any) {
      setPreview({ loading: false, rowCount: null, events: [], error: err?.message || 'Failed to fetch sheet.' });
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Please enter a name for this Seva List.');
      return;
    }
    if (!form.sheetUrl.trim()) {
      Alert.alert('Validation', 'Please paste the Google Sheets URL.');
      return;
    }
    const sheetId = extractSheetId(form.sheetUrl.trim());
    if (!sheetId) {
      Alert.alert('Invalid URL', 'Could not extract Sheet ID from the URL. Please paste a valid Google Sheets link.');
      return;
    }
    if (!appUser?.orgId || !appUser?.uid) return;
    setIsSaving(true);
    try {
      await createSevaList(appUser.orgId, appUser.uid, {
        name: form.name.trim(),
        sheetUrl: form.sheetUrl.trim(),
        sheetId,
        eventColumn: form.eventColumn.trim() || 'Event',
        description: form.description.trim(),
      });
      setModalVisible(false);
      setForm(EMPTY_FORM);
      setPreview({ loading: false, rowCount: null, events: [], error: null });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create Seva List.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (item: SevaList) => {
    const performDelete = async () => {
      try {
        await deleteSevaList(appUser!.orgId, item.id);
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to delete.');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${item.name}"? This cannot be undone.`)) performDelete();
    } else {
      Alert.alert('Delete Seva List', `Delete "${item.name}"? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  const renderItem = ({ item }: { item: SevaList }) => (
    <View style={styles.listCard}>
      <View style={styles.listCardIcon}>
        <Ionicons name="document-text-outline" size={24} color="#F97316" />
      </View>
      <View style={styles.listCardBody}>
        <Text style={styles.listCardName}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.listCardDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <Text style={styles.listCardMeta}>
          Event column: <Text style={{ fontWeight: '700' }}>{item.eventColumn}</Text>
        </Text>
        <Text style={styles.listCardDate}>
          Added {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        {/* Superadmin can open the Poojari view for this list */}
        {isSuperAdmin && (
          <TouchableOpacity
            style={styles.viewPoojariBtn}
            onPress={() => router.push(`/(poojari)/${item.id}` as any)}
          >
            <Ionicons name="eye-outline" size={13} color="#F97316" />
            <Text style={styles.viewPoojariText}>View as Poojari</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={20} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <AdminHeader
        subtitle="Navakundathmaka Shatha Chandi Sahitha Rudra Yagam · Seva Registry"
        right={<TouchableOpacity onPress={() => router.replace('/home' as any)}><Text style={gsDark.link}>← Back</Text></TouchableOpacity>}
      />
      <View style={styles.toolbar}>
        {isSuperAdmin && (
          <TouchableOpacity
            style={styles.superAdminBannerCompact}
            onPress={() => router.push('/(poojari)/seva-registry' as any)}
          >
            <Ionicons name="eye-outline" size={16} color={colors.primary} />
            <Text style={styles.superAdminBannerText}>Open full Poojari view</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            setForm(EMPTY_FORM);
            setPreview({ loading: false, rowCount: null, events: [], error: null });
            setModalVisible(true);
          }}
        >
          <Ionicons name="add" size={22} color={colors.dark.bg} />
          <Text style={styles.addBtnText}>Add Sheet</Text>
        </TouchableOpacity>
      </View>

      {/* Superadmin banner — quick link to the Poojari portal */}
      {isSuperAdmin && (
        <TouchableOpacity
          style={styles.superAdminBanner}
          onPress={() => router.push('/(poojari)/seva-registry' as any)}
        >
          <Ionicons name="eye-outline" size={16} color="#F97316" />
          <Text style={styles.superAdminBannerText}>
            Superadmin: tap to open full Poojari view
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#F97316" />
        </TouchableOpacity>
      )}

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : sevaLists.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={72} color="#FED7AA" />
          <Text style={styles.emptyTitle}>No Seva Lists Yet</Text>
          <Text style={styles.emptyText}>
            Tap "Add Sheet" to link a Google Sheet. The Poojari will then be able to view and track seva entries from that sheet.
          </Text>
          <TouchableOpacity
            style={styles.addBtnEmpty}
            onPress={() => {
              setForm(EMPTY_FORM);
              setPreview({ loading: false, rowCount: null, events: [], error: null });
              setModalVisible(true);
            }}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addBtnText}>Add First Seva List</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={sevaLists}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        />
      )}

      {/* Add Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={colors.gold} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Seva List</Text>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.modalSaveBtn, isSaving && styles.modalSaveBtnDisabled]}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalSaveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {/* Instructions */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.infoText}>
                The Google Sheet must be shared as "Anyone with the link can view" for the Poojari to access it.
              </Text>
            </View>

            {/* Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Seva List Name *</Text>
              <TextInput
                style={styles.formInput}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. Ganesh Chaturthi 2025 Puja Registrations"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Sheet URL */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Google Sheet URL *</Text>
              <TextInput
                style={[styles.formInput, styles.formInputMulti]}
                value={form.sheetUrl}
                onChangeText={(v) => {
                  setForm((f) => ({ ...f, sheetUrl: v }));
                  setPreview({ loading: false, rowCount: null, events: [], error: null });
                }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Event Column */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Event Column Name</Text>
              <TextInput
                style={styles.formInput}
                value={form.eventColumn}
                onChangeText={(v) => setForm((f) => ({ ...f, eventColumn: v }))}
                placeholder="Event"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.formHint}>
                The column in your sheet that contains the puja/event name. Default: "Event"
              </Text>
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.formInput, styles.formInputMulti]}
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Brief description shown to the Poojari"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Preview Button */}
            <TouchableOpacity
              style={[styles.previewBtn, preview.loading && styles.previewBtnDisabled]}
              onPress={handlePreview}
              disabled={preview.loading}
            >
              {preview.loading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="eye-outline" size={18} color={colors.primary} />
              )}
              <Text style={styles.previewBtnText}>
                {preview.loading ? 'Fetching sheet…' : 'Preview Sheet Data'}
              </Text>
            </TouchableOpacity>

            {/* Preview Result */}
            {preview.error && (
              <View style={styles.previewError}>
                <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                <Text style={styles.previewErrorText}>{preview.error}</Text>
              </View>
            )}
            {preview.rowCount !== null && !preview.error && (
              <View style={styles.previewSuccess}>
                <View style={styles.previewSuccessRow}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                  <Text style={styles.previewSuccessText}>
                    {preview.rowCount} data rows found
                  </Text>
                </View>
                {preview.events.length > 0 && (
                  <View style={styles.previewEvents}>
                    <Text style={styles.previewEventsLabel}>
                      Events found in "{form.eventColumn}" column:
                    </Text>
                    {preview.events.map((ev) => (
                      <View key={ev} style={styles.previewEventChip}>
                        <Ionicons name="flame-outline" size={12} color="#F97316" />
                        <Text style={styles.previewEventChipText}>{ev}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  toolbar: { width: '100%', maxWidth: 1100, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  list: { flex: 1, minHeight: 0 },
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
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1F2937' },
  headerSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
  },
  addBtnText: { fontFamily: fonts.sans, color: colors.dark.bg, fontWeight: '700', fontSize: fontSize.body },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#374151', textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  addBtnEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F97316',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    marginTop: 8,
  },
  listContent: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: spacing.xl, gap: spacing.md, paddingBottom: 40 },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCardBody: { flex: 1, gap: 2 },
  listCardName: { fontFamily: fonts.serif, fontSize: fontSize.h3, fontWeight: '700', color: colors.heading },
  listCardDesc: { fontFamily: fonts.sans, fontSize: fontSize.small, color: colors.body, lineHeight: 17 },
  listCardMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  listCardDate: { fontSize: 11, color: '#D1D5DB', marginTop: 1 },
  deleteBtn: {
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(28, 10, 13, 0.62)',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.gold,
  },
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
  modalSaveBtnText: { color: colors.dark.bg, fontWeight: '700', fontSize: fontSize.body },
  modalContent: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.tipBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.tipBorder,
  },
  infoText: { flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 18 },
  formGroup: { gap: 6 },
  formLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
  formInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.heading,
  },
  formInputMulti: { minHeight: 72, textAlignVertical: 'top' },
  formHint: { fontSize: 12, color: '#9CA3AF', lineHeight: 16 },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#F97316',
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: '#FFF7ED',
  },
  previewBtnDisabled: { opacity: 0.6 },
  previewBtnText: { fontSize: 14, fontWeight: '700', color: '#F97316' },
  previewError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  previewErrorText: { flex: 1, fontSize: 13, color: '#EF4444', lineHeight: 18 },
  previewSuccess: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 10,
  },
  previewSuccessRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewSuccessText: { fontSize: 13, color: '#059669', fontWeight: '600' },
  previewEvents: { gap: 6 },
  previewEventsLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  previewEventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignSelf: 'flex-start',
  },
  previewEventChipText: { fontSize: 13, color: '#EA580C', fontWeight: '600' },

  // Superadmin extras
  superAdminBanner: {
    display: 'none',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF7ED',
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
  },
  superAdminBannerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.tipBg,
  },
  superAdminBannerText: {
    flexShrink: 1,
    fontSize: 13,
    color: '#EA580C',
    fontWeight: '600',
  },
  viewPoojariBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFF7ED',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  viewPoojariText: {
    fontSize: 12,
    color: '#F97316',
    fontWeight: '700',
  },
});
