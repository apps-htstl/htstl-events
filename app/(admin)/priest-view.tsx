// app/(admin)/priest-view.tsx
// Priest Live Sankalpam View — large-screen list of registered devotees
// (Name / Spouse / Gothram) filtered by date, seva and time. Data lives in
// the destination Google Sheet, accessed through an Apps Script Web App
// (google-apps-script/README.md). Tapping ✓ marks the row completed in the
// sheet; Sync pulls new rows from the source sheets without touching
// existing ones.

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// Backend: a Google Apps Script Web App that reads/writes the destination
// Google Sheet (see google-apps-script/README.md).
const SCRIPT_URL = process.env.EXPO_PUBLIC_SANKALPAM_API || '';

async function parseApi(res: Response) {
  const body = await res.json();
  // Apps Script always answers HTTP 200; errors come back in the body.
  if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function requireScriptUrl(): string {
  if (!SCRIPT_URL) {
    throw new Error(
      'EXPO_PUBLIC_SANKALPAM_API is not set — deploy the Apps Script and add its /exec URL to .env (see google-apps-script/README.md).',
    );
  }
  return SCRIPT_URL;
}

async function apiRecords(): Promise<SankalpamRecord[]> {
  const res = await fetch(`${requireScriptUrl()}?action=records`);
  return (await parseApi(res)).records;
}

// POSTs use a text/plain body (no JSON content-type) to avoid a CORS
// preflight, which Apps Script web apps cannot answer.
async function apiComplete(record: SankalpamRecord, completed: boolean): Promise<void> {
  const res = await fetch(requireScriptUrl(), {
    method: 'POST',
    body: JSON.stringify({ action: 'complete', id: record.id, name: record.name, completed }),
  });
  await parseApi(res);
}

async function apiRefresh(): Promise<SankalpamRecord[]> {
  const res = await fetch(requireScriptUrl(), {
    method: 'POST',
    body: JSON.stringify({ action: 'refresh' }),
  });
  return (await parseApi(res)).records;
}

const SERIF = Platform.OS === 'web' ? "'Cormorant Garamond', serif" : 'serif';
const SANS = Platform.OS === 'web' ? "'Karla', sans-serif" : undefined;

const ALL = '__all__';

type SankalpamRecord = {
  id: string;
  source: string;
  name: string;
  spouseName: string;
  gothram: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  completed: boolean;
};

type Option = { value: string; label: string };

// ─── Small custom dropdown (RN-web friendly) ─────────────────────────────────
function Dropdown({
  label,
  value,
  options,
  minWidth,
  onSelect,
}: {
  label: string;
  value: string;
  options: Option[];
  minWidth: number;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={[styles.dropdownWrap, { minWidth, zIndex: open ? 100 : 1 }]}>
      <Text style={styles.filterLabel}>{label}</Text>
      <TouchableOpacity style={styles.select} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.selectText} numberOfLines={1}>
          {current ? current.label : '—'}
        </Text>
        <Text style={styles.selectCaret}>▾</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.menu}>
          <ScrollView style={{ maxHeight: 340 }}>
            {options.map((o) => (
              <TouchableOpacity
                key={o.value}
                style={[styles.menuItem, o.value === value && styles.menuItemActive]}
                onPress={() => {
                  onSelect(o.value);
                  setOpen(false);
                }}
              >
                <Text style={styles.menuItemText}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function PriestViewScreen() {
  const router = useRouter();
  const [records, setRecords] = useState<SankalpamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(ALL);
  const [sevaFilter, setSevaFilter] = useState(ALL);
  const [timeFilter, setTimeFilter] = useState(ALL);

  // Load the temple fonts on web.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'priest-view-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Karla:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  // Ids marked completed locally whose write may not have reached the sheet
  // yet. Server responses read the sheet, so a poll racing a slow write can
  // return the record as still pending — these ids stay completed locally
  // until the server confirms them.
  const optimisticDone = useRef<Set<string>>(new Set());

  const applyServerRecords = useCallback((incoming: SankalpamRecord[]) => {
    setRecords(
      incoming.map((r) => {
        if (!optimisticDone.current.has(r.id)) return r;
        if (r.completed) {
          optimisticDone.current.delete(r.id); // server caught up
          return r;
        }
        return { ...r, completed: true }; // stale read — keep local state
      }),
    );
  }, []);

  const fetchRecords = useCallback(async () => {
    applyServerRecords(await apiRecords());
    setError(null);
  }, [applyServerRecords]);

  // Initial load + light polling so walk-in edits appear without a reload.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await fetchRecords();
      } catch (err: any) {
        if (!cancelled) setError(String(err.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const poll = setInterval(() => {
      fetchRecords().catch(() => {});
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [fetchRecords]);

  const markCompleted = useCallback(async (record: SankalpamRecord) => {
    // Optimistic: drop from queue immediately, restore on failure.
    optimisticDone.current.add(record.id);
    setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, completed: true } : r)));
    try {
      await apiComplete(record, true);
    } catch (err: any) {
      optimisticDone.current.delete(record.id);
      setRecords((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, completed: false } : r)),
      );
      setError(`Could not save: ${String(err.message || err)}`);
    }
  }, []);

  const syncFromDrive = useCallback(async () => {
    setSyncing(true);
    try {
      applyServerRecords(await apiRefresh());
      setError(null);
    } catch (err: any) {
      setError(`Sync failed: ${String(err.message || err)}`);
    } finally {
      setSyncing(false);
    }
  }, [applyServerRecords]);

  // ── Derived lists ──
  const pending = useMemo(() => records.filter((r) => !r.completed), [records]);
  // Rows without any event are standing sponsors, shown under every seva.
  const sponsors = useMemo(() => pending.filter((r) => !r.eventName), [pending]);
  const registered = useMemo(() => pending.filter((r) => r.eventName), [pending]);

  const dateOptions = useMemo<Option[]>(() => {
    const dates = [...new Set(registered.map((r) => r.eventDate).filter(Boolean))].sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );
    return [
      { value: ALL, label: 'All Dates' },
      ...dates.map((d) => ({ value: d, label: formatDate(d) })),
    ];
  }, [registered]);

  const sevaOptions = useMemo<Option[]>(() => {
    const sevas = [...new Set(registered.map((r) => r.eventName))].sort();
    return [{ value: ALL, label: 'All Sevas' }, ...sevas.map((s) => ({ value: s, label: s }))];
  }, [registered]);

  const timeOptions = useMemo<Option[]>(() => {
    const inScope = registered.filter(
      (r) =>
        (dateFilter === ALL || r.eventDate === dateFilter) &&
        (sevaFilter === ALL || r.eventName === sevaFilter),
    );
    const times = [...new Set(inScope.map((r) => r.eventTime).filter(Boolean))].sort();
    return [{ value: ALL, label: 'All Times' }, ...times.map((t) => ({ value: t, label: t }))];
  }, [registered, dateFilter, sevaFilter]);

  // Strict AND-match: "All" means the filter is ignored; a specific value
  // must match the record exactly (blank fields don't match).
  const matchesFilters = useCallback(
    (r: SankalpamRecord) =>
      (dateFilter === ALL || r.eventDate === dateFilter) &&
      (sevaFilter === ALL || r.eventName === sevaFilter) &&
      (timeFilter === ALL || r.eventTime === timeFilter),
    [dateFilter, sevaFilter, timeFilter],
  );

  const visible = useMemo(
    () => registered.filter(matchesFilters),
    [registered, matchesFilters],
  );

  // Sponsors have no event/date/time, so they only pass when no specific
  // filter is selected.
  const visibleSponsors = useMemo(
    () => sponsors.filter(matchesFilters),
    [sponsors, matchesFilters],
  );

  // Shown = not-completed records matching the current filters (incl. the
  // sponsors listed under every seva). Awaiting = all not-completed records
  // in the destination sheet, regardless of filters.
  const shownCount = visible.length + visibleSponsors.length;
  const awaitingCount = pending.length;

  // ── Pulsing live dot ──
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 800, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // ── Render ──
  return (
    <View style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.omCircle}>
            <Text style={styles.omGlyph}>ॐ</Text>
          </View>
          <View>
            <Text style={styles.templeName}>Hindu Temple of St. Louis</Text>
            <Text style={styles.eventName}>
              Navakundathmaka Shatha Chandi Sahitha Rudra Yagam · Priest Sankalpam View
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
          <Text style={styles.liveText}>
            Live · {shownCount} in view · {awaitingCount} awaiting reading
          </Text>
          <TouchableOpacity onPress={() => router.replace('/home' as any)}>
            <Text style={styles.exitLink}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterBar}>
        <Dropdown
          label="Date"
          value={dateFilter}
          options={dateOptions}
          minWidth={220}
          onSelect={(v) => {
            setDateFilter(v);
            setTimeFilter(ALL);
          }}
        />
        <Dropdown
          label="Seva"
          value={sevaFilter}
          options={sevaOptions}
          minWidth={320}
          onSelect={(v) => {
            setSevaFilter(v);
            setTimeFilter(ALL);
          }}
        />
        <Dropdown
          label="Time"
          value={timeFilter}
          options={timeOptions}
          minWidth={160}
          onSelect={setTimeFilter}
        />
        <TouchableOpacity
          style={[styles.syncButton, syncing && { opacity: 0.6 }]}
          onPress={syncFromDrive}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#2b0d12" />
          ) : (
            <Text style={styles.syncButtonText}>⟳ Sync from Drive</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Section heading */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>
          {sevaFilter === ALL ? 'All Sevas' : sevaFilter}
        </Text>
        <Text style={styles.sectionNote}>
          Sponsors without an event are listed when no filters are applied
        </Text>
      </View>

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator size="large" color="#d4a83f" />
          <Text style={styles.emptyText}>Downloading registrations from Drive…</Text>
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {visible.length === 0 && visibleSponsors.length === 0 ? (
            <Text style={styles.emptyText}>
              No pending names for this selection yet — new registrations will appear here
              automatically.
            </Text>
          ) : (
            <>
              <View style={styles.gridHeader}>
                <Text style={[styles.gridHeaderCell, { flex: 2 }]}>Name</Text>
                <Text style={[styles.gridHeaderCell, { flex: 2 }]}>Spouse Name</Text>
                <Text style={[styles.gridHeaderCell, { flex: 1.3 }]}>Gothram</Text>
                <View style={styles.doneColumn} />
              </View>
              {visible.map((r) => (
                <Row key={r.id} record={r} onComplete={markCompleted} />
              ))}
              {visibleSponsors.length > 0 && (
                <>
                  <Text style={styles.sponsorDivider}>
                    Sponsors · {visibleSponsors.length}
                  </Text>
                  {visibleSponsors.map((r) => (
                    <Row key={r.id} record={r} sponsor onComplete={markCompleted} />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Row({
  record,
  sponsor = false,
  onComplete,
}: {
  record: SankalpamRecord;
  sponsor?: boolean;
  onComplete: (record: SankalpamRecord) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, sponsor && styles.rowSponsor]}
      onPress={() => onComplete(record)}
      activeOpacity={0.7}
    >
      <View style={{ flex: 2 }}>
        <Text style={styles.rowName}>{record.name}</Text>
        {!!record.eventTime && <Text style={styles.rowMeta}>{record.eventTime}</Text>}
      </View>
      <Text style={[styles.rowSpouse, { flex: 2 }]}>{record.spouseName || '—'}</Text>
      <Text style={[styles.rowGothram, { flex: 1.3 }]}>{record.gothram || '—'}</Text>
      <View style={styles.doneColumn}>
        <TouchableOpacity style={styles.doneButton} onPress={() => onComplete(record)}>
          <Text style={styles.doneButtonText}>✓ Done</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Styles (from design/PriestView.html) ────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#2b0d12',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 22,
    paddingHorizontal: 40,
    backgroundColor: '#2b0d12',
    borderBottomWidth: 2,
    borderBottomColor: '#b8863b',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  omCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#d4a83f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  omGlyph: { fontFamily: SERIF, fontSize: 26, color: '#d4a83f' },
  templeName: {
    fontFamily: SERIF,
    fontSize: 30,
    fontWeight: '700',
    color: '#f6ead4',
    letterSpacing: 0.5,
  },
  eventName: { fontFamily: SANS, fontSize: 15, color: '#d4a83f', letterSpacing: 0.5, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7bc47f' },
  liveText: { fontFamily: SANS, fontSize: 14, color: '#e7d3a1' },
  exitLink: {
    fontFamily: SANS,
    marginLeft: 18,
    color: '#d4a83f',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 20,
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,168,63,0.3)',
    zIndex: 10,
  },
  dropdownWrap: { position: 'relative' },
  filterLabel: {
    fontFamily: SANS,
    fontSize: 12,
    color: '#c9b183',
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d4a83f',
    backgroundColor: '#2b0d12',
    gap: 10,
  },
  selectText: {
    fontFamily: SERIF,
    fontSize: 18,
    fontWeight: '700',
    color: '#f6ead4',
    flexShrink: 1,
  },
  selectCaret: { color: '#d4a83f', fontSize: 14 },
  menu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d4a83f',
    backgroundColor: '#3a1118',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.5)' } : {}),
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: 16 },
  menuItemActive: { backgroundColor: 'rgba(212,168,63,0.25)' },
  menuItemText: { fontFamily: SANS, fontSize: 15, color: '#f6ead4' },
  syncButton: {
    backgroundColor: '#d4a83f',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    minWidth: 170,
    alignItems: 'center',
  },
  syncButtonText: { fontFamily: SANS, fontSize: 15, fontWeight: '700', color: '#2b0d12' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingTop: 16,
  },
  sectionTitle: { fontFamily: SERIF, fontSize: 26, fontWeight: '600', color: '#f6ead4' },
  sectionNote: { fontFamily: SANS, fontSize: 14, color: '#c9b183' },
  errorBar: {
    marginHorizontal: 40,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,120,120,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,120,120,0.5)',
  },
  errorText: { fontFamily: SANS, color: '#ff9d9d', fontSize: 14 },
  list: { flex: 1, paddingHorizontal: 40, paddingTop: 20 },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(212,168,63,0.4)',
  },
  gridHeaderCell: {
    fontFamily: SANS,
    fontSize: 14,
    color: '#c9b183',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  doneColumn: { width: 110, alignItems: 'flex-end' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 28,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,248,232,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,63,0.2)',
  },
  rowSponsor: {
    backgroundColor: 'rgba(212,168,63,0.22)',
    borderColor: '#d4a83f',
  },
  rowName: { fontFamily: SERIF, fontSize: 34, fontWeight: '700', color: '#fff8e8' },
  rowMeta: { fontFamily: SANS, fontSize: 14, color: '#c9b183', marginTop: 2 },
  rowSpouse: { fontFamily: SERIF, fontSize: 26, color: '#e7d3a1' },
  rowGothram: { fontFamily: SANS, fontSize: 24, color: '#e7d3a1' },
  doneButton: {
    borderWidth: 1.5,
    borderColor: '#7bc47f',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  doneButtonText: { fontFamily: SANS, fontSize: 14, fontWeight: '700', color: '#7bc47f' },
  sponsorDivider: {
    fontFamily: SANS,
    fontSize: 14,
    color: '#c9b183',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 26,
    marginBottom: 4,
  },
  emptyWrap: { alignItems: 'center', marginTop: 80, gap: 16 },
  emptyText: {
    marginTop: 60,
    textAlign: 'center',
    color: '#a68a5c',
    fontSize: 22,
    fontFamily: SERIF,
    paddingBottom: 60,
  },
});
