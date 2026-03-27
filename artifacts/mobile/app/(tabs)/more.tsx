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

const WEB_TOP = 0;

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
    certifier: "Building Certifier / Surveyor",
    inspector: "Inspector",
    staff: "Staff",
    engineer: "Structural Engineer",
    plumber: "Plumbing Inspector",
    builder: "Builder",
    supervisor: "Site Supervisor",
    whs: "WHS Officer",
    pre_purchase: "Pre-Purchase Inspector",
    fire_engineer: "Fire Safety Engineer",
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
          {user?.firstName || user?.lastName ? (
            <Text style={styles.avatarText}>
              {(user?.firstName?.[0] ?? "").toUpperCase()}{(user?.lastName?.[0] ?? "").toUpperCase()}
            </Text>
          ) : (
            <Feather name="user" size={22} color={Colors.accent} />
          )}
        </View>
        <View style={styles.profileInfo}>
          {(user?.firstName || user?.lastName) ? (
            <Text style={styles.profileName} numberOfLines={1}>
              {[user?.firstName, user?.lastName].filter(Boolean).join(" ")}
            </Text>
          ) : (
            <Text style={styles.profileName} numberOfLines={1}>{user?.email ?? "Your Account"}</Text>
          )}
          {(user?.role) ? (
            <Text style={styles.profileRole} numberOfLines={1}>
              {roleLabel[user.role] || user.role}
            </Text>
          ) : null}
          {(user?.email && (user?.firstName || user?.lastName)) ? (
            <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text>
          ) : null}
        </View>
        {user?.role ? (
          <View style={styles.profileBadge}>
            <Text style={styles.profileBadgeText}>{user.role.toUpperCase()}</Text>
          </View>
        ) : null}
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
        </View>
      </View>

      {/* Tools */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tools</Text>
        <View style={styles.menuGroup}>
          <MenuItem
            icon="bell"
            label="Notifications"
            sublabel="Reminders, alerts, and map preferences"
            onPress={() => router.push("/notifications" as any)}
          />
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
            onPress={() => router.push("/settings" as any)}
          />
          <MenuItem
            icon="help-circle"
            label="Help & Support"
            sublabel="Documentation and contact"
            onPress={() => router.push("/help" as any)}
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
