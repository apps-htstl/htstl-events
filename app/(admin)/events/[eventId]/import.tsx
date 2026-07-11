// app/(admin)/events/[eventId]/import.tsx
// CSV Import Wizard — Pick CSV, map columns, preview rows, and batch write to Firestore.

import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { collection, doc, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

// Safe CSV parser that handles double quotes
function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentVal.trim());
      if (row.length > 0 && row.some((x) => x !== '')) {
        result.push(row);
      }
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    if (row.some((x) => x !== '')) {
      result.push(row);
    }
  }
  return result;
}

interface FieldMapping {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tier: string;
  partySize: string;
  notes: string;
}

export default function CSVImportScreen() {
  const { appUser } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();

  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'importing' | 'success'>('upload');
  const [fileName, setFileName] = useState('');
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  
  // Mapping of system fields to CSV column header indexes (as string representations of numbers, e.g. "0")
  const [mappings, setMappings] = useState<FieldMapping>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    tier: '',
    partySize: '',
    notes: '',
  });

  const [importProgress, setImportProgress] = useState(0);
  const [totalToImport, setTotalToImport] = useState(0);

  // Pick CSV File
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      setFileName(file.name);

      let content = '';
      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        content = await response.text();
      } else {
        content = await readAsStringAsync(file.uri);
      }
      const parsed = parseCSV(content);

      if (parsed.length < 2) {
        Alert.alert('Invalid File', 'CSV must contain at least a header row and one data row.');
        return;
      }

      const fileHeaders = parsed[0];
      setCsvData(parsed.slice(1));
      setHeaders(fileHeaders);

      // Auto-detect mappings based on header text
      const newMappings = { ...mappings };
      fileHeaders.forEach((header, index) => {
        const text = header.toLowerCase().replace(/[\s_-]/g, '');
        const indexStr = index.toString();

        if (text.includes('first') || text === 'name' || text === 'fname') {
          newMappings.firstName = indexStr;
        } else if (text.includes('last') || text === 'lname' || text === 'surname') {
          newMappings.lastName = indexStr;
        } else if (text.includes('email') || text === 'mail') {
          newMappings.email = indexStr;
        } else if (text.includes('phone') || text.includes('mobile') || text === 'tel') {
          newMappings.phone = indexStr;
        } else if (text.includes('tier') || text.includes('sponsor') || text === 'level') {
          newMappings.tier = indexStr;
        } else if (text.includes('party') || text.includes('guests') || text.includes('size') || text.includes('count')) {
          newMappings.partySize = indexStr;
        } else if (text.includes('note') || text.includes('comment') || text.includes('diet')) {
          newMappings.notes = indexStr;
        }
      });

      setMappings(newMappings);
      setStep('map');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to read the file.');
    }
  };

  const validateMappings = () => {
    if (mappings.firstName === '' || mappings.lastName === '') {
      Alert.alert('Mapping Error', 'First Name and Last Name columns must be mapped.');
      return false;
    }
    if (mappings.email === '' && mappings.phone === '') {
      Alert.alert('Mapping Error', 'You must map either Email or Phone to deliver tickets.');
      return false;
    }
    return true;
  };

  const getMappedRow = (row: string[]) => {
    const getValue = (fieldKey: keyof FieldMapping) => {
      const idx = mappings[fieldKey];
      return idx !== '' ? row[parseInt(idx)] : '';
    };

    return {
      firstName: getValue('firstName'),
      lastName: getValue('lastName'),
      email: getValue('email'),
      phone: getValue('phone'),
      tier: getValue('tier') || 'General',
      partySize: parseInt(getValue('partySize')) || 1,
      notes: getValue('notes'),
    };
  };

  const handleStartImport = async () => {
    if (!appUser?.orgId || !eventId) return;

    try {
      setStep('importing');
      setTotalToImport(csvData.length);
      setImportProgress(0);

      // Write in batches of 250 (Firestore limit is 500, using 250 for safety)
      const batchSize = 250;
      let batch = writeBatch(db);
      let countInBatch = 0;

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        const data = getMappedRow(row);

        const regRef = doc(collection(db, 'orgs', appUser.orgId, 'events', eventId, 'registrations'));
        batch.set(regRef, {
          eventId,
          orgId: appUser.orgId,
          ...data,
          checkedInCount: 0,
          checkins: [],
          qrStatus: { generated: false },
          createdAt: Timestamp.now(),
        });

        countInBatch++;

        if (countInBatch === batchSize || i === csvData.length - 1) {
          await batch.commit();
          setImportProgress(i + 1);
          batch = writeBatch(db);
          countInBatch = 0;
        }
      }

      setStep('success');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'An error occurred during import.');
      setStep('preview');
    }
  };

  // Helper to render dropdown picker options
  const renderMappingOption = (field: keyof FieldMapping, label: string, required = false) => {
    const currentValIdx = mappings[field];

    return (
      <View style={styles.mappingRow}>
        <View style={styles.fieldInfo}>
          <Text style={styles.fieldLabel}>
            {label} {required && <Text style={{ color: '#EF4444' }}>*</Text>}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionScroll}>
          <TouchableOpacity
            style={[styles.optionChip, currentValIdx === '' && styles.optionChipSelected]}
            onPress={() => setMappings({ ...mappings, [field]: '' })}
          >
            <Text style={[styles.optionText, currentValIdx === '' && styles.optionTextSelected]}>
              (Skip)
            </Text>
          </TouchableOpacity>

          {headers.map((header, idx) => {
            const idxStr = idx.toString();
            const isSelected = currentValIdx === idxStr;

            return (
              <TouchableOpacity
                key={idx}
                style={[styles.optionChip, isSelected && styles.optionChipSelected]}
                onPress={() => setMappings({ ...mappings, [field]: idxStr })}
              >
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {header}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
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
              router.replace(`/(admin)/events/${eventId}/registrations`);
            }
          }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CSV Import Wizard</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Step 1: Upload File */}
      {step === 'upload' && (
        <View style={styles.centerBox}>
          <Ionicons name="document-text-outline" size={80} color="#D1D5DB" />
          <Text style={styles.stepTitle}>Select Registrants Spreadsheet</Text>
          <Text style={styles.stepDesc}>
            Upload a CSV file containing your attendee registrations list.
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={handlePickFile}>
            <Ionicons name="attach" size={20} color="#FFF" />
            <Text style={styles.primaryBtnText}>Select CSV File</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2: Map Columns */}
      {step === 'map' && (
        <View style={{ flex: 1 }}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>Map CSV Headers</Text>
            <Text style={styles.stepDesc}>
              Select which CSV column maps to the corresponding event fields.
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.mappingsList}>
            {renderMappingOption('firstName', 'First Name', true)}
            {renderMappingOption('lastName', 'Last Name', true)}
            {renderMappingOption('email', 'Email Address')}
            {renderMappingOption('phone', 'Phone Number')}
            {renderMappingOption('tier', 'Seating Tier')}
            {renderMappingOption('partySize', 'Party Size')}
            {renderMappingOption('notes', 'Notes / Preferences')}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => validateMappings() && setStep('preview')}>
              <Text style={styles.primaryBtnText}>Preview Data</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 3: Preview Data */}
      {step === 'preview' && (
        <View style={{ flex: 1 }}>
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>Preview Import ({csvData.length} records)</Text>
            <Text style={styles.stepDesc}>
              Verify the mappings look correct below before submitting to database.
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.previewList}>
            <Text style={styles.previewSub}>Previewing first 3 rows:</Text>
            {csvData.slice(0, 3).map((row, idx) => {
              const item = getMappedRow(row);
              return (
                <View key={idx} style={styles.previewCard}>
                  <Text style={styles.previewName}>
                    {item.firstName} {item.lastName}
                  </Text>
                  <Text style={styles.previewContact}>
                    {item.email || 'No Email'} • {item.phone || 'No Phone'}
                  </Text>
                  <Text style={styles.previewMeta}>
                    Tier: {item.tier} • Party: {item.partySize}
                  </Text>
                  {item.notes ? <Text style={styles.previewNotes}>Notes: {item.notes}</Text> : null}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('map')}>
              <Text style={styles.secondaryBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 1.5 }]} onPress={handleStartImport}>
              <Text style={styles.primaryBtnText}>Import {csvData.length} Attendees</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 4: Importing Progress */}
      {step === 'importing' && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#6D28D9" />
          <Text style={styles.stepTitle}>Importing Registrants...</Text>
          <Text style={styles.stepDesc}>
            Writing to database. Do not close the app.
          </Text>

          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(importProgress / totalToImport) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {importProgress} of {totalToImport} imported
          </Text>
        </View>
      )}

      {/* Step 5: Success */}
      {step === 'success' && (
        <View style={styles.centerBox}>
          <Ionicons name="checkmark-circle" size={80} color="#10B981" />
          <Text style={styles.stepTitle}>Import Completed! 🎉</Text>
          <Text style={styles.stepDesc}>
            {totalToImport} attendees have been imported successfully and are ready for ticketing.
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace(`/(admin)/events/${eventId}`)}>
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
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
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  stepHeader: {
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  stepDesc: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D28D9',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 24,
    gap: 8,
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    height: 48,
  },
  secondaryBtnText: {
    color: '#4B5563',
    fontSize: 15,
    fontWeight: '700',
  },
  mappingsList: {
    paddingVertical: 12,
  },
  mappingRow: {
    backgroundColor: '#FFF',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 8,
  },
  fieldInfo: {
    paddingHorizontal: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  optionScroll: {
    paddingLeft: 16,
    flexDirection: 'row',
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  optionChipSelected: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  optionText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#FFF',
  },
  footer: {
    padding: 20,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footerRow: {
    padding: 20,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    gap: 12,
  },
  previewList: {
    padding: 20,
    gap: 12,
  },
  previewSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  previewCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  previewName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  previewContact: {
    fontSize: 13,
    color: '#4B5563',
  },
  previewMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  previewNotes: {
    fontSize: 12,
    color: '#D97706',
    fontStyle: 'italic',
    marginTop: 4,
  },
  progressBar: {
    width: '80%',
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 16,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6D28D9',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
});
