import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

const FEATURES = [
  {
    icon: "clipboard" as const,
    title: "Digital Inspection Forms",
    desc: "NCC 2022 & BCA-compliant checklists for every building class, stage, and trade.",
  },
  {
    icon: "camera" as const,
    title: "Photo Evidence with Markup",
    desc: "Capture, annotate, and attach photos directly to checklist items on site.",
  },
  {
    icon: "file-text" as const,
    title: "One-Tap Certificates",
    desc: "Generate Inspection Certificates, Defect Notices, and Compliance Reports instantly.",
  },
  {
    icon: "shield" as const,
    title: "Issue Tracking",
    desc: "Log defects, assign responsibility, and track resolution through to sign-off.",
  },
];

const WHO_FOR = [
  { icon: "briefcase" as const, label: "Building Certifiers" },
  { icon: "tool" as const, label: "Site Inspectors" },
  { icon: "bar-chart-2" as const, label: "Project Managers" },
  { icon: "droplet" as const, label: "Plumbing Inspectors" },
];

export default function WelcomeScreen() {
  const { user, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/(tabs)");
      return;
    }
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (user) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + WEB_TOP + 24, paddingBottom: insets.bottom + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }, styles.inner]}>

        {/* Hero */}
        <View style={styles.hero}>
          {/* Logo badge */}
          <View style={styles.logoBadge}>
            <Feather name="clipboard" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.brandName}>InspectProof</Text>
          <Text style={styles.tagline}>
            Australia's building certification{"\n"}and inspection platform
          </Text>
          <Text style={styles.subTagline}>
            Built for certifiers, surveyors and engineers who demand accuracy on site and speed in the office.
          </Text>
        </View>

        {/* CTA Buttons */}
        <View style={styles.ctaRow}>
          <Pressable
            onPress={() => router.push("/register" as any)}
            style={({ pressed }) => [styles.ctaPrimary, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          >
            <Text style={styles.ctaPrimaryText}>Get Started Free</Text>
            <Feather name="arrow-right" size={16} color={Colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/login" as any)}
            style={({ pressed }) => [styles.ctaSecondary, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.ctaSecondaryText}>Sign In</Text>
          </Pressable>
        </View>

        {/* Stats Strip */}
        <View style={styles.statsStrip}>
          {[
            { n: "10+", label: "Inspection\nTypes" },
            { n: "NCC\n2022", label: "Compliant" },
            { n: "AU", label: "Built for\nAustralia" },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statN}>{s.n}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Everything you need on site</Text>
          <View style={styles.featureList}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.featureCard}>
                <View style={styles.featureIcon}>
                  <Feather name={f.icon} size={18} color={Colors.accent} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Who It's For */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Built for professionals</Text>
          <View style={styles.whoGrid}>
            {WHO_FOR.map((w) => (
              <View key={w.label} style={styles.whoChip}>
                <Feather name={w.icon} size={15} color={Colors.accent} />
                <Text style={styles.whoLabel}>{w.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Bottom CTA */}
        <View style={styles.bottomCta}>
          <Text style={styles.bottomCtaText}>Ready to modernise your inspection workflow?</Text>
          <Pressable
            onPress={() => router.push("/register" as any)}
            style={({ pressed }) => [styles.ctaPrimary, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.ctaPrimaryText}>Create Free Account</Text>
            <Feather name="arrow-right" size={16} color={Colors.primary} />
          </Pressable>
          <Pressable onPress={() => router.push("/login" as any)}>
            <Text style={styles.alreadyHave}>Already have an account? <Text style={styles.signInLink}>Sign In</Text></Text>
          </Pressable>
        </View>

        {/* Footer */}
        <Text style={styles.footerText}>InspectProof · contact@inspectproof.com.au</Text>
        <Text style={styles.footerSub}>NCC 2022 · BCA · AS Standards Compatible</Text>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: Colors.primary },
  content: { paddingHorizontal: 24 },
  inner: { gap: 28 },

  hero: { alignItems: "center", gap: 10, paddingTop: 8 },
  logoBadge: {
    width: 68, height: 68, borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  brandName: {
    fontSize: 34,
    color: "#FFFFFF",
    letterSpacing: -0.5,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  tagline: {
    fontSize: 17,
    color: "rgba(255,255,255,0.85)",
    fontFamily: "PlusJakartaSans_600SemiBold",
    textAlign: "center",
    lineHeight: 24,
  },
  subTagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "PlusJakartaSans_600SemiBold",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 300,
  },

  ctaRow: { gap: 10 },
  ctaPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 16,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  ctaPrimaryText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  ctaSecondary: {
    alignItems: "center", justifyContent: "center",
    borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)",
  },
  ctaSecondaryText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.8)" },

  statsStrip: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 16,
  },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statN: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.accent, lineHeight: 22, textAlign: "center" },
  statLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 13 },

  section: { gap: 14 },
  sectionTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: "#FFFFFF" },
  featureList: { gap: 10 },
  featureCard: {
    flexDirection: "row", gap: 14, alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  featureIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "rgba(197,217,45,0.15)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  featureText: { flex: 1, gap: 3 },
  featureTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "#FFFFFF" },
  featureDesc: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.5)", lineHeight: 17 },

  whoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  whoChip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  whoLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.8)" },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)" },

  bottomCta: { alignItems: "center", gap: 12 },
  bottomCtaText: {
    fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#FFFFFF", textAlign: "center", lineHeight: 22,
  },
  alreadyHave: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.45)" },
  signInLink: { color: Colors.accent },

  footerText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.25)", textAlign: "center" },
  footerSub: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.15)", textAlign: "center" },
});
