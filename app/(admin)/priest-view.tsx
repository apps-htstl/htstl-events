// app/(admin)/priest-view.tsx
// Priest Live Sankalpam View — large-screen list of registered devotees
// (Name / Spouse / Gothram) filtered by date, seva and time. Data lives in
// the destination Google Sheet, accessed through an Apps Script Web App
// (google-apps-script/README.md). Tapping ✓ marks the row completed in the
// sheet; Sync pulls new rows from the source sheets without touching
// existing ones.

import AdminHeader from "@/components/AdminHeader";
import { gsDark } from "@/constants/styles";
import { colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { subscribeEvents } from "@/lib/firestore";
import { HTSLEvent } from "@/lib/types";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
  return (await parseApi(res)).records;
}

// POSTs use a text/plain body (no JSON content-type) to avoid a CORS
// preflight, which Apps Script web apps cannot answer.
async function apiComplete(
  record: SankalpamRecord,
  completed: boolean,
): Promise<void> {
  const res = await fetch(requireScriptUrl(), {
    method: "POST",
    body: JSON.stringify({
      action: "complete",
      id: record.id,
      name: record.name,
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
  return (await parseApi(res)).records;
}

const ALL = "__all__";

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
          <ScrollView style={{ maxHeight: 340 }}>
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

  useEffect(() => {
    if (!appUser?.orgId) return;
    const unsubscribe = subscribeEvents(appUser.orgId, (fetchedEvents) => {
      console.log("Priest view: events updated", fetchedEvents);
      setEvents(fetchedEvents);
    });
    return () => unsubscribe();
  }, [appUser?.orgId]);

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
    setRecords((prev) =>
      prev.map((r) => (r.id === record.id ? { ...r, completed: true } : r)),
    );
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
  const sponsors = useMemo(
    () => pending.filter((r) => !r.eventName),
    [pending],
  );
  const registered = useMemo(
    () => pending.filter((r) => r.eventName),
    [pending],
  );

  const normalizeDate = (value: string) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return trimmed;

    const cleaned = trimmed.replace(/\u00A0/g, " ").trim();

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
    const eventNames = [...events]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((event) => event.name);

    return [
      { value: ALL, label: "All Sevas" },
      ...eventNames.map((s) => ({ value: s, label: s })),
    ];
  }, [events, registered]);

  const timeOptions = useMemo<Option[]>(() => {
    const inScope = registered.filter(
      (r) =>
        (dateFilter === ALL || normalizeDate(r.eventDate) === dateFilter) &&
        (sevaFilter === ALL || r.eventName === sevaFilter),
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

      {/* Filters */}
      <View style={[gsDark.filterBar, narrow && gsDark.filterBarNarrow]}>
        <Dropdown
          label="Date"
          value={dateFilter}
          options={dateOptions}
          minWidth={220}
          fullWidth={narrow}
          onSelect={(v) => {
            setDateFilter(v);
            setTimeFilter(ALL);
          }}
        />
        <Dropdown
          label="Seva"
          value={sevaFilter}
          options={sevaOptions}
          minWidth={narrow ? 220 : 320}
          fullWidth={narrow}
          onSelect={(v) => {
            setSevaFilter(v);
            setTimeFilter(ALL);
          }}
        />
        {/* <Dropdown
          label="Time"
          value={timeFilter}
          options={timeOptions}
          minWidth={160}
          fullWidth={narrow}
          onSelect={setTimeFilter}
        /> */}
        <TouchableOpacity
          style={[
            gsDark.btnGold,
            narrow && gsDark.btnFull,
            syncing && gsDark.disabled,
          ]}
          onPress={syncFromDrive}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={colors.dark.bg} />
          ) : (
            <Text style={gsDark.btnGoldText}>⟳ Sync from Drive</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Section heading */}
      <View style={[gsDark.sectionRow, narrow && gsDark.sectionRowNarrow]}>
        <Text style={gsDark.sectionTitle}>
          {sevaFilter === ALL ? "All Sevas" : sevaFilter}
        </Text>
        <Text style={gsDark.sectionNote}>
          Sponsors without an event are listed when no filters are applied
        </Text>
      </View>

      {error && (
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
        <ScrollView style={[gsDark.list, narrow && gsDark.listNarrow]}>
          {visible.length === 0 && visibleSponsors.length === 0 ? (
            <Text style={gsDark.emptyText}>
              No pending names for this selection yet — new registrations will
              appear here automatically.
            </Text>
          ) : (
            <>
              {!narrow && (
                <View style={gsDark.gridHeader}>
                  <Text style={[gsDark.gridHeaderCell, gsDark.cellLg]}>
                    Name
                  </Text>
                  <Text style={[gsDark.gridHeaderCell, gsDark.cellLg]}>
                    Spouse Name
                  </Text>
                  <Text style={[gsDark.gridHeaderCell, gsDark.cellSm]}>
                    Gothram
                  </Text>
                  <View style={gsDark.actionColumn} />
                </View>
              )}
              {visible.map((r) => (
                <Row
                  key={r.id}
                  record={r}
                  stacked={narrow}
                  onComplete={markCompleted}
                />
              ))}
              {visibleSponsors.length > 0 && (
                <>
                  <Text style={gsDark.divider}>
                    Sponsors · {visibleSponsors.length}
                  </Text>
                  {visibleSponsors.map((r) => (
                    <Row
                      key={r.id}
                      record={r}
                      sponsor
                      stacked={narrow}
                      onComplete={markCompleted}
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
  onComplete,
}: {
  record: SankalpamRecord;
  sponsor?: boolean;
  stacked?: boolean;
  onComplete: (record: SankalpamRecord) => void;
}) {
  return (
    <TouchableOpacity
      style={[
        gsDark.row,
        sponsor && gsDark.rowHighlight,
        stacked && gsDark.rowStacked,
      ]}
      onPress={() => onComplete(record)}
      activeOpacity={0.7}
    >
      <View style={stacked ? undefined : gsDark.cellLg}>
        <Text style={gsDark.rowText}>{record.name}</Text>
        {!!record.eventTime && (
          <Text style={gsDark.rowMeta}>{record.eventTime}</Text>
        )}
      </View>
      <Text style={[gsDark.rowText, !stacked && gsDark.cellLg]}>
        {stacked
          ? `Spouse: ${record.spouseName || "—"}`
          : record.spouseName || "—"}
      </Text>
      <Text style={[gsDark.rowText, !stacked && gsDark.cellSm]}>
        {stacked ? `Gothram: ${record.gothram || "—"}` : record.gothram || "—"}
      </Text>
      <View style={stacked ? gsDark.actionColumnStacked : gsDark.actionColumn}>
        <Pressable
          style={(state) =>
            [
              gsDark.btnOutlineGold,
              stacked && gsDark.btnFull,
              (state as any).hovered && gsDark.btnOutlineGoldHover,
            ] as any
          }
          onPress={() => onComplete(record)}
        >
          {(state) => (
            <Text
              style={[
                gsDark.btnOutlineGoldText,
                (state as any).hovered && gsDark.btnOutlineGoldTextHover,
              ]}
            >
              Mark as Completed
            </Text>
          )}
        </Pressable>
      </View>
    </TouchableOpacity>
  );
}
