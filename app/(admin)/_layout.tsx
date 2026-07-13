// app/(admin)/_layout.tsx
// Admin tab navigator — shows Events, Seva Registry, and Settings tabs.

import { useAuth } from "@/context/AuthContext";
import { alpha, colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

export default function AdminLayout() {
  const { appUser } = useAuth();
  const isSuperAdmin = appUser?.role === "superadmin";
  const isPoojari = appUser?.role === "poojari";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.dark.bg,
        tabBarInactiveTintColor: alpha(colors.dark.bg, 0.55),
        tabBarStyle: {
          backgroundColor: colors.navBg,
          borderTopColor: colors.tipBorder,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === "ios" ? 20 : 8,
          height: Platform.OS === "ios" ? 80 : 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          href: isPoojari ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          href: isPoojari ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="seva-registry"
        options={{
          title: "Seva Registry",
          href: isPoojari ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="seva"
        options={{
          title: "Seva View",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flame-outline" size={size} color={color} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("priest-view");
          },
        })}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: "Users",
          href: isSuperAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Priest Live Sankalpam View — full-screen page, not a tab */}
      <Tabs.Screen
        name="priest-view"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          href: isPoojari ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
