// app/(admin)/events/_layout.tsx
// Stack navigator for all admin event screens (Events list, event detail sub-screens).

import { Stack } from 'expo-router';

const modalOptions = {
  presentation: 'transparentModal' as const,
  animation: 'fade' as const,
  contentStyle: { backgroundColor: 'transparent' },
  webModalStyle: {
    width: '92vw',
    height: '88dvh',
    minWidth: 320,
    minHeight: 420,
    border: '1px solid rgba(212, 160, 23, 0.35)',
    overlayBackground: 'rgba(42, 8, 14, 0.58)',
    shadow: 'drop-shadow(0 24px 48px rgba(42, 8, 14, 0.28))',
  },
};

export default function EventsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={modalOptions} />
      <Stack.Screen name="[eventId]/index" />
      <Stack.Screen name="[eventId]/registrations" options={modalOptions} />
      <Stack.Screen name="[eventId]/import" options={modalOptions} />
      <Stack.Screen name="[eventId]/seating" options={modalOptions} />
      <Stack.Screen name="[eventId]/volunteers" options={modalOptions} />
      <Stack.Screen name="[eventId]/send-tickets" options={modalOptions} />
    </Stack>
  );
}
