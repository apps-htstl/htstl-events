// components/AdminHeader.tsx
// Shared page header: dark maroon band with the ॐ mark, title, subtitle and
// optional meta line. Pass `right` to render custom trailing content (live
// badges, back links). Stacks vertically below the narrow breakpoint.
// Lives in components/ (not app/) so expo-router does not register it as a
// route.

import { gsDark } from "@/constants/styles";
import type { ReactNode } from "react";
import { Text, useWindowDimensions, View } from "react-native";

const NARROW_BREAKPOINT = 768;

type AdminHeaderProps = {
  title?: string;
  subtitle?: string;
  meta?: string;
  right?: ReactNode;
};

export default function AdminHeader({
  title = "Hindu Temple of St. Louis",
  subtitle = "Navakundathmaka Shatha Chandi Sahitha Rudra Yagam",
  meta,
  right,
}: AdminHeaderProps) {
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_BREAKPOINT;

  return (
    <View style={[gsDark.header, narrow && gsDark.headerNarrow]}>
      <View style={gsDark.headerLeft}>
        <View style={gsDark.omCircle}>
          <Text style={gsDark.omGlyph}>ॐ</Text>
        </View>
        <View style={gsDark.headerTextBlock}>
          <Text style={[gsDark.title, narrow && gsDark.titleNarrow]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[gsDark.subtitle, narrow && gsDark.subtitleNarrow]}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? <Text style={gsDark.headerMeta}>{meta}</Text> : null}
        </View>
      </View>
      {right ? (
        <View style={[gsDark.headerRight, narrow && gsDark.headerRightNarrow]}>
          {right}
        </View>
      ) : null}
    </View>
  );
}
