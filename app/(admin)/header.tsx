// app/(admin)/header.tsx
// Reusable admin header component based on the Devotee Registration design.

import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type AdminHeaderProps = {
  title?: string;
  subtitle?: string;
  metaText?: string;
  backHref?: string;
  backLabel?: string;
};

export default function AdminHeader({
  title = "Hindu Temple of St. Louis",
  subtitle = "Navakundathmaka Shatha Chandi Sahitha Rudra Yagam",
  metaText = "July 14–19, 2026 · Seva & Sponsorship Registration System",
  backHref,
  backLabel = "Back to Home",
}: AdminHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>ॐ</Text>
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {metaText ? <Text style={styles.meta}>{metaText}</Text> : null}
        </View>
        {backHref ? (
          <TouchableOpacity
            style={styles.linkWrapper}
            onPress={() => router.push(backHref as any)}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>{backLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "rgb(87 5 19)",
    paddingVertical: 22,
    paddingHorizontal: 24,
    borderBottomWidth: 4,
    borderBottomColor: "#d4a83f",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#d4a83f",
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    fontFamily: "Cormorant Garamond",
    fontSize: 22,
    color: "#d4a83f",
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontFamily: "Cormorant Garamond",
    fontSize: 24,
    fontWeight: "700",
    color: "#fbf5e9",
  },
  subtitle: {
    fontSize: 13,
    color: "#e8c069",
    marginTop: 2,
  },
  meta: {
    fontSize: 12,
    color: "#c9b183",
    marginTop: 4,
  },
  linkWrapper: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  linkText: {
    color: "#e8c069",
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
