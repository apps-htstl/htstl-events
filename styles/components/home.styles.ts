// Home page component styles with reusable theme
// Demonstrates the design from Home.html implemented in a reusable React Native component

import { StyleSheet } from "react-native";

// Define theme colors and values inline (can be imported from theme.scss in web projects)
export const THEME = {
  colors: {
    // Primary
    primaryDark: "rgb(87 5 19)",
    primaryMedium: "#5a1a2e",
    primaryLight: "#8b3a4e",

    // Accent
    accentGold: "#d4a83f",
    accentOrange: "#f97316",

    // Secondary
    secondaryGreen: "#059669",
    secondaryPurple: "#6d28d9",

    // Neutrals
    white: "#ffffff",
    black: "#000000",
    gray50: "#f9fafb",
    gray100: "#f3f4f6",
    gray200: "#e5e7eb",
    gray300: "#d1d5db",
    gray400: "#9ca3af",
    gray500: "#6b7280",
    gray600: "#4b5563",
    gray700: "#374151",
    gray800: "#1f2937",
    gray900: "#111827",

    // Status
    success: "#10b981",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    "2xl": 40,
    "3xl": 48,
  },

  typography: {
    sizes: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      "2xl": 24,
      "3xl": 30,
      "4xl": 36,
    },
    weights: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    } as const,
  },

  shadows: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 4,
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 15,
      elevation: 10,
    },
  },

  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    "2xl": 24,
    full: 9999,
  },
};

export const homeStyles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: THEME.colors.gray50,
  },

  safeArea: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },

  // ── Header / Hero Section ───────────────────────────────────────────────
  headerSection: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.lg,
    backgroundColor: THEME.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.gray100,
    marginBottom: THEME.spacing.md,
  },

  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  headerInfo: {
    flex: 1,
  },

  greeting: {
    fontSize: THEME.typography.sizes.lg,
    fontWeight: THEME.typography.weights.bold,
    color: THEME.colors.gray900,
    marginBottom: THEME.spacing.sm,
  },

  subtitle: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: THEME.typography.weights.medium,
    color: THEME.colors.gray500,
  },

  headerActions: {
    flexDirection: "row",
    gap: THEME.spacing.sm,
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius: THEME.radius.md,
    justifyContent: "center",
    alignItems: "center",
  },

  logoutBtn: {
    backgroundColor: "#FEE2E2",
  },

  // ── Search Bar ──────────────────────────────────────────────────────────
  searchSection: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    backgroundColor: THEME.colors.white,
    flexDirection: "row",
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },

  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    backgroundColor: THEME.colors.gray100,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.gray200,
  },

  searchInput: {
    flex: 1,
    fontSize: THEME.typography.sizes.sm,
    color: THEME.colors.gray900,
    padding: 0,
  },

  createButton: {
    width: 44,
    height: 44,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.secondaryPurple,
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Filter Tabs ─────────────────────────────────────────────────────────
  filterSection: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    backgroundColor: THEME.colors.white,
    marginBottom: THEME.spacing.md,
    flexDirection: "row",
    gap: THEME.spacing.sm,
  },

  filterTab: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    borderRadius: 20,
    backgroundColor: THEME.colors.gray100,
  },

  filterTabActive: {
    backgroundColor: THEME.colors.secondaryPurple,
  },

  filterTabText: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: THEME.typography.weights.semibold,
    color: THEME.colors.gray500,
  },

  filterTabTextActive: {
    color: THEME.colors.white,
  },

  // ── Cards / Items ───────────────────────────────────────────────────────
  card: {
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: THEME.colors.gray200,
    ...THEME.shadows.sm,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: THEME.spacing.md,
  },

  cardTitle: {
    fontSize: THEME.typography.sizes.base,
    fontWeight: THEME.typography.weights.bold,
    color: THEME.colors.gray900,
    marginBottom: THEME.spacing.sm,
    flex: 1,
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm,
  },

  badgeActive: {
    backgroundColor: "#DBEAFE",
  },

  badgeDraft: {
    backgroundColor: THEME.colors.gray100,
  },

  badgeClosed: {
    backgroundColor: "#FEE2E2",
  },

  badgeText: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: THEME.typography.weights.bold,
  },

  badgeTextActive: {
    color: "#0369A1",
  },

  badgeTextDraft: {
    color: THEME.colors.gray500,
  },

  badgeTextClosed: {
    color: "#DC2626",
  },

  // ── Row / Row items ────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },

  rowText: {
    fontSize: THEME.typography.sizes.sm,
    color: THEME.colors.gray500,
    flex: 1,
  },

  // ── Action Buttons ─────────────────────────────────────────────────────
  actionButtons: {
    flexDirection: "row",
    gap: THEME.spacing.sm,
    paddingTop: THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.gray100,
  },

  actionButton: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.radius.md,
    backgroundColor: "#E0E7FF",
    justifyContent: "center",
    alignItems: "center",
  },

  actionButtonText: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: THEME.typography.weights.semibold,
    color: "#4F46E5",
  },

  actionButtonDanger: {
    backgroundColor: "transparent",
  },

  // ── Empty State ────────────────────────────────────────────────────────
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: THEME.spacing.md,
  },

  emptyIcon: {
    marginBottom: THEME.spacing.md,
  },

  emptyTitle: {
    fontSize: THEME.typography.sizes.lg,
    fontWeight: THEME.typography.weights.bold,
    color: THEME.colors.gray900,
    marginBottom: THEME.spacing.sm,
  },

  emptyText: {
    fontSize: THEME.typography.sizes.sm,
    color: THEME.colors.gray500,
    textAlign: "center",
    marginBottom: THEME.spacing.lg,
  },

  emptyActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.secondaryPurple,
  },

  emptyActionButtonText: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: THEME.typography.weights.semibold,
    color: THEME.colors.white,
  },

  // ── Typography ────────────────────────────────────────────────────────
  label: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: THEME.typography.weights.semibold,
    color: THEME.colors.gray600,
  },

  meta: {
    fontSize: THEME.typography.sizes.xs,
    color: THEME.colors.gray500,
  },

  // ── Utility ─────────────────────────────────────────────────────────────
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  spacer: {
    height: THEME.spacing.md,
  },
});
