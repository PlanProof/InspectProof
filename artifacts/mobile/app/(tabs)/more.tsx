import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const logoImage = require("@/assets/images/logo.png");

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

interface MenuItemProps {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
  badge?: string | number;
}

function MenuItem({ icon, label, sublabel, onPress, danger = false, badge }: MenuItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.menuIcon, danger && { backgroundColor: Colors.dangerLight }]}>
        <Feather name={icon as any} size={18} color={danger ? Colors.danger : Colors.secondary} />
      </View>
      <View style={styles.menuLabel}>
        <Text style={[styles.menuText, danger && { color: Colors.danger }]}>{label}</Text>
        {sublabel && <Text style={styles.menuSublabel}>{sublabel}</Text>}
      </View>
      {badge !== undefined && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Feather name="chevron-right" size={16} color={danger ? Colors.danger : Colors.textTertiary} />
    </Pressable>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const roleLabel: Record<string, string> = {
    admin: "Administrator",
    certifier: "Building Certifier",
    inspector: "Inspector",
    staff: "Staff",
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + WEB_TOP + 16, paddingBottom: insets.bottom + 90 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.firstName} {user?.lastName}</Text>
          <Text style={styles.profileRole}>{roleLabel[user?.role || ""] || user?.role}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
        </View>
        <View style={styles.profileBadge}>
          <Text style={styles.profileBadgeText}>{user?.role?.toUpperCase()}</Text>
        </View>
      </View>

      {/* Quick Access */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="bar-chart-2"
            label="Analytics & Insights"
            sublabel="Trends, compliance rates, defect analysis"
            onPress={() => router.push("/analytics")}
          />
          <MenuItem
            icon="file-text"
            label="Reports"
            sublabel="Generate and manage inspection reports"
            onPress={() => {}}
          />
          <MenuItem
            icon="book"
            label="Documents"
            sublabel="Project documents and certificates"
            onPress={() => {}}
          />
        </View>
      </View>

      {/* Tools */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tools</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="clipboard"
            label="Checklist Templates"
            sublabel="Manage inspection checklists"
            onPress={() => {}}
          />
          <MenuItem
            icon="bell"
            label="Notifications"
            sublabel="Reminders, alerts, and map preferences"
            onPress={() => router.push("/notifications" as any)}
          />
          <MenuItem
            icon="users"
            label="Team Members"
            sublabel="Manage inspectors and staff"
            onPress={() => {}}
          />
        </View>
      </View>

      {/* Compliance References */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Compliance References</Text>
        <View style={styles.referenceGrid}>
          {[
            { code: "NCC 2022", desc: "National Construction Code" },
            { code: "AS 1684.2", desc: "Timber Framing" },
            { code: "AS 3600", desc: "Concrete Structures" },
            { code: "AS 3660.1", desc: "Termite Management" },
            { code: "AS 2870", desc: "Residential Slabs" },
            { code: "AS 1926.1", desc: "Pool Barriers" },
          ].map(r => (
            <View key={r.code} style={styles.refCard}>
              <Text style={styles.refCode}>{r.code}</Text>
              <Text style={styles.refDesc}>{r.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="settings"
            label="Settings"
            sublabel="App preferences and configuration"
            onPress={() => {}}
          />
          <MenuItem
            icon="help-circle"
            label="Help & Support"
            sublabel="Documentation and contact"
            onPress={() => {}}
          />
          <MenuItem
            icon="log-out"
            label="Sign Out"
            onPress={logout}
            danger
          />
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Image source={logoImage} style={styles.footerLogo} resizeMode="contain" />
        <Text style={styles.footerVersion}>Version 1.0.0 · Australian Building Inspection Platform</Text>
        <Text style={styles.footerCompliance}>NCC 2022 · BCA · AS Standards Compatible</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 20 },
  profileCard: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.secondary + "40",
    borderWidth: 2,
    borderColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.accent,
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#FFFFFF",
  },
  profileRole: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.accent,
  },
  profileEmail: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "rgba(255,255,255,0.5)",
  },
  profileBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  profileBadgeText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  menuGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.infoLight,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1 },
  menuText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  menuSublabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    marginTop: 1,
  },
  badge: {
    backgroundColor: Colors.danger,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: "center",
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#FFFFFF",
  },
  referenceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  refCard: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 3,
  },
  refCode: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  refDesc: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  footer: {
    alignItems: "center",
    gap: 6,
    padding: 16,
  },
  footerLogo: {
    width: 44,
    height: 44,
    marginBottom: 2,
  },
  footerVersion: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    textAlign: "center",
  },
  footerCompliance: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary + "AA",
    textAlign: "center",
  },
});
