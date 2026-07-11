// app/(auth)/login.tsx
// Magic link login screen for HTSL Events.
// Volunteers and admins enter their email — a sign-in link is sent to their inbox.

import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
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

const EMAIL_KEY = 'htsl_pending_signin_email';
const TEST_ADMIN_EMAIL = 'testadmin@htsl.events';
const TEST_ADMIN_PASSWORD = 'HtstlEvents2026!';

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

function EmailSentIcon({ size, color }: { size: number; color: string }) {
  if (Platform.OS === 'web') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    );
  }
  return <MaterialCommunityIcons name="email-fast-outline" size={size} color={color} />;
}


export default function LoginScreen() {
  const { sendMagicLink, completeSignIn, signInWithPassword, appUser } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [pastedLink, setPastedLink] = useState('');

  // If user is already signed in, they shouldn't be here
  useEffect(() => {
    if (appUser) {
      if (appUser.role === 'superadmin' || appUser.role === 'eventadmin') {
        router.replace('/(admin)/events');
      } else {
        router.replace('/(volunteer)/scan');
      }
    }
  }, [appUser]);

  // Handle incoming deep links (from magic link email)
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const { url } = event;
      if (!url.includes('__/auth/action') && !url.includes('apiKey')) return;

      setIsCompleting(true);
      try {
        const storedEmail = await AsyncStorage.getItem(EMAIL_KEY);
        if (!storedEmail) {
          Alert.alert(
            'Email Required',
            'Please enter your email address to complete sign-in.',
          );
          setIsCompleting(false);
          return;
        }
        await completeSignIn(storedEmail, url);
        await AsyncStorage.removeItem(EMAIL_KEY);
      } catch (err: any) {
        Alert.alert('Sign-in Error', err.message ?? 'Could not complete sign-in.');
      } finally {
        setIsCompleting(false);
      }
    };

    // Check if app was opened via a link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, [completeSignIn]);

  const handleManualSignIn = async () => {
    if (!pastedLink.trim()) {
      Alert.alert('Empty Link', 'Please paste the link you copied from the email.');
      return;
    }

    setIsCompleting(true);
    try {
      const storedEmail = await AsyncStorage.getItem(EMAIL_KEY);
      const emailToUse = storedEmail ?? email.trim().toLowerCase();
      if (!emailToUse) {
        Alert.alert(
          'Email Required',
          'Please make sure you entered your email first.',
        );
        setIsCompleting(false);
        return;
      }
      await completeSignIn(emailToUse, pastedLink.trim());
      await AsyncStorage.removeItem(EMAIL_KEY);
    } catch (err: any) {
      Alert.alert('Sign-in Error', err.message ?? 'Could not complete sign-in.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSendLink = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setIsSending(true);
    try {
      if (trimmedEmail === TEST_ADMIN_EMAIL) {
        // Direct passwordless sign-in for the test admin account behind the scenes
        await signInWithPassword(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
      } else {
        // Normal magic link flow
        await sendMagicLink(trimmedEmail);
        await AsyncStorage.setItem(EMAIL_KEY, trimmedEmail);
        setLinkSent(true);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to sign in. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  if (isCompleting) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6D28D9" />
        <Text style={styles.loadingText}>Signing you in…</Text>
      </View>
    );
  }

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

        {linkSent ? (
          /* After sending the link — confirmation state */
          <View style={styles.sentContainer}>
            <View style={styles.sentIconWrapper}>
              <EmailSentIcon size={64} color="#7C3AED" />
            </View>
            <Text style={styles.sentTitle}>Check your inbox</Text>
            <Text style={styles.sentBody}>
              A sign-in link was sent to{'\n'}
              <Text style={styles.emailBold}>{email}</Text>
            </Text>
            <Text style={styles.sentHint}>
              Tap the link in the email to open the app and sign in automatically.
            </Text>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Manual Link Input (essential for testing in Expo Go) */}
            <View style={styles.manualContainer}>
              <Text style={styles.manualTitle}>Testing in Expo Go?</Text>
              <Text style={styles.manualBody}>
                If clicking the link doesn't open the app automatically, copy the URL from the email and paste it below:
              </Text>
              <TextInput
                style={styles.manualInput}
                placeholder="Paste the email link here..."
                placeholderTextColor="#9CA3AF"
                value={pastedLink}
                onChangeText={setPastedLink}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.manualButton}
                onPress={handleManualSignIn}
              >
                <Text style={styles.manualButtonText}>Verify & Sign In</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.resendButton}
              onPress={() => setLinkSent(false)}
            >
              <Text style={styles.resendText}>Use a different email</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Email entry form */
          <View style={styles.form}>
            <Text style={styles.formLabel}>Enter your email address</Text>
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
              onSubmitEditing={handleSendLink}
              returnKeyType="go"
            />
            <TouchableOpacity
              id="login-send-button"
              style={[styles.button, isSending && styles.buttonDisabled]}
              onPress={handleSendLink}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send Sign-in Link</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.disclaimer}>
              No password required. We'll email you a secure link to sign in.
            </Text>
          </View>
        )}
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
    fontFamily: 'SpaceMono',
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
  logoEmoji: {
    fontSize: 36,
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
  // Sent state
  sentContainer: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  sentIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  sentTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  sentBody: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  emailBold: {
    fontWeight: '700',
    color: '#374151',
  },
  sentHint: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  resendButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#6D28D9',
  },
  resendText: {
    color: '#6D28D9',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    width: '100%',
    marginVertical: 16,
  },
  manualContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  manualTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  manualBody: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 4,
  },
  manualInput: {
    width: '100%',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  manualButton: {
    width: '100%',
    backgroundColor: '#6D28D9',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  manualButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
