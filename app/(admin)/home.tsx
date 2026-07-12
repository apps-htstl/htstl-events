// app/(admin)/home.tsx
// Home page - Event Navigation Hub

import { useRouter } from "expo-router";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { gs } from "@/constants/styles";
import { spacing } from "@/constants/theme";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView style={gs.screen} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={gs.headerBand}>
        <View style={gs.omCircle}>
          <Text style={gs.omGlyph}>ॐ</Text>
        </View>
        <Text style={gs.headerTitle}>Hindu Temple of St. Louis</Text>
        <Text style={gs.headerSubtitle}>
          Navakundathmaka Shatha Chandi Sahitha Rudra Yagam
        </Text>
        <Text style={gs.headerMeta}>
          July 14–19, 2026 · Seva & Sponsorship Registration System
        </Text>
      </View>

      {/* Content */}
      <View style={gs.content}>
        <Text style={gs.sectionLabel}>Choose a screen</Text>

        {/* Grid of Navigation Cards */}
        <View style={styles.grid}>
          {/* Devotee Online Registration */}
          <TouchableOpacity
            style={[gs.card, styles.gridItem]}
            onPress={() => router.push("/devotee-registration")}
          >
            <Text style={gs.cardTitle}>Devotee Online Registration</Text>
            <Text style={gs.cardBody}>
              Browse sevas & sponsorship levels, enter name/gothram for
              sankalpam, and pay by card or PayPal — for devotees registering
              ahead of time.
            </Text>
          </TouchableOpacity>

          {/* Registration Desk */}
          <TouchableOpacity
            style={[gs.card, styles.gridItem]}
            onPress={() => router.push("/walkin-admin")}
          >
            <Text style={gs.cardTitle}>Registration Desk (Staff)</Text>
            <Text style={gs.cardBody}>
              Fast entry screen for temple staff assisting walk-in devotees
              during the event — records name, gothram, seva & payment method.
            </Text>
          </TouchableOpacity>

          {/* Self-Service Kiosk */}
          <TouchableOpacity
            style={[gs.card, styles.gridItem]}
            onPress={() => router.push("/self-service-kiosk")}
          >
            <Text style={gs.cardTitle}>Self-Service Kiosk</Text>
            <Text style={gs.cardBody}>
              Devotee-facing tablet kiosk for walk-ins to register themselves
              and pay via PayPal, with an emailed confirmation.
            </Text>
          </TouchableOpacity>

          {/* Priest Live Sankalpam View */}
          <TouchableOpacity
            style={[gs.cardDark, styles.gridItem]}
            onPress={() => router.push("/priest-view")}
          >
            <Text style={gs.cardDarkTitle}>Priest Live Sankalpam View</Text>
            <Text style={gs.cardDarkBody}>
              Large-screen view for the priest — select day & seva to see
              names/gothram live as devotees register, tap to mark read.
            </Text>
          </TouchableOpacity>

          {/* Admin Dashboard - spans 2 columns */}
          <TouchableOpacity
            style={[gs.card, styles.gridItem, styles.gridItemWide]}
            onPress={() => router.push("/users")}
          >
            <Text style={gs.cardTitle}>Event Admin Dashboard</Text>
            <Text style={gs.cardBody}>
              Overview of all registrations by day, source and sponsorship
              level, with running totals for the organizing committee.
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tip Box */}
        <View style={gs.tipBox}>
          <Text style={gs.tipText}>
            <Text style={gs.tipBold}>Tip for demo:</Text> open the Priest
            View in one tab and Registration Desk or Kiosk in another — new
            walk-in registrations appear live on the priest's screen without a
            refresh, and disappear once tapped as read.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// Only layout specific to this screen lives here — all colors, fonts and
// component looks come from the shared theme.
const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginBottom: spacing.xl + 4,
  },
  gridItem: {
    flex: 1,
    minWidth: "45%",
  },
  gridItemWide: {
    minWidth: "100%",
  },
});
