// constants/styles.ts
// Global reusable styles ("classes") built from the theme tokens — the one
// place button/header/card/input styles are defined. Screens import `gs`
// and compose: style={[gs.card, { marginTop: spacing.lg }]}.
//
// Naming convention:
//   screen / content            page scaffolding
//   headerBand*                 dark maroon banner with gold underline
//   h1 h2 h3 / sectionLabel     headings & labels
//   card* / cardDark*           light and dark cards
//   btn*                        buttons (pair each btnX with btnXText)
//   input*                      form fields
//   tip*                        dashed callout panel

import { Platform, StyleSheet } from "react-native";
import {
  alpha,
  colors,
  fonts,
  fontSize,
  maxContentWidth,
  radius,
  rem,
  spacing,
} from "./theme";

export const gs = StyleSheet.create({
  // ─── Page scaffolding ──────────────────────────────────────────────────────
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    width: "100%",
    maxWidth: maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  // ─── Card grid (2-up on wide screens, use gridItemFull when narrow) ────────
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
  gridItemFull: {
    minWidth: "100%",
  },

  // ─── Header band (dark maroon banner) ──────────────────────────────────────
  headerBand: {
    backgroundColor: colors.dark.bg,
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    borderBottomWidth: 4,
    borderBottomColor: colors.gold,
  },
  omCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  omGlyph: {
    fontFamily: fonts.serif,
    fontSize: rem(1.75),
    color: colors.gold,
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSize.hero,
    fontWeight: "700",
    color: colors.bg,
    textAlign: "center",
  },
  headerSubtitle: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h2,
    color: colors.goldBright,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  headerMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.dark.muted,
    marginTop: spacing.sm,
    textAlign: "center",
  },

  // Narrow-screen (< 768px) header band variants
  headerBandNarrow: {
    paddingTop: spacing.xxl + 6,
    paddingBottom: spacing.xxl + 10,
  },
  headerTitleNarrow: { fontSize: fontSize.h1 },
  headerSubtitleNarrow: { fontSize: fontSize.h3 },

  // ─── Headings & labels ─────────────────────────────────────────────────────
  h1: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h1,
    fontWeight: "700",
    color: colors.primary,
  },
  h2: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h2,
    fontWeight: "700",
    color: colors.primary,
  },
  h3: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h3,
    fontWeight: "700",
    color: colors.heading,
  },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.label,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
    marginBottom: spacing.lg + 2,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.body,
    lineHeight: 21,
  },
  muted: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.muted,
  },

  // ─── Cards ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xxl,
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h2,
    fontWeight: "700",
    color: colors.primary,
  },
  cardBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.body,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  cardDark: {
    backgroundColor: colors.dark.bg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xxl,
  },
  cardDarkTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h2,
    fontWeight: "700",
    color: colors.goldBright,
  },
  cardDarkBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.dark.body,
    marginTop: spacing.sm,
    lineHeight: 21,
  },

  // ─── Buttons ───────────────────────────────────────────────────────────────
  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm + 2,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "700",
    color: colors.white,
  },
  btnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.sm + 2,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "700",
    color: colors.primary,
  },
  btnGold: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm + 2,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGoldText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "700",
    color: colors.dark.bg,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // ─── Inputs ────────────────────────────────────────────────────────────────
  inputLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.label,
    color: colors.body,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  input: {
    width: "100%",
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.surface,
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.heading,
  },

  // ─── Callouts ──────────────────────────────────────────────────────────────
  tipBox: {
    backgroundColor: colors.tipBg,
    borderWidth: 1,
    borderColor: colors.tipBorder,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl - 2,
  },
  tipText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.label,
    color: colors.body,
    lineHeight: 21,
  },
  tipBold: {
    fontWeight: "700",
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.danger,
  },
});

