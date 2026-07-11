// app/(admin)/seva/index.tsx
// Seva view for superadmin — identical UX to the Poojari Seva Registry home,
// but embedded inside the admin tab bar. Lists all Seva Lists so the superadmin
// can browse them and open the card reader.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { subscribeSevaLists } from '@/lib/firestore';
import { SevaList } from '@/lib/types';

export default function AdminSevaIndexScreen() {
  const { appUser } = useAuth();
  const router = useRouter();
  const [sevaLists, setSevaLists] = useState<SevaList[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!appUser?.orgId) return;
    const unsub = subscribeSevaLists(appUser.orgId, (lists) => {
      setSevaLists(lists);
      setIsLoading(false);
    });
    return () => unsub();
  }, [appUser?.orgId]);

  const renderItem = ({ item }: { item: SevaList }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(admin)/seva/${item.id}` as any)}
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
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🕉️ Seva View</Text>
          <Text style={styles.headerSub}>Browse and track seva entries as Poojari</Text>
        </View>
      </View>

      {/* Body */}
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
            Add a Google Sheet in the "Seva Registry" tab first.
          </Text>
          <TouchableOpacity
            style={styles.goManageBtn}
            onPress={() => router.push('/(admin)/seva-registry' as any)}
          >
            <Ionicons name="settings-outline" size={16} color="#F97316" />
            <Text style={styles.goManageBtnText}>Manage Seva Registry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sevaLists}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF7ED' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#C2410C',
    letterSpacing: -0.5,
  },
  headerSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 14, color: '#9CA3AF' },
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
    color: '#374151',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  goManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  goManageBtnText: { fontSize: 14, fontWeight: '700', color: '#F97316' },
  listContent: { padding: 16, gap: 12 },
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
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  cardDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  cardMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  cardMetaBold: { fontWeight: '600', color: '#F97316' },
});
