// app/_layout.tsx
// Root layout: wraps all screens in AuthProvider, handles splash screen,
// and redirects to the correct section based on auth state and user role.

import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "@/context/AuthContext";

// Prevent splash screen from hiding until fonts + auth state are ready
SplashScreen.preventAutoHideAsync();

// Inner component — has access to AuthContext
function RootLayoutNav() {
  const { appUser, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inAdminGroup = segments[0] === "(admin)";
    const inVolunteerGroup = segments[0] === "(volunteer)";
    const inPoojariGroup = segments[0] === "(poojari)";

    if (!appUser) {
      // Not signed in → send to login
      if (!inAuthGroup) {
        router.replace("/(auth)/login");
      }
      return;
    }

    // Signed in — route by role
    if (appUser.role === "superadmin" || appUser.role === "eventadmin") {
      // Superadmin/eventadmin → admin area by default.
      // BUT: allow superadmin to navigate into the poojari portal if they choose to.
      if (!inAdminGroup && !inPoojariGroup) {
        router.replace("/(admin)/home");
      }
    } else if (appUser.role === "poojari") {
      const inAdminPriestView = inAdminGroup && segments[1] === "priest-view";
      if (!inPoojariGroup && !inAdminPriestView) {
        router.replace("/(admin)/priest-view" as any);
      }
    } else {
      // volunteer
      if (!inVolunteerGroup) {
        router.replace("/(volunteer)/scan");
      }
    }
  }, [appUser, isLoading, segments]);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(volunteer)" />
        <Stack.Screen name="(poojari)" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

// Root layout wraps everything in the auth provider
export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    // Icon fonts — keys MUST exactly match the fontFamily the icon components use on web.
    // Ionicons.js: createIconSet(glyphMap, 'ionicons', font)
    // MaterialCommunityIcons.js: createIconSet(glyphMap, 'material-community', font)
    ionicons: require("../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"),
    "material-community": require("../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf"),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
