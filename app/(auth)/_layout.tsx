// app/(auth)/_layout.tsx
// Simple stack layout wrapping the auth screens (login, email sent confirmation)

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
