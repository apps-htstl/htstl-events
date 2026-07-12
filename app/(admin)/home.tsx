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

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.omSymbol}>
          <Text style={styles.omText}>ॐ</Text>
        </View>
        <Text style={styles.templeTitle}>Hindu Temple of St. Louis</Text>
        <Text style={styles.eventSubtitle}>
          Navakundathmaka Shatha Chandi Sahitha Rudra Yagam
        </Text>
        <Text style={styles.dateInfo}>
          July 14–19, 2026 · Seva & Sponsorship Registration System
        </Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.chooseSectionLabel}>Choose a screen</Text>

        {/* Grid of Navigation Cards */}
        <View style={styles.grid}>
          {/* Devotee Online Registration */}
          <TouchableOpacity
            style={styles.cardLight}
            onPress={() => router.push("/devotee-registration")}
          >
            <Text style={styles.cardTitle}>Devotee Online Registration</Text>
            <Text style={styles.cardDescription}>
              Browse sevas & sponsorship levels, enter name/gothram for
              sankalpam, and pay by card or PayPal — for devotees registering
              ahead of time.
            </Text>
          </TouchableOpacity>

          {/* Registration Desk */}
          <TouchableOpacity
            style={styles.cardLight}
            onPress={() => router.push("/walkin-admin")}
          >
            <Text style={styles.cardTitle}>Registration Desk (Staff)</Text>
            <Text style={styles.cardDescription}>
              Fast entry screen for temple staff assisting walk-in devotees
              during the event — records name, gothram, seva & payment method.
            </Text>
          </TouchableOpacity>

          {/* Self-Service Kiosk */}
          <TouchableOpacity
            style={styles.cardLight}
            onPress={() => router.push("/self-service-kiosk")}
          >
            <Text style={styles.cardTitle}>Self-Service Kiosk</Text>
            <Text style={styles.cardDescription}>
              Devotee-facing tablet kiosk for walk-ins to register themselves
              and pay via PayPal, with an emailed confirmation.
            </Text>
          </TouchableOpacity>

          {/* Priest Live Sankalpam View */}
          <TouchableOpacity
            style={styles.cardDark}
            onPress={() => router.push("/priest-view")}
          >
            <Text style={styles.cardTitleLight}>
              Priest Live Sankalpam View
            </Text>
            <Text style={styles.cardDescriptionLight}>
              Large-screen view for the priest — select day & seva to see
              names/gothram auto-scroll live as devotees register, tap to mark
              read.
            </Text>
          </TouchableOpacity>

          {/* Admin Dashboard - spans 2 columns */}
          <TouchableOpacity
            style={[styles.cardLight, styles.cardWide]}
            onPress={() => router.push("/users")}
          >
            <Text style={styles.cardTitle}>Event Admin Dashboard</Text>
            <Text style={styles.cardDescription}>
              Overview of all registrations by day, source and sponsorship
              level, with running totals for the organizing committee.
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tip Box */}
        <View style={styles.tipBox}>
          <Text style={styles.tipText}>
            <Text style={styles.tipBold}>Tip for demo:</Text> open the Priest
            View in one tab and Registration Desk or Kiosk in another — new
            walk-in registrations appear live on the priest's screen without a
            refresh, and disappear once tapped as read.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fbf5e9",
  },
  header: {
    backgroundColor: "rgb(87 5 19)",
    paddingVertical: 40,
    paddingHorizontal: 16,
    alignItems: "center",
    borderBottomWidth: 4,
    borderBottomColor: "#d4a83f",
  },
  omSymbol: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#d4a83f",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  omText: {
    fontFamily: "Cormorant Garamond",
    fontSize: 28,
    color: "#d4a83f",
  },
  templeTitle: {
    fontFamily: "Cormorant Garamond",
    fontSize: 28,
    fontWeight: "700",
    color: "#fbf5e9",
    marginBottom: 8,
    textAlign: "center",
  },
  eventSubtitle: {
    fontFamily: "Cormorant Garamond",
    fontSize: 18,
    color: "#e8c069",
    marginBottom: 6,
    textAlign: "center",
  },
  dateInfo: {
    fontSize: 12,
    color: "#c9b183",
    textAlign: "center",
  },
  content: {
    maxWidth: 1100,
    marginHorizontal: "auto",
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  chooseSectionLabel: {
    fontSize: 11,
    color: "#8a6a4e",
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },
  cardLight: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e6d4b0",
    borderRadius: 16,
    padding: 20,
  },
  cardWide: {
    minWidth: "100%",
  },
  cardDark: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgb(87 5 19)",
    borderWidth: 1,
    borderColor: "rgb(87 5 19)",
    borderRadius: 16,
    padding: 20,
  },
  cardTitle: {
    fontFamily: "Cormorant Garamond",
    fontSize: 18,
    fontWeight: "700",
    color: "rgb(87 5 19)",
  },
  cardTitleLight: {
    fontFamily: "Cormorant Garamond",
    fontSize: 18,
    fontWeight: "700",
    color: "#e8c069",
  },
  cardDescription: {
    fontSize: 12,
    color: "#6b4a38",
    marginTop: 8,
    lineHeight: 18,
  },
  cardDescriptionLight: {
    fontSize: 12,
    color: "#d8c297",
    marginTop: 8,
    lineHeight: 18,
  },
  tipBox: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fdf0e2",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#c9a25c",
    borderRadius: 12,
  },
  tipText: {
    fontSize: 12,
    color: "#6b4a38",
    lineHeight: 18,
  },
  tipBold: {
    fontWeight: "700",
  },
});
