// app/(admin)/settings.tsx
// Admin settings screen.

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { colors, fonts, fontSize, spacing, radius } from '@/constants/theme';
import { gs } from '@/constants/styles';

export default function SettingsScreen() {
  const { appUser, logout } = useAuth();

  return (
    <View style={gs.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{appUser?.displayName ?? '—'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{appUser?.email ?? '—'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>{appUser?.role ?? '—'}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { 
    fontFamily: fonts.serif,
    fontSize: fontSize.h1, 
    fontWeight: '700', 
    color: colors.primary 
  },
  section: { padding: spacing.xl, gap: spacing.md },
  sectionTitle: { 
    fontFamily: fonts.sans,
    fontSize: fontSize.label, 
    fontWeight: '700', 
    color: colors.muted, 
    textTransform: 'uppercase', 
    letterSpacing: 0.8 
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { 
    fontFamily: fonts.sans,
    fontSize: fontSize.body, 
    color: colors.body, 
    fontWeight: '500' 
  },
  value: { 
    fontFamily: fonts.sans,
    fontSize: fontSize.body, 
    color: colors.heading, 
    fontWeight: '600' 
  },
  logoutButton: {
    margin: spacing.xl,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
  },
  logoutText: { 
    fontFamily: fonts.sans,
    color: colors.danger, 
    fontSize: fontSize.body, 
    fontWeight: '600' 
  },
});
