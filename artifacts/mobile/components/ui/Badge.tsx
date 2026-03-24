import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "@/constants/colors";

interface BadgeProps {
  label: string;
  variant?: "severity" | "status" | "type" | "default";
  value?: string;
  size?: "sm" | "md";
}

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: Colors.severity.criticalBg, text: Colors.severity.critical, border: Colors.dangerBorder },
  high: { bg: Colors.severity.highBg, text: Colors.severity.high, border: Colors.warningBorder },
  medium: { bg: Colors.severity.mediumBg, text: Colors.severity.medium, border: "#FAF089" },
  low: { bg: Colors.severity.lowBg, text: Colors.severity.low, border: Colors.successBorder },
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: Colors.successLight, text: Colors.success, border: Colors.successBorder },
  on_hold: { bg: Colors.warningLight, text: Colors.warning, border: Colors.warningBorder },
  completed: { bg: Colors.infoLight, text: Colors.info, border: Colors.infoBorder },
  archived: { bg: "#F7FAFC", text: "#718096", border: "#E2E8F0" },
  scheduled: { bg: Colors.infoLight, text: Colors.info, border: Colors.infoBorder },
  in_progress: { bg: Colors.warningLight, text: Colors.warning, border: Colors.warningBorder },
  follow_up_required: { bg: Colors.dangerLight, text: Colors.danger, border: Colors.dangerBorder },
  cancelled: { bg: "#F7FAFC", text: "#718096", border: "#E2E8F0" },
  open: { bg: Colors.dangerLight, text: Colors.danger, border: Colors.dangerBorder },
  resolved: { bg: Colors.successLight, text: Colors.success, border: Colors.successBorder },
  closed: { bg: "#F7FAFC", text: "#718096", border: "#E2E8F0" },
  deferred: { bg: "#FAF5FF", text: "#6B46C1", border: "#D6BCFA" },
};

export function Badge({ label, variant = "default", value, size = "md" }: BadgeProps) {
  let colors = { bg: Colors.infoLight, text: Colors.info, border: Colors.infoBorder };

  if (variant === "severity" && value) {
    colors = severityColors[value] || colors;
  } else if (variant === "status" && value) {
    colors = statusColors[value] || colors;
  }

  return (
    <View style={[
      styles.badge,
      size === "sm" && styles.badgeSm,
      { backgroundColor: colors.bg, borderColor: colors.border }
    ]}>
      <Text style={[
        styles.label,
        size === "sm" && styles.labelSm,
        { color: colors.text }
      ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  label: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    letterSpacing: 0.1,
  },
  labelSm: {
    fontSize: 11,
  },
});
