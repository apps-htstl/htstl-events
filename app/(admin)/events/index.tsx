// app/(admin)/events/index.tsx
// Event list screen — displays real events from Firestore in real time.

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
  } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeEvents } from '@/lib/firestore';
import { HTSLEvent } from '@/lib/types';
import AdminHeader from '@/components/AdminHeader';
import { gsDark } from '@/constants/styles';
import { colors, fonts, fontSize, radius, spacing } from '@/constants/theme';

export default function EventsScreen() {
  const { appUser } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<HTSLEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Sorting and Filtering states
  const [sortBy, setSortBy] = useState<'date-asc' | 'date-desc' | 'name-asc' | 'name-desc'>('date-asc');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedVenue, setSelectedVenue] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Subscribe to real-time events on mount
  useEffect(() => {
    if (!appUser?.orgId) return;

    setIsLoading(true);
    const unsubscribe = subscribeEvents(appUser.orgId, (fetchedEvents) => {
      setEvents(fetchedEvents);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [appUser?.orgId]);

  // Extract unique dates dynamically from active events
  const uniqueDatesObj = useMemo(() => {
    const datesMap = new Map<string, string>();
    events.forEach(e => {
      const filterVal = e.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const displayVal = e.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      datesMap.set(filterVal, displayVal);
    });

    // Sort chronologically
    const sortedKeys = Array.from(datesMap.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return [
      { filterVal: 'all', displayVal: 'All Days' },
      ...sortedKeys.map(k => ({ filterVal: k, displayVal: datesMap.get(k)! }))
    ];
  }, [events]);

  // Extract unique venues dynamically
  const uniqueVenues = useMemo(() => {
    const venues = events.map(e => {
      if (e.venue.includes('Temple')) return 'Temple';
      if (e.venue.includes('Yagashala')) return 'Yagashala';
      if (e.venue.includes('CEC') || e.venue.includes('Community Center')) return 'CEC';
      return e.venue;
    });
    return ['All', ...Array.from(new Set(venues))];
  }, [events]);

  // Count active filters (excluding default values)
  const activeFiltersCount = (selectedStatus !== 'all' ? 1 : 0) +
    (selectedVenue !== 'all' ? 1 : 0) +
    (selectedDate !== 'all' ? 1 : 0) +
    (sortBy !== 'date-asc' ? 1 : 0);

  const resetFilters = () => {
    setSelectedStatus('all');
    setSelectedVenue('all');
    setSelectedDate('all');
    setSortBy('date-asc');
  };

  // Filter and sort events dynamically
  const filteredAndSortedEvents = useMemo(() => {
    let result = [...events];

    // 1. Search Query filter (matches name and venue)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(e => 
        e.name.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q)
      );
    }

    // 2. Status filter
    if (selectedStatus !== 'all') {
      result = result.filter(e => e.status === selectedStatus);
    }

    // 3. Venue filter
    if (selectedVenue !== 'all') {
      result = result.filter(e => {
        const v = e.venue.toLowerCase();
        if (selectedVenue === 'Temple') return v.includes('temple');
        if (selectedVenue === 'Yagashala') return v.includes('yagashala');
        if (selectedVenue === 'CEC') return v.includes('cec') || v.includes('community center');
        return v.includes(selectedVenue.toLowerCase());
      });
    }

    // 4. Date filter
    if (selectedDate !== 'all') {
      result = result.filter(e => {
        const dStr = e.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return dStr === selectedDate;
      });
    }

    // 5. Sorting
    result.sort((a, b) => {
      if (sortBy === 'date-asc') {
        return a.date.getTime() - b.date.getTime();
      } else if (sortBy === 'date-desc') {
        return b.date.getTime() - a.date.getTime();
      } else if (sortBy === 'name-asc') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });

    return result;
  }, [events, searchQuery, selectedStatus, selectedVenue, selectedDate, sortBy]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return { container: styles.statusActive, text: styles.statusActiveText };
      case 'closed':
        return { container: styles.statusClosed, text: styles.statusClosedText };
      default:
        return { container: styles.statusDraft, text: styles.statusDraftText };
    }
  };

  const renderEventItem = ({ item }: { item: HTSLEvent }) => {
    const statusStyle = getStatusStyle(item.status);
    const totalCapacity = item.sections.reduce((acc, sec) => acc + sec.capacity, 0);

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => router.push(`/(admin)/events/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.eventName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.statusBadge, statusStyle.container]}>
            <Text style={[styles.statusText, statusStyle.text]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.muted} />
            <Text style={styles.infoText}>{formatDate(item.date)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color={colors.muted} />
            <Text style={styles.infoText} numberOfLines={1}>
              {item.venue}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={16} color={colors.muted} />
            <Text style={styles.infoText}>
              {item.tiers.length} Tiers • {totalCapacity} Capacity
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.viewEventText}>Manage Event</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <AdminHeader
        subtitle="Navakundathmaka Shatha Chandi Sahitha Rudra Yagam · Events"
        meta="Manage event schedules, venues, seating, and registrations"
        right={
          <TouchableOpacity onPress={() => router.replace('/home' as any)}>
            <Text style={gsDark.link}>← Back</Text>
          </TouchableOpacity>
        }
      />
      {/* Search and Action Bar */}
      <View style={styles.actionsBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Filter Panel Toggle Button */}
        <TouchableOpacity
          style={[styles.filterToggleBtn, showFilters && styles.filterToggleBtnActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons 
            name={showFilters ? "funnel" : "funnel-outline"} 
            size={20} 
            color={showFilters ? "#FFFFFF" : "#4B5563"} 
          />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/(admin)/events/create')}
        >
          <Ionicons name="add" size={22} color={colors.dark.bg} />
          <Text style={styles.createBtnText}>Create Event</Text>
        </TouchableOpacity>
      </View>

      {/* Dynamic Horizontal Date Filter Tabs */}
      <View style={styles.dateTabsContainer}>
        <ScrollView 
          style={styles.dateTabs}
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.dateTabsScrollContent}
        >
          {uniqueDatesObj.map((dateObj) => {
            const isActive = selectedDate === dateObj.filterVal;
            return (
              <TouchableOpacity
                key={dateObj.filterVal}
                style={[styles.dateTab, isActive && styles.dateTabActive]}
                onPress={() => setSelectedDate(dateObj.filterVal)}
              >
                <Text style={[styles.dateTabText, isActive && styles.dateTabTextActive]}>
                  {dateObj.displayVal}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Expandable Sort & Filter Panel */}
      {showFilters && (
        <View style={styles.filterPanel}>
          <View style={styles.filterPanelHeader}>
            <Text style={styles.filterPanelTitle}>Sort & Filter</Text>
            {activeFiltersCount > 0 && (
              <TouchableOpacity onPress={resetFilters}>
                <Text style={styles.resetText}>Reset All</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Sort Selection */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionLabel}>Sort By</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, sortBy === 'date-asc' && styles.chipActive]}
                onPress={() => setSortBy('date-asc')}
              >
                <Text style={[styles.chipText, sortBy === 'date-asc' && styles.chipTextActive]}>Date (Asc)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, sortBy === 'date-desc' && styles.chipActive]}
                onPress={() => setSortBy('date-desc')}
              >
                <Text style={[styles.chipText, sortBy === 'date-desc' && styles.chipTextActive]}>Date (Desc)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, sortBy === 'name-asc' && styles.chipActive]}
                onPress={() => setSortBy('name-asc')}
              >
                <Text style={[styles.chipText, sortBy === 'name-asc' && styles.chipTextActive]}>Name (A-Z)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, sortBy === 'name-desc' && styles.chipActive]}
                onPress={() => setSortBy('name-desc')}
              >
                <Text style={[styles.chipText, sortBy === 'name-desc' && styles.chipTextActive]}>Name (Z-A)</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Venue Selection */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionLabel}>Venue</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollChips}>
              {uniqueVenues.map((venue) => (
                <TouchableOpacity
                  key={venue}
                  style={[styles.chip, selectedVenue === venue && styles.chipActive]}
                  onPress={() => setSelectedVenue(venue)}
                >
                  <Text style={[styles.chipText, selectedVenue === venue && styles.chipTextActive]}>
                    {venue}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Status Selection */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionLabel}>Status</Text>
            <View style={styles.chipRow}>
              {['All', 'Active', 'Draft', 'Closed'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.chip, selectedStatus === status.toLowerCase() && styles.chipActive]}
                  onPress={() => setSelectedStatus(status.toLowerCase())}
                >
                  <Text style={[styles.chipText, selectedStatus === status.toLowerCase() && styles.chipTextActive]}>
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Events List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredAndSortedEvents.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={72} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>No Events Found</Text>
          <Text style={styles.emptyText}>
            {searchQuery || activeFiltersCount > 0
              ? 'No events match your current search queries or filters.'
              : 'Create your first event to start registering and checking in attendees.'}
          </Text>
          {(searchQuery || activeFiltersCount > 0) ? (
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => {
                setSearchQuery('');
                resetFilters();
              }}
            >
              <Text style={styles.emptyCreateBtnText}>Reset Search & Filters</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => router.push('/(admin)/events/create')}
            >
              <Text style={styles.emptyCreateBtnText}>Create Event</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filteredAndSortedEvents}
          renderItem={renderEventItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    display: 'none',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
  },
  actionsBar: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 240,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.heading,
  },
  createBtn: {
    height: 44,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnText: { fontFamily: fonts.sans, fontSize: fontSize.body, fontWeight: '700', color: colors.dark.bg },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: { flex: 1, minHeight: 0 },
  listContent: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 24,
    gap: spacing.lg,
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  eventName: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: fontSize.h2,
    fontWeight: '700',
    color: colors.primary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusDraft: {
    backgroundColor: '#F3F4F6',
  },
  statusDraftText: {
    color: '#374151',
  },
  statusActive: {
    backgroundColor: '#D1FAE5',
  },
  statusActiveText: {
    color: '#065F46',
  },
  statusClosed: {
    backgroundColor: '#FEE2E2',
  },
  statusClosedText: {
    color: '#991B1B',
  },
  cardInfo: {
    marginTop: 12,
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.label,
    color: colors.body,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  viewEventText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCreateBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.sm + 2,
    marginTop: 8,
  },
  emptyCreateBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  clearSearchBtn: {
    padding: 4,
  },
  filterToggleBtn: {
    width: 44,
    height: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  filterToggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  filterPanel: {
    backgroundColor: colors.surface,
    width: '100%',
    maxWidth: 1060,
    alignSelf: 'center',
    marginHorizontal: 0,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  filterPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterPanelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  filterSection: {
    gap: 8,
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scrollChips: {
    gap: 8,
    paddingRight: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.tipBg,
    borderColor: colors.gold,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  dateTabsContainer: {
    backgroundColor: colors.bg,
    paddingBottom: 12,
  },
  dateTabs: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  dateTabsScrollContent: {
    paddingHorizontal: spacing.xl,
    gap: 8,
  },
  dateTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  dateTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dateTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  dateTabTextActive: {
    color: '#FFFFFF',
  },
});
