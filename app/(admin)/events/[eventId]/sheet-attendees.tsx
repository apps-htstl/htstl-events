// app/(admin)/events/[eventId]/sheet-attendees.tsx
// Sheet Attendee Lookup & Check-in
//
// Architecture:
//   - Google Sheet CSV  →  fetched live on mount & pull-to-refresh (source of truth)
//   - Firestore sheetCheckins  →  real-time check-in state (onSnapshot)
//   - Merged in-memory before rendering — no registration data is duplicated in Firestore
//
// Features:
//   - Fuzzy name search with typo tolerance
//   - Filter by checked-in / not yet checked-in
//   - Check-in + Undo check-in per attendee
//   - Detail modal with spouse, gotram, phone, email, time info
//   - Admin: configure / change the linked Google Sheet

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Modal, ScrollView, ActivityIndicator, Alert,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeEvent, subscribeSheetCheckins, writeSheetCheckin, writeSheetCheckout, undoSheetCheckin, updateEventSheet, subscribeOrgUsers } from '@/lib/firestore';
import { fetchSheetAttendees, searchAttendees, isNameBasedKey, extractSheetId } from '@/lib/sheetAttendees';
import { HTSLEvent, SheetAttendee, SheetCheckin, AppUser } from '@/lib/types';

type FilterMode = 'all' | 'checked-in' | 'not-checked-in';

// ─── Merged row for display ──────────────────────────────────────────────────
interface AttendeeRow {
  attendee: SheetAttendee;
  checkin: SheetCheckin | null;
  score: number;
}

