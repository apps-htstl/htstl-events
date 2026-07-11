// app/(volunteer)/lookup.tsx
// Volunteer Manual Lookup Screen — Search attendees by name/contact, details view, and manual check-in.

import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeRegistrations, addRegistration, checkInAttendee, updateRegistration } from '@/lib/firestore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, app } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { HTSLEvent, Registration } from '@/lib/types';

export default function LookupScreen() {
  const { appUser, logout } = useAuth();

  const [events, setEvents] = useState<HTSLEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<HTSLEvent | null>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [listLoading, setListLoading] = useState(false);

  // Check-in Modal state
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);
  const [partyCount, setPartyCount] = useState(1);
  const [checkInLoading, setCheckInLoading] = useState(false);
  
  // Edit & Resend states
  const [editMode, setEditMode] = useState(false);
  const [editedEmail, setEditedEmail] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [isSendingTicket, setIsSendingTicket] = useState(false);

  // Add Attendee form state (superadmin / eventadmin only)
  const canAddAttendee = appUser?.role === 'superadmin' || appUser?.role === 'eventadmin';
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addFirstName, setAddFirstName] = useState('');
  const [addLastName, setAddLastName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPartySize, setAddPartySize] = useState(1);
  const [addSelectedTier, setAddSelectedTier] = useState('');
  const [addNotes, setAddNotes] = useState('');

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
      setRegistrations([]);
      return;
    }

    setListLoading(true);
    const unsubscribe = subscribeRegistrations(appUser.orgId, selectedEvent.id, (regs) => {
      setRegistrations(regs);
      setListLoading(false);

      // If details modal is open, keep selected registrant updated
      setSelectedReg((curr) => {
        if (!curr) return null;
        const updated = regs.find((r) => r.id === curr.id);
        return updated || null;
      });
    });

    return () => unsubscribe();
  }, [appUser?.orgId, selectedEvent]);

  // Filter registrations by search query
  const filteredRegs = registrations.filter((reg) => {
    const searchStr = `${reg.firstName} ${reg.lastName} ${reg.email} ${reg.phone}`.toLowerCase();
    return searchStr.includes(searchQuery.toLowerCase());
  });

  const handleManualCheckIn = async () => {
    if (!selectedReg || !appUser?.orgId || !selectedEvent || !appUser?.uid) return;

    try {
      setCheckInLoading(true);
      
      // Perform local client check-in write (offline supported!)
      await checkInAttendee(
        appUser.orgId,
        selectedEvent.id,
        selectedReg.id,
        appUser.uid,
        partyCount,
        'manual'
      );

      Alert.alert('Checked In', `${selectedReg.firstName} +${partyCount} checked in successfully!`);
      setCheckInModalVisible(false);
      setSelectedReg(null);
    } catch (err: any) {
      Alert.alert('Check-in Failed', err?.message || 'Transaction error.');
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleResendTicket = async (targetChannel: 'email' | 'sms') => {
    if (!selectedReg || !appUser?.orgId || !selectedEvent) return;

    try {
      setIsSendingTicket(true);

      // 1. If details changed, save them to Firestore first
      const hasEmailChanged = editedEmail.trim() !== (selectedReg.email || '');
      const hasPhoneChanged = editedPhone.trim() !== (selectedReg.phone || '');

      if (hasEmailChanged || hasPhoneChanged) {
        await updateRegistration(appUser.orgId, selectedEvent.id, selectedReg.id, {
          email: editedEmail.trim(),
          phone: editedPhone.trim(),
        });
      }

      // 2. Call Cloud Function to dispatch the ticket
      const functions = getFunctions(app);
      const sendTicketsCallable = httpsCallable<{
        orgId: string;
        eventId: string;
        registrantIds: string[];
        channel: 'email' | 'sms' | 'both';
      }, {
        success: boolean;
        count: number;
        failed: number;
        errors?: string[];
      }>(functions, 'sendTickets');

      const res = await sendTicketsCallable({
        orgId: appUser.orgId,
        eventId: selectedEvent.id,
        registrantIds: [selectedReg.id],
        channel: targetChannel,
      });

      if (res.data.failed > 0) {
        const errorDetails = res.data.errors?.join('\n') || 'Failed to dispatch ticket.';
        Alert.alert('Dispatch Warning', errorDetails);
      } else {
        Alert.alert('Success', `Ticket sent via ${targetChannel.toUpperCase()} successfully!`);
        setEditMode(false);
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err?.message || 'Failed to send ticket.');
    } finally {
      setIsSendingTicket(false);
    }
  };

  // ── Add Attendee (admin-only) ─────────────────────────────────────────────────
  const handleAddAttendee = async () => {
    if (!addFirstName.trim() || !addLastName.trim()) {
      Alert.alert('Required', 'First Name and Last Name are required.');
      return;
    }
    if (!addEmail.trim() && !addPhone.trim()) {
      Alert.alert('Required', 'Please provide at least an email or phone number.');
      return;
    }
    if (!selectedEvent || !appUser?.orgId) return;

    try {
      setAddLoading(true);
      await addRegistration(appUser.orgId, selectedEvent.id, {
        firstName: addFirstName.trim(),
        lastName: addLastName.trim(),
        email: addEmail.trim(),
        phone: addPhone.trim(),
        tier: addSelectedTier || (selectedEvent.tiers[0]?.name ?? 'General'),
        partySize: addPartySize,
        notes: addNotes.trim(),
        qrStatus: { generated: false },
      });

      // Reset form
      setAddFirstName('');
      setAddLastName('');
      setAddEmail('');
      setAddPhone('');
      setAddPartySize(1);
      setAddNotes('');
      setAddModalVisible(false);
      Alert.alert('Registered!', `${addFirstName} ${addLastName} has been added to the attendee list.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add attendee.');
    } finally {
      setAddLoading(false);
    }
  };

  const renderAttendeeItem = ({ item }: { item: Registration }) => {
    const checkedInAll = item.checkedInCount >= item.partySize;
    const checkedInSome = item.checkedInCount > 0 && !checkedInAll;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          setSelectedReg(item);
          setEditedEmail(item.email || '');
          setEditedPhone(item.phone || '');
          setEditMode(false);
          const remaining = item.partySize - item.checkedInCount;
          setPartyCount(Math.max(1, remaining));
          setCheckInModalVisible(true);
        }}
      >
        <View style={styles.cardBody}>
          <Text style={styles.regName}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={styles.regContact}>
            {item.email || 'No email'} • {item.phone || 'No phone'}
          </Text>
          <Text style={styles.regMeta}>
            Tier: {item.tier} • Group: {item.partySize}
          </Text>
        </View>

        <View style={styles.cardStatus}>
          {checkedInAll ? (
            <View style={[styles.badge, styles.badgeSuccess]}>
              <Text style={styles.badgeSuccessText}>{item.checkedInCount}/{item.partySize} In</Text>
            </View>
          ) : checkedInSome ? (
            <View style={[styles.badge, styles.badgeWarning]}>
              <Text style={styles.badgeWarningText}>{item.checkedInCount}/{item.partySize} In</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgeNone]}>
              <Text style={styles.badgeNoneText}>0/{item.partySize} In</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </View>
      </TouchableOpacity>
    );
  };

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

        {/* + Add Attendee button — superadmin / eventadmin only */}
        {canAddAttendee && selectedEvent && (
          <TouchableOpacity
            style={styles.addAttendeeBtn}
            onPress={() => {
              setAddSelectedTier(selectedEvent.tiers[0]?.name ?? '');
              setAddPartySize(1);
              setAddModalVisible(true);
            }}
          >
            <Ionicons name="person-add-outline" size={18} color="#6D28D9" />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      {selectedEvent && (
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search attendee by name, email, phone..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      {/* Main Content */}
      {!selectedEvent ? (
        <View style={styles.center}>
          <Ionicons name="search" size={64} color="#D1D5DB" />
          <Text style={styles.noEventsTitle}>Select Event to Search</Text>
          <Text style={styles.noEventsText}>
            Select an active event from the top header to lookup registrations.
          </Text>
        </View>
      ) : listLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : filteredRegs.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={64} color="#E5E7EB" />
          <Text style={styles.noEventsTitle}>No Attendees Found</Text>
          <Text style={styles.noEventsText}>
            {searchQuery ? 'Try searching different spelling or keywords.' : 'No attendees registered for this event yet.'}
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

            {eventsLoading ? (
              <ActivityIndicator style={{ margin: 24 }} color="#059669" />
            ) : events.length === 0 ? (
              <Text style={styles.noEventsPicker}>No active events available.</Text>
            ) : (
              events.map((evt) => (
                <TouchableOpacity
                  key={evt.id}
                  style={[
                    styles.pickerItem,
                    selectedEvent?.id === evt.id && styles.pickerItemActive,
                  ]}
                  onPress={() => {
                    setSelectedEvent(evt);
                    setShowEventPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{evt.name}</Text>
                  <Text style={styles.pickerItemVenue}>{evt.venue}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </Modal>

      {/* MANUAL CHECK-IN MODAL */}
      <Modal visible={checkInModalVisible} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={styles.confirmContainer}>
            {selectedReg && (
              <View style={{ gap: 16 }}>
                <Text style={styles.confirmHeader}>Manual Check-in</Text>

                <View style={styles.attendeeProfileCard}>
                  <Text style={styles.attendeeName}>
                    {selectedReg.firstName} {selectedReg.lastName}
                  </Text>
                  <View style={styles.tierTag}>
                    <Text style={styles.tierTagText}>{selectedReg.tier.toUpperCase()}</Text>
                  </View>
                  
                  {/* Email & Phone Details / Edit Mode */}
                  {!editMode ? (
                    <View style={styles.contactDetails}>
                      <Text style={styles.contactLabel}>
                        Email: <Text style={styles.contactValue}>{selectedReg.email || 'Not provided'}</Text>
                      </Text>
                      <Text style={styles.contactLabel}>
                        Phone: <Text style={styles.contactValue}>{selectedReg.phone || 'Not provided'}</Text>
                      </Text>
                      <TouchableOpacity 
                        style={styles.editContactBtn} 
                        onPress={() => {
                          setEditedEmail(selectedReg.email || '');
                          setEditedPhone(selectedReg.phone || '');
                          setEditMode(true);
                        }}
                      >
                        <Ionicons name="create-outline" size={14} color="#059669" />
                        <Text style={styles.editContactText}>Edit Details / Send Ticket</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.editContactForm}>
                      <View style={styles.modalInputGroup}>
                        <Text style={styles.modalInputLabel}>Email Address</Text>
                        <TextInput
                          style={styles.modalTextInput}
                          value={editedEmail}
                          onChangeText={setEditedEmail}
                          placeholder="Email address"
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>
                      <View style={styles.modalInputGroup}>
                        <Text style={styles.modalInputLabel}>Phone Number</Text>
                        <TextInput
                          style={styles.modalTextInput}
                          value={editedPhone}
                          onChangeText={setEditedPhone}
                          placeholder="Phone number"
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={styles.editActionsRow}>
                        <TouchableOpacity
                          style={[styles.resendBtn, isSendingTicket && styles.resendBtnDisabled]}
                          onPress={() => handleResendTicket('email')}
                          disabled={isSendingTicket}
                        >
                          <Ionicons name="mail-outline" size={16} color="#FFF" />
                          <Text style={styles.resendBtnText}>Email Ticket</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.resendBtn, isSendingTicket && styles.resendBtnDisabled]}
                          onPress={() => handleResendTicket('sms')}
                          disabled={isSendingTicket}
                        >
                          <Ionicons name="phone-portrait-outline" size={16} color="#FFF" />
                          <Text style={styles.resendBtnText}>SMS Ticket</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity 
                        style={styles.cancelEditBtn} 
                        onPress={() => setEditMode(false)}
                      >
                        <Text style={styles.cancelEditText}>Cancel Edit</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {selectedReg.notes ? (
                    <Text style={styles.notesVal}>Notes: {selectedReg.notes}</Text>
                  ) : null}
                </View>

                {/* Stats */}
                <View style={styles.confirmStatsRow}>
                  <Text style={styles.confirmStatsLabel}>Group Size:</Text>
                  <Text style={styles.confirmStatsValue}>{selectedReg.partySize}</Text>
                </View>
                <View style={styles.confirmStatsRow}>
                  <Text style={styles.confirmStatsLabel}>Checked In So Far:</Text>
                  <Text style={styles.confirmStatsValue}>{selectedReg.checkedInCount}</Text>
                </View>

                {/* Counter controls */}
                {selectedReg.checkedInCount >= selectedReg.partySize ? (
                  <View style={styles.warningBox}>
                    <Ionicons name="checkmark-circle" size={20} color="#047857" />
                    <Text style={styles.warningText}>
                      Every guest in this registration group is already checked in.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.checkinActionBox}>
                    <Text style={styles.selectCountLabel}>Guests present now:</Text>
                    <View style={styles.countControls}>
                      <TouchableOpacity
                        style={styles.countBtn}
                        onPress={() => setPartyCount(Math.max(1, partyCount - 1))}
                      >
                        <Ionicons name="remove" size={20} color="#374151" />
                      </TouchableOpacity>
                      <Text style={styles.countVal}>{partyCount}</Text>
                      <TouchableOpacity
                        style={styles.countBtn}
                        onPress={() =>
                          setPartyCount(
                            Math.min(selectedReg.partySize - selectedReg.checkedInCount, partyCount + 1)
                          )
                        }
                      >
                        <Ionicons name="add" size={20} color="#374151" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.confirmBtn}
                      onPress={handleManualCheckIn}
                      disabled={checkInLoading}
                    >
                      {checkInLoading ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text style={styles.confirmBtnText}>Admit {partyCount} Guest(s)</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setCheckInModalVisible(false);
                    setSelectedReg(null);
                  }}
                >
                  <Text style={styles.cancelBtnText}>Cancel / Close</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ADD ATTENDEE MODAL — superadmin / eventadmin only */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={styles.addModalContainer}>
            {/* Header */}
            <View style={styles.addModalHeader}>
              <View style={styles.addModalTitleRow}>
                <Ionicons name="person-add" size={20} color="#6D28D9" />
                <Text style={styles.addModalTitle}>Add Attendee</Text>
              </View>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={styles.addModalBody}>

                {/* Name Row */}
                <View style={styles.addRow}>
                  <View style={[styles.addInputGroup, { flex: 1 }]}>
                    <Text style={styles.addLabel}>First Name *</Text>
                    <TextInput
                      style={styles.addInput}
                      placeholder="First name"
                      placeholderTextColor="#9CA3AF"
                      value={addFirstName}
                      onChangeText={setAddFirstName}
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={[styles.addInputGroup, { flex: 1 }]}>
                    <Text style={styles.addLabel}>Last Name *</Text>
                    <TextInput
                      style={styles.addInput}
                      placeholder="Last name"
                      placeholderTextColor="#9CA3AF"
                      value={addLastName}
                      onChangeText={setAddLastName}
                      autoCapitalize="words"
                    />
                  </View>
                </View>

                {/* Email */}
                <View style={styles.addInputGroup}>
                  <Text style={styles.addLabel}>Email</Text>
                  <TextInput
                    style={styles.addInput}
                    placeholder="email@example.com"
                    placeholderTextColor="#9CA3AF"
                    value={addEmail}
                    onChangeText={setAddEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                {/* Phone */}
                <View style={styles.addInputGroup}>
                  <Text style={styles.addLabel}>Phone</Text>
                  <TextInput
                    style={styles.addInput}
                    placeholder="+1 (555) 000-0000"
                    placeholderTextColor="#9CA3AF"
                    value={addPhone}
                    onChangeText={setAddPhone}
                    keyboardType="phone-pad"
                  />
                </View>

                {/* Tier Picker */}
                {selectedEvent && selectedEvent.tiers.length > 0 && (
                  <View style={styles.addInputGroup}>
                    <Text style={styles.addLabel}>Tier</Text>
                    <View style={styles.tierPickerRow}>
                      {selectedEvent.tiers.map((tier) => (
                        <TouchableOpacity
                          key={tier.id}
                          style={[
                            styles.tierChip,
                            addSelectedTier === tier.name && {
                              backgroundColor: tier.color + '25',
                              borderColor: tier.color,
                            },
                          ]}
                          onPress={() => setAddSelectedTier(tier.name)}
                        >
                          <View style={[styles.tierDot, { backgroundColor: tier.color }]} />
                          <Text
                            style={[
                              styles.tierChipText,
                              addSelectedTier === tier.name && { color: tier.color, fontWeight: '700' },
                            ]}
                          >
                            {tier.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Party Size */}
                <View style={styles.addInputGroup}>
                  <Text style={styles.addLabel}>Group / Party Size</Text>
                  <View style={styles.partyStepper}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => setAddPartySize(Math.max(1, addPartySize - 1))}
                    >
                      <Ionicons name="remove" size={20} color="#374151" />
                    </TouchableOpacity>
                    <Text style={styles.stepperVal}>{addPartySize}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => setAddPartySize(addPartySize + 1)}
                    >
                      <Ionicons name="add" size={20} color="#374151" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Notes */}
                <View style={styles.addInputGroup}>
                  <Text style={styles.addLabel}>Notes (optional)</Text>
                  <TextInput
                    style={[styles.addInput, styles.addNotesInput]}
                    placeholder="VIP seating, dietary needs, etc."
                    placeholderTextColor="#9CA3AF"
                    value={addNotes}
                    onChangeText={setAddNotes}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                {/* Action Buttons */}
                <View style={styles.addActionsRow}>
                  <TouchableOpacity
                    style={styles.cancelAddBtn}
                    onPress={() => setAddModalVisible(false)}
                    disabled={addLoading}
                  >
                    <Text style={styles.cancelAddText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveAddBtn, addLoading && { opacity: 0.6 }]}
                    onPress={handleAddAttendee}
                    disabled={addLoading}
                  >
                    {addLoading ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                        <Text style={styles.saveAddText}>Register Attendee</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

              </View>
            </ScrollView>
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
    padding: 40,
    gap: 12,
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: '#111827',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  card: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  regName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  regContact: {
    fontSize: 13,
    color: '#4B5563',
  },
  regMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  cardStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeSuccess: {
    backgroundColor: '#D1FAE5',
  },
  badgeSuccessText: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeWarningText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeNone: {
    backgroundColor: '#F3F4F6',
  },
  badgeNoneText: {
    color: '#4B5563',
    fontSize: 11,
    fontWeight: '700',
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
    lineHeight: 18,
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
  confirmContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  confirmHeader: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  attendeeProfileCard: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  attendeeName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  tierTag: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tierTagText: {
    color: '#0369A1',
    fontSize: 11,
    fontWeight: '700',
  },
  notesVal: {
    fontSize: 13,
    color: '#D97706',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  confirmStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  confirmStatsLabel: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  confirmStatsValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginVertical: 8,
  },
  warningText: {
    flex: 1,
    color: '#047857',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  checkinActionBox: {
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  selectCountLabel: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '600',
  },
  countControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  countBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countVal: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  confirmBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    height: 48,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  contactDetails: {
    width: '100%',
    marginTop: 8,
    gap: 4,
    alignItems: 'center',
  },
  contactLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  contactValue: {
    fontWeight: '600',
    color: '#374151',
  },
  editContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  editContactText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
  },
  editContactForm: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  modalInputGroup: {
    gap: 4,
    width: '100%',
  },
  modalInputLabel: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '600',
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#111827',
    width: '100%',
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    width: '100%',
  },
  resendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    borderRadius: 8,
    height: 38,
  },
  resendBtnDisabled: {
    backgroundColor: '#A7F3D0',
  },
  resendBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelEditBtn: {
    alignItems: 'center',
    paddingVertical: 4,
    marginTop: 4,
  },
  cancelEditText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Add Attendee button (header) ──────────────────────────────────────────
  addAttendeeBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },

  // ── Add Attendee modal ────────────────────────────────────────────────────
  addModalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    flex: 0,
    width: '100%',
    position: 'absolute',
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  addModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  addModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  addModalBody: {
    padding: 20,
    gap: 16,
    paddingBottom: 32,
  },
  addRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addInputGroup: {
    gap: 6,
  },
  addLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  addNotesInput: {
    height: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  tierPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  tierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tierChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
  },
  partyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperVal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    minWidth: 32,
    textAlign: 'center',
  },
  addActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelAddBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelAddText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveAddBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6D28D9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveAddText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});
