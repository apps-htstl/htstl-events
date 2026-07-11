// app/(admin)/events/[eventId]/send-tickets.tsx
// Ticket Dispatch Screen — bulk send tickets via Email and SMS with select filters and live progress.

import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeRegistrations } from '@/lib/firestore';
import { Registration } from '@/lib/types';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';

type FilterType = 'all' | 'unsent' | 'sent';
type ChannelType = 'email' | 'sms' | 'both';

export default function SendTicketsScreen() {
  const { appUser } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterType>('unsent');
  const [channel, setChannel] = useState<ChannelType>('email');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Dispatch states
  const [isSending, setIsSending] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{
    success: boolean;
    count: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    if (!appUser?.orgId || !eventId) return;

    setIsLoading(true);
    const unsubscribe = subscribeRegistrations(appUser.orgId, eventId, (regs) => {
      setRegistrations(regs);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [appUser?.orgId, eventId]);

  // Apply filters and search query
  const filteredRegs = registrations.filter((reg) => {
    const isSent = !!reg.qrStatus?.sentAt;
    const searchString = `${reg.firstName} ${reg.lastName} ${reg.email} ${reg.phone}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());

    if (filter === 'sent') return isSent && matchesSearch;
    if (filter === 'unsent') return !isSent && matchesSearch;
    return matchesSearch; // 'all'
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredRegs.length) {
      // Unselect all
      setSelectedIds(new Set());
    } else {
      // Select all in current list
      const next = new Set(filteredRegs.map((r) => r.id));
      setSelectedIds(next);
    }
  };

  const handleSendTickets = async () => {
    if (selectedIds.size === 0) {
      Alert.alert('No Selection', 'Please select at least one attendee to send tickets.');
      return;
    }

    const runDispatch = async () => {
      try {
        setIsSending(true);
        setDispatchResult(null);

        const functions = getFunctions(app);
        const sendTicketsCallable = httpsCallable<{
          orgId: string;
          eventId: string;
          registrantIds: string[];
          channel: ChannelType;
        }, {
          success: boolean;
          count: number;
          failed: number;
          errors?: string[];
        }>(functions, 'sendTickets');

        const res = await sendTicketsCallable({
          orgId: appUser!.orgId,
          eventId: eventId!,
          registrantIds: Array.from(selectedIds),
          channel,
        });

        setDispatchResult({
          success: res.data.success,
          count: res.data.count,
          failed: res.data.failed,
        });

        // Clear selection
        setSelectedIds(new Set());

        if (res.data.failed > 0) {
          const errorDetails = res.data.errors?.join('\n') || 'Failed to dispatch tickets.';
          console.error('Dispatch failures:', errorDetails);
          Alert.alert(
            'Dispatch Warning',
            `Successfully sent ${res.data.count} ticket(s), but ${res.data.failed} failed.\n\nErrors:\n${errorDetails}`
          );
        } else {
          Alert.alert('Success', `Successfully sent ${res.data.count} ticket(s)!`);
        }
      } catch (err: any) {
        console.error(err);
        Alert.alert('Error', err?.message || 'Failed to dispatch tickets.');
      } finally {
        setIsSending(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Confirm Dispatch: You are about to send tickets to ${selectedIds.size} attendee(s) via ${channel.toUpperCase()}. Continue?`
      );
      if (confirmed) {
        runDispatch();
      }
    } else {
      Alert.alert(
        'Confirm Dispatch',
        `You are about to send tickets to ${selectedIds.size} attendee(s) via ${channel.toUpperCase()}. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send Now', onPress: runDispatch },
        ]
      );
    }
  };

  const renderAttendeeItem = ({ item }: { item: Registration }) => {
    const isSelected = selectedIds.has(item.id);
    const isSent = !!item.qrStatus?.sentAt;

    return (
      <TouchableOpacity style={styles.card} onPress={() => toggleSelect(item.id)}>
        <View style={styles.cardSelectCol}>
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
          </View>
        </View>

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

        <View style={styles.cardStatusCol}>
          {isSent ? (
            <View style={styles.sentBadge}>
              <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
              <Text style={styles.sentText}>SENT</Text>
            </View>
          ) : (
            <View style={styles.unsentBadge}>
              <Ionicons name="mail-unread-outline" size={14} color="#D97706" />
              <Text style={styles.unsentText}>UNSENT</Text>
            </View>
          )}
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
        <Text style={styles.headerTitle}>Dispatch Tickets</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats Summary & Options */}
      <View style={styles.controlBox}>
        {/* Filters */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'unsent' && styles.filterTabActive]}
            onPress={() => {
              setFilter('unsent');
              setSelectedIds(new Set());
              setSearchQuery('');
            }}
          >
            <Text style={[styles.filterTabText, filter === 'unsent' && styles.filterTabTextActive]}>
              Unsent ({registrations.filter((r) => !r.qrStatus?.sentAt).length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'sent' && styles.filterTabActive]}
            onPress={() => {
              setFilter('sent');
              setSelectedIds(new Set());
              setSearchQuery('');
            }}
          >
            <Text style={[styles.filterTabText, filter === 'sent' && styles.filterTabTextActive]}>
              Sent ({registrations.filter((r) => !!r.qrStatus?.sentAt).length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            onPress={() => {
              setFilter('all');
              setSelectedIds(new Set());
              setSearchQuery('');
            }}
          >
            <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
              All ({registrations.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, email, phone..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Channels */}
        <View style={styles.channelSection}>
          <Text style={styles.sectionLabel}>Delivery Method:</Text>
          <View style={styles.channelRow}>
            <TouchableOpacity
              style={[styles.channelChip, channel === 'email' && styles.channelChipActive]}
              onPress={() => setChannel('email')}
            >
              <Ionicons name="mail-outline" size={16} color={channel === 'email' ? '#FFF' : '#4B5563'} />
              <Text style={[styles.channelText, channel === 'email' && styles.channelTextActive]}>
                Email
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.channelChip, channel === 'sms' && styles.channelChipActive]}
              onPress={() => setChannel('sms')}
            >
              <Ionicons name="phone-portrait-outline" size={16} color={channel === 'sms' ? '#FFF' : '#4B5563'} />
              <Text style={[styles.channelText, channel === 'sms' && styles.channelTextActive]}>
                SMS
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.channelChip, channel === 'both' && styles.channelChipActive]}
              onPress={() => setChannel('both')}
            >
              <Ionicons name="chatbubbles-outline" size={16} color={channel === 'both' ? '#FFF' : '#4B5563'} />
              <Text style={[styles.channelText, channel === 'both' && styles.channelTextActive]}>
                Both
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selection Tools */}
        <View style={styles.selectionToolRow}>
          <Text style={styles.selectionCount}>
            {selectedIds.size} of {filteredRegs.length} selected
          </Text>
          <TouchableOpacity style={styles.selectAllBtn} onPress={handleSelectAll}>
            <Text style={styles.selectAllText}>
              {selectedIds.size === filteredRegs.length ? 'Unselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6D28D9" />
        </View>
      ) : filteredRegs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="mail-unread-outline" size={72} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>No Attendees Found</Text>
          <Text style={styles.emptyText}>
            No registrations match the selected filter.
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

      {/* Dispatch Trigger Bar */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.dispatchBtn, selectedIds.size === 0 && styles.dispatchBtnDisabled]}
          onPress={handleSendTickets}
          disabled={selectedIds.size === 0 || isSending}
        >
          {isSending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#FFF" />
              <Text style={styles.dispatchBtnText}>
                Send Tickets ({selectedIds.size})
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
  controlBox: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    padding: 16,
    gap: 14,
  },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterTabTextActive: {
    color: '#111827',
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
  clearBtn: {
    padding: 4,
  },
  channelSection: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  channelRow: {
    flexDirection: 'row',
    gap: 8,
  },
  channelChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 38,
    borderRadius: 8,
    gap: 6,
  },
  channelChipActive: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  channelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  channelTextActive: {
    color: '#FFF',
  },
  selectionToolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  selectionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  selectAllBtn: {
    padding: 4,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6D28D9',
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
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardSelectCol: {
    paddingRight: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  regName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  regContact: {
    fontSize: 12,
    color: '#4B5563',
  },
  regMeta: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  cardStatusCol: {
    paddingLeft: 10,
  },
  sentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  sentText: {
    color: '#065F46',
    fontSize: 9,
    fontWeight: '800',
  },
  unsentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  unsentText: {
    color: '#D97706',
    fontSize: 9,
    fontWeight: '800',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  dispatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D28D9',
    borderRadius: 12,
    height: 48,
    gap: 8,
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  dispatchBtnDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
    elevation: 0,
  },
  dispatchBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
