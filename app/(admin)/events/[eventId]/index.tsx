// app/(admin)/events/[eventId]/index.tsx
// Event Dashboard — shows quick statistics and provides links to all sub-management tools.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeEvent, subscribeRegistrations, updateEvent } from '@/lib/firestore';
import { HTSLEvent, Registration } from '@/lib/types';
import AdminHeader from '@/components/AdminHeader';
import { gsDark } from '@/constants/styles';
import { colors, fonts, fontSize, radius, spacing } from '@/constants/theme';

export default function EventDashboardScreen() {
  const { appUser } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<HTSLEvent | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!appUser?.orgId || !eventId) return;

    setIsLoading(true);
    
    // Subscribe to Event doc
    const unsubEvent = subscribeEvent(appUser.orgId, eventId, (fetchedEvent) => {
      setEvent(fetchedEvent);
    });

    // Subscribe to registrations
    const unsubRegs = subscribeRegistrations(appUser.orgId, eventId, (fetchedRegs) => {
      setRegistrations(fetchedRegs);
      setIsLoading(false);
    });

    return () => {
      unsubEvent();
      unsubRegs();
    };
  }, [appUser?.orgId, eventId]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Event not found</Text>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(admin)/events');
              }
            }}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Calculate statistics
  const totalCapacity = event.sections.reduce((acc, sec) => acc + sec.capacity, 0);
  const totalRegistered = registrations.reduce((acc, reg) => acc + reg.partySize, 0);
  const totalCheckedIn = registrations.reduce((acc, reg) => acc + reg.checkedInCount, 0);
  
  // Calculate section occupancy
  const sectionOccupancy = event.sections.reduce((acc, sec) => {
    acc[sec.id] = { capacity: sec.capacity, registered: 0, checkedIn: 0, color: sec.color };
    return acc;
  }, {} as Record<string, { capacity: number; registered: number; checkedIn: number; color?: string }>);

  registrations.forEach((reg) => {
    // Find section corresponding to tier
    const tierObj = event.tiers.find((t) => t.name.toLowerCase() === reg.tier.toLowerCase());
    if (tierObj) {
      tierObj.sectionIds.forEach((secId) => {
        if (sectionOccupancy[secId]) {
          sectionOccupancy[secId].registered += reg.partySize;
          sectionOccupancy[secId].checkedIn += reg.checkedInCount;
        }
      });
    }
  });

  const toggleEventStatus = () => {
    const nextStatus = event.status === 'draft' ? 'active' : event.status === 'active' ? 'closed' : 'draft';
    
    const performToggle = async () => {
      try {
        if (appUser?.orgId) {
          await updateEvent(appUser.orgId, event.id, { status: nextStatus });
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to update event status');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Change Event Status: Are you sure you want to change the status to ${nextStatus.toUpperCase()}?`
      );
      if (confirmed) {
        performToggle();
      }
    } else {
      Alert.alert(
        'Change Event Status',
        `Are you sure you want to change the status to ${nextStatus.toUpperCase()}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: performToggle,
          },
        ]
      );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <View style={[styles.badge, styles.badgeActive]}><Text style={styles.badgeActiveText}>ACTIVE</Text></View>;
      case 'closed':
        return <View style={[styles.badge, styles.badgeClosed]}><Text style={styles.badgeClosedText}>CLOSED</Text></View>;
      default:
        return <View style={[styles.badge, styles.badgeDraft]}><Text style={styles.badgeDraftText}>DRAFT</Text></View>;
    }
  };

  return (
    <View style={styles.container}>
      <AdminHeader
        subtitle={`Navakundathmaka Shatha Chandi Sahitha Rudra Yagam · ${event.name}`}
        right={
          <>
            <TouchableOpacity onPress={toggleEventStatus} style={styles.statusToggleBtn}>
              {getStatusBadge(event.status)}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace('/(admin)/events')}>
              <Text style={gsDark.link}>← Back</Text>
            </TouchableOpacity>
          </>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Event Main Info */}
        <View style={styles.eventCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.muted} />
            <Text style={styles.infoText}>
              {event.date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color={colors.muted} />
            <Text style={styles.infoText}>{event.venue}</Text>
          </View>
        </View>

        {/* Attendance Summary Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{totalRegistered}</Text>
            <Text style={styles.statLabel}>Registered</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{totalCheckedIn}</Text>
            <Text style={styles.statLabel}>Checked In</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{totalRegistered - totalCheckedIn}</Text>
            <Text style={styles.statLabel}>Remaining</Text>
          </View>
        </View>

        {/* Section breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Section occupancy</Text>
          {event.sections.map((sec) => {
            const data = sectionOccupancy[sec.id] || { capacity: 0, registered: 0, checkedIn: 0 };
            const registeredPercent = data.capacity > 0 ? Math.min((data.registered / data.capacity) * 100, 100) : 0;
            const checkedInPercent = data.registered > 0 ? Math.min((data.checkedIn / data.registered) * 100, 100) : 0;
            
            return (
              <View key={sec.id} style={styles.sectionItem}>
                <View style={styles.sectionInfo}>
                  <View style={styles.sectionTitleRow}>
                    <View style={[styles.sectionColorIndicator, { backgroundColor: data.color || '#D1D5DB' }]} />
                    <Text style={styles.sectionName}>{sec.name}</Text>
                  </View>
                  <Text style={styles.sectionStats}>
                    {data.checkedIn}/{data.registered} in • Cap: {data.capacity}
                  </Text>
                </View>

                {/* Progress bars */}
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${registeredPercent}%`, backgroundColor: (data.color || '#3B82F6') + '60' }
                    ]}
                  />
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${registeredPercent * (checkedInPercent / 100)}%`, backgroundColor: data.color || '#3B82F6', position: 'absolute' }
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Admin Management Grid */}
        <Text style={styles.gridHeader}>Management Tools</Text>
        <View style={styles.grid}>
          {/* Registrations */}
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => router.push(`/(admin)/events/${eventId}/registrations`)}
          >
            <View style={[styles.gridIconBg, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="people" size={24} color="#4F46E5" />
            </View>
            <Text style={styles.gridLabel}>Attendees</Text>
            <Text style={styles.gridSub}>{registrations.length} profiles</Text>
          </TouchableOpacity>

          {/* CSV Import */}
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => router.push(`/(admin)/events/${eventId}/import`)}
          >
            <View style={[styles.gridIconBg, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="cloud-upload" size={24} color="#059669" />
            </View>
            <Text style={styles.gridLabel}>CSV Import</Text>
            <Text style={styles.gridSub}>Upload spreadsheet</Text>
          </TouchableOpacity>

          {/* Seating Config */}
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => router.push(`/(admin)/events/${eventId}/seating`)}
          >
            <View style={[styles.gridIconBg, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="grid" size={24} color="#D97706" />
            </View>
            <Text style={styles.gridLabel}>Seating config</Text>
            <Text style={styles.gridSub}>{event.sections.length} sections</Text>
          </TouchableOpacity>

          {/* Volunteers Assignment */}
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => router.push(`/(admin)/events/${eventId}/volunteers`)}
          >
            <View style={[styles.gridIconBg, { backgroundColor: '#FDF2F8' }]}>
              <Ionicons name="shield-checkmark" size={24} color="#DB2777" />
            </View>
            <Text style={styles.gridLabel}>Volunteers</Text>
            <Text style={styles.gridSub}>Assign access</Text>
          </TouchableOpacity>

          {/* Send tickets */}
          <TouchableOpacity
            style={[styles.gridItem, { width: '100%' }]}
            onPress={() => router.push(`/(admin)/events/${eventId}/send-tickets`)}
          >
            <View style={styles.fullWidthItemRow}>
              <View style={[styles.gridIconBg, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="send" size={24} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gridLabel}>Dispatch QR Tickets</Text>
                <Text style={styles.gridSub}>Bulk email & SMS QR ticket codes to attendees</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFF',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginLeft: 8,
  },
  statusToggleBtn: {
    paddingHorizontal: 4,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeActive: {
    backgroundColor: '#D1FAE5',
  },
  badgeActiveText: {
    color: '#065F46',
    fontWeight: '700',
    fontSize: 11,
  },
  badgeClosed: {
    backgroundColor: '#FEE2E2',
  },
  badgeClosedText: {
    color: '#991B1B',
    fontWeight: '700',
    fontSize: 11,
  },
  badgeDraft: {
    backgroundColor: '#F3F4F6',
  },
  badgeDraftText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 11,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
    paddingBottom: 32,
  },
  eventCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xl,
  },
  eventName: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h1,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.body,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h2,
    fontWeight: '800',
    color: colors.primary,
  },
  statLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    color: colors.muted,
    marginTop: 1,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h3,
    fontWeight: '700',
    color: colors.heading,
  },
  sectionItem: {
    gap: 4,
  },
  sectionColorIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sectionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionName: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.heading,
  },
  sectionStats: {
    fontFamily: fonts.sans,
    fontSize: fontSize.label,
    color: colors.muted,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  gridHeader: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h3,
    fontWeight: '700',
    color: colors.heading,
    marginTop: 2,
    marginBottom: -4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridItem: {
    flex: 1,
    minWidth: 220,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  gridIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridLabel: {
    fontFamily: fonts.serif,
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primary,
  },
  gridSub: {
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    color: colors.muted,
  },
  fullWidthItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '600',
  },
  backLink: {
    marginTop: 12,
    padding: 12,
  },
  backLinkText: {
    color: colors.primary,
    fontWeight: '700',
  },
});
