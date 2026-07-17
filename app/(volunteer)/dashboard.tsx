// app/(volunteer)/dashboard.tsx
// Volunteer Attendance Dashboard — shows real-time stats, section capacities, and tier breakdowns.

import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeEvent, subscribeRegistrations } from '@/lib/firestore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { HTSLEvent, Registration } from '@/lib/types';

export default function VolunteerDashboard() {
  const { appUser, logout } = useAuth();

  const [events, setEvents] = useState<HTSLEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<HTSLEvent | null>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventSearch, setEventSearch] = useState('');

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // Load active events
  const loadActiveEvents = async () => {
    if (!appUser?.orgId) return;
    try {
      setEventsLoading(true);
      const q = query(
        collection(db, 'orgs', appUser.orgId, 'events'),
        where('status', '==', 'active')
      );
      const snap = await getDocs(q);
      const activeEvents = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          orgId: data.orgId,
          name: data.name,
          date: data.date?.toDate(),
          venue: data.venue,
          status: data.status,
          tiers: data.tiers || [],
          sections: data.sections || [],
          createdBy: data.createdBy,
          createdAt: data.createdAt?.toDate(),
        } as HTSLEvent;
      });

      setEvents(activeEvents);
      if (activeEvents.length > 0 && !selectedEvent) {
        setSelectedEvent(activeEvents[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    loadActiveEvents();
  }, [appUser?.orgId]);

  // Subscribe to registrations for the selected event
  useEffect(() => {
    if (!appUser?.orgId || !selectedEvent) {
      setStatsLoading(false);
      return;
    }

    setStatsLoading(true);
    const unsubscribe = subscribeRegistrations(appUser.orgId, selectedEvent.id, (regs) => {
      setRegistrations(regs);
      setStatsLoading(false);
    });

    return () => unsubscribe();
  }, [appUser?.orgId, selectedEvent]);

  // Calculate statistics
  const totalRegistered = registrations.reduce((acc, reg) => acc + reg.partySize, 0);
  const totalCheckedIn = registrations.reduce((acc, reg) => acc + reg.checkedInCount, 0);
  const totalRemaining = totalRegistered - totalCheckedIn;

  // Seating section occupancy calculations
  const sectionOccupancy = selectedEvent
    ? selectedEvent.sections.reduce((acc, sec) => {
        acc[sec.id] = { capacity: sec.capacity, registered: 0, checkedIn: 0, color: sec.color };
        return acc;
      }, {} as Record<string, { capacity: number; registered: number; checkedIn: number; color?: string }>)
    : {};

  if (selectedEvent) {
    registrations.forEach((reg) => {
      const tierObj = selectedEvent.tiers.find((t) => t.name.toLowerCase() === reg.tier.toLowerCase());
      if (tierObj) {
        tierObj.sectionIds.forEach((secId) => {
          if (sectionOccupancy[secId]) {
            sectionOccupancy[secId].registered += reg.partySize;
            sectionOccupancy[secId].checkedIn += reg.checkedInCount;
          }
        });
      }
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Event Selector Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.eventSelector}
          onPress={() => {
            loadActiveEvents();
            setShowEventPicker(true);
          }}
        >
          <Ionicons name="calendar" size={18} color="#059669" />
          <Text style={styles.eventNameText} numberOfLines={1}>
            {selectedEvent ? selectedEvent.name : 'Select Event'}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {selectedEvent ? (
        statsLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#059669" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Total Counters */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: '#EEF2FF' }]}>
                <Text style={[styles.statNum, { color: '#4F46E5' }]}>{totalRegistered}</Text>
                <Text style={styles.statLabel}>Total Registrants</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.statNum, { color: '#059669' }]}>{totalCheckedIn}</Text>
                <Text style={styles.statLabel}>Checked In</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#FFFBEB' }]}>
                <Text style={[styles.statNum, { color: '#D97706' }]}>{totalRemaining}</Text>
                <Text style={styles.statLabel}>Remaining</Text>
              </View>
            </View>

            {/* Attendance Progress Ring / Bar */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Overall Check-in Progress</Text>
              <View style={styles.progressRow}>
                <Text style={styles.progressPercentage}>
                  {totalRegistered > 0 ? Math.round((totalCheckedIn / totalRegistered) * 100) : 0}%
                </Text>
                <View style={styles.progressBarWrapper}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${totalRegistered > 0 ? (totalCheckedIn / totalRegistered) * 100 : 0}%` },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* Section Capacities */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Live Section Occupancy</Text>
              {selectedEvent.sections.map((sec) => {
                const data = sectionOccupancy[sec.id] || { capacity: 0, registered: 0, checkedIn: 0 };
                const registeredPercent = data.capacity > 0 ? Math.min((data.registered / data.capacity) * 100, 100) : 0;
                const checkedInPercent = data.registered > 0 ? Math.min((data.checkedIn / data.registered) * 100, 100) : 0;

                return (
                  <View key={sec.id} style={styles.sectionItem}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleRow}>
                        <View style={[styles.colorIndicator, { backgroundColor: data.color || '#10B981' }]} />
                        <Text style={styles.sectionName}>{sec.name}</Text>
                      </View>
                      <Text style={styles.sectionStats}>
                        {data.checkedIn}/{data.registered} in (Cap: {data.capacity})
                      </Text>
                    </View>

                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFillColor,
                          {
                            width: `${registeredPercent}%`,
                            backgroundColor: (data.color || '#10B981') + '40',
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.progressBarFillColor,
                          {
                            width: `${registeredPercent * (checkedInPercent / 100)}%`,
                            backgroundColor: data.color || '#10B981',
                            position: 'absolute',
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )
      ) : (
        <View style={styles.noEventsContainer}>
          <Ionicons name="stats-chart-outline" size={64} color="#D1D5DB" />
          <Text style={styles.noEventsTitle}>Select Event to View Stats</Text>
          <Text style={styles.noEventsText}>
            Please select an event from the top dropdown to view live attendance records.
          </Text>
        </View>
      )}

      {/* EVENT PICKER MODAL */}
      <Modal visible={showEventPicker} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Event</Text>
              <TouchableOpacity onPress={() => setShowEventPicker(false)}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            {/* Search box inside picker */}
            <View style={styles.pickerSearchBox}>
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Search events..."
                placeholderTextColor="#9CA3AF"
                value={eventSearch}
                onChangeText={setEventSearch}
              />
            </View>

            {eventsLoading ? (
              <ActivityIndicator style={{ margin: 24 }} color="#059669" />
            ) : events.length === 0 ? (
              <Text style={styles.noEventsPicker}>No active events available.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={true}>
                {events
                  .filter((e) =>
                    !eventSearch.trim() ||
                    e.name.toLowerCase().includes(eventSearch.trim().toLowerCase())
                  )
                  .map((evt) => (
                  <TouchableOpacity
                    key={evt.id}
                    style={[
                      styles.pickerItem,
                      selectedEvent?.id === evt.id && styles.pickerItemActive,
                    ]}
                    onPress={() => {
                      setSelectedEvent(evt);
                      setShowEventPicker(false);
                      setEventSearch('');
                    }}
                  >
                    <Text style={styles.pickerItemText}>{evt.name}</Text>
                    <Text style={styles.pickerItemVenue}>{evt.venue}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  eventSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
    flex: 1,
  },
  eventNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },
  logoutBtn: {
    padding: 8,
    marginLeft: 8,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statNum: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressPercentage: {
    fontSize: 24,
    fontWeight: '800',
    color: '#059669',
  },
  progressBarWrapper: {
    flex: 1,
    height: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 6,
  },
  sectionItem: {
    gap: 6,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sectionName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  sectionStats: {
    fontSize: 12,
    color: '#6B7280',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFillColor: {
    height: '100%',
    borderRadius: 4,
  },
  noEventsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  noEventsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  noEventsText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
    maxHeight: '70%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  noEventsPicker: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginVertical: 20,
  },
  pickerItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemActive: {
    backgroundColor: '#F0FDF4',
  },
  pickerItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  pickerItemVenue: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  pickerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 4,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingVertical: 0,
  },
});
