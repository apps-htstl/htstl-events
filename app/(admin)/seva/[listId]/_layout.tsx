// app/(admin)/seva/[listId]/_layout.tsx
// Nested stack for event picker and card reader within admin Seva view.

import { Stack } from 'expo-router';

export default function AdminSevaListLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
