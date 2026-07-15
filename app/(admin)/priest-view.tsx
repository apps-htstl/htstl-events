// app/(admin)/priest-view.tsx
// Priest Live Sankalpam View — large-screen list of registered devotees and sponsors.
// (Name / Spouse / Gothram) filtered by date and seva. Source rows are read
// live through an Apps Script Web App; only completion history is written to
// the destination sheet. Sponsors remain eligible for every event/date.

import AdminHeader from "@/components/AdminHeader";
import { gsDark } from "@/constants/styles";
import { colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { subscribeEvents } from "@/lib/firestore";
import { HTSLEvent } from "@/lib/types";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

// Below this width the priest view switches to the stacked mobile layout.
const NARROW_BREAKPOINT = 768;

// Backend: a Google Apps Script Web App that reads/writes the destination
// Google Sheet (see google-apps-script/README.md).
const SCRIPT_URL = process.env.EXPO_PUBLIC_SANKALPAM_API || "";

async function parseApi(res: Response) {
  const body = await res.json();
  // Apps Script always answers HTTP 200; errors come back in the body.
  if (!res.ok || body.error)
    throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function requireScriptUrl(): string {
  if (!SCRIPT_URL) {
    throw new Error(
      "EXPO_PUBLIC_SANKALPAM_API is not set — deploy the Apps Script and add its /exec URL to .env (see google-apps-script/README.md).",
    );
  }
  return SCRIPT_URL;
}

async function apiRecords(): Promise<SankalpamRecord[]> {
  const res = await fetch(`${requireScriptUrl()}?action=records`);
  const payload = await parseApi(res);
  return payload.records;
}

// POSTs use a text/plain body (no JSON content-type) to avoid a CORS
// preflight, which Apps Script web apps cannot answer.
async function apiComplete(
  record: SankalpamRecord,
  completed: boolean,
  eventName: string,
  eventDate: string,
): Promise<void> {
  const res = await fetch(requireScriptUrl(), {
    method: "POST",
    body: JSON.stringify({
      action: "complete",
      recordType: record.source,
      personKey: record.personKey,
      name: record.name,
      spouseName: record.spouseName,
      gothram: record.gothram,
      eventName,
      eventDate,
      completed,
    }),
  });
  await parseApi(res);
}

async function apiRefresh(): Promise<SankalpamRecord[]> {
  const res = await fetch(requireScriptUrl(), {
    method: "POST",
    body: JSON.stringify({ action: "refresh" }),
  });
  const payload = await parseApi(res);
  return payload.records;
}

const ALL = "__all__";

// Event names come from two independent sources (the events API and Google
// Sheets). Treat formatting-only differences and an optional participant-count
// suffix as the same seva while preserving the original values for display.
const normalizeEventName = (value: string) =>
  String(value ?? "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\(\s*\d[\d,]*\s+participants?\s*\)\s*$/i, "")
    .trim()
    .toLocaleLowerCase();

const eventNamesMatch = (left: string, right: string) =>
  normalizeEventName(left) === normalizeEventName(right);

// Apps Script's `clean` helper collapses whitespace before completion keys are
// returned. Build UI keys the same way so non-breaking or repeated spaces in a
// Firestore event name cannot make an already-completed sponsor appear again.
const completionEventKey = (eventName: string, eventDate: string) =>
  `${String(eventName ?? "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase()}|${String(eventDate ?? "").trim().toLowerCase()}`;

type SankalpamRecord = {
  id: string;
  personKey: string;
  source: string;
  name: string;
  spouseName: string;
  gothram: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  completed: boolean;
  completedEventKeys: string[];
};

type Option = { value: string; label: string };

// ─── Small custom dropdown (RN-web friendly) ─────────────────────────────────
function Dropdown({
  label,
  value,
  options,
  minWidth,
  fullWidth = false,
  onSelect,
}: {
  label: string;
  value: string;
  options: Option[];
  minWidth: number;
  fullWidth?: boolean;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View
      style={[
        gsDark.dropdownWrap,
        { minWidth, zIndex: open ? 100 : 1 },
        fullWidth && gsDark.dropdownFull,
      ]}
    >
      <Text style={gsDark.filterLabel}>{label}</Text>
      <TouchableOpacity
        style={gsDark.select}
        onPress={() => setOpen((v) => !v)}
      >
        <Text style={gsDark.selectText} numberOfLines={1}>
          {current ? current.label : "—"}
        </Text>
        <Text style={gsDark.selectCaret}>▾</Text>
      </TouchableOpacity>
      {open && (
        <View style={gsDark.menu}>
          <ScrollView
            style={[
              { maxHeight: 340, backgroundColor: colors.dark.surface },
              Platform.OS === "web" &&
              ({
                overflowY: "scroll",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
              } as any),
            ]}
            contentContainerStyle={
              Platform.OS === "web"
                ? ({ overflowY: "auto", minHeight: "max-content" } as any)
                : undefined
            }
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardShouldPersistTaps="always"
            {...(Platform.OS === "web"
              ? ({
                onWheel: (event: any) => event.stopPropagation(),
              } as any)
              : {})}
          >
            {options.map((o) => (
              <TouchableOpacity
                key={o.value}
                style={[
                  gsDark.menuItem,
                  o.value === value && gsDark.menuItemActive,
                ]}
                onPress={() => {
                  onSelect(o.value);
                  setOpen(false);
                }}
              >
                <Text style={gsDark.menuItemText}>{o.label}</Text>
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
  const { appUser } = useAuth();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_BREAKPOINT;
  const [events, setEvents] = useState<HTSLEvent[]>([]);
  const [records, setRecords] = useState<SankalpamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(ALL);
  const [sevaFilter, setSevaFilter] = useState(ALL);
  const [timeFilter, setTimeFilter] = useState(ALL);
  const [fontSize, setFontSize] = useState(16);

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
    const records = await apiRecords();
    applyServerRecords(records);
    setError(null);
  }, [applyServerRecords]);

  useEffect(() => {
    if (!appUser?.orgId) return;
    return subscribeEvents(appUser.orgId, setEvents);
  }, [appUser?.orgId]);

  // Load once when the page opens. Later refreshes happen only after a local
  // completion update or when an admin explicitly syncs from Drive.
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
    return () => {
      cancelled = true;
    };
  }, [fetchRecords]);

  const markCompleted = useCallback(
    async (record: SankalpamRecord) => {
      const isSponsor = record.source === "sponsors";
      if (isSponsor && (dateFilter === ALL || sevaFilter === ALL)) {
        setError(
          "Select a specific date and seva before marking sponsor as completed.",
        );
        return;
      }
      const eventName = isSponsor ? sevaFilter : record.eventName;
      const eventDate = isSponsor
        ? dateFilter
        : normalizeDate(record.eventDate);
      if (!isSponsor) optimisticDone.current.add(record.id);
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id !== record.id) return r;
          if (!isSponsor) return { ...r, completed: true };
          return {
            ...r,
            completedEventKeys: [
              ...r.completedEventKeys,
              completionEventKey(eventName, eventDate),
            ],
          };
        }),
      );
      let completionSaved = false;
      try {
        await apiComplete(record, true, eventName, eventDate);
        completionSaved = true;
        await fetchRecords();
        setError(null);
      } catch (err: any) {
        if (completionSaved) {
          setError(`Saved, but could not sync: ${String(err.message || err)}`);
          return;
        }
        optimisticDone.current.delete(record.id);
        setRecords((prev) =>
          prev.map((current) => (current.id === record.id ? record : current)),
        );
        setError(`Could not save: ${String(err.message || err)}`);
      }
    },
    [dateFilter, sevaFilter, fetchRecords],
  );

  const syncFromDrive = useCallback(async () => {
    setSyncing(true);
    try {
      const newRecords = await apiRefresh();
      applyServerRecords(newRecords);
      setError(null);
    } catch (err: any) {
      setError(`Sync failed: ${String(err.message || err)}`);
    } finally {
      setSyncing(false);
    }
  }, [applyServerRecords]);

  // ── Derived lists ──
  const pending = useMemo(() => records.filter((r) => !r.completed), [records]);
  const sponsors = useMemo(
    () => records.filter((r) => r.source === "sponsors"),
    [records],
  );
  const registered = useMemo(
    () => pending.filter((r) => r.source !== "sponsors"),
    [pending],
  );

  const normalizeDate = (value: string) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return trimmed;

    const cleaned = trimmed.replace(/ /g, " ").trim();

    const isoDateOnly = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateOnly)
      return `${isoDateOnly[1]}-${isoDateOnly[2]}-${isoDateOnly[3]}`;

    const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [, month, day, year] = slashMatch;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const date = new Date(cleaned);
    if (Number.isNaN(date.getTime())) return cleaned;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Filter choices come from the application events API, not sheet rows.
  const dateOptions = useMemo<Option[]>(() => {
    const dates = [
      ...new Set(
        events.map((event) => normalizeDate(event.date.toISOString())),
      ),
    ].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return [
      { value: ALL, label: "All Dates" },
      ...dates.map((d) => ({ value: d, label: d })),
    ];
  }, [events]);

  const sevaOptions = useMemo<Option[]>(() => {
    const eventsForSelectedDate = events.filter(
      (event) =>
        dateFilter === ALL ||
        normalizeDate(event.date.toISOString()) === dateFilter,
    );
    const eventNames = [
      ...new Set(
        eventsForSelectedDate.map((event) => event.name).filter(Boolean),
      ),
    ].sort();

    return [
      { value: ALL, label: "All Sevas" },
      ...eventNames.map((s) => ({ value: s, label: s })),
    ];
  }, [events, dateFilter]);

  const timeOptions = useMemo<Option[]>(() => {
    const inScope = registered.filter(
      (r) =>
        (dateFilter === ALL || normalizeDate(r.eventDate) === dateFilter) &&
        (sevaFilter === ALL || eventNamesMatch(r.eventName, sevaFilter)),
    );
    const times = [
      ...new Set(inScope.map((r) => r.eventTime).filter(Boolean)),
    ].sort();
    return [
      { value: ALL, label: "All Times" },
      ...times.map((t) => ({ value: t, label: t })),
    ];
  }, [registered, dateFilter, sevaFilter]);

  // Strict AND-match: "All" means the filter is ignored; a specific value
  // must match the record exactly (blank fields don't match).
  const matchesFilters = useCallback(
    (r: SankalpamRecord) =>
      (dateFilter === ALL || normalizeDate(r.eventDate) === dateFilter) &&
      (sevaFilter === ALL || eventNamesMatch(r.eventName, sevaFilter)) &&
      (timeFilter === ALL || r.eventTime === timeFilter),
    [dateFilter, sevaFilter, timeFilter],
  );

  const visibleRegistered = useMemo(
    () => registered.filter(matchesFilters),
    [registered, matchesFilters],
  );

  // Sponsors always remain eligible. A completion hides one only for the
  // currently selected event/date pair.
  const visibleSponsors = useMemo(
    () =>
      sponsors.filter((s) => {
        if (dateFilter === ALL || sevaFilter === ALL) return true;
        const selectedKey = completionEventKey(sevaFilter, dateFilter);
        return !s.completedEventKeys.includes(selectedKey);
      }),
    [sponsors, dateFilter, sevaFilter],
  );

  const shownCount = visibleRegistered.length + visibleSponsors.length;
  const awaitingCount = pending.length;

  // ── Pulsing live dot ──
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 800,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // ── Render ──
  return (
    <View style={gsDark.screen}>
      {/* Header */}
      <AdminHeader
        subtitle="Navakundathmaka Shatha Chandi Sahitha Rudra Yagam · Priest Sankalpam View"
        right={
          <>
            <Animated.View style={[gsDark.liveDot, { opacity: pulse }]} />
            <Text style={gsDark.liveText}>{shownCount} in view</Text>
            <TouchableOpacity onPress={() => router.replace("/home" as any)}>
              <Text style={gsDark.link}>← Back</Text>
            </TouchableOpacity>
          </>
        }
      />

      {/* Filters — fixed on wide, inline (scrollable) on narrow */}
      {!narrow && (
        <View style={gsDark.filterBar}>
          <Dropdown
            label="Date"
            value={dateFilter}
            options={dateOptions}
            minWidth={220}
            fullWidth={false}
            onSelect={(v) => {
              setDateFilter(v);
              setSevaFilter(ALL);
              setTimeFilter(ALL);
            }}
          />
          <Dropdown
            label="Seva"
            value={sevaFilter}
            options={sevaOptions}
            minWidth={320}
            fullWidth={false}
            onSelect={(v) => {
              setSevaFilter(v);
              setTimeFilter(ALL);
            }}
          />
          <TouchableOpacity
            style={[gsDark.btnGold, syncing && gsDark.disabled]}
            onPress={syncFromDrive}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={colors.dark.bg} />
            ) : (
              <Text style={gsDark.btnGoldText}>⟳ Refresh Details</Text>
            )}
          </TouchableOpacity>

          <View style={gsDark.sizeControlRow}>
            <Text style={gsDark.sizeLabel}>Text Size:</Text>
            <TouchableOpacity onPress={() => setFontSize(prev => Math.max(12, prev - 2))} style={gsDark.sizeBtn}>
              <Ionicons name="remove-circle-outline" size={20} color={colors.gold} />
            </TouchableOpacity>
            <Text style={gsDark.sizeVal}>{fontSize}px</Text>
            <TouchableOpacity onPress={() => setFontSize(prev => Math.min(30, prev + 2))} style={gsDark.sizeBtn}>
              <Ionicons name="add-circle-outline" size={20} color={colors.gold} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Section heading — fixed on wide only */}
      {!narrow && (
        <View style={gsDark.sectionRow}>
          <Text style={gsDark.sectionTitle}>
            {sevaFilter === ALL ? "All Sevas" : sevaFilter}
          </Text>
          <Text style={gsDark.sectionNote}>
            Registered users shown for selected date & seva; sponsors for all
          </Text>
        </View>
      )}

      {!narrow && error && (
        <View style={gsDark.errorBar}>
          <Text style={gsDark.errorText}>{error}</Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={gsDark.emptyWrap}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={gsDark.emptyText}>
            Downloading registrations from Drive…
          </Text>
        </View>
      ) : (
        <ScrollView
          style={gsDark.list}
          contentContainerStyle={[
            gsDark.listContent,
            narrow && gsDark.listContentNarrow,
          ]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          {/* On narrow: filters, section heading, error scroll with the list */}
          {narrow && (
            <>
              <View style={gsDark.filterBarNarrow}>
                <Dropdown
                  label="Date"
                  value={dateFilter}
                  options={dateOptions}
                  minWidth={220}
                  fullWidth
                  onSelect={(v) => {
                    setDateFilter(v);
                    setSevaFilter(ALL);
                    setTimeFilter(ALL);
                  }}
                />
                <Dropdown
                  label="Seva"
                  value={sevaFilter}
                  options={sevaOptions}
                  minWidth={220}
                  fullWidth
                  onSelect={(v) => {
                    setSevaFilter(v);
                    setTimeFilter(ALL);
                  }}
                />
                <TouchableOpacity
                  style={[gsDark.btnGold, gsDark.btnFull, syncing && gsDark.disabled]}
                  onPress={syncFromDrive}
                  disabled={syncing}
                >
                  {syncing ? (
                    <ActivityIndicator size="small" color={colors.dark.bg} />
                  ) : (
                    <Text style={gsDark.btnGoldText}>⟳ Refresh Details</Text>
                  )}
                </TouchableOpacity>

                <View style={[gsDark.sizeControlRow, { justifyContent: 'center', marginTop: 4 }]}>
                  <Text style={gsDark.sizeLabel}>Text Size:</Text>
                  <TouchableOpacity onPress={() => setFontSize(prev => Math.max(12, prev - 2))} style={gsDark.sizeBtn}>
                    <Ionicons name="remove-circle-outline" size={20} color={colors.gold} />
                  </TouchableOpacity>
                  <Text style={gsDark.sizeVal}>{fontSize}px</Text>
                  <TouchableOpacity onPress={() => setFontSize(prev => Math.min(30, prev + 2))} style={gsDark.sizeBtn}>
                    <Ionicons name="add-circle-outline" size={20} color={colors.gold} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={gsDark.sectionRowNarrow}>
                <Text style={gsDark.sectionTitle}>
                  {sevaFilter === ALL ? "All Sevas" : sevaFilter}
                </Text>
                <Text style={gsDark.sectionNote}>
                  Registered users shown for selected date & seva; sponsors for all
                </Text>
              </View>

              {error && (
                <View style={gsDark.errorBar}>
                  <Text style={gsDark.errorText}>{error}</Text>
                </View>
              )}
            </>
          )}

          {visibleRegistered.length === 0 && visibleSponsors.length === 0 ? (
            <Text style={gsDark.emptyText}>
              No pending names for this selection yet — new registrations will
              appear here automatically.
            </Text>
          ) : (
            <>
              {!narrow && (
                <View style={gsDark.gridHeader}>
                  <Text style={[gsDark.gridHeaderCell, gsDark.cellSm]}>
                    Gothram
                  </Text>
                  <Text style={[gsDark.gridHeaderCell, gsDark.cellLg]}>
                    Name
                  </Text>
                </View>
              )}
              {visibleSponsors.length > 0 && (
                <>
                  <Text style={[gsDark.divider, gsDark.dividerFirst]}>
                    Sponsors · {visibleSponsors.length}
                  </Text>
                  {visibleSponsors.map((r) => (
                    <Row
                      key={r.id}
                      record={r}
                      sponsor
                      stacked={narrow}
                      fontSize={fontSize}
                    />
                  ))}
                </>
              )}
              {visibleRegistered.length > 0 && (
                <>
                  <Text style={gsDark.divider}>
                    Registered Event Users · {visibleRegistered.length}
                  </Text>
                  {visibleRegistered.map((r) => (
                    <Row
                      key={r.id}
                      record={r}
                      stacked={narrow}
                      fontSize={fontSize}
                    />
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
  stacked = false,
  fontSize = 16,
}: {
  record: SankalpamRecord;
  sponsor?: boolean;
  stacked?: boolean;
  fontSize?: number;
}) {
  return (
    <View
      style={[
        gsDark.row,
        sponsor && gsDark.rowHighlight,
        stacked && gsDark.rowStacked,
      ]}
    >
      {/* Column 1: Gothram */}
      <Text style={[gsDark.rowText, !stacked && gsDark.cellSm, { fontSize }]}>
        {stacked ? `Gothram: ${record.gothram || "—"}` : record.gothram || "—"}
      </Text>

      {/* Column 2: Name & Spouse Name mixed */}
      <View style={stacked ? undefined : gsDark.cellLg}>
        <Text style={[gsDark.rowText, { fontSize }]}>
          {record.name}
          {!!record.spouseName && `, ${record.spouseName}`}
        </Text>
        {!!record.eventTime && (
          <Text style={[gsDark.rowMeta, { fontSize: Math.max(11, fontSize - 2) }]}>
            {record.eventTime}
          </Text>
        )}
      </View>
    </View>
  );
}
