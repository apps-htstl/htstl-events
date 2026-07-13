// app/(admin)/seva/[listId]/index.tsx
// Event picker for admin Seva view — same logic as the Poojari event picker,
// but back button returns to the admin Seva tab (not the poojari group).

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
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
} from '@/lib/firestore';
import { SevaList, SevaEntry } from '@/lib/types';

// ── CSV parser ────────────────────────────────────────────────────────────────
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

interface EventSummary {
  name: string;
  totalCount: number;
  seenCount: number;
}

export default function AdminSevaEventPickerScreen() {
  const { appUser } = useAuth();
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId: string }>();

  const [sevaList, setSevaList] = useState<SevaList | null>(null);
  const [entries, setEntries] = useState<SevaEntry[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [seenRowKeys, setSeenRowKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appUser?.orgId || !listId) return;
    const unsub = subscribeSevaLists(appUser.orgId, (lists) => {
      setSevaList(lists.find((l) => l.id === listId) ?? null);
    });
    return () => unsub();
  }, [appUser?.orgId, listId]);

  useEffect(() => {
    if (!appUser?.orgId || !listId || !appUser?.uid) return;
    getSevaProgress(appUser.orgId, listId, appUser.uid).then((p) => {
      if (p) setSeenRowKeys(new Set(p.seenRowKeys));
    });
  }, [appUser?.orgId, listId, appUser?.uid]);

  const fetchSheet = useCallback(async (list: SevaList) => {
    setIsFetchingSheet(true);
    setError(null);
    try {
      const res = await fetch(buildSheetCsvUrl(list.sheetId));
      if (!res.ok) throw new Error(`HTTP ${res.status} — is the sheet shared publicly?`);
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('Sheet appears empty.');
      const headers = rows[0];
      const built = buildEntries(rows.slice(1).filter((r) => r.some((c) => c)), headers, list.eventColumn);
      setEntries(built);
      setLastFetched(new Date());
      setIsLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load sheet.');
      setIsLoading(false);
    } finally {
      setIsFetchingSheet(false);
    }
  }, []);

  useEffect(() => {
    if (sevaList) fetchSheet(sevaList);
  }, [sevaList, fetchSheet]);

  useEffect(() => {
    const map = new Map<string, EventSummary>();
    for (const e of entries) {
      const name = e.eventValue || '(No Event)';
      if (!map.has(name)) map.set(name, { name, totalCount: 0, seenCount: 0 });
      const ev = map.get(name)!;
      ev.totalCount++;
      if (seenRowKeys.has(e.rowKey)) ev.seenCount++;
    }
    setEvents(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
  }, [entries, seenRowKeys]);

  const renderEvent = ({ item }: { item: EventSummary }) => {
    const unseen = item.totalCount - item.seenCount;
    const allDone = unseen === 0;
    return (
      <TouchableOpacity
        style={[styles.eventCard, allDone && styles.eventCardDone]}
        onPress={() =>
          router.push({
            pathname: `/(admin)/seva/${listId}/cards` as any,
            params: { event: item.name },
          })
        }
        activeOpacity={0.8}
      >
        <View style={[styles.eventIconWrap, allDone && styles.eventIconWrapDone]}>
          {allDone
            ? <Ionicons name="checkmark-circle" size={28} color="#059669" />
            : <Ionicons name="flame-outline" size={28} color="#F97316" />
          }
        </View>
        <View style={styles.eventBody}>
          <Text style={[styles.eventName, allDone && styles.eventNameDone]}>{item.name}</Text>
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${item.totalCount > 0 ? (item.seenCount / item.totalCount) * 100 : 0}%` } as any,
                  allDone && styles.progressFillDone,
                ]}
              />
            </View>
            <Text style={styles.progressText}>{item.seenCount}/{item.totalCount} seen</Text>
          </View>
          {!allDone && (
            <Text style={styles.unseenText}>{unseen} remaining</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { router.replace('/(admin)/seva' as any); }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.gold} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{sevaList?.name || 'Seva List'}</Text>
          {lastFetched && (
            <Text style={styles.headerSub}>Updated {lastFetched.toLocaleTimeString()}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => sevaList && fetchSheet(sevaList)} style={styles.refreshBtn} disabled={isFetchingSheet}>
          {isFetchingSheet
            ? <ActivityIndicator size="small" color={colors.gold} />
            : <Ionicons name="refresh-outline" size={22} color={colors.gold} />
          }
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={styles.loadingText}>Loading from Google Sheet…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={64} color="#FCA5A5" />
          <Text style={styles.errorTitle}>Could Not Load Sheet</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => sevaList && fetchSheet(sevaList)}>
            <Ionicons name="refresh-outline" size={16} color="#FFF" />
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={64} color="#FED7AA" />
          <Text style={styles.errorTitle}>No Events Found</Text>
          <Text style={styles.errorText}>The sheet is empty or the event column "{sevaList?.eventColumn}" was not found.</Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryBanner}>
            <Ionicons name="people-outline" size={16} color="#F97316" />
            <Text style={styles.summaryText}>
              {entries.length} entries across {events.length} event{events.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <FlatList
            data={events}
            keyExtractor={(item) => item.name}
            renderItem={renderEvent}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: colors.dark.bg, borderBottomWidth: 2, borderBottomColor: colors.gold, gap: 8,
  },
  backBtn: { padding: 8 },
  headerCenter: { flex: 1 },
  headerTitle: { fontFamily: fonts.serif, fontSize: fontSize.h3, fontWeight: '700', color: colors.dark.text },
  headerSub: { fontFamily: fonts.sans, fontSize: fontSize.small, color: colors.gold, marginTop: 1 },
  refreshBtn: { padding: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', textAlign: 'center' },
  errorText: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.gold,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, gap: 6, marginTop: 4,
  },
  retryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  summaryBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  summaryText: { fontSize: 13, color: '#6B7280' },
  listContent: { padding: 16, gap: 12 },
  eventCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: '#FED7AA',
    shadowColor: '#F97316', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  eventCardDone: { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' },
  eventIconWrap: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: '#FFF7ED', justifyContent: 'center', alignItems: 'center',
  },
  eventIconWrapDone: { backgroundColor: '#D1FAE5' },
  eventBody: { flex: 1, gap: 6 },
  eventName: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  eventNameDone: { color: '#059669' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: { flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#F97316', borderRadius: 3 },
  progressFillDone: { backgroundColor: '#059669' },
  progressText: { fontSize: 12, color: '#6B7280', minWidth: 60 },
  unseenText: { fontSize: 12, color: '#F97316', fontWeight: '600' },
});
