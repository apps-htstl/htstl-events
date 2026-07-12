// constants/theme.ts
// Design tokens ("variables") for the HTSL Events temple theme, extracted
// from the reference designs in /design. Import these anywhere a raw value
// is needed; for ready-made styles ("classes") use constants/styles.ts.

import { Platform } from "react-native";

// ─── Colors ──────────────────────────────────────────────────────────────────
export const colors = {
  // Base
  white: "#ffffff",
  black: "#000000",

  // Light surfaces (most screens)
  bg: "#fbf5e9", // cream page background
  surface: "#ffffff", // cards
  surfaceSoft: "#fbeee0", // soft cream panels
  border: "#e6d4b0", // card borders
  inputBorder: "#d8c297",

  // Brand
  primary: "#7a1220", // deep maroon — buttons, links, card titles
  primaryPressed: "#591419",
  gold: "#d4a83f", // accents, borders on dark
  goldBright: "#e8c069", // headings on dark
  goldDeep: "#b8863b",

  // Text on light surfaces
  heading: "#3a1c14",
  body: "#6b4a38",
  muted: "#8a6a4e",

  // Callout / tip panels
  tipBg: "#fdf0e2",
  tipBorder: "#c9a25c",

  // Status
  success: "#2f7d38",
  successBg: "#e9f5ea",
  danger: "#b3261e",
  dangerBg: "#fdecea",
  live: "#7bc47f",

  // Dark surfaces (header bands, priest view)
  dark: {
    bg: "#2b0d12",
    bgDeep: "#1c0a0d",
    surface: "#3a1118",
    text: "#f6ead4",
    textSoft: "#e7d3a1",
    body: "#d8c297",
    muted: "#c9b183",
    faint: "#a68a5c",
    highlight: "#fff8e8",
    danger: "#ff7878",
    dangerText: "#ff9d9d",
  },
} as const;

// Convert a "#rrggbb" token to an rgba() string with the given opacity —
// use for translucent variants instead of hardcoding rgba literals.
export function alpha(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

// ─── Typography ──────────────────────────────────────────────────────────────
// One font for the whole application: the platform system stack. On native,
// undefined means the OS default (San Francisco on iOS, Roboto on Android) —
// the same families the web stack resolves to.
const SYSTEM_FONT = 'Roboto, Roboto, Arial, sans-serif, "Noto Color Emoji"';

export const fonts = {
  base: SYSTEM_FONT,
  // Aliases kept so styles can express intent (headings vs body) while all
  // resolving to the single application font.
  serif: SYSTEM_FONT,
  sans: SYSTEM_FONT,
} as const;

// Font sizes are authored in rem (1rem = 16px browser default). On web the
// value is emitted as a real CSS rem unit so text scales with the user's
// browser font-size setting; native gets the equivalent numeric dp, since
// React Native only accepts numbers there.
const REM_BASE = 16;
export function rem(value: number): number {
  if (Platform.OS === "web") {
    // react-native-web passes string units through to CSS.
    return `${value}rem` as unknown as number;
  }
  return Math.round(value * REM_BASE);
}

export const fontSize = {
  hero: rem(2.25), // 36px — page banner title
  h1: rem(1.75), // 28px
  h2: rem(1.375), // 22px — card titles, section headings
  h3: rem(1.125), // 18px
  body: rem(0.875), // 14px — application default
  label: rem(0.8125), // 13px — uppercase section labels
  small: rem(0.75), // 12px
} as const;

// ─── Layout ──────────────────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 26,
} as const;

export const radius = {
  sm: 8, // inputs
  md: 12, // tip boxes
  lg: 16, // cards
  pill: 999,
} as const;

export const maxContentWidth = 1100;
