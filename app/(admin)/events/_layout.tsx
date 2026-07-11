// app/(admin)/events/_layout.tsx
// Stack navigator for all admin event screens (Events list, event detail sub-screens).

import { Stack } from 'expo-router';

export default function EventsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" />
      <Stack.Screen name="[eventId]/index" />
      <Stack.Screen name="[eventId]/registrations" />
      <Stack.Screen name="[eventId]/import" />
      <Stack.Screen name="[eventId]/seating" />
      <Stack.Screen name="[eventId]/volunteers" />
      <Stack.Screen name="[eventId]/send-tickets" />
    </Stack>
  );
}
