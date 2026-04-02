import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  Linking,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/constants/api";

const WEB_TOP = 0;

const PROFESSIONS = [
  "Building Surveyor",
  "Structural Engineer",
  "Plumbing Inspector",
  "Builder",
  "Site Supervisor",
  "WHS Officer",
  "Pre-Purchase Inspector",
  "Fire Safety Engineer",
  "Other",
];

const PLAN_PRICE_MAP: Record<string, { price: string; priceNote: string }> = {
  free_trial: { price: "Free", priceNote: "Forever" },
  starter: { price: "$59", priceNote: "AUD/month" },
  professional: { price: "$149", priceNote: "AUD/month" },
  enterprise: { price: "Custom", priceNote: "Contact us" },
};

const FALLBACK_PLANS = [
  {
    key: "free_trial",
    name: "Free Trial",
    price: "Free",
    priceNote: "Forever",
    features: ["1 active project", "10 total inspections", "1 team member", "Basic report generation"],
    highlight: false,
    badge: null as string | null,
  },
  {
    key: "starter",
    name: "Starter",
    price: "$59",
    priceNote: "AUD/month",
    features: ["10 active projects", "50 inspections per month", "3 team members", "All report types"],
    highlight: false,
    badge: null as string | null,
  },
  {
    key: "professional",
    name: "Professional",
    price: "$149",
    priceNote: "AUD/month",
    features: ["Unlimited projects", "Unlimited inspections", "10 team members", "Full template customisation", "Priority support"],
    highlight: true,
    badge: "Most Popular" as string | null,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    priceNote: "Contact us",
    features: ["Unlimited projects", "Unlimited inspections", "Unlimited team members", "Dedicated account manager", "Custom integrations"],
    highlight: false,
    badge: null as string | null,
  },
];

type Step = "profile" | "plan" | "invited";

type PlanOption = {
  key: string;
  name: string;
  price: string;
  priceNote: string;
  features: string[];
  highlight: boolean;
  badge: string | null;
};

