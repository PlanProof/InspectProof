import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  Platform, Switch, Image, Alert, Linking, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useNotifications, MapApp } from "@/context/NotificationsContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";
import { getApiUrl } from "@/constants/api";

const WEB_TOP = 0;

const MAP_OPTIONS: { value: MapApp; label: string; desc: string; icon: string }[] = [
  { value: "apple", label: "Apple Maps", desc: "Opens in Apple Maps app", icon: "map" },
  { value: "google", label: "Google Maps", desc: "Opens in Google Maps app or browser", icon: "navigation" },
  { value: "ask", label: "Ask each time", desc: "Choose the app whenever you tap an address", icon: "help-circle" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  certifier: "Building Certifier",
  inspector: "Site Inspector",
  building_inspector: "Building Inspector",
  engineer: "Structural Engineer",
  plumber: "Plumbing Inspector",
  project_manager: "Project Manager",
  builder: "Builder",
  supervisor: "Site Supervisor",
  whs: "WHS Officer",
  pre_purchase: "Pre-Purchase Inspector",
  fire_engineer: "Fire Safety Engineer",
  staff: "Staff",
  other: "Other",
};

function SettingRow({
  icon, label, sublabel, onPress, value, toggle, danger,
}: {
  icon: string; label: string; sublabel?: string;
  onPress?: () => void; value?: string;
  toggle?: { value: boolean; onChange: (v: boolean) => void };
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && { opacity: 0.75 }]}
      disabled={!onPress && !toggle}
    >
      <View style={[styles.rowIcon, danger && { backgroundColor: Colors.dangerLight }]}>
        <Feather name={icon as any} size={17} color={danger ? Colors.danger : Colors.secondary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, danger && { color: Colors.danger }]}>{label}</Text>
        {sublabel && <Text style={styles.rowSublabel}>{sublabel}</Text>}
      </View>
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          trackColor={{ false: Colors.border, true: Colors.secondary }}
          thumbColor="#fff"
        />
      ) : value ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : onPress ? (
        <Feather name="chevron-right" size={16} color={danger ? Colors.danger : Colors.textTertiary} />
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { user, logout, token } = useAuth();
  const { prefs, updatePrefs } = useNotifications();

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [marketingSaving, setMarketingSaving] = useState(false);

  const [calendarStatus, setCalendarStatus] = useState<{
    google: { connected: boolean; calendarName?: string };
    microsoft: { connected: boolean; calendarName?: string };
    googleAvailable: boolean;
    microsoftAvailable: boolean;
  } | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [disconnectingCal, setDisconnectingCal] = useState<string | null>(null);

  const [orgDetails, setOrgDetails] = useState<{
    name?: string; abn?: string; acn?: string; phone?: string;
    address?: string; suburb?: string; state?: string; postcode?: string;
    accredBody?: string; accredNum?: string; accredExpiry?: string;
    logoUrl?: string;
  } | null>(null);

  const fetchCalendarStatus = useCallback(async () => {
    if (!token) return;
    setCalendarLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/integrations/calendar/status"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCalendarStatus(data);
      }
    } catch {}
    setCalendarLoading(false);
  }, [token]);

  useEffect(() => {
    fetchCalendarStatus();
  }, [fetchCalendarStatus]);

  async function handleCalendarDisconnect(provider: string) {
    setDisconnectingCal(provider);
    try {
      await fetch(getApiUrl(`/api/integrations/calendar/${provider}/disconnect`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchCalendarStatus();
    } catch {
      Alert.alert("Error", "Failed to disconnect. Please try again.");
    } finally {
      setDisconnectingCal(null);
    }
  }

  function handleCalendarConnect(provider: string) {
    const connectUrl = getApiUrl(`/api/integrations/calendar/${provider}/connect?token=${encodeURIComponent(token || "")}`);
    Linking.openURL(connectUrl).catch(() => {
      Alert.alert("Error", "Could not open the browser. Please try again.");
    });
  }

  useEffect(() => {
    if (!token) return;
    fetch(getApiUrl("/api/auth/organisation"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && (data.name || data.abn || data.phone)) setOrgDetails(data);
      })
      .catch(() => {});
    fetch(getApiUrl("/api/auth/marketing-prefs"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setMarketingOptIn(data.marketingEmailOptIn ?? false); })
      .catch(() => {});
  }, [token]);

  const toggleMarketingOptIn = async (value: boolean) => {
    const previous = marketingOptIn;
    setMarketingOptIn(value);
    setMarketingSaving(true);
    try {
      const res = await fetch(getApiUrl("/api/auth/marketing-prefs"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ marketingEmailOptIn: value }),
      });
      if (!res.ok) {
        setMarketingOptIn(previous);
      }
    } catch {
      setMarketingOptIn(previous);
    } finally {
      setMarketingSaving(false);
    }
  };

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch(getApiUrl("/api/auth/account"), {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Request failed");
      await logout();
    } catch {
      Alert.alert("Error", "Failed to delete account. Please try again or email contact@inspectproof.com.au.");
    } finally {
      setDeleting(false);
    }
  }

  const initials = `${(user?.firstName ?? "?")[0]}${(user?.lastName ?? "?")[0]}`.toUpperCase();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-left" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <Pressable
          onPress={() => router.push("/profile" as any)}
          style={({ pressed }) => [styles.profileCard, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.profileLeft}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.profileAvatar} />
            ) : (
              <View style={[styles.profileAvatar, styles.profileAvatarFallback]}>
                <Text style={styles.profileInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.firstName} {user?.lastName}</Text>
              <Text style={styles.profileRole}>
                {user?.role ? (ROLE_LABELS[user.role] ?? user.role.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")) : "Professional"}
              </Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
          </View>
          <View style={styles.profileEditBadge}>
            <Feather name="edit-2" size={14} color={Colors.secondary} />
            <Text style={styles.profileEditText}>Edit</Text>
          </View>
        </Pressable>

        {/* Company Details (read-only) */}
        {orgDetails && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Company</Text>
            <View style={styles.group}>
              {orgDetails.logoUrl && (
                <View style={styles.orgLogoRow}>
                  <Image
                    source={{ uri: getApiUrl(`/api/storage${orgDetails.logoUrl}`) }}
                    style={styles.orgLogo}
                    resizeMode="contain"
                  />
                </View>
              )}
              {orgDetails.name && (
                <View style={styles.orgDetailRow}>
                  <Feather name="briefcase" size={14} color={Colors.textTertiary} style={styles.orgDetailIcon} />
                  <Text style={styles.orgDetailLabel}>Company</Text>
                  <Text style={styles.orgDetailValue}>{orgDetails.name}</Text>
                </View>
              )}
              {(orgDetails.abn || orgDetails.acn) && (
                <View style={styles.orgDetailRow}>
                  <Feather name="hash" size={14} color={Colors.textTertiary} style={styles.orgDetailIcon} />
                  <Text style={styles.orgDetailLabel}>{orgDetails.abn ? "ABN" : "ACN"}</Text>
                  <Text style={styles.orgDetailValue}>{orgDetails.abn || orgDetails.acn}</Text>
                </View>
              )}
              {orgDetails.phone && (
                <View style={styles.orgDetailRow}>
                  <Feather name="phone" size={14} color={Colors.textTertiary} style={styles.orgDetailIcon} />
                  <Text style={styles.orgDetailLabel}>Phone</Text>
                  <Text style={styles.orgDetailValue}>{orgDetails.phone}</Text>
                </View>
              )}
              {(orgDetails.address || orgDetails.suburb) && (
                <View style={styles.orgDetailRow}>
                  <Feather name="map-pin" size={14} color={Colors.textTertiary} style={styles.orgDetailIcon} />
                  <Text style={styles.orgDetailLabel}>Address</Text>
                  <Text style={styles.orgDetailValue}>
                    {[orgDetails.address, orgDetails.suburb, orgDetails.state, orgDetails.postcode].filter(Boolean).join(", ")}
                  </Text>
                </View>
              )}
              {(orgDetails.accredBody || orgDetails.accredNum) && (
                <View style={styles.orgDetailRow}>
                  <Feather name="award" size={14} color={Colors.textTertiary} style={styles.orgDetailIcon} />
                  <Text style={styles.orgDetailLabel}>Accreditation</Text>
                  <Text style={styles.orgDetailValue}>
                    {[orgDetails.accredBody, orgDetails.accredNum].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              )}
              {orgDetails.accredExpiry && (
                <View style={styles.orgDetailRow}>
                  <Feather name="calendar" size={14} color={Colors.textTertiary} style={styles.orgDetailIcon} />
                  <Text style={styles.orgDetailLabel}>Acc. Expiry</Text>
                  <Text style={styles.orgDetailValue}>{orgDetails.accredExpiry}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.group}>
            <SettingRow
              icon="package"
              label="Plan"
              sublabel={Platform.OS === "ios" ? "Visit inspectproof.com.au to manage your plan" : undefined}
              value={user?.plan
                ? ({ free_trial: "Free Trial", starter: "Starter", professional: "Professional", enterprise: "Enterprise" }[user.plan] ?? user.plan)
                : "Not available"}
              onPress={Platform.OS !== "ios" ? () => Linking.openURL("https://inspectproof.com.au").catch(() => {}) : undefined}
            />
            <SettingRow
              icon="lock"
              label="Change Password"
              sublabel="Update your account password"
              onPress={() => router.push("/change-password" as any)}
            />
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.group}>
            <SettingRow
              icon="bell"
              label="Inspection Reminders"
              sublabel="Get notified before scheduled inspections"
              toggle={{ value: prefs.remindersEnabled, onChange: (v) => updatePrefs({ remindersEnabled: v }) }}
            />
            <SettingRow
              icon="settings"
              label="Reminder Timing"
              sublabel="Set how far in advance you're reminded"
              onPress={() => router.push("/notifications" as any)}
            />
          </View>
        </View>

        {/* Communication Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Communication Preferences</Text>
          <View style={styles.group}>
            <SettingRow
              icon="mail"
              label="Product Updates & News"
              sublabel="Receive inspection tips and product news from InspectProof"
              toggle={{ value: marketingOptIn, onChange: toggleMarketingOptIn }}
            />
          </View>
          <Text style={[styles.sectionHint, { marginTop: 4, fontSize: 11, fontFamily: "PlusJakartaSans_400Regular" }]}>
            {marketingSaving ? "Saving..." : "Marketing emails only. Transactional emails are always sent."}
          </Text>
        </View>

        {/* General — Open addresses in */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>
          <Text style={styles.sectionHint}>Open addresses in</Text>
          <View style={styles.group}>
            {MAP_OPTIONS.map((opt) => {
              if (opt.value === "apple" && Platform.OS === "android") return null;
              const selected = prefs.mapApp === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => updatePrefs({ mapApp: opt.value })}
                  style={({ pressed }) => [styles.row, styles.rowTall, selected && styles.rowSelected, pressed && { opacity: 0.75 }]}
                >
                  <View style={[styles.rowIcon, selected && styles.rowIconSelected]}>
                    <Feather name={opt.icon as any} size={17} color={selected ? Colors.secondary : Colors.textTertiary} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowLabel, selected && { color: Colors.secondary }]}>{opt.label}</Text>
                    <Text style={styles.rowSublabel}>{opt.desc}</Text>
                  </View>
                  {selected && <Feather name="check" size={15} color={Colors.secondary} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Calendar Integration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calendar Integration</Text>
          <View style={styles.group}>
            {calendarLoading ? (
              <View style={[styles.row, { justifyContent: "center" }]}>
                <ActivityIndicator size="small" color={Colors.secondary} />
              </View>
            ) : (
              <>
                {/* Google Calendar */}
                <View style={styles.calRow}>
                  <View style={[styles.rowIcon, { backgroundColor: "#EEF2FF" }]}>
                    <Feather name="calendar" size={17} color="#4B6CC1" />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowLabel}>Google Calendar</Text>
                    {calendarStatus?.google?.connected ? (
                      <Text style={[styles.rowSublabel, { color: Colors.success }]}>
                        Connected{calendarStatus.google.calendarName ? ` — ${calendarStatus.google.calendarName}` : ""}
                      </Text>
                    ) : (
                      <Text style={styles.rowSublabel}>Not connected</Text>
                    )}
                  </View>
                  {calendarStatus?.google?.connected ? (
                    <Pressable
                      onPress={() => {
                        Alert.alert("Disconnect Google Calendar", "Remove the Google Calendar connection?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Disconnect", style: "destructive", onPress: () => handleCalendarDisconnect("google") },
                        ]);
                      }}
                      disabled={disconnectingCal === "google"}
                      style={({ pressed }) => [styles.calBtn, styles.calBtnDanger, pressed && { opacity: 0.75 }]}
                    >
                      {disconnectingCal === "google" ? (
                        <ActivityIndicator size="small" color={Colors.danger} />
                      ) : (
                        <Text style={styles.calBtnDangerText}>Disconnect</Text>
                      )}
                    </Pressable>
                  ) : calendarStatus?.googleAvailable ? (
                    <Pressable
                      onPress={() => handleCalendarConnect("google")}
                      style={({ pressed }) => [styles.calBtn, styles.calBtnPrimary, pressed && { opacity: 0.75 }]}
                    >
                      <Text style={styles.calBtnPrimaryText}>Connect</Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.rowSublabel, { fontStyle: "italic" }]}>N/A</Text>
                  )}
                </View>

                {/* Microsoft Outlook */}
                <View style={[styles.calRow, { borderBottomWidth: 0 }]}>
                  <View style={[styles.rowIcon, { backgroundColor: "#EEF2FF" }]}>
                    <Feather name="calendar" size={17} color="#6366F1" />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowLabel}>Outlook</Text>
                    {calendarStatus?.microsoft?.connected ? (
                      <Text style={[styles.rowSublabel, { color: Colors.success }]}>
                        Connected{calendarStatus.microsoft.calendarName ? ` — ${calendarStatus.microsoft.calendarName}` : ""}
                      </Text>
                    ) : (
                      <Text style={styles.rowSublabel}>Not connected</Text>
                    )}
                  </View>
                  {calendarStatus?.microsoft?.connected ? (
                    <Pressable
                      onPress={() => {
                        Alert.alert("Disconnect Outlook", "Remove the Outlook Calendar connection?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Disconnect", style: "destructive", onPress: () => handleCalendarDisconnect("microsoft") },
                        ]);
                      }}
                      disabled={disconnectingCal === "microsoft"}
                      style={({ pressed }) => [styles.calBtn, styles.calBtnDanger, pressed && { opacity: 0.75 }]}
                    >
                      {disconnectingCal === "microsoft" ? (
                        <ActivityIndicator size="small" color={Colors.danger} />
                      ) : (
                        <Text style={styles.calBtnDangerText}>Disconnect</Text>
                      )}
                    </Pressable>
                  ) : calendarStatus?.microsoftAvailable ? (
                    <Pressable
                      onPress={() => handleCalendarConnect("microsoft")}
                      style={({ pressed }) => [styles.calBtn, styles.calBtnPrimary, pressed && { opacity: 0.75 }]}
                    >
                      <Text style={styles.calBtnPrimaryText}>Connect</Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.rowSublabel, { fontStyle: "italic" }]}>N/A</Text>
                  )}
                </View>
              </>
            )}
          </View>
        </View>

        {/* App */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.group}>
            <SettingRow
              icon="refresh-cw"
              label="Clear Local Cache"
              sublabel="Force-refresh data from server"
              onPress={() => { setConfirmClearCache(true); setCacheCleared(false); }}
            />
            {confirmClearCache && (
              <View style={styles.confirmRow}>
                {cacheCleared ? (
                  <View style={styles.confirmSuccess}>
                    <Feather name="check-circle" size={15} color={Colors.success} />
                    <Text style={styles.confirmSuccessText}>Cache cleared</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.confirmText}>This will reload all data from the server.</Text>
                    <View style={styles.confirmActions}>
                      <Pressable
                        onPress={() => setConfirmClearCache(false)}
                        style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnGhost, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={styles.confirmBtnGhostText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setCacheCleared(true)}
                        style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnPrimary, pressed && { opacity: 0.8 }]}
                      >
                        <Text style={styles.confirmBtnPrimaryText}>Clear</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            )}
            <SettingRow icon="info" label="App Version" value="1.0.0" />
            <SettingRow icon="globe" label="Region" value="Australia" />
          </View>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.group}>
            <SettingRow
              icon="help-circle"
              label="Help & Support"
              sublabel="FAQs and contact"
              onPress={() => router.push("/help" as any)}
            />
          </View>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <View style={styles.group}>
            <SettingRow
              icon="log-out"
              label="Sign Out"
              onPress={() => setConfirmSignOut(true)}
              danger
            />
            {confirmSignOut && (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmText}>Are you sure you want to sign out?</Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={() => setConfirmSignOut(false)}
                    style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnGhost, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.confirmBtnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={logout}
                    style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnDanger, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.confirmBtnDangerText}>Sign Out</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Delete Account */}
        <View style={styles.section}>
          <View style={styles.group}>
            <SettingRow
              icon="trash-2"
              label="Delete Account"
              sublabel="Permanently remove your profile and personal data"
              onPress={() => { setConfirmDelete(true); setConfirmSignOut(false); }}
              danger
            />
            {confirmDelete && (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmText}>
                  This will permanently delete your name, email, phone, and all personal data from InspectProof. Inspection and company records will be retained as required by Australian building law. This cannot be undone.
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={() => setConfirmDelete(false)}
                    style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnGhost, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.confirmBtnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDeleteAccount}
                    disabled={deleting}
                    style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnDanger, (pressed || deleting) && { opacity: 0.7 }]}
                  >
                    <Text style={styles.confirmBtnDangerText}>{deleting ? "Deleting…" : "Delete Account"}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  content: { padding: 16, gap: 20 },

  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  profileLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  profileAvatar: { width: 56, height: 56, borderRadius: 28 },
  profileAvatarFallback: {
    backgroundColor: Colors.secondary, alignItems: "center", justifyContent: "center",
  },
  profileInitials: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold", color: "#fff" },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  profileRole: { fontSize: 12, color: Colors.secondary, fontFamily: "PlusJakartaSans_600SemiBold", marginTop: 1 },
  profileEmail: { fontSize: 11, color: Colors.textTertiary, fontFamily: "PlusJakartaSans_400Regular", marginTop: 2 },
  profileEditBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.infoLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  profileEditText: { fontSize: 12, color: Colors.secondary, fontFamily: "PlusJakartaSans_600SemiBold" },

  section: { gap: 8 },
  sectionTitle: {
    fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary, textTransform: "uppercase",
    letterSpacing: 1, paddingHorizontal: 4,
  },
  sectionHint: {
    fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary, paddingHorizontal: 4,
  },
  group: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  rowTall: { paddingVertical: 13 },
  rowSelected: { backgroundColor: Colors.infoLight },
  rowIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.infoLight,
    alignItems: "center", justifyContent: "center",
  },
  rowIconSelected: { backgroundColor: Colors.secondary + "20" },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  rowSublabel: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", color: Colors.textTertiary, marginTop: 2 },
  rowValue: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },

  confirmRow: {
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
    padding: 14, gap: 10,
  },
  confirmText: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", color: Colors.textSecondary, lineHeight: 18 },
  confirmActions: { flexDirection: "row", gap: 8 },
  confirmBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  confirmBtnGhost: { borderWidth: 1, borderColor: Colors.border },
  confirmBtnGhostText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  confirmBtnPrimary: { backgroundColor: Colors.secondary },
  confirmBtnPrimaryText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
  confirmBtnDanger: { backgroundColor: Colors.danger },
  confirmBtnDangerText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
  confirmSuccess: { flexDirection: "row", alignItems: "center", gap: 8 },
  confirmSuccessText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.success },

  calRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  calBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, minWidth: 80, alignItems: "center",
  },
  calBtnPrimary: { backgroundColor: Colors.secondary },
  calBtnPrimaryText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
  calBtnDanger: { borderWidth: 1, borderColor: Colors.danger },
  calBtnDangerText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.danger },

  orgLogoRow: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    alignItems: "flex-start",
  },
  orgLogo: { width: 120, height: 40 },
  orgDetailRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  orgDetailIcon: { marginTop: 1 },
  orgDetailLabel: {
    fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary, width: 88,
  },
  orgDetailValue: {
    flex: 1, fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", color: Colors.text,
  },
});
