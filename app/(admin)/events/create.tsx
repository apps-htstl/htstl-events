// app/(admin)/events/create.tsx
// Event creation form screen with pre-populated Hindu Temple tiers/sections.

import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { createEvent } from '@/lib/firestore';
import { Tier, Section } from '@/lib/types';

export default function CreateEventScreen() {
  const { appUser } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('Hindu Temple of St. Louis');
  
  // Default to tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDateStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
  const [dateStr, setDateStr] = useState(defaultDateStr);
  const [timeStr, setTimeStr] = useState('18:00'); // HH:MM

  // Capacities for default seating sections
  const [frontRowsCap, setFrontRowsCap] = useState('100');
  const [rows6to12Cap, setRows6to12Cap] = useState('200');
  const [rows13to20Cap, setRows13to20Cap] = useState('300');
  const [generalStandingCap, setGeneralStandingCap] = useState('500');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Event Name is required');
      return;
    }
    if (!venue.trim()) {
      setError('Venue is required');
      return;
    }
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setError('Date must be in YYYY-MM-DD format');
      return;
    }
    if (!timeStr.match(/^\d{2}:\d{2}$/)) {
      setError('Time must be in HH:MM format');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Parse date and time strings to single JS Date
      const parsedDate = new Date(`${dateStr}T${timeStr}:00`);
      if (isNaN(parsedDate.getTime())) {
        throw new Error('Invalid Date or Time values');
      }

      // Generate default structure: 4 sections & 4 tiers
      const sections: Section[] = [
        { id: 'front-rows', name: 'Front Rows (1-5)', capacity: parseInt(frontRowsCap) || 0, color: '#A855F7' },
        { id: 'rows-6-12', name: 'Rows 6-12', capacity: parseInt(rows6to12Cap) || 0, color: '#F59E0B' },
        { id: 'rows-13-20', name: 'Rows 13-20', capacity: parseInt(rows13to20Cap) || 0, color: '#3B82F6' },
        { id: 'general-standing', name: 'General Standing', capacity: parseInt(generalStandingCap) || 0, color: '#10B981' },
      ];

      const tiers: Tier[] = [
        { id: 'platinum', name: 'Platinum', color: '#A855F7', sectionIds: ['front-rows'] },
        { id: 'gold', name: 'Gold', color: '#F59E0B', sectionIds: ['rows-6-12'] },
        { id: 'silver', name: 'Silver', color: '#3B82F6', sectionIds: ['rows-13-20'] },
        { id: 'general', name: 'General', color: '#10B981', sectionIds: ['general-standing'] },
      ];

      const newEvent = {
        name,
        date: parsedDate,
        venue,
        status: 'draft' as const,
        tiers,
        sections,
      };

      if (!appUser?.orgId || !appUser?.uid) {
        throw new Error('User not logged in or missing org association');
      }

      await createEvent(appUser.orgId, appUser.uid, newEvent);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(admin)/events');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to create event. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalCard}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(admin)/events');
              }
            }}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create New Event</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Event Details Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Event Details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Event Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Ganesha Chaturthi 2026"
                placeholderTextColor="#9CA3AF"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Venue</Text>
              <TextInput
                style={styles.input}
                placeholder="Venue name"
                placeholderTextColor="#9CA3AF"
                value={venue}
                onChangeText={setVenue}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2026-06-17"
                  placeholderTextColor="#9CA3AF"
                  value={dateStr}
                  onChangeText={setDateStr}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Time (HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="18:00"
                  placeholderTextColor="#9CA3AF"
                  value={timeStr}
                  onChangeText={setTimeStr}
                />
              </View>
            </View>
          </View>

          {/* Seating Capacities Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Seating Sections & Capacities</Text>
            <Text style={styles.cardDescription}>
              Set maximum occupancies. Tiers (Platinum, Gold, Silver, General) are automatically linked.
            </Text>

            <View style={styles.capacityRow}>
              <View style={[styles.colorIndicator, { backgroundColor: '#A855F7' }]} />
              <Text style={styles.capacityLabel}>Front Rows (Platinum)</Text>
              <TextInput
                style={styles.capacityInput}
                keyboardType="numeric"
                value={frontRowsCap}
                onChangeText={setFrontRowsCap}
              />
            </View>

            <View style={styles.capacityRow}>
              <View style={[styles.colorIndicator, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.capacityLabel}>Rows 6-12 (Gold)</Text>
              <TextInput
                style={styles.capacityInput}
                keyboardType="numeric"
                value={rows6to12Cap}
                onChangeText={setRows6to12Cap}
              />
            </View>

            <View style={styles.capacityRow}>
              <View style={[styles.colorIndicator, { backgroundColor: '#3B82F6' }]} />
              <Text style={styles.capacityLabel}>Rows 13-20 (Silver)</Text>
              <TextInput
                style={styles.capacityInput}
                keyboardType="numeric"
                value={rows13to20Cap}
                onChangeText={setRows13to20Cap}
              />
            </View>

            <View style={styles.capacityRow}>
              <View style={[styles.colorIndicator, { backgroundColor: '#10B981' }]} />
              <Text style={styles.capacityLabel}>General Standing</Text>
              <TextInput
                style={styles.capacityInput}
                keyboardType="numeric"
                value={generalStandingCap}
                onChangeText={setGeneralStandingCap}
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                <Text style={styles.submitBtnText}>Create Event</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(42, 8, 14, 0.58)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 900,
    maxHeight: '92%',
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.45)',
    overflow: 'hidden',
    boxShadow: '0 24px 56px rgba(42, 8, 14, 0.32)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  scrollContent: {
    padding: 18,
    gap: 14,
    paddingBottom: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cardDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    height: 48,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  capacityLabel: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  capacityInput: {
    width: 80,
    height: 40,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D28D9',
    borderRadius: 14,
    height: 52,
    gap: 8,
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