export default function RegisterScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("profile");
  const [plans, setPlans] = useState<PlanOption[]>(FALLBACK_PLANS);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [profession, setProfession] = useState("");
  const [professionOpen, setProfessionOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("free_trial");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(getApiUrl("/billing/plan-configs"))
      .then(r => r.json())
      .then(data => {
        if (data?.plans?.length) {
          const mapped: PlanOption[] = data.plans.map((p: any) => {
            const pricing = PLAN_PRICE_MAP[p.planKey] ?? { price: "Custom", priceNote: "Contact us" };
            return {
              key: p.planKey,
              name: p.label,
              price: pricing.price,
              priceNote: pricing.priceNote,
              features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || "[]"),
              highlight: p.isPopular || p.isBestValue,
              badge: p.isBestValue ? "Best Value" : p.isPopular ? "Most Popular" : null,
            };
          });
          setPlans(mapped);
        }
      })
      .catch(() => {}); // Keep fallback on network failure
  }, []);

  const validateProfile = () => {
    if (!firstName.trim()) return "Please enter your first name.";
    if (!lastName.trim()) return "Please enter your last name.";
    if (!email.trim() || !email.includes("@")) return "Please enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!organization.trim()) return "Please enter your company or organisation name.";
    return null;
  };

  const handleNext = () => {
    const err = validateProfile();
    if (err) { setError(err); return; }
    setError("");
    setStep("plan");
  };

  const [showInviteFlow, setShowInviteFlow] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteUrlError, setInviteUrlError] = useState("");

  const handleSubmitInvited = () => {
    setInviteUrl("");
    setInviteUrlError("");
    setShowInviteFlow(true);
  };

  const handleOpenInviteUrl = async () => {
    const trimmed = inviteUrl.trim();
    if (!trimmed) {
      setInviteUrlError("Please paste your invitation link.");
      return;
    }
    const isValidLink = trimmed.includes("/join?token=") || trimmed.includes("join?token=");
    if (!isValidLink) {
      setInviteUrlError("This doesn't look like a valid invitation link. It should contain /join?token=");
      return;
    }
    setInviteUrlError("");
    setShowInviteFlow(false);
    await Linking.openURL(trimmed);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
    try {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password, organization, profession, plan: selectedPlan }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Registration failed.");
      }
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Registration failed. Please try again.");
      setStep("profile");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Invite token flow modal */}
      <Modal visible={showInviteFlow} transparent animationType="fade" onRequestClose={() => setShowInviteFlow(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, gap: 14 }}>
            <Text style={{ fontSize: 18, fontFamily: "PlusJakartaSans_700Bold", color: "#0B1933" }}>Join via Invitation Link</Text>
            <Text style={{ fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", color: "#4b5563", lineHeight: 22 }}>
              Paste the invitation link from your email below to open the secure sign-up page in your browser.
            </Text>
            <TextInput
              value={inviteUrl}
              onChangeText={t => { setInviteUrl(t); setInviteUrlError(""); }}
              placeholder="https://...inspectproof.com.au/join?token=..."
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={{
                borderWidth: 1,
                borderColor: inviteUrlError ? "#ef4444" : "#d1d5db",
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                fontFamily: "PlusJakartaSans_400Regular",
                color: "#0B1933",
                backgroundColor: "#f8fafc",
              }}
            />
            {inviteUrlError ? (
              <Text style={{ fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: "#ef4444" }}>{inviteUrlError}</Text>
            ) : null}
            <Text style={{ fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: "#9ca3af", lineHeight: 18 }}>
              Don't have a link yet? Ask your admin to invite you from the Team Members screen in InspectProof.
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setShowInviteFlow(false)}
                style={{ flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 10, padding: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#6b7280", fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 14 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleOpenInviteUrl}
                style={{ flex: 2, backgroundColor: "#0B1933", borderRadius: 10, padding: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 14 }}>Open Invite Link</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + WEB_TOP + 24, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable
          onPress={() => step === "plan" ? setStep("profile") : router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backText}>{step === "plan" ? "Back to Profile" : "Back"}</Text>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Feather name="clipboard" size={22} color="#F2F3F4" />
          </View>
          <Text style={styles.title}>
            {step === "profile" ? "Create your account" : "Choose your plan"}
          </Text>
          <Text style={styles.subtitle}>
            {step === "profile"
              ? "Join Australia's building inspection platform"
              : "Start free — upgrade anytime. No lock-in."}
          </Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, step === "profile" ? styles.stepDotActive : styles.stepDotDone]}>
              {step === "plan" ? (
                <Feather name="check" size={12} color={Colors.primary} />
              ) : (
                <Text style={styles.stepDotText}>1</Text>
              )}
            </View>
            <Text style={[styles.stepLabel, step === "profile" && styles.stepLabelActive]}>Profile</Text>
          </View>
          <View style={styles.stepConnector} />
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, step === "plan" ? styles.stepDotActive : styles.stepDotInactive]}>
              <Text style={[styles.stepDotText, step === "plan" && { color: Colors.primary }]}>2</Text>
            </View>
            <Text style={[styles.stepLabel, step === "plan" && styles.stepLabelActive]}>Plan</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {step === "profile" ? (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Sarah"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="words"
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Mitchell"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Feather name="mail" size={15} color={Colors.textTertiary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { flex: 1, borderWidth: 0, paddingHorizontal: 0 }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com.au"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Feather name="lock" size={15} color={Colors.textTertiary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { flex: 1, borderWidth: 0, paddingHorizontal: 0 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={Colors.textTertiary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={Colors.textTertiary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Company / Organisation</Text>
              <View style={styles.inputWrapper}>
                <Feather name="briefcase" size={15} color={Colors.textTertiary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { flex: 1, borderWidth: 0, paddingHorizontal: 0 }]}
                  value={organization}
                  onChangeText={setOrganization}
                  placeholder="Your firm or company name"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Profession</Text>
              <Pressable
                onPress={() => setProfessionOpen(true)}
                style={[styles.inputWrapper, styles.dropdownTrigger]}
              >
                <Feather name="briefcase" size={15} color={Colors.textTertiary} style={{ marginRight: 8 }} />
                <Text style={[styles.dropdownValue, !profession && styles.dropdownPlaceholder]}>
                  {profession || "Select your profession"}
                </Text>
                <Feather name="chevron-down" size={15} color={Colors.textTertiary} />
              </Pressable>

              <Modal
                visible={professionOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setProfessionOpen(false)}
              >
                <Pressable style={styles.modalBackdrop} onPress={() => setProfessionOpen(false)}>
                  <View style={styles.dropdownList}>
                    <Text style={styles.dropdownListTitle}>Select Profession</Text>
                    {PROFESSIONS.map((p) => (
                      <Pressable
                        key={p}
                        onPress={() => { setProfession(p); setProfessionOpen(false); }}
                        style={[styles.dropdownItem, profession === p && styles.dropdownItemSelected]}
                      >
                        <Text style={[styles.dropdownItemText, profession === p && styles.dropdownItemTextSelected]}>
                          {p}
                        </Text>
                        {profession === p && <Feather name="check" size={14} color={Colors.accent} />}
                      </Pressable>
                    ))}
                  </View>
                </Pressable>
              </Modal>
            </View>

            <Pressable
              onPress={handleNext}
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.actionBtnText}>Continue to Plan Selection</Text>
              <Feather name="arrow-right" size={16} color={Colors.primary} />
            </Pressable>

            <View style={styles.invitedDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={handleSubmitInvited}
              disabled={submitting}
              style={({ pressed }) => [styles.invitedBtn, pressed && { opacity: 0.85 }, submitting && { opacity: 0.7 }]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <View style={{ gap: 2 }}>
                  <Text style={styles.invitedBtnTitle}>I was invited by my company</Text>
                  <Text style={styles.invitedBtnSub}>Create account without plan selection</Text>
                </View>
              )}
            </Pressable>

            <Pressable onPress={() => router.replace("/login" as any)} style={{ alignItems: "center" }}>
              <Text style={styles.switchText}>Already have an account? <Text style={styles.switchLink}>Sign In</Text></Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.planWrap}>
            {plans.map((plan) => (
              <Pressable
                key={plan.key}
                onPress={() => setSelectedPlan(plan.key)}
                style={[
                  styles.planCard,
                  selectedPlan === plan.key && styles.planCardSelected,
                  plan.highlight && styles.planCardHighlight,
                ]}
              >
                {plan.badge && (
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{plan.badge}</Text>
                  </View>
                )}
                <View style={styles.planHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, plan.highlight && styles.planNameHighlight]}>{plan.name}</Text>
                    <View style={styles.planPriceRow}>
                      <Text style={[styles.planPrice, plan.highlight && styles.planPriceHighlight]}>{plan.price}</Text>
                      <Text style={[styles.planPriceNote, plan.highlight && { color: "rgba(255,255,255,0.6)" }]}> {plan.priceNote}</Text>
                    </View>
                  </View>
                  <View style={[
                    styles.radioOuter,
                    selectedPlan === plan.key && styles.radioOuterSelected,
                    plan.highlight && { borderColor: "rgba(255,255,255,0.4)" },
                    plan.highlight && selectedPlan === plan.key && { borderColor: Colors.accent },
                  ]}>
                    {selectedPlan === plan.key && <View style={styles.radioInner} />}
                  </View>
                </View>
                <View style={styles.planFeatures}>
                  {plan.features.map((f) => (
                    <View key={f} style={styles.planFeatureRow}>
                      <Feather name="check" size={12} color={plan.highlight ? Colors.accent : Colors.success} />
                      <Text style={[styles.planFeatureText, plan.highlight && { color: "rgba(255,255,255,0.8)" }]}>{f}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            ))}

            {/* Payment note */}
            <View style={styles.paymentNote}>
              <Feather name="lock" size={13} color="rgba(255,255,255,0.4)" />
              <Text style={styles.paymentNoteText}>
                Secure payment via Stripe. Start free — card only required when upgrading.
              </Text>
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }, submitting && { opacity: 0.7 }]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Text style={styles.actionBtnText}>
                    {selectedPlan === "free_trial" ? "Create Free Account" : `Start ${plans.find(p => p.key === selectedPlan)?.name ?? selectedPlan} Plan`}
                  </Text>
                  <Feather name="arrow-right" size={16} color={Colors.primary} />
                </>
              )}
            </Pressable>

            <Text style={styles.termsText}>
              By creating an account you agree to our{" "}
              <Text style={styles.termsLink}>Terms & Conditions</Text>
              {" "}and{" "}
              <Text style={styles.termsLink}>Privacy Policy</Text>.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Colors.primary, paddingHorizontal: 24, gap: 20 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.7)" },
  header: { alignItems: "center", gap: 8 },
  logoBadge: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.secondary, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 24, fontFamily: "PlusJakartaSans_600SemiBold", color: "#FFFFFF", letterSpacing: -0.4, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 280 },

  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  stepItem: { alignItems: "center", gap: 4 },
  stepConnector: { width: 40, height: 1.5, backgroundColor: "rgba(255,255,255,0.15)", marginBottom: 16 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  stepDotActive: { backgroundColor: Colors.accent },
  stepDotDone: { backgroundColor: Colors.success },
  stepDotInactive: { backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)" },
  stepDotText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  stepLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.4)" },
  stepLabelActive: { color: Colors.accent },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.dangerBorder,
  },
  errorText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.danger, flex: 1 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 20, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 8,
  },
  row: { flexDirection: "row", gap: 10 },
  field: { gap: 5 },
  label: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    backgroundColor: Colors.background, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text,
  },
  inputWrapper: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    backgroundColor: Colors.background, paddingHorizontal: 12,
  },
  dropdownTrigger: { paddingVertical: 11, paddingHorizontal: 12 },
  dropdownValue: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  dropdownPlaceholder: { color: Colors.textTertiary },
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  dropdownList: {
    backgroundColor: Colors.surface, borderRadius: 16,
    paddingVertical: 8, width: "100%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10,
  },
  dropdownListTitle: {
    fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary,
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
    marginBottom: 4,
  },
  dropdownItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  dropdownItemSelected: { backgroundColor: Colors.background + "80" },
  dropdownItemText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  dropdownItemTextSelected: { color: Colors.secondary },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 15, marginTop: 4,
  },
  actionBtnText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  switchText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  switchLink: { color: Colors.secondary },

  planWrap: { gap: 12 },
  planCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 2, borderColor: Colors.border,
  },
  planCardSelected: { borderColor: Colors.secondary },
  planCardHighlight: { backgroundColor: Colors.primary, borderColor: Colors.secondary },
  planBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  planBadgeText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  planName: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  planNameHighlight: { color: "#FFFFFF" },
  planPriceRow: { flexDirection: "row", alignItems: "baseline" },
  planPrice: { fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  planPriceHighlight: { color: Colors.accent },
  planPriceNote: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  radioOuterSelected: { borderColor: Colors.secondary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.secondary },
  planFeatures: { gap: 6 },
  planFeatureRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  planFeatureText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },

  paymentNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  paymentNoteText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.4)", flex: 1, lineHeight: 17 },
  termsText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.3)", textAlign: "center", lineHeight: 16 },
  termsLink: { color: Colors.accent },

  invitedDivider: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.borderLight },
  dividerText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  invitedBtn: {
    borderWidth: 1.5, borderColor: Colors.accent + "50", borderRadius: 12, paddingVertical: 14,
    paddingHorizontal: 16, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.accent + "12",
  },
  invitedBtnTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.accent, textAlign: "center" },
  invitedBtnSub: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textAlign: "center" },
});
