import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

const NAVY = "#0B1933";
const PEAR = "#C5D92D";

const TILES: {
  id: string;
  label: string;
  icon: string;
  route: string;
  iconColor: string;
  iconBg: string;
}[] = [
  {
    id: "inspections",
    label: "Inspections",
    icon: "clipboard",
    route: "/(tabs)/inspections",
    iconColor: "#466DB5",
    iconBg: "#EBF1FB",
  },
  {
    id: "projects",
    label: "Projects",
    icon: "folder",
    route: "/(tabs)/projects",
    iconColor: "#16a34a",
    iconBg: "#f0fdf4",
  },
  {
    id: "reports",
    label: "Reports",
    icon: "file-text",
    route: "/(tabs)/reports",
    iconColor: "#d97706",
    iconBg: "#fffbeb",
  },
  {
    id: "create",
    label: "New Inspection",
    icon: "plus-circle",
    route: "/inspection/create",
    iconColor: NAVY,
    iconBg: "#e2e8f0",
  },
  {
    id: "more",
    label: "More",
    icon: "grid",
    route: "/(tabs)/more",
    iconColor: "#7c3aed",
    iconBg: "#f5f3ff",
  },
  {
    id: "issues",
    label: "Issues",
    icon: "alert-triangle",
    route: "/(tabs)/issues",
    iconColor: "#dc2626",
    iconBg: "#fef2f2",
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* Brand header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>INSPECTPROOF</Text>
        <Text style={styles.tagline}>Built Environment Platform</Text>
      </View>

      {/* 2 × 3 tile grid */}
      <View style={styles.grid}>
        {TILES.map((tile) => (
          <Pressable
            key={tile.id}
            style={({ pressed }) => [
              styles.tile,
              pressed && styles.tilePressed,
            ]}
            onPress={() => router.push(tile.route as any)}
          >
            <View style={[styles.iconWrap, { backgroundColor: tile.iconBg }]}>
              <Feather name={tile.icon as any} size={34} color={tile.iconColor} />
            </View>
            <Text style={styles.tileLabel}>{tile.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 36,
  },
  wordmark: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: PEAR,
    letterSpacing: 2.5,
  },
  tagline: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 5,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  tile: {
    width: "47%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  tilePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: NAVY,
    textAlign: "center",
  },
});