// ─── Dark theme ("classes" for dark full-screen pages, e.g. priest view) ─────
// Same conventions as `gs`, on the dark maroon surfaces with gold accents.
export const gsDark = StyleSheet.create({
  // Page scaffolding
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.dark.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 22,
    paddingHorizontal: 40,
    backgroundColor: colors.dark.bg,
    borderBottomWidth: 2,
    borderBottomColor: colors.goldDeep,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    flexShrink: 1,
  },
  headerTextBlock: { flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 24 },
  headerRightNarrow: {
    width: "100%",
    justifyContent: "center",
  },
  omCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  omGlyph: {
    fontFamily: fonts.serif,
    fontSize: rem(1.625),
    color: colors.gold,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: rem(1.875),
    fontWeight: "700",
    color: colors.dark.text,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: rem(0.9375),
    color: colors.gold,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  headerMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    color: colors.dark.muted,
    marginTop: spacing.xs,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.live,
  },
  liveText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.dark.textSoft,
  },
  link: {
    fontFamily: fonts.sans,
    marginLeft: 18,
    color: colors.gold,
    fontSize: fontSize.body,
    textDecorationLine: "underline",
  },

  // Filter bar & dropdowns
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: spacing.xl,
    paddingHorizontal: 40,
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.gold, 0.3),
    zIndex: 10,
  },
  dropdownWrap: { position: "relative" },
  filterLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    color: colors.dark.muted,
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm + 2,
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: colors.dark.bg,
    gap: 10,
  },
  selectText: {
    fontFamily: fonts.serif,
    fontSize: fontSize.body,
    fontWeight: "700",
    color: colors.dark.text,
    flexShrink: 1,
  },
  selectCaret: { color: colors.gold, fontSize: fontSize.body },
  menu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    maxHeight: 340,
    marginTop: 4,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.dark.surface,
    overflow: "hidden",
    zIndex: 1000,
    elevation: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    ...(Platform.OS === "web"
      ? { boxShadow: `0 8px 24px ${alpha(colors.black, 0.5)}` }
      : {}),
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: spacing.lg },
  menuItemActive: { backgroundColor: alpha(colors.gold, 0.25) },
  menuItemText: {
    fontFamily: fonts.sans,
    fontSize: rem(0.9375),
    color: colors.dark.text,
  },

  // Buttons
  btnGold: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm + 2,
    paddingVertical: 14,
    paddingHorizontal: 22,
    minWidth: 170,
    alignItems: "center",
  },
  btnGoldText: {
    fontFamily: fonts.sans,
    fontSize: rem(0.9375),
    fontWeight: "700",
    color: colors.dark.bg,
  },
  btnOutlineGold: {
    width: 174,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: "transparent",
    borderRadius: radius.sm + 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: 14,
  },
  btnOutlineGoldHover: {
    backgroundColor: colors.gold,
  },
  btnOutlineGoldText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "700",
    color: colors.gold,
  },
  btnOutlineGoldTextHover: {
    color: colors.dark.bg,
  },

  // Section headings
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: rem(1.625),
    fontWeight: "600",
    color: colors.dark.text,
  },
  sectionNote: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.dark.muted,
  },

  // Error banner
  errorBar: {
    marginHorizontal: 40,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm + 2,
    backgroundColor: alpha(colors.dark.danger, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.dark.danger, 0.5),
  },
  errorText: {
    fontFamily: fonts.sans,
    color: colors.dark.dangerText,
    fontSize: fontSize.body,
  },

  // List / table
  list: { flex: 1, minHeight: 0 },
  listContent: {
    paddingHorizontal: 40,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  gridHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: alpha(colors.gold, 0.4),
  },
  gridHeaderCell: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.dark.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  actionColumn: { width: 210, alignItems: "flex-end" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 28,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: alpha(colors.dark.highlight, 0.05),
    borderWidth: 1,
    borderColor: alpha(colors.gold, 0.2),
  },
  rowHighlight: {
    backgroundColor: alpha(colors.gold, 0.22),
    borderColor: colors.gold,
  },
  rowTitle: {
    fontFamily: fonts.serif,
    fontSize: rem(2.125),
    fontWeight: "700",
    color: colors.dark.highlight,
  },
  rowMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.dark.muted,
    marginTop: 2,
  },
  rowText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.dark.textSoft,
  },
  divider: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.dark.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: spacing.xxl,
    marginBottom: spacing.xs,
  },
  dividerFirst: { marginTop: spacing.lg },

  // Empty / loading states
  emptyWrap: { alignItems: "center", marginTop: 80, gap: spacing.lg },
  emptyText: {
    marginTop: 60,
    textAlign: "center",
    color: colors.dark.faint,
    fontSize: fontSize.h2,
    fontFamily: fonts.serif,
    paddingBottom: 60,
  },

  // States
  disabled: { opacity: 0.6 },

  // Table cell widths (wide layout)
  cellLg: { flex: 2 },
  cellSm: { flex: 1.3 },

  // ── Narrow-screen (< 768px) variants — compose after the base class ──
  headerNarrow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  titleNarrow: { fontSize: fontSize.h2 },
  subtitleNarrow: { fontSize: fontSize.label },
  filterBarNarrow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
    zIndex: 50,
    backgroundColor: colors.dark.bg,
  },
  dropdownFull: { minWidth: "100%" },
  btnFull: { width: "100%" },
  sectionRowNarrow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  listContentNarrow: { paddingHorizontal: spacing.lg },
  rowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  actionColumnStacked: {
    width: "100%",
    alignItems: "stretch",
    marginTop: spacing.xs,
  },
  sizeControlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sizeLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    color: colors.dark.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sizeBtn: {
    padding: 4,
  },
  sizeVal: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "700",
    color: colors.gold,
    minWidth: 40,
    textAlign: "center",
  },
});
