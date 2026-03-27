import React, { useEffect, useRef, useState } from "react";
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

const WEB_TOP = 0;

const FEATURES = [
  {
    icon: "clipboard" as const,
    title: "Digital Inspection Forms",
    desc: "Purpose-built checklists for every discipline, inspection stage and trade type — aligned to Australian standards.",
  },
  {
    icon: "camera" as const,
    title: "Photo Evidence with Markup",
    desc: "Capture, annotate, and attach photos directly to checklist items on site.",
  },
  {
    icon: "file-text" as const,
    title: "One-Tap Reports",
    desc: "Generate inspection certificates, compliance reports, defect notices and more — instantly from field data.",
  },
  {
    icon: "shield" as const,
    title: "Audit-Ready Records",
    desc: "Every inspection is timestamped, geotagged and securely stored — defensible records at every stage.",
  },
];

const PROFESSIONALS = [
  {
    icon: "shield" as const,
    label: "Building Surveyors",
    description:
      "Manage the full statutory inspection lifecycle from a single platform — from hold points to compliance certificates.",
    bullets: [
      "Statutory hold point and mandatory inspection management",
      "Occupation and compliance certificate documentation",
      "Client-facing PDF report and certificate delivery",
    ],
  },
  {
    icon: "trending-up" as const,
    label: "Structural Engineers",
    description:
      "Document structural inspections at every stage with timestamped evidence that stands up to scrutiny.",
    bullets: [
      "Stage-by-stage structural inspection records",
      "Photo evidence attached to each inspection item",
      "Engineer certification report export",
    ],
  },
  {
    icon: "droplet" as const,
    label: "Plumbing Inspectors",
    description:
      "Carry out plumbing inspections with purpose-built checklists. Issue compliance certificates from the field.",
    bullets: [
      "Plumbing compliance certificate templates",
      "Pressure test and fixture inspection records",
      "Geocoded inspection reports for regulatory lodgement",
    ],
  },
  {
    icon: "tool" as const,
    label: "Builders",
    description:
      "Record quality checks at every stage, flag non-conformances and maintain a full audit trail before handover.",
    bullets: [
      "Stage-based quality control checklists",
      "Non-conformance flagging and resolution tracking",
      "Pre-handover inspection records for clients",
    ],
  },
  {
    icon: "clipboard" as const,
    label: "Site Supervisors",
    description:
      "Schedule inspections, log daily observations and ensure nothing slips through the cracks during construction.",
    bullets: [
      "Daily run sheet scheduling and management",
      "Hold point and inspection gate management",
      "Daily site diary and observation logging",
    ],
  },
  {
    icon: "alert-triangle" as const,
    label: "WHS Officers",
    description:
      "Document safety inspections and hazard assessments in the field. Raise issues instantly and track corrective actions.",
    bullets: [
      "Safety inspection checklists aligned to WHS Act",
      "Hazard and incident reporting with photo evidence",
      "Audit-ready safety records and reports",
    ],
  },
  {
    icon: "home" as const,
    label: "Pre-Purchase Inspectors",
    description:
      "Deliver professional building inspection reports faster than ever — generated before you leave the property.",
    bullets: [
      "Residential and commercial inspection templates",
      "Branded PDF report generation from the field",
      "Client delivery direct from the app",
    ],
  },
  {
    icon: "zap" as const,
    label: "Fire Safety Engineers",
    description:
      "Conduct fire safety inspections, document system compliance and issue fire safety certificates from the field.",
    bullets: [
      "Fire safety system inspection checklists",
      "Passive and active fire protection verification",
      "Annual fire safety statement support",
    ],
  },
];