export default function SheetAttendeesScreen() {
  const { appUser } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ── State ──────────────────────────────────────────────────────────────────
  const [event, setEvent] = useState<HTSLEvent | null>(null);
  const [attendees, setAttendees] = useState<SheetAttendee[]>([]);
  const [checkinMap, setCheckinMap] = useState<Map<string, SheetCheckin>>(new Map());
  const [users, setUsers] = useState<AppUser[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [eventLoaded, setEventLoaded] = useState(false);

  // Detail modal
  const [selectedRow, setSelectedRow] = useState<AttendeeRow | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Sheet config modal (admin)
  const [configVisible, setConfigVisible] = useState(false);
  const [sheetUrlDraft, setSheetUrlDraft] = useState('');
  const [sheetFilterDraft, setSheetFilterDraft] = useState('');
  const [configSaving, setConfigSaving] = useState(false);

  const searchRef = useRef<TextInput>(null);

  // ── Subscribe to event doc ─────────────────────────────────────────────────
  useEffect(() => {
    if (!appUser?.orgId || !eventId) return;
    const unsub = subscribeEvent(appUser.orgId, eventId, (ev) => {
      setEvent(ev);
      setEventLoaded(true);
    });
    return () => unsub();
  }, [appUser?.orgId, eventId]);

  // ── Subscribe to check-ins (real-time) ────────────────────────────────────
  useEffect(() => {
    if (!appUser?.orgId || !eventId) return;
    const unsub = subscribeSheetCheckins(appUser.orgId, eventId, (list) => {
      const map = new Map<string, SheetCheckin>();
      list.forEach((c) => map.set(c.rowKey, c));
      setCheckinMap(map);
    });
    return () => unsub();
  }, [appUser?.orgId, eventId]);

  // ── Subscribe to org users (to resolve volunteer names) ───────────────────
  useEffect(() => {
    if (!appUser?.orgId) return;
    const unsub = subscribeOrgUsers(appUser.orgId, setUsers);
    return () => unsub();
  }, [appUser?.orgId]);

  // ── Fetch sheet attendees ──────────────────────────────────────────────────
  const fetchAttendees = useCallback(async (ev: HTSLEvent) => {
    if (!ev.sheetId) {
      setAttendees([]);
      setSheetError(null);
      return;
    }
    setSheetLoading(true);
    setSheetError(null);
    try {
      const filter = ev.sheetEventFilter || ev.name;
      const rows = await fetchSheetAttendees(ev.sheetId, filter || null);
      setAttendees(rows);
    } catch (err: any) {
      setSheetError(err?.message || 'Failed to load sheet data.');
    } finally {
      setSheetLoading(false);
    }
  }, []);

  // Fetch when event first loads, or when sheet config changes
  useEffect(() => {
    if (event) fetchAttendees(event);
  }, [event?.sheetId, event?.sheetEventFilter, fetchAttendees]);

  const handleRefresh = async () => {
    if (!event) return;
    setRefreshing(true);
    await fetchAttendees(event);
    setRefreshing(false);
  };

  // ── Merge + search + filter ────────────────────────────────────────────────
  const displayRows = useMemo<AttendeeRow[]>(() => {
    const searchResults = searchAttendees(attendees, searchQuery);

    return searchResults
      .map(({ attendee, score }) => ({
        attendee,
        checkin: checkinMap.get(attendee.rowKey) ?? null,
        score,
      }))
      .filter(({ checkin }) => {
        if (filterMode === 'checked-in')     return checkin !== null && !checkin.checkedOutAt;
        if (filterMode === 'not-checked-in') return checkin === null || !!checkin.checkedOutAt;
        return true;
      });
  }, [attendees, checkinMap, searchQuery, filterMode]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalCount     = attendees.length;
  const checkedInCount = Array.from(checkinMap.values()).filter((c) => !c.checkedOutAt).length;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getUserName = (uid: string) => {
    const u = users.find((x) => x.uid === uid);
    return u ? (u.displayName || u.email) : uid;
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ── Check-in action ────────────────────────────────────────────────────────
  const handleCheckIn = async (row: AttendeeRow) => {
    if (!appUser?.orgId || !eventId || !appUser.uid) return;
    setActionLoading(true);
    try {
      await writeSheetCheckin(appUser.orgId, eventId, row.attendee.rowKey, {
        attendeeName: row.attendee.customerName,
        spouseName:   row.attendee.spouseName,
        gotram:       row.attendee.gotram,
        eventName:    row.attendee.eventName,
        phone:        row.attendee.phone,
        email:        row.attendee.email,
        volunteerId:  appUser.uid,
        note:         noteText.trim(),
      });
      setNoteText('');
      setDetailVisible(false);
    } catch (err: any) {
      Alert.alert('Check-in failed', err?.message || 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Undo check-in ──────────────────────────────────────────────────────────
  const handleUndoCheckIn = async (row: AttendeeRow) => {
    if (!appUser?.orgId || !eventId) return;

    const doUndo = async () => {
      setActionLoading(true);
      try {
        await undoSheetCheckin(appUser.orgId!, eventId, row.attendee.rowKey);
        setDetailVisible(false);
      } catch (err: any) {
        Alert.alert('Failed to undo', err?.message || 'Please try again.');
      } finally {
        setActionLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Undo check-in for ${row.attendee.customerName}?`)) doUndo();
    } else {
      Alert.alert(
        'Undo Check-in',
        `Remove the check-in record for ${row.attendee.customerName}?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Undo', style: 'destructive', onPress: doUndo }],
      );
    }
  };

  // ── Save sheet config ──────────────────────────────────────────────────────
  const handleSaveConfig = async () => {
    if (!appUser?.orgId || !eventId) return;
    const url = sheetUrlDraft.trim();
    if (!url) { Alert.alert('Validation', 'Sheet URL is required.'); return; }
    const id = extractSheetId(url);
    if (!id) { Alert.alert('Invalid URL', 'Could not extract a spreadsheet ID from that URL. Make sure you paste the full Google Sheets URL.'); return; }
    setConfigSaving(true);
    try {
      await updateEventSheet(
        appUser.orgId, eventId, url, id,
        sheetFilterDraft.trim() || (event?.name ?? ''),
      );
      setConfigVisible(false);
    } catch (err: any) {
      Alert.alert('Save failed', err?.message);
    } finally {
      setConfigSaving(false);
    }
  };

  // ─── Render row ─────────────────────────────────────────────────────────────
  const renderRow = ({ item }: { item: AttendeeRow }) => {
    const { attendee, checkin } = item;
    const isCheckedIn = checkin !== null && !checkin.checkedOutAt;
    const isCheckedOut = checkin !== null && !!checkin.checkedOutAt;
    const nameKey = isNameBasedKey(attendee.rowKey);

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          setSelectedRow(item);
          setNoteText('');
          setDetailVisible(true);
        }}
        activeOpacity={0.7}
      >
        {/* Left: status pill */}
        <View style={[styles.statusDot, isCheckedIn ? styles.dotIn : isCheckedOut ? styles.dotOut : styles.dotNone]} />

        {/* Middle: info */}
        <View style={styles.rowInfo}>
          <View style={styles.rowNameRow}>
            <Text style={styles.rowName} numberOfLines={1}>{attendee.customerName}</Text>
            {attendee.spouseName ? (
              <Text style={styles.rowSpouse} numberOfLines={1}> & {attendee.spouseName}</Text>
            ) : null}
            {nameKey && (
              <View style={styles.unstableBadge}>
                <Ionicons name="warning-outline" size={10} color="#B45309" />
              </View>
            )}
          </View>
          <Text style={styles.rowSub} numberOfLines={1}>
            {attendee.gotram ? `${attendee.gotram} · ` : ''}{attendee.eventDate}{attendee.eventTime ? ` · ${attendee.eventTime}` : ''}
          </Text>
        </View>

        {/* Right: status badge */}
        <View>
          {isCheckedIn ? (
            <View style={styles.badgeIn}>
              <Ionicons name="checkmark-circle" size={13} color="#065F46" />
              <Text style={styles.badgeInText}>{formatTime(checkin!.checkedInAt)}</Text>
            </View>
          ) : isCheckedOut ? (
            <View style={styles.badgeOut}>
              <Ionicons name="exit-outline" size={13} color="#6B7280" />
              <Text style={styles.badgeOutText}>Left</Text>
            </View>
          ) : (
            <View style={styles.badgeNone}>
              <Ionicons name="ellipse-outline" size={13} color="#9CA3AF" />
              <Text style={styles.badgeNoneText}>Not in</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Empty / loading states ──────────────────────────────────────────────────
  if (!eventLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6D28D9" />
      </View>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace(`/(admin)/events/${eventId}` as any)} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Sheet Attendees</Text>
          {event?.name ? <Text style={styles.headerSub} numberOfLines={1}>{event.name}</Text> : null}
        </View>
        <TouchableOpacity
          style={styles.configBtn}
          onPress={() => {
            setSheetUrlDraft(event?.sheetUrl ?? '');
            setSheetFilterDraft(event?.sheetEventFilter ?? event?.name ?? '');
            setConfigVisible(true);
          }}
        >
          <Ionicons name="settings-outline" size={22} color="#6D28D9" />
        </TouchableOpacity>
      </View>

      {/* ── Stats bar ── */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{totalCount}</Text>
          <Text style={styles.statLabel}>Registered</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#059669' }]}>{checkedInCount}</Text>
          <Text style={styles.statLabel}>Checked In</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{totalCount - checkedInCount}</Text>
          <Text style={styles.statLabel}>Remaining</Text>
        </View>
      </View>

      {/* ── Search + Filter bar ── */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder="Search name, spouse, gotram, phone…"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {(['all', 'not-checked-in', 'checked-in'] as FilterMode[]).map((mode) => {
            const labels = { all: 'All', 'not-checked-in': 'Not In', 'checked-in': 'Checked In' };
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.filterChip, filterMode === mode && styles.filterChipActive]}
                onPress={() => setFilterMode(mode)}
              >
                <Text style={[styles.filterChipText, filterMode === mode && styles.filterChipTextActive]}>
                  {labels[mode]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── No sheet configured ── */}
      {!event?.sheetId ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>No sheet linked</Text>
          <Text style={styles.emptyText}>
            Tap the settings icon above to paste your Google Sheet URL and link it to this event.
          </Text>
          <TouchableOpacity
            style={styles.linkSheetBtn}
            onPress={() => {
              setSheetUrlDraft(event?.sheetUrl ?? '');
              setSheetFilterDraft(event?.sheetEventFilter ?? event?.name ?? '');
              setConfigVisible(true);
            }}
          >
            <Ionicons name="link-outline" size={18} color="#fff" />
            <Text style={styles.linkSheetBtnText}>Link Google Sheet</Text>
          </TouchableOpacity>
        </View>
      ) : sheetLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6D28D9" />
          <Text style={styles.loadingText}>Loading attendees from sheet…</Text>
        </View>
      ) : sheetError ? (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-offline-outline" size={64} color="#FCA5A5" />
          <Text style={styles.emptyTitle}>Could not load sheet</Text>
          <Text style={styles.emptyText}>{sheetError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayRows}
          keyExtractor={(item) => item.attendee.rowKey}
          renderItem={renderRow}
          contentContainerStyle={[styles.listContent, displayRows.length === 0 && styles.listEmpty]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6D28D9" />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color="#E5E7EB" />
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No matches found' : 'No attendees'}
              </Text>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? `No one matched "${searchQuery}". Try a different spelling — the search handles typos.`
                  : 'Pull down to refresh from the sheet.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          DETAIL MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={detailVisible} animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Attendee Details</Text>
            <TouchableOpacity onPress={() => setDetailVisible(false)}>
              <Ionicons name="close" size={26} color="#374151" />
            </TouchableOpacity>
          </View>

          {selectedRow && (
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {/* Profile card */}
              <View style={styles.modalCard}>
                <Text style={styles.modalName}>{selectedRow.attendee.customerName}</Text>
                {selectedRow.attendee.spouseName ? (
                  <Text style={styles.modalSpouse}>& {selectedRow.attendee.spouseName}</Text>
                ) : null}

                <View style={styles.detailList}>

                  {/* ── Identity ───────────────────────────── */}
                  <View style={styles.detailSectionHeader}>
                    <Text style={styles.detailSectionTitle}>Identity</Text>
                  </View>

                  <DetailRow
                    icon="person-outline"
                    label="Customer Name"
                    value={selectedRow.attendee.customerName || '—'}
                  />
                  <DetailRow
                    icon="people-outline"
                    label="Spouse Name"
                    value={selectedRow.attendee.spouseName || '—'}
                  />
                  <DetailRow
                    icon="leaf-outline"
                    label="Gotram"
                    value={selectedRow.attendee.gotram || '—'}
                    highlight={!selectedRow.attendee.gotram}
                  />

                  {/* ── Event ─────────────────────────────── */}
                  <View style={styles.detailSectionHeader}>
                    <Text style={styles.detailSectionTitle}>Event</Text>
                  </View>

                  <DetailRow
                    icon="calendar-outline"
                    label="Event Name"
                    value={selectedRow.attendee.eventName || '—'}
                  />
                  <DetailRow
                    icon="today-outline"
                    label="Event Date"
                    value={selectedRow.attendee.eventDate || '—'}
                  />
                  <DetailRow
                    icon="time-outline"
                    label="Event Time"
                    value={selectedRow.attendee.eventTime || '—'}
                  />

                  {/* ── Contact ───────────────────────────── */}
                  <View style={styles.detailSectionHeader}>
                    <Text style={styles.detailSectionTitle}>Contact</Text>
                  </View>

                  <DetailRow
                    icon="call-outline"
                    label="Phone"
                    value={selectedRow.attendee.phone || '—'}
                    highlight={!selectedRow.attendee.phone}
                  />
                  <DetailRow
                    icon="mail-outline"
                    label="Email"
                    value={selectedRow.attendee.email || '—'}
                    highlight={!selectedRow.attendee.email}
                  />

                  {/* ── Row Key (diagnostic) ──────────────── */}
                  <View style={styles.detailSectionHeader}>
                    <Text style={styles.detailSectionTitle}>Tracking</Text>
                  </View>
                  <DetailRow
                    icon="key-outline"
                    label="ID Method"
                    value={
                      selectedRow.attendee.rowKey.startsWith('phone:') ? 'Phone (stable ✓)' :
                      selectedRow.attendee.rowKey.startsWith('email:') ? 'Email (stable ✓)' :
                      'Name + Gotram (add phone/email to stabilise)'
                    }
                    highlight={isNameBasedKey(selectedRow.attendee.rowKey)}
                  />
                </View>

                {/* Name-based key warning */}
                {isNameBasedKey(selectedRow.attendee.rowKey) && (
                  <View style={styles.warningBox}>
                    <Ionicons name="warning-outline" size={15} color="#B45309" />
                    <Text style={styles.warningText}>
                      No phone or email on file — identity is tracked by name + gotram. Adding a phone number to the sheet will make check-in tracking more reliable.
                    </Text>
                  </View>
                )}
              </View>

              {/* Check-in status card */}
              <View style={styles.modalCard}>
                <Text style={styles.modalCardTitle}>Check-in Status</Text>

                {selectedRow.checkin && !selectedRow.checkin.checkedOutAt ? (
                  /* ─ Already checked in ─ */
                  <>
                    <View style={styles.checkedInBanner}>
                      <Ionicons name="checkmark-circle" size={22} color="#059669" />
                      <Text style={styles.checkedInText}>
                        Checked in at {formatTime(selectedRow.checkin.checkedInAt)}
                        {'\n'}by {getUserName(selectedRow.checkin.checkedInBy)}
                      </Text>
                    </View>
                    {selectedRow.checkin.note ? (
                      <Text style={styles.noteDisplay}>Note: {selectedRow.checkin.note}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={styles.undoBtn}
                      onPress={() => handleUndoCheckIn(selectedRow)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <Ionicons name="arrow-undo-outline" size={16} color="#fff" />
                          <Text style={styles.undoBtnText}>Undo Check-in</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  /* ─ Not yet checked in ─ */
                  <>
                    <Text style={styles.notCheckedInHint}>This attendee has not been checked in yet.</Text>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Optional note (e.g. arrived late, partial group)…"
                      placeholderTextColor="#9CA3AF"
                      multiline
                      value={noteText}
                      onChangeText={setNoteText}
                    />
                    <TouchableOpacity
                      style={styles.checkInBtn}
                      onPress={() => handleCheckIn(selectedRow)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                          <Text style={styles.checkInBtnText}>Mark as Checked In</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          SHEET CONFIG MODAL  (Admin only)
          ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={configVisible} animationType="slide" onRequestClose={() => setConfigVisible(false)}>
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Link Google Sheet</Text>
              <TouchableOpacity onPress={() => setConfigVisible(false)}>
                <Ionicons name="close" size={26} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.modalCard}>
                <Text style={styles.configLabel}>Google Sheet URL</Text>
                <Text style={styles.configHint}>
                  Paste the full URL of a Google Sheet that is shared as "Anyone with the link can view".
                </Text>
                <TextInput
                  style={styles.configInput}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  placeholderTextColor="#9CA3AF"
                  value={sheetUrlDraft}
                  onChangeText={setSheetUrlDraft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  multiline
                />
              </View>

              <View style={styles.modalCard}>
                <Text style={styles.configLabel}>Event Name Filter</Text>
                <Text style={styles.configHint}>
                  The app will only show rows where the "Event Name" column matches this value (case-insensitive).
                  Leave blank to use the event name: <Text style={{ fontWeight: '700' }}>{event?.name}</Text>
                </Text>
                <TextInput
                  style={styles.configInput}
                  placeholder={event?.name ?? 'e.g. Rudra Yagam Day 1'}
                  placeholderTextColor="#9CA3AF"
                  value={sheetFilterDraft}
                  onChangeText={setSheetFilterDraft}
                />
              </View>

              <View style={[styles.modalCard, styles.infoCard]}>
                <Ionicons name="information-circle-outline" size={18} color="#4F46E5" />
                <Text style={styles.infoText}>
                  Expected sheet columns: <Text style={{ fontWeight: '600' }}>Customer Name, Spouse Name, Gotram, Event Name, Event Date, Event Time, Phone Number, Email</Text>.
                  Column order doesn't matter and partial names are supported.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.saveConfigBtn}
                onPress={handleSaveConfig}
                disabled={configSaving}
              >
                {configSaving ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.saveConfigBtnText}>Save &amp; Reload Attendees</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Helper component ────────────────────────────────────────────────────────
function DetailRow({
  icon, label, value, highlight = false,
}: {
  icon: any;
  label: string;
  value: string;
  highlight?: boolean;   // true = value is missing/needs attention → amber text
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={16} color={highlight ? '#B45309' : '#6B7280'} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, highlight && styles.detailValueMissing]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#6B7280', fontSize: 14, marginTop: 8 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#FFF',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  configBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F5F3FF' },

  // Stats bar
  statsBar: {
    flexDirection: 'row', backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 10,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#6B7280', fontWeight: '500', marginTop: 1 },
  statDivider: { width: 1, backgroundColor: '#E5E7EB' },

  // Search + filter
  searchSection: {
    backgroundColor: '#FFF', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 10,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, height: 40, fontSize: 14, color: '#111827' },
  filterScroll: { gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: '#6D28D9', borderColor: '#6D28D9' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  filterChipTextActive: { color: '#FFF' },

  // List
  listContent: { padding: 12, gap: 8 },
  listEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  dotIn:   { backgroundColor: '#059669' },
  dotOut:  { backgroundColor: '#9CA3AF' },
  dotNone: { backgroundColor: '#D1D5DB' },
  rowInfo: { flex: 1 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  rowName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowSpouse: { fontSize: 13, color: '#6B7280' },
  rowSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  unstableBadge: { marginLeft: 4, padding: 2 },

  // Status badges
  badgeIn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeInText: { fontSize: 11, fontWeight: '700', color: '#065F46' },
  badgeOut: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeOutText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  badgeNone: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F9FAFB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeNoneText: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  linkSheetBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#6D28D9', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  linkSheetBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  retryBtn: { backgroundColor: '#6D28D9', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, marginTop: 4 },
  retryText: { color: '#FFF', fontWeight: '700' },

  // Modal shared
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#FFF',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalScroll: { padding: 20, gap: 16 },
  modalCard: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB', gap: 8,
  },
  modalName: { fontSize: 20, fontWeight: '800', color: '#111827' },
  modalSpouse: { fontSize: 15, color: '#6B7280', marginTop: -4 },
  modalCardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },

  // Detail rows inside modal
  detailList: { gap: 2, marginTop: 4 },
  detailSectionHeader: {
    marginTop: 14,
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  detailLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailValue: { fontSize: 14, color: '#111827', fontWeight: '500', marginTop: 1 },
  detailValueMissing: { color: '#B45309', fontStyle: 'italic' },

  // Warning box
  warningBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10, marginTop: 4,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  warningText: { fontSize: 12, color: '#92400E', lineHeight: 17, flex: 1 },

  // Check-in modal actions
  checkedInBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12,
  },
  checkedInText: { fontSize: 14, color: '#065F46', lineHeight: 20, flex: 1 },
  noteDisplay: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', marginTop: 4 },
  undoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#DC2626', borderRadius: 10, padding: 12, marginTop: 4,
  },
  undoBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  notCheckedInHint: { fontSize: 14, color: '#6B7280' },
  noteInput: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, padding: 12, fontSize: 14, color: '#111827',
    minHeight: 70, textAlignVertical: 'top',
  },
  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#059669', borderRadius: 10, padding: 14, marginTop: 4,
  },
  checkInBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Sheet config modal
  configLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  configHint: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  configInput: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 8, padding: 12, fontSize: 13, color: '#111827',
  },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  infoText: { flex: 1, fontSize: 13, color: '#3730A3', lineHeight: 19 },
  saveConfigBtn: {
    backgroundColor: '#6D28D9', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 4,
  },
  saveConfigBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
