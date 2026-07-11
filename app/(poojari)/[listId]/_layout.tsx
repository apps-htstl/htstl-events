// app/(poojari)/[listId]/_layout.tsx
// Nested stack for event picker → card reader within a Seva List.

import { Stack } from 'expo-router';

export default function SevaListLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
