// app/(admin)/seva/_layout.tsx
// Stack navigator for the admin's embedded Seva view.

import { Stack } from 'expo-router';

export default function AdminSevaLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
