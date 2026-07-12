// app/(auth)/login.tsx
// Email & Password login screen for HTSL Events.

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Platform-aware icons: clean SVGs on web, vector icons on native
function TempleIcon({ size, color }: { size: number; color: string }) {
  if (Platform.OS === 'web') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: 'block' }}>
        <path d="M2 22h20v-2H2v2z M4 20h14v-6H4v6z M6 14h12v-4H6v4z M8 10h8v-3H8v3z M11 7h2V4h-2v3z M12 2l-1 2h2l-1-2z M10 20v-4h4v4h-4z" />
      </svg>
    );
  }
  return <MaterialCommunityIcons name="temple-hindu" size={size} color={color} />;
}

function EyeIcon({ visible, size, color }: { visible: boolean; size: number; color: string }) {
  if (Platform.OS === 'web') {
    if (visible) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      );
    }
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return <MaterialCommunityIcons name={visible ? 'eye-off-outline' : 'eye-outline'} size={size} color={color} />;
}

export default function LoginScreen() {
  const { signInWithPassword, appUser } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [secureTextEntry, setSecureTextEntry] = useState(true);

  // If user is already signed in, redirect them based on role
  useEffect(() => {
    if (appUser) {
      if (appUser.role === 'superadmin' || appUser.role === 'eventadmin') {
        router.replace('/(admin)/events');
      } else if (appUser.role === 'poojari') {
        router.replace('/(poojari)/seva-registry' as any);
      } else {
        // volunteer and all other roles
        router.replace('/(volunteer)/scan');
      }
    }
  }, [appUser]);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!password) {
      Alert.alert('Password Required', 'Please enter your password.');
      return;
    }

    setIsSigningIn(true);
    try {
      await signInWithPassword(trimmedEmail, password);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* Logo / Header */}
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <TempleIcon size={40} color="#7C3AED" />
          </View>
          <Text style={styles.title}>HTSL Events</Text>
          <Text style={styles.subtitle}>Hindu Temple of St. Louis</Text>
        </View>

        {/* Email & Password Form */}
        <View style={styles.form}>
          <Text style={styles.formLabel}>Email Address</Text>
          <TextInput
            id="login-email-input"
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.formLabel}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              id="login-password-input"
              style={styles.passwordInput}
              placeholder="Enter password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={secureTextEntry}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleSignIn}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setSecureTextEntry(!secureTextEntry)}
            >
              <EyeIcon visible={secureTextEntry} size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            id="login-send-button"
            style={[styles.button, isSigningIn && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={isSigningIn}
          >
            {isSigningIn ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  form: {
    gap: 12,
  },
  formLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  eyeButton: {
    padding: 4,
  },
  button: {
    backgroundColor: '#6D28D9',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  disclaimer: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
