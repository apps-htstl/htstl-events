// app/(admin)/events/[eventId]/seating.tsx
// Seating Section Capacity Management — modify section capacities and add/remove custom sections.

import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeEvent, updateEvent } from '@/lib/firestore';
import { HTSLEvent, Section, Tier } from '@/lib/types';

export default function SeatingScreen() {
  const { appUser } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<HTSLEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);

  // Editable lists
  const [sections, setSections] = useState<Section[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  
  // Custom section fields
  const [newSecName, setNewSecName] = useState('');
  const [newSecCap, setNewSecCap] = useState('100');
  const [showAddForm, setShowAddForm] = useState(false);

  // Custom tier fields
  const [newTierName, setNewTierName] = useState('');
  const [showAddTierForm, setShowAddTierForm] = useState(false);

  const TIER_COLORS = ['#A855F7', '#6366F1', '#EC4899', '#3B82F6', '#F59E0B', '#EF4444', '#10B981'];

  useEffect(() => {
    if (!appUser?.orgId || !eventId) return;

    setIsLoading(true);
    const unsubscribe = subscribeEvent(appUser.orgId, eventId, (fetchedEvent) => {
      if (fetchedEvent) {
        setEvent(fetchedEvent);
        setSections(fetchedEvent.sections);
        setTiers(fetchedEvent.tiers);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [appUser?.orgId, eventId]);

  const handleUpdateCapacity = (id: string, val: string) => {
    const numericCap = parseInt(val) || 0;
    setSections((current) =>
      current.map((sec) => (sec.id === id ? { ...sec, capacity: numericCap } : sec))
    );
  };

  const handleUpdateName = (id: string, val: string) => {
    setSections((current) =>
      current.map((sec) => (sec.id === id ? { ...sec, name: val } : sec))
    );
  };

  const handleUpdateTierName = (id: string, val: string) => {
    setTiers((current) =>
      current.map((t) => (t.id === id ? { ...t, name: val } : t))
    );
  };

  const handleToggleSectionAssignment = (tierId: string, sectionId: string) => {
    setTiers((current) =>
      current.map((t) => {
        if (t.id !== tierId) return t;
        const exists = t.sectionIds.includes(sectionId);
        const newSectionIds = exists
          ? t.sectionIds.filter((id) => id !== sectionId)
          : [...t.sectionIds, sectionId];
        return { ...t, sectionIds: newSectionIds };
      })
    );
  };

  const handleAddTier = () => {
    if (!newTierName.trim()) {
      Alert.alert('Validation Error', 'Tier Name is required');
      return;
    }

    const newId = newTierName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (tiers.some((t) => t.id === newId)) {
      Alert.alert('Duplicate', 'A tier with this name already exists.');
      return;
    }

    const existingColors = tiers.map(t => t.color.toUpperCase());
    const availableColor = TIER_COLORS.find(c => !existingColors.includes(c.toUpperCase())) || TIER_COLORS[Math.floor(Math.random() * TIER_COLORS.length)];

    const newTier: Tier = {
      id: newId,
      name: newTierName.trim(),
      color: availableColor,
      sectionIds: [],
    };

    setTiers([...tiers, newTier]);
    setNewTierName('');
    setShowAddTierForm(false);
  };

  const handleDeleteTier = (id: string) => {
    if (id === 'general') {
      Alert.alert('Error', 'The General tier is required and cannot be deleted.');
      return;
    }

    const performDelete = () => {
      setTiers(tiers.filter((t) => t.id !== id));
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'Remove Tier: Are you sure you want to remove this tier? Make sure no active registrations rely on it.'
      );
      if (confirmed) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Remove Tier',
        'Are you sure you want to remove this tier? Make sure no active registrations rely on it.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: performDelete,
          },
        ]
      );
    }
  };

  const handleAddSection = () => {
    if (!newSecName.trim()) {
      Alert.alert('Validation Error', 'Section Name is required');
      return;
    }

    const newId = newSecName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (sections.some((sec) => sec.id === newId)) {
      Alert.alert('Duplicate', 'A section with this name already exists.');
      return;
    }

    const newSection: Section = {
      id: newId,
      name: newSecName.trim(),
      capacity: parseInt(newSecCap) || 100,
      color: '#4B5563', // default gray color
    };

    setSections([...sections, newSection]);
    setNewSecName('');
    setNewSecCap('100');
    setShowAddForm(false);
  };

  const handleDeleteSection = (id: string) => {
    const performDelete = () => {
      setSections(sections.filter((sec) => sec.id !== id));
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'Remove Section: Are you sure you want to remove this seating section? Make sure no active registrations rely on its corresponding tier.'
      );
      if (confirmed) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Remove Section',
        'Are you sure you want to remove this seating section? Make sure no active registrations rely on its corresponding tier.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: performDelete,
          },
        ]
      );
    }
  };

  const handleSaveChanges = async () => {
    if (!appUser?.orgId || !event) return;

    try {
      setSaveLoading(true);

      // Verify and update corresponding Tiers if sections were deleted
      // For any deleted section, we remove it from Tier sectionIds
      const updatedTiers = tiers.map((tier) => {
        const filteredSectionIds = tier.sectionIds.filter((secId) =>
          sections.some((s) => s.id === secId)
        );
        return { ...tier, sectionIds: filteredSectionIds };
      });

      // If a new section was added, let's map it to the General tier or create a new tier if appropriate.
      // For now, we will add any unassigned sections to the 'General' tier automatically so they are check-in ready!
      const finalTiers = updatedTiers.map((tier) => {
        if (tier.id === 'general') {
          // Find any section that is not in any other tier's sectionIds
          const allAssigned = updatedTiers
            .filter((t) => t.id !== 'general')
            .flatMap((t) => t.sectionIds);
          
          const unassignedSecs = sections
            .filter((sec) => !allAssigned.includes(sec.id))
            .map((sec) => sec.id);

          return {
            ...tier,
            sectionIds: Array.from(new Set([...tier.sectionIds, ...unassignedSecs])),
          };
        }
        return tier;
      });

      await updateEvent(appUser.orgId, event.id, {
        sections,
        tiers: finalTiers,
      });

      Alert.alert('Success', 'Seating configuration saved successfully');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to update seating configuration');
    } finally {
      setSaveLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6D28D9" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            router.replace(`/(admin)/events/${eventId}` as any);
          }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Seating Configuration</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#4B5563" />
          <Text style={styles.infoText}>
            Set the capacity limit for each section. Section caps represent soft limits. Volunteers will receive a warning if capacity is exceeded.
          </Text>
        </View>

        {/* Sections List */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sections & Soft Limits</Text>

          {sections.map((sec) => (
            <View key={sec.id} style={styles.sectionRow}>
              <View style={styles.sectionLeft}>
                <View style={[styles.colorIndicator, { backgroundColor: sec.color || '#D97706' }]} />
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={styles.sectionNameInput}
                    value={sec.name}
                    onChangeText={(val) => handleUpdateName(sec.id, val)}
                    placeholder="Section Name"
                  />
                  <Text style={styles.sectionId}>ID: {sec.id}</Text>
                </View>
              </View>

              <View style={styles.sectionRight}>
                <TextInput
                  style={styles.capacityInput}
                  keyboardType="numeric"
                  value={sec.capacity.toString()}
                  onChangeText={(val) => handleUpdateCapacity(sec.id, val)}
                />
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteSection(sec.id)}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Add Section toggle button */}
          {!showAddForm && (
            <TouchableOpacity style={styles.addSectionToggle} onPress={() => setShowAddForm(true)}>
              <Ionicons name="add" size={18} color="#6D28D9" />
              <Text style={styles.addSectionToggleText}>Add Custom Section</Text>
            </TouchableOpacity>
          )}

          {/* Add Section Form */}
          {showAddForm && (
            <View style={styles.addSectionForm}>
              <Text style={styles.addSectionTitle}>New Custom Section</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Section Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Balcony B"
                  value={newSecName}
                  onChangeText={setNewSecName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Capacity</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="100"
                  value={newSecCap}
                  onChangeText={setNewSecCap}
                />
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelFormBtn} onPress={() => setShowAddForm(false)}>
                  <Text style={styles.cancelFormText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitFormBtn} onPress={handleAddSection}>
                  <Text style={styles.submitFormText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Tiers summary */}
        {event && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tiers & Section Assignments</Text>
            <Text style={styles.cardDescription}>
              Edit the names of your tiers (e.g. general, priority) and toggle which seating sections map to them below.
            </Text>

            {tiers.map((tier) => (
              <View key={tier.id} style={styles.tierItem}>
                <View style={styles.tierHeader}>
                  <View style={[styles.colorIndicator, { backgroundColor: tier.color }]} />
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.tierNameInput}
                      value={tier.name}
                      onChangeText={(val) => handleUpdateTierName(tier.id, val)}
                      placeholder="Tier Name"
                    />
                  </View>
                  {tier.id !== 'general' && (
                    <TouchableOpacity
                      style={styles.deleteTierBtn}
                      onPress={() => handleDeleteTier(tier.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
                
                <View style={styles.sectionAssignmentRow}>
                  <Text style={styles.sectionAssignmentLabel}>Maps to Seating Sections:</Text>
                  <View style={styles.tagsContainer}>
                    {sections.map((sec) => {
                      const isAssigned = tier.sectionIds.includes(sec.id);
                      return (
                        <TouchableOpacity
                          key={sec.id}
                          style={[
                            styles.sectionTag,
                            isAssigned && { backgroundColor: tier.color, borderColor: tier.color }
                          ]}
                          onPress={() => handleToggleSectionAssignment(tier.id, sec.id)}
                        >
                          <Text style={[styles.sectionTagText, isAssigned && styles.sectionTagTextActive]}>
                            {sec.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {sections.length === 0 && (
                      <Text style={styles.noSectionsText}>No seating sections created yet.</Text>
                    )}
                  </View>
                </View>
              </View>
            ))}

            {/* Add Tier toggle button */}
            {!showAddTierForm && (
              <TouchableOpacity style={styles.addSectionToggle} onPress={() => setShowAddTierForm(true)}>
                <Ionicons name="add" size={18} color="#6D28D9" />
                <Text style={styles.addSectionToggleText}>Add Custom Tier</Text>
              </TouchableOpacity>
            )}

            {/* Add Tier Form */}
            {showAddTierForm && (
              <View style={styles.addSectionForm}>
                <Text style={styles.addSectionTitle}>New Custom Tier</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Tier Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. VVIP"
                    value={newTierName}
                    onChangeText={setNewTierName}
                  />
                </View>

                <View style={styles.formActions}>
                  <TouchableOpacity style={styles.cancelFormBtn} onPress={() => setShowAddTierForm(false)}>
                    <Text style={styles.cancelFormText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.submitFormBtn} onPress={handleAddTier}>
                    <Text style={styles.submitFormText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSaveChanges}
          disabled={saveLoading}
        >
          {saveLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#FFF" />
              <Text style={styles.saveBtnText}>Save Configuration</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    gap: 16,
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
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  sectionNameInput: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: 'transparent',
    minWidth: 120,
    outlineStyle: 'none',
  } as any,
  sectionId: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  capacityInput: {
    width: 70,
    height: 36,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  deleteBtn: {
    padding: 4,
  },
  addSectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 10,
    height: 40,
    gap: 6,
    marginTop: 8,
  },
  addSectionToggleText: {
    color: '#6D28D9',
    fontSize: 14,
    fontWeight: '600',
  },
  addSectionForm: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  addSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  inputGroup: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  input: {
    height: 40,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#111827',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  cancelFormBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelFormText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  submitFormBtn: {
    backgroundColor: '#6D28D9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  submitFormText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tierItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierNameInput: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: 'transparent',
    minWidth: 120,
    outlineStyle: 'none',
  } as any,
  sectionAssignmentRow: {
    marginTop: 8,
    marginLeft: 20,
    gap: 6,
  },
  sectionAssignmentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  sectionTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  sectionTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  sectionTagTextActive: {
    color: '#FFF',
  },
  noSectionsText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#9CA3AF',
  },
  deleteTierBtn: {
    padding: 4,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D28D9',
    borderRadius: 12,
    height: 48,
    gap: 8,
    marginTop: 8,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
