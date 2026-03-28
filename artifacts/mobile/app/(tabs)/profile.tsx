import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Platform, ActivityIndicator, Alert, Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/constants/api";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

const WEB_TOP = 0;

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

function Field({
  label, value, onChange, placeholder, editable = true, keyboardType, autoCapitalize,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; editable?: boolean;
  keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, !editable && styles.fieldInputReadOnly]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? ""}
        placeholderTextColor={Colors.textTertiary}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        returnKeyType="done"
      />
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { user, token, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [companyName, setCompanyName] = useState(user?.companyName ?? "");
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasChanges =
    firstName !== (user?.firstName ?? "") ||
    lastName !== (user?.lastName ?? "") ||
    phone !== (user?.phone ?? "") ||
    companyName !== (user?.companyName ?? "") ||
    avatar !== (user?.avatar ?? null);

  const getBaseUrl = () =>
    process.env.EXPO_PUBLIC_DOMAIN
      ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
      : "";

  const authHeader = () => ({
    Authorization: `Bearer ${token ?? ""}`,
    "Content-Type": "application/json",
  });

  const handlePickPhoto = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Please allow access to your photo library to set a profile photo.");
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const base64Uri = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      setAvatar(base64Uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Please allow camera access to take a profile photo.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const base64Uri = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      setAvatar(base64Uri);
    }
  };

  const showPhotoOptions = () => {
    if (Platform.OS === "web") {
      handlePickPhoto();
      return;
    }
    Alert.alert("Profile Photo", "Choose how to set your profile photo", [
      { text: "Take Photo", onPress: handleTakePhoto },
      { text: "Choose from Library", onPress: handlePickPhoto },
      ...(avatar ? [{ text: "Remove Photo", style: "destructive" as const, onPress: () => setAvatar(null) }] : []),
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleSave = async () => {
    if (!firstName.trim()) { setError("First name is required."); return; }
    if (!lastName.trim()) { setError("Last name is required."); return; }
    setError("");
    setSaving(true);
    try {
      const r = await fetch(`${getBaseUrl()}/api/auth/profile`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ firstName, lastName, phone, avatar, companyName }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.message ?? "Failed to save."); return; }
      await refreshUser();
      Alert.alert("Saved", "Your profile has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const initials = `${(user?.firstName ?? "?")[0]}${(user?.lastName ?? "?")[0]}`.toUpperCase();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-left" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Edit Profile</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving || !hasChanges}
          style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 8 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Pressable onPress={showPhotoOptions} style={styles.avatarWrap}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Feather name="camera" size={14} color="#fff" />
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Company */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Company</Text>
          <View style={styles.group}>
            <Field
              label="Company name"
              value={companyName}
              onChange={setCompanyName}
              placeholder="e.g. Smith Inspections Pty Ltd"
            />
          </View>
          <Text style={styles.sectionNote}>
            Shown at the top of the app for all inspectors in your organisation.
          </Text>
        </View>

        {/* Personal Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <View style={styles.group}>
            <Field label="First name" value={firstName} onChange={setFirstName} placeholder="Jane" />
            <Field label="Last name" value={lastName} onChange={setLastName} placeholder="Smith" />
            <Field
              label="Phone"
              value={phone}
              onChange={setPhone}
              placeholder="+61 4xx xxx xxx"
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Read-only info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Details</Text>
          <View style={styles.group}>
            <Field label="Email address" value={user?.email ?? ""} editable={false} />
            <Field
              label="Professional role"
              value={user?.role ? (ROLE_LABELS[user.role] ?? user.role.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")) : ""}
              editable={false}
            />
          </View>
          <Text style={styles.sectionNote}>
            To change your email address or professional role, please contact support.
          </Text>
        </View>

        {/* Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.group}>
            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.7 }]}
              onPress={() => router.push("/change-password" as any)}
            >
              <View style={styles.actionRowIcon}>
                <Feather name="lock" size={17} color={Colors.secondary} />
              </View>
              <View style={styles.actionRowBody}>
                <Text style={styles.actionRowLabel}>Change Password</Text>
                <Text style={styles.actionRowSub}>Update your account password</Text>
              </View>
              <Feather name="chevron-right" size={16} color={Colors.textTertiary} />
            </Pressable>
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
  title: { flex: 1, fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  saveBtn: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, minWidth: 60, alignItems: "center",
  },
  saveBtnDisabled: { backgroundColor: Colors.border },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold" },

  content: { padding: 16, gap: 20 },

  avatarSection: { alignItems: "center", paddingVertical: 16 },
  avatarWrap: { position: "relative" },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: {
    backgroundColor: Colors.secondary, alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { fontSize: 32, fontFamily: "PlusJakartaSans_700Bold", color: "#fff" },
  avatarBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.background,
  },
  avatarHint: { marginTop: 8, fontSize: 12, color: Colors.textTertiary, fontFamily: "PlusJakartaSans_400Regular" },

  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: 10, padding: 12,
  },
  errorText: { color: Colors.danger, fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", flex: 1 },

  section: { gap: 8 },
  sectionTitle: {
    fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary, textTransform: "uppercase",
    letterSpacing: 1, paddingHorizontal: 4,
  },
  sectionNote: {
    fontSize: 11, color: Colors.textTertiary,
    fontFamily: "PlusJakartaSans_400Regular",
    paddingHorizontal: 4, lineHeight: 16,
  },
  group: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },

  field: { padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  fieldLabel: {
    fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4,
  },
  fieldInput: {
    fontSize: 15, fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.text, padding: 0,
  },
  fieldInputReadOnly: { color: Colors.textSecondary },

  actionRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  actionRowIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.infoLight,
    alignItems: "center", justifyContent: "center",
  },
  actionRowBody: { flex: 1 },
  actionRowLabel: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  actionRowSub: { fontSize: 11, color: Colors.textTertiary, fontFamily: "PlusJakartaSans_400Regular", marginTop: 2 },
});
