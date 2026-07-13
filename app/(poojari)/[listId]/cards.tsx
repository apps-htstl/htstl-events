// app/(poojari)/[listId]/cards.tsx
// Card Reader — Poojari sees one person card at a time for a given event.
// Green ✓ marks as seen and advances. History strip shows previous cards.
// Background prefetch: entire dataset is already in memory from event picker.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, fontSize, radius, spacing } from '@/constants/theme';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import {
  subscribeSevaLists,
  buildSheetCsvUrl,
  getSevaProgress,
  saveSevaProgress,
} from '@/lib/firestore';
import { SevaList, SevaEntry } from '@/lib/types';

// ── CSV Parser (same as event picker — duplicated to keep files independent) ──
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(cell.trim()); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = []; cell = '';
    } else { cell += ch; }
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some((c) => c !== '')) rows.push(row); }
  return rows;
}

function buildEntries(rawRows: string[][], headers: string[], eventColumn: string): SevaEntry[] {
  // Strip out columns whose header is blank
  const validIndices = headers
    .map((h, i) => ({ h: h.trim(), i }))
    .filter(({ h }) => h !== '')
    .map(({ i }) => i);
  const filteredHeaders = validIndices.map((i) => headers[i]);
  const eventColIdx = filteredHeaders.findIndex(
    (h) => h.toLowerCase() === eventColumn.toLowerCase()
  );
  return rawRows.map((values) => {
    const filteredValues = validIndices.map((i) => (values[i] ?? '').trim());
    return {
      rowKey: filteredValues.slice(0, 4).join('|'),
      columns: filteredHeaders,
      values: filteredValues,
      eventValue: eventColIdx >= 0 ? (filteredValues[eventColIdx] || '') : '',
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CardReaderScreen() {
  const { appUser } = useAuth();
  const router = useRouter();
  const { listId, event: selectedEvent } = useLocalSearchParams<{
    listId: string;
    event: string;
  }>();

  const [sevaList, setSevaList] = useState<SevaList | null>(null);
  const [allEntries, setAllEntries] = useState<SevaEntry[]>([]);  // all event entries, in order
  const [seenRowKeys, setSeenRowKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSavingProgress, setIsSavingProgress] = useState(false);

  const cardAnim = useRef(new Animated.Value(0)).current;

  // Load seva list metadata
  useEffect(() => {
    if (!appUser?.orgId || !listId) return;
    const unsub = subscribeSevaLists(appUser.orgId, (lists) => {
      const found = lists.find((l) => l.id === listId) ?? null;
      setSevaList(found);
    });
    return () => unsub();
  }, [appUser?.orgId, listId]);

  // Load saved progress from Firestore
  useEffect(() => {
    if (!appUser?.orgId || !listId || !appUser?.uid) return;
    getSevaProgress(appUser.orgId, listId, appUser.uid).then((progress) => {
      if (progress) setSeenRowKeys(new Set(progress.seenRowKeys));
    });
  }, [appUser?.orgId, listId, appUser?.uid]);

  // Fetch the full CSV
  const fetchSheet = useCallback(async (list: SevaList) => {
    setIsFetchingSheet(true);
    setError(null);
    try {
      const csvUrl = buildSheetCsvUrl(list.sheetId);
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status}`);
      const text = await response.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('Sheet appears empty.');
      const headers = rows[0];
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c));
      const built = buildEntries(dataRows, headers, list.eventColumn);
      // Filter to only entries matching our selected event
      const filtered = built.filter(
        (e) => e.eventValue.toLowerCase() === (selectedEvent || '').toLowerCase()
      );
      setAllEntries(filtered);
      setLastFetched(new Date());
      setIsLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load sheet.');
      setIsLoading(false);
    } finally {
      setIsFetchingSheet(false);
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (sevaList) fetchSheet(sevaList);
  }, [sevaList, fetchSheet]);

  // Derived: seen and unseen entries (preserve original order)
  const seenEntries = allEntries.filter((e) => seenRowKeys.has(e.rowKey));
  const unseenEntries = allEntries.filter((e) => !seenRowKeys.has(e.rowKey));
  const currentCard = unseenEntries[0] ?? null; // next unseen
  const allDone = allEntries.length > 0 && unseenEntries.length === 0;

  // Persist progress changes to Firestore (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistProgress = useCallback(
    (keys: Set<string>) => {
      if (!appUser?.orgId || !listId || !appUser?.uid) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setIsSavingProgress(true);
        try {
          await saveSevaProgress(appUser.orgId, listId, appUser.uid, Array.from(keys));
        } finally {
          setIsSavingProgress(false);
        }
      }, 800);
    },
    [appUser?.orgId, listId, appUser?.uid]
  );

  // Animate card entrance
  const animateCard = () => {
    cardAnim.setValue(0);
    Animated.spring(cardAnim, {
      toValue: 1,
      tension: 80,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (!isLoading) animateCard();
  }, [currentCard?.rowKey, isLoading]);

  // Mark current card as seen
  const handleMarkSeen = () => {
    if (!currentCard) return;
    const next = new Set(seenRowKeys);
    next.add(currentCard.rowKey);
    setSeenRowKeys(next);
    persistProgress(next);
    animateCard();
  };

  // Uncheck a specific row key
  const handleUncheck = (rowKey: string) => {
    const next = new Set(seenRowKeys);
    next.delete(rowKey);
    setSeenRowKeys(next);
    persistProgress(next);
  };

  // Uncheck all
  const handleUncheckAll = () => {
    const performUncheck = () => {
      const empty = new Set<string>();
      setSeenRowKeys(empty);
      persistProgress(empty);
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Uncheck All: Reset progress for all entries in this event?')) {
        performUncheck();
      }
    } else {
      Alert.alert('Uncheck All', 'Reset progress for all entries in this event?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: performUncheck },
      ]);
    }
  };

  // Column label formatting
  const formatLabel = (col: string) =>
    col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const renderCardContent = (entry: SevaEntry, isHistory = false) => (
    <View style={[styles.entryGrid, isHistory && styles.entryGridHistory]}>
      {entry.columns.map((col, i) => {
        const val = entry.values[i] || '—';
        const isEventCol = col.toLowerCase() === (sevaList?.eventColumn || 'event').toLowerCase();
        return (
          <View key={col} style={[styles.entryRow, isEventCol && styles.entryRowEvent]}>
            <Text style={[styles.entryLabel, isEventCol && styles.entryLabelEvent]}>
              {formatLabel(col)}
            </Text>
            <Text style={[styles.entryValue, isEventCol && styles.entryValueEvent]} numberOfLines={isHistory ? 1 : 0}>
              {val}
            </Text>
          </View>
        );
      })}
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            router.replace(`/(poojari)/${listId}` as any);
          }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.gold} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {selectedEvent || 'Event'}
          </Text>
          <Text style={styles.headerSub}>
            {seenEntries.length}/{allEntries.length} seen
            {isSavingProgress ? ' · saving…' : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => {
              if (sevaList) fetchSheet(sevaList);
            }}
            style={styles.iconBtn}
            disabled={isFetchingSheet}
          >
            {isFetchingSheet ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <Ionicons name="refresh-outline" size={20} color={colors.gold} />
            )}
          </TouchableOpacity>
          {seenEntries.length > 0 && (
            <TouchableOpacity onPress={handleUncheckAll} style={styles.uncheckAllBtn}>
              <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
              <Text style={styles.uncheckAllText}>Uncheck All</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={styles.loadingText}>Loading entries…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={64} color="#FCA5A5" />
          <Text style={styles.errorTitle}>Could Not Load Sheet</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => sevaList && fetchSheet(sevaList)}
          >
            <Ionicons name="refresh-outline" size={16} color="#FFF" />
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : allEntries.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={64} color="#FED7AA" />
          <Text style={styles.errorTitle}>No Entries</Text>
          <Text style={styles.errorText}>
            No entries found for "{selectedEvent}" in this sheet.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Current Card ─────────────────────────────────────────────── */}
          {allDone ? (
            <View style={styles.allDoneCard}>
              <Ionicons name="checkmark-circle" size={64} color="#059669" />
              <Text style={styles.allDoneTitle}>All Done! 🙏</Text>
              <Text style={styles.allDoneText}>
                You have seen all {allEntries.length} {allEntries.length === 1 ? 'person' : 'people'} for this event.
              </Text>
              <TouchableOpacity onPress={handleUncheckAll} style={styles.resetBtn}>
                <Ionicons name="reload-outline" size={16} color="#F97316" />
                <Text style={styles.resetBtnText}>Reset & Review Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            currentCard && (
              <Animated.View
                style={[
                  styles.currentCard,
                  {
                    opacity: cardAnim,
                    transform: [
                      {
                        translateY: cardAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {/* Card Header */}
                <View style={styles.currentCardHeader}>
                  <View style={styles.currentCardBadge}>
                    <Ionicons name="person-outline" size={14} color="#F97316" />
                    <Text style={styles.currentCardBadgeText}>
                      Next — {unseenEntries.length} remaining
                    </Text>
                  </View>
                </View>

                {/* Card Content */}
                {renderCardContent(currentCard)}

                {/* Mark Seen Button */}
                <TouchableOpacity style={styles.markSeenBtn} onPress={handleMarkSeen} activeOpacity={0.85}>
                  <Ionicons name="checkmark-circle" size={28} color="#FFF" />
                  <Text style={styles.markSeenText}>Mark as Seen</Text>
                </TouchableOpacity>
              </Animated.View>
            )
          )}

          {/* ── History Strip (previously seen cards) ───────────────────── */}
          {seenEntries.length > 0 && (
            <View style={styles.historySection}>
              <View style={styles.historySectionHeader}>
                <Ionicons name="checkmark-done-outline" size={16} color="#059669" />
                <Text style={styles.historySectionTitle}>
                  Seen ({seenEntries.length})
                </Text>
              </View>
              {[...seenEntries].reverse().map((entry) => (
                <View key={entry.rowKey} style={styles.historyCard}>
                  <View style={styles.historyCardContent}>
                    {renderCardContent(entry, true)}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleUncheck(entry.rowKey)}
                    style={styles.uncheckBtn}
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
                    <Text style={styles.uncheckBtnText}>Uncheck</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: colors.dark.bg,
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
    gap: 4,
  },
  backBtn: { padding: 8 },
  headerCenter: { flex: 1 },
  headerTitle: { fontFamily: fonts.serif, fontSize: fontSize.h3, fontWeight: '700', color: colors.dark.text },
  headerSub: { fontFamily: fonts.sans, fontSize: fontSize.small, color: colors.gold, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { padding: 8 },
  uncheckAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  uncheckAllText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },

  // Scroll
  scrollArea: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },

  // Center state
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', textAlign: 'center' },
  errorText: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    marginTop: 4,
  },
  retryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  // Current card
  currentCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#FED7AA',
  },
  currentCardHeader: { flexDirection: 'row', alignItems: 'center' },
  currentCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  currentCardBadgeText: { fontSize: 12, fontWeight: '600', color: '#F97316' },

  // Entry grid
  entryGrid: { gap: 10 },
  entryGridHistory: { gap: 6 },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  entryRowEvent: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    borderRadius: 8,
    borderBottomWidth: 0,
    marginVertical: 2,
  },
  entryLabel: { fontSize: 13, color: '#9CA3AF', fontWeight: '500', flex: 1 },
  entryLabelEvent: { color: '#F97316', fontWeight: '700' },
  entryValue: { fontSize: 14, color: '#1F2937', fontWeight: '600', flex: 2, textAlign: 'right' },
  entryValueEvent: { color: '#EA580C' },

  // Mark seen button
  markSeenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    marginTop: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  markSeenText: { color: '#FFF', fontWeight: '800', fontSize: 17, letterSpacing: 0.2 },

  // All done
  allDoneCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  allDoneTitle: { fontSize: 24, fontWeight: '800', color: '#059669' },
  allDoneText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginTop: 4,
  },
  resetBtnText: { color: '#F97316', fontWeight: '700', fontSize: 13 },

  // History section
  historySection: { gap: 8 },
  historySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  historySectionTitle: { fontSize: 13, fontWeight: '700', color: '#059669' },
  historyCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
  },
  historyCardContent: { padding: 14 },
  uncheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  uncheckBtnText: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
});