export default function WelcomeScreen() {
  const { user, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const [activeProf, setActiveProf] = useState(0);

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

  const prof = PROFESSIONALS[activeProf];

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
          <View style={styles.logoBadge}>
            <Feather name="clipboard" size={28} color="#F2F3F4" />
          </View>
          <Text style={styles.brandName}>InspectProof</Text>
          <Text style={styles.tagline}>
            Inspection records that{"\n"}
            <Text style={styles.taglineAccent}>prove compliance.</Text>
          </Text>
          <Text style={styles.subTagline}>
            The field inspection platform for every professional working within Australia's built environment.
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
            { n: "8", label: "Professional\nDisciplines" },
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
                  <Feather name={f.icon} size={18} color={Colors.secondary} />
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
          <View style={styles.sectionHeader}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>WHO IT'S FOR</Text>
            </View>
            <Text style={styles.sectionTitle}>Built for every professional</Text>
            <Text style={styles.sectionSubtitle}>
              From building surveyors to fire safety engineers — InspectProof covers every discipline in Australia's built environment.
            </Text>
          </View>

          {/* Professional chip scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipScrollContent}
          >
            {PROFESSIONALS.map((p, i) => (
              <Pressable
                key={p.label}
                onPress={() => setActiveProf(i)}
                style={({ pressed }) => [
                  styles.chip,
                  activeProf === i && styles.chipActive,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Feather
                  name={p.icon}
                  size={13}
                  color={activeProf === i ? Colors.primary : "rgba(255,255,255,0.6)"}
                />
                <Text style={[styles.chipLabel, activeProf === i && styles.chipLabelActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Active professional detail card */}
          <View style={styles.profCard}>
            <View style={styles.profCardHeader}>
              <View style={styles.profIconWrap}>
                <Feather name={prof.icon} size={20} color={Colors.secondary} />
              </View>
              <Text style={styles.profCardTitle}>{prof.label}</Text>
            </View>
            <Text style={styles.profCardDesc}>{prof.description}</Text>
            <View style={styles.profBullets}>
              {prof.bullets.map((b) => (
                <View key={b} style={styles.bulletRow}>
                  <Feather name="check-circle" size={14} color={Colors.accent} />
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
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
            <Text style={styles.alreadyHave}>
              Already have an account?{" "}
              <Text style={styles.signInLink}>Sign In</Text>
            </Text>
          </Pressable>
        </View>

        {/* Footer */}
        <Text style={styles.footerText}>InspectProof · contact@inspectproof.com.au</Text>
        <Text style={styles.footerSub}>Standards-aligned for Australia's built environment</Text>
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
    backgroundColor: Colors.secondary,
    alignItems: "center", justifyContent: "center",
    shadowColor: Colors.secondary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  brandName: {
    fontSize: 34,
    color: "#FFFFFF",
    letterSpacing: -0.5,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  tagline: {
    fontSize: 22,
    color: "rgba(255,255,255,0.9)",
    fontFamily: "PlusJakartaSans_600SemiBold",
    textAlign: "center",
    lineHeight: 30,
  },
  taglineAccent: {
    color: Colors.accent,
  },
  subTagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "PlusJakartaSans_600SemiBold",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 310,
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
    borderWidth: 1.5, borderColor: Colors.secondary,
  },
  ctaSecondaryText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },

  statsStrip: {
    flexDirection: "row",
    backgroundColor: "rgba(70,109,181,0.18)",
    borderRadius: 16, borderWidth: 1, borderColor: "rgba(70,109,181,0.35)",
    paddingVertical: 16,
  },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statN: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.accent, lineHeight: 22, textAlign: "center" },
  statLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.6)", textAlign: "center", lineHeight: 13 },

  section: { gap: 16 },
  sectionHeader: { gap: 8 },
  sectionBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(197,217,45,0.12)",
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(197,217,45,0.25)",
  },
  sectionBadgeText: {
    fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.accent, letterSpacing: 1,
  },
  sectionTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: "#FFFFFF" },
  sectionSubtitle: {
    fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold",
    color: "rgba(255,255,255,0.45)", lineHeight: 17,
  },
  featureList: { gap: 10 },
  featureCard: {
    flexDirection: "row", gap: 14, alignItems: "flex-start",
    backgroundColor: "#F2F3F5",
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(70,109,181,0.15)",
  },
  featureIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "rgba(70,109,181,0.12)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  featureText: { flex: 1, gap: 3 },
  featureTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "#0B1933" },
  featureDesc: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "#566077", lineHeight: 17 },

  chipScroll: { marginHorizontal: -24 },
  chipScrollContent: { paddingHorizontal: 24, gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.7)" },
  chipLabelActive: { color: Colors.primary },

  profCard: {
    backgroundColor: "#F2F3F5",
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: "rgba(70,109,181,0.2)",
    gap: 12,
  },
  profCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  profIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(70,109,181,0.12)",
    borderWidth: 1, borderColor: "rgba(70,109,181,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  profCardTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: "#0B1933", flex: 1 },
  profCardDesc: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: "#566077", lineHeight: 19 },
  profBullets: { gap: 10 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletText: { flex: 1, fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "#566077", lineHeight: 17 },

  divider: { height: 1, backgroundColor: "rgba(70,109,181,0.3)" },

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
