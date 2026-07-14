// app/(admin)/events/[eventId]/registrations.tsx
// Attendee Registrations List — Search, filter, manual register modal, details view, and manual check-in.

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useState, useTransition } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import {
  subscribeRegistrations,
  addRegistration,
  checkInAttendee,
  getEvent,
  subscribeOrgUsers,
  subscribeSheetCheckins,
  writeSheetCheckin,
  undoSheetCheckin,
} from '@/lib/firestore';
import { fetchSheetAttendees, searchAttendees, isNameBasedKey } from '@/lib/sheetAttendees';
import { HTSLEvent, Registration, AppUser, SheetAttendee, SheetCheckin } from '@/lib/types';


export default function RegistrationsScreen() {
  const { appUser } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [event, setEvent] = useState<HTSLEvent | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  // inputValue  → TextInput display (immediate)
  // searchQuery → debounced 250ms, drives filter computation
  const [inputValue, setInputValue]   = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('All');
  const [, startTransition] = useTransition();

  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);

  // Source tab: 'firestore' = existing registrations, 'sheet' = linked Google Sheet
  const [sourceTab, setSourceTab] = useState<'firestore' | 'sheet'>('firestore');

  // Sheet attendees state
  const [sheetAttendees, setSheetAttendees] = useState<SheetAttendee[]>([]);
  const [sheetCheckinMap, setSheetCheckinMap] = useState<Map<string, SheetCheckin>>(new Map());
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);


  // Modals state
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [manualCheckInCount, setManualCheckInCount] = useState(1);
  const [checkInLoading, setCheckInLoading] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  // Form states for manual registration
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedTier, setSelectedTier] = useState('');
  const [partySize, setPartySize] = useState('1');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!appUser?.orgId || !eventId) return;

    setIsLoading(true);

    // Fetch Event for Tiers
    getEvent(appUser.orgId, eventId).then((evt) => {
      setEvent(evt);
      if (evt && evt.tiers.length > 0) {
        setSelectedTier(evt.tiers[0].name);
      }
      // Fetch sheet attendees once event is loaded
      if (evt?.sheetId) {
        setSheetLoading(true);
        setSheetError(null);
        fetchSheetAttendees(evt.sheetId, evt.sheetEventFilter || evt.name || null)
          .then(setSheetAttendees)
          .catch((e) => setSheetError(e?.message || 'Failed to load sheet'))
          .finally(() => setSheetLoading(false));
      }
    });

    // Subscribe to Registrations
    const unsubscribe = subscribeRegistrations(appUser.orgId, eventId, (regs) => {
      setRegistrations(regs);
      setIsLoading(false);

      // If a registrant detail modal is open, update its state in real time
      setSelectedReg((current) => {
        if (!current) return null;
        const updated = regs.find((r) => r.id === current.id);
        return updated || null;
      });
    });

    // Subscribe to sheet check-ins (real-time)
    const unsubSheetCheckins = subscribeSheetCheckins(appUser.orgId, eventId, (list) => {
      const map = new Map<string, SheetCheckin>();
      list.forEach((c) => map.set(c.rowKey, c));
      setSheetCheckinMap(map);
    });

    // Subscribe to Org Users to resolve checkin IDs
    const unsubUsers = subscribeOrgUsers(appUser.orgId, (fetchedUsers) => {
      setUsers(fetchedUsers);
    });

    return () => {
      unsubscribe();
      unsubSheetCheckins();
      unsubUsers();
    };
  }, [appUser?.orgId, eventId]);

  // ── Debounce inputValue → searchQuery ────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(inputValue), 250);
    return () => clearTimeout(t);
  }, [inputValue]);


  const getUserName = (uid: string) => {
    const user = users.find((u) => u.uid === uid);
    if (!user) return `UID: ${uid}`;
    return user.displayName || user.email;
  };

  const handleAddRegistration = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Validation Error', 'First Name and Last Name are required');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      Alert.alert('Validation Error', 'Either Email or Phone is required');
      return;
    }

    try {
      setAddLoading(true);
      if (appUser?.orgId && eventId) {
        const size = parseInt(partySize) || 1;
        await addRegistration(appUser.orgId, eventId, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          tier: selectedTier,
          partySize: size,
          notes: notes.trim(),
          qrStatus: { generated: false },
        });

        // Reset Form
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        setPartySize('1');
        setNotes('');
        setAddModalVisible(false);
        Alert.alert('Success', 'Attendee registered successfully');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to register attendee');
    } finally {
      setAddLoading(false);
    }
  };

  const handleManualCheckIn = async () => {
    if (!selectedReg || !appUser?.orgId || !eventId || !appUser?.uid) return;

    try {
      setCheckInLoading(true);
      await checkInAttendee(
        appUser.orgId,
        eventId,
        selectedReg.id,
        appUser.uid,
        manualCheckInCount,
        'manual'
      );
      Alert.alert('Success', `Checked in ${manualCheckInCount} guests`);
      setManualCheckInCount(1);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Check-in failed');
    } finally {
      setCheckInLoading(false);
    }
  };

  // Filter logic — Firestore registrations (simple substring, fast)
  const filteredRegs = registrations.filter((reg) => {
    const searchString = `${reg.firstName} ${reg.lastName} ${reg.email} ${reg.phone}`.toLowerCase();
    const matchesSearch = !searchQuery || searchString.includes(searchQuery.toLowerCase());
    const matchesTier = selectedTierFilter === 'All' || reg.tier.toLowerCase() === selectedTierFilter.toLowerCase();
    return matchesSearch && matchesTier;
  });

  // Filter logic — Sheet attendees (cross-field token search)
  const filteredSheetAttendees = searchAttendees(sheetAttendees, searchQuery)
    .map(({ attendee }) => attendee);

  const getTierColor = (tierName: string) => {
    const t = event?.tiers.find((x) => x.name.toLowerCase() === tierName.toLowerCase());
    return t?.color || '#D1D5DB';
  };

  // Sheet attendee quick check-in from the list row
  const handleSheetQuickCheckIn = async (attendee: SheetAttendee) => {
    if (!appUser?.orgId || !eventId || !appUser.uid) return;
    const existing = sheetCheckinMap.get(attendee.rowKey);
    if (existing && !existing.checkedOutAt) {
      // Already checked in → undo
      Alert.alert(
        'Undo Check-in',
        `Remove check-in for ${attendee.customerName}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Undo', style: 'destructive',
            onPress: async () => {
              try { await undoSheetCheckin(appUser.orgId!, eventId, attendee.rowKey); }
              catch (e: any) { Alert.alert('Error', e?.message); }
            },
          },
        ]
      );
    } else {
      try {
        await writeSheetCheckin(appUser.orgId, eventId, attendee.rowKey, {
          attendeeName: attendee.customerName,
          spouseName: attendee.spouseName,
          gotram: attendee.gotram,
          eventName: attendee.eventName,
          phone: attendee.phone,
          email: attendee.email,
          volunteerId: appUser.uid,
        });
      } catch (e: any) { Alert.alert('Error', e?.message); }
    }
  };

  const renderSheetAttendeeItem = ({ item }: { item: SheetAttendee }) => {
    const checkin = sheetCheckinMap.get(item.rowKey);
    const isIn = checkin != null && !checkin.checkedOutAt;
    const nameKey = isNameBasedKey(item.rowKey);

    return (
      <TouchableOpacity
        style={[styles.regCard, isIn && styles.regCardCheckedIn]}
        onPress={() => handleSheetQuickCheckIn(item)}
        activeOpacity={0.75}
      >
        <View style={styles.cardMain}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.regName} numberOfLines={1}>{item.customerName}</Text>
            {item.spouseName ? (
              <Text style={[styles.regName, { fontWeight: '400', color: '#6B7280' }]} numberOfLines={1}>
                & {item.spouseName}
              </Text>
            ) : null}
            {nameKey && (
              <Ionicons name="warning-outline" size={13} color="#B45309" />
            )}
          </View>
          <View style={[styles.tierTag, { backgroundColor: '#F0FDF415' }]}>
            <Text style={[styles.tierTagText, { color: '#16A34A' }]}>Sheet</Text>
          </View>
        </View>

        <View style={styles.cardSub}>
          <Text style={styles.contactText} numberOfLines={1}>
            {item.gotram ? `${item.gotram}` : 'No gotram'}
            {item.phone ? ` · ${item.phone}` : ''}
          </Text>
          <View style={styles.checkinStatusRow}>
            {isIn ? (
              <View style={[styles.statusIndicator, styles.indicatorAll]}>
                <Ionicons name="checkmark-done" size={14} color="#065F46" />
                <Text style={styles.statusTextAll}>Checked In</Text>
              </View>
            ) : (
              <View style={[styles.statusIndicator, styles.indicatorNone]}>
                <Ionicons name="ellipse-outline" size={14} color="#4B5563" />
                <Text style={styles.statusTextNone}>Tap to Check In</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };



  const renderAttendeeItem = ({ item }: { item: Registration }) => {
    const color = getTierColor(item.tier);
    const checkedInAll = item.checkedInCount >= item.partySize;
    const checkedInSome = item.checkedInCount > 0 && !checkedInAll;

    return (
      <TouchableOpacity
        style={styles.regCard}
        onPress={() => {
          setSelectedReg(item);
          setManualCheckInCount(Math.max(1, item.partySize - item.checkedInCount));
          setDetailModalVisible(true);
        }}
      >
        <View style={styles.cardMain}>
          <Text style={styles.regName}>
            {item.firstName} {item.lastName}
          </Text>
          <View style={[styles.tierTag, { backgroundColor: color + '15' }]}>
            <Text style={[styles.tierTagText, { color }]}>{item.tier}</Text>
          </View>
        </View>

        <View style={styles.cardSub}>
          <Text style={styles.contactText} numberOfLines={1}>
            {item.email || item.phone || 'No contact info'}
          </Text>
          <View style={styles.checkinStatusRow}>
            {checkedInAll ? (
              <View style={[styles.statusIndicator, styles.indicatorAll]}>
                <Ionicons name="checkmark-done" size={14} color="#065F46" />
                <Text style={styles.statusTextAll}>{item.checkedInCount}/{item.partySize} In</Text>
              </View>
            ) : checkedInSome ? (
              <View style={[styles.statusIndicator, styles.indicatorSome]}>
                <Ionicons name="checkmark" size={14} color="#92400E" />
                <Text style={styles.statusTextSome}>{item.checkedInCount}/{item.partySize} In</Text>
              </View>
            ) : (
              <View style={[styles.statusIndicator, styles.indicatorNone]}>
                <Ionicons name="ellipse-outline" size={14} color="#4B5563" />
                <Text style={styles.statusTextNone}>0/{item.partySize} In</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace(`/(admin)/events/${eventId}`);
            }
          }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendee List</Text>
        {sourceTab === 'firestore' && (
          <TouchableOpacity
            onPress={() => {
              if (event && event.tiers.length > 0) {
                setSelectedTier(event.tiers[0].name);
              }
              setAddModalVisible(true);
            }}
            style={styles.addBtn}
          >
            <Ionicons name="person-add" size={20} color="#6D28D9" />
          </TouchableOpacity>
        )}
        {sourceTab === 'sheet' && <View style={{ width: 40 }} />}
      </View>

      {/* Source tab toggle */}
      <View style={styles.sourceTabBar}>
        <TouchableOpacity
          style={[styles.sourceTab, sourceTab === 'firestore' && styles.sourceTabActive]}
          onPress={() => setSourceTab('firestore')}
        >
          <Ionicons name="people" size={15} color={sourceTab === 'firestore' ? '#4F46E5' : '#9CA3AF'} />
          <Text style={[styles.sourceTabText, sourceTab === 'firestore' && styles.sourceTabTextActive]}>
            Registered ({registrations.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sourceTab, sourceTab === 'sheet' && styles.sourceTabActive]}
          onPress={() => setSourceTab('sheet')}
        >
          <Ionicons name="document-text" size={15} color={sourceTab === 'sheet' ? '#16A34A' : '#9CA3AF'} />
          <Text style={[styles.sourceTabText, sourceTab === 'sheet' && styles.sourceTabTextActive, sourceTab === 'sheet' && { color: '#16A34A' }]}>
            Sheet ({sheetAttendees.length})
          </Text>
          {!event?.sheetId && (
            <View style={styles.noSheetDot} />
          )}
        </TouchableOpacity>
      </View>

      {/* Search & Filters */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder={sourceTab === 'firestore' ? 'Search name, email, phone…' : 'Search name, gotram, phone…'}
            placeholderTextColor="#9CA3AF"
            value={inputValue}
            onChangeText={setInputValue}
          />
          {inputValue.length > 0 && (
            <TouchableOpacity onPress={() => { setInputValue(''); setSearchQuery(''); }}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Tier filter — only for Firestore tab */}
        {sourceTab === 'firestore' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tierFilterScroll}
          >
            {['All', ...(event?.tiers.map((t) => t.name) || [])].map((tierName) => {
              const isSelected = selectedTierFilter === tierName;
              return (
                <TouchableOpacity
                  key={tierName}
                  style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                  onPress={() => setSelectedTierFilter(tierName)}
                >
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>
                    {tierName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── FIRESTORE TAB ── */}
      {sourceTab === 'firestore' && (
        isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#6D28D9" />
          </View>
        ) : filteredRegs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={72} color="#E5E7EB" />
            <Text style={styles.emptyTitle}>No Attendees Found</Text>
            <Text style={styles.emptyText}>
              {searchQuery || selectedTierFilter !== 'All'
                ? 'No registrants match your search/filter.'
                : 'Add an attendee manually or import from a CSV file.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredRegs}
            renderItem={renderAttendeeItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {/* ── SHEET TAB ── */}
      {sourceTab === 'sheet' && (
        !event?.sheetId ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#E5E7EB" />
            <Text style={styles.emptyTitle}>No sheet linked</Text>
            <Text style={styles.emptyText}>
              Go to Sheet Lookup in the event dashboard to link a Google Sheet.
            </Text>
          </View>
        ) : sheetLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#16A34A" />
          </View>
        ) : sheetError ? (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={64} color="#FCA5A5" />
            <Text style={styles.emptyTitle}>Sheet load failed</Text>
            <Text style={styles.emptyText}>{sheetError}</Text>
          </View>
        ) : filteredSheetAttendees.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={72} color="#E5E7EB" />
            <Text style={styles.emptyTitle}>No attendees found</Text>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No one matches your search. Try a different spelling.' : 'The linked sheet has no rows for this event.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredSheetAttendees}
            renderItem={renderSheetAttendeeItem}
            keyExtractor={(item) => item.rowKey}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )
      )}



      {/* DETAIL & CHECK-IN MODAL */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Attendee Details</Text>
            <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
              <Ionicons name="close" size={26} color="#374151" />
            </TouchableOpacity>
          </View>

          {selectedReg && (
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {/* Profile Card */}
              <View style={styles.modalCard}>
                <View style={styles.modalCardRow}>
                  <Text style={styles.modalName}>
                    {selectedReg.firstName} {selectedReg.lastName}
                  </Text>
                  <View
                    style={[
                      styles.tierTag,
                      { backgroundColor: getTierColor(selectedReg.tier) + '15' },
                    ]}
                  >
                    <Text style={[styles.tierTagText, { color: getTierColor(selectedReg.tier) }]}>
                      {selectedReg.tier}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailsList}>
                  {selectedReg.email ? (
                    <View style={styles.detailItem}>
                      <Ionicons name="mail-outline" size={18} color="#6B7280" />
                      <Text style={styles.detailVal}>{selectedReg.email}</Text>
                    </View>
                  ) : null}
                  {selectedReg.phone ? (
                    <View style={styles.detailItem}>
                      <Ionicons name="call-outline" size={18} color="#6B7280" />
                      <Text style={styles.detailVal}>{selectedReg.phone}</Text>
                    </View>
                  ) : null}
                  <View style={styles.detailItem}>
                    <Ionicons name="people-outline" size={18} color="#6B7280" />
                    <Text style={styles.detailVal}>Party Size: {selectedReg.partySize}</Text>
                  </View>
                  {selectedReg.notes ? (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesLabel}>Notes</Text>
                      <Text style={styles.notesVal}>{selectedReg.notes}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Check-In Controls */}
              <View style={styles.modalCard}>
                <Text style={styles.modalCardTitle}>Manual Check-in Control</Text>
                
                <View style={styles.checkinProgressRow}>
                  <Text style={styles.checkinProgressText}>
                    Status: {selectedReg.checkedInCount} of {selectedReg.partySize} guests checked in
                  </Text>
                </View>

                {selectedReg.checkedInCount < selectedReg.partySize ? (
                  <View style={styles.checkinActionBox}>
                    <Text style={styles.checkinCountLabel}>Number to check in:</Text>
                    <View style={styles.countSelector}>
                      <TouchableOpacity
                        style={styles.countBtn}
                        onPress={() => setManualCheckInCount(Math.max(1, manualCheckInCount - 1))}
                      >
                        <Ionicons name="remove" size={20} color="#374151" />
                      </TouchableOpacity>
                      <Text style={styles.countNumber}>{manualCheckInCount}</Text>
                      <TouchableOpacity
                        style={styles.countBtn}
                        onPress={() =>
                          setManualCheckInCount(
                            Math.min(selectedReg.partySize - selectedReg.checkedInCount, manualCheckInCount + 1)
                          )
                        }
                      >
                        <Ionicons name="add" size={20} color="#374151" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.confirmCheckinBtn}
                      onPress={handleManualCheckIn}
                      disabled={checkInLoading}
                    >
                      {checkInLoading ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text style={styles.confirmCheckinText}>
                          Confirm Check-In ({manualCheckInCount})
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.allCheckedInAlert}>
                    <Ionicons name="checkmark-circle" size={24} color="#059669" />
                    <Text style={styles.allCheckedInText}>Everyone in this group has checked in.</Text>
                  </View>
                )}
              </View>

              {/* Check-In Logs */}
              <View style={styles.modalCard}>
                <Text style={styles.modalCardTitle}>Check-in Log History</Text>
                {selectedReg.checkins.length === 0 ? (
                  <Text style={styles.noLogsText}>No check-in entries yet.</Text>
                ) : (
                  selectedReg.checkins.map((log, idx) => (
                    <View key={idx} style={styles.logItem}>
                      <View style={styles.logHeader}>
                        <Text style={styles.logMethod}>
                          +{log.count} via {log.method.toUpperCase()}
                        </Text>
                        <Text style={styles.logTime}>
                          {log.checkedInAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={styles.logBy}>Checked in by: {getUserName(log.checkedInBy)}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ADD ATTENDEE MODAL */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Attendee</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={26} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.modalCard}>
                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>First Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="First Name"
                      value={firstName}
                      onChangeText={setFirstName}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Last Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Last Name"
                      value={lastName}
                      onChangeText={setLastName}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="email@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. +13145551234"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Party Size</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={partySize}
                      onChangeText={setPartySize}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1.5 }]}>
                    <Text style={styles.label}>Seating Tier</Text>
                    {/* Simplified selector logic for iOS/Android */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tierSelectScroll}>
                      {event?.tiers.map((t) => {
                        const isSel = selectedTier === t.name;
                        return (
                          <TouchableOpacity
                            key={t.id}
                            style={[styles.tierSelChip, isSel && styles.tierSelChipSelected]}
                            onPress={() => setSelectedTier(t.name)}
                          >
                            <Text style={[styles.tierSelText, isSel && styles.tierSelTextSelected]}>
                              {t.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Notes / Seating Preferences</Text>
                  <TextInput
                    style={[styles.input, { height: 80, paddingTop: 12 }]}
                    placeholder="Dietary requirements, accessibility needs..."
                    multiline
                    value={notes}
                    onChangeText={setNotes}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleAddRegistration}
                disabled={addLoading}
              >
                {addLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Register Attendee</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
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
  },
  addBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F5F3FF',
  },
  filterSection: {
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 14,
    color: '#111827',
  },
  tierFilterScroll: {
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipSelected: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterChipTextSelected: {
    color: '#FFF',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Source tab bar
  sourceTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sourceTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  sourceTabActive: {
    borderBottomColor: '#4F46E5',
  },
  sourceTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  sourceTabTextActive: {
    color: '#4F46E5',
  },
  noSheetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
    marginLeft: 2,
  },

  regCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
  },
  regCardCheckedIn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },

  cardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  regName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  tierTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tierTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardSub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  contactText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
    marginRight: 12,
  },
  checkinStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  indicatorAll: {
    backgroundColor: '#D1FAE5',
  },
  indicatorSome: {
    backgroundColor: '#FEF3C7',
  },
  indicatorNone: {
    backgroundColor: '#F3F4F6',
  },
  statusTextAll: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextSome: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextNone: {
    color: '#4B5563',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalScroll: {
    padding: 20,
    gap: 16,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  modalCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
  },
  detailsList: {
    gap: 10,
    marginTop: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailVal: {
    fontSize: 14,
    color: '#374151',
  },
  notesBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 6,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 4,
  },
  notesVal: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  modalCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  checkinProgressRow: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  checkinProgressText: {
    fontSize: 14,
    color: '#4338CA',
    fontWeight: '600',
  },
  checkinActionBox: {
    gap: 10,
    marginTop: 6,
  },
  checkinCountLabel: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  countSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    alignSelf: 'flex-start',
  },
  countBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  confirmCheckinBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  confirmCheckinText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  allCheckedInAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  allCheckedInText: {
    color: '#047857',
    fontWeight: '600',
    fontSize: 13,
  },
  noLogsText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  logItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingVertical: 8,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logMethod: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  logTime: {
    fontSize: 11,
    color: '#6B7280',
  },
  logBy: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  inputGroup: {
    gap: 6,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    height: 44,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  tierSelectScroll: {
    flexDirection: 'row',
  },
  tierSelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tierSelChipSelected: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  tierSelText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  tierSelTextSelected: {
    color: '#FFF',
  },
  submitBtn: {
    backgroundColor: '#6D28D9',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 20,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
