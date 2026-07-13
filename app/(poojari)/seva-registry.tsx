// app/(poojari)/seva-registry.tsx
// Poojari home screen — lists all Seva Lists the receptionist has shared.
// Tapping a list navigates to the event picker.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AdminHeader from '@/components/AdminHeader';
import { gsDark } from '@/constants/styles';
import { colors, fonts, fontSize, radius, spacing } from '@/constants/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeSevaLists } from '@/lib/firestore';
import { SevaList } from '@/lib/types';

export default function PoojariSevaRegistryScreen() {
  const { appUser, logout } = useAuth();
  const router = useRouter();
  const { adminPreview } = useLocalSearchParams<{ adminPreview?: string }>();
  const [sevaLists, setSevaLists] = useState<SevaList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isAdminPreview = adminPreview === '1';

  useEffect(() => {
    if (!appUser?.orgId) return;
    const unsub = subscribeSevaLists(appUser.orgId, (lists) => {
      setSevaLists(lists);
      setIsLoading(false);
    });
    return () => unsub();
  }, [appUser?.orgId]);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out of the Seva Registry?')) {
        logout();
      }
    } else {
      Alert.alert('Sign Out', 'Sign out of the Seva Registry?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', onPress: () => logout() },
      ]);
    }
  };

  const renderItem = ({ item }: { item: SevaList }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(poojari)/${item.id}` as any)}
      activeOpacity={0.8}
    >
      <View style={styles.cardIconWrap}>
        <Ionicons name="document-text-outline" size={28} color="#F97316" />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <Text style={styles.cardMeta}>
          Event column: <Text style={styles.cardMetaBold}>{item.eventColumn}</Text>
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <AdminHeader
        subtitle={`Navakundathmaka Shatha Chandi Sahitha Rudra Yagam · Seva View`}
        meta={`Namaste, ${appUser?.displayName?.split(' ')[0] || 'Poojari'}`}
        right={
          isAdminPreview ? (
            <TouchableOpacity onPress={() => router.replace('/(admin)/seva-registry' as any)}>
              <Text style={gsDark.link}>← Back</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={22} color={colors.gold} />
            </TouchableOpacity>
          )
        }
      />

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={styles.loadingText}>Loading seva lists…</Text>
        </View>
      ) : sevaLists.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={72} color="#FED7AA" />
          <Text style={styles.emptyTitle}>No Seva Lists Yet</Text>
          <Text style={styles.emptyText}>
            Please ask your receptionist to add a Seva List in the admin panel.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={sevaLists}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
  },
  greeting: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#C2410C',
    letterSpacing: -0.5,
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#7C3AED',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  list: { flex: 1, minHeight: 0 },
  listContent: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: spacing.xl, gap: spacing.md, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  cardDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  cardMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  cardMetaBold: {
    fontWeight: '600',
    color: '#F97316',
  },
});
