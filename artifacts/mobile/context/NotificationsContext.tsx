import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Linking, Alert } from "react-native";
import Constants from "expo-constants";

// expo-notifications crashes in Expo Go SDK 53 — skip all push/schedule features there
const IS_EXPO_GO = Constants.appOwnership === "expo";

const PREFS_KEY = "inspectproof_notification_prefs";

export type MapApp = "apple" | "google" | "ask";
export type ReminderMinutes = 15 | 30 | 60 | 120;

export interface NotificationPrefs {
  remindersEnabled: boolean;
  reminderMinutesBefore: ReminderMinutes;
  mapApp: MapApp;
}

const DEFAULT_PREFS: NotificationPrefs = {
  remindersEnabled: true,
  reminderMinutesBefore: 30,
  mapApp: Platform.OS === "ios" ? "apple" : "google",
};

interface NotificationsContextValue {
  prefs: NotificationPrefs;
  updatePrefs: (patch: Partial<NotificationPrefs>) => Promise<void>;
  scheduleInspectionReminders: (inspections: any[]) => Promise<void>;
  cancelAllReminders: () => Promise<void>;
  permissionGranted: boolean;
  requestPermission: () => Promise<boolean>;
  openAddressInMaps: (address: string, suburb: string | null) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

async function tryScheduleNative(inspections: any[], prefs: NotificationPrefs): Promise<void> {
  if (IS_EXPO_GO) return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    for (const insp of inspections) {
      if (!insp.scheduledDate || !insp.displayTime) continue;
      const [hh, mm] = insp.displayTime.split(":").map(Number);
      const inspDate = new Date(insp.scheduledDate + "T00:00:00");
      inspDate.setHours(hh, mm, 0, 0);
      const triggerTime = new Date(inspDate.getTime() - prefs.reminderMinutesBefore * 60 * 1000);
      if (triggerTime <= now) continue;

      const typeLabel = (insp.inspectionType || "Inspection").replace(/_/g, " ");
      const addr = insp.projectAddress ? `, ${insp.projectAddress}` : "";

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Inspection in ${prefs.reminderMinutesBefore} min`,
          body: `${typeLabel} — ${insp.projectName}${addr}`,
          data: { inspectionId: insp.id },
        },
        trigger: {
          type: (Notifications as any).SchedulableTriggerInputTypes?.DATE ?? "date",
          date: triggerTime,
        } as any,
      });
    }
  } catch {
  }
}

async function tryRequestNativePermission(): Promise<boolean> {
  if (IS_EXPO_GO) return false;
  try {
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

async function tryGetNativePermission(): Promise<boolean> {
  if (IS_EXPO_GO) return false;
  try {
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

function buildMapsUrl(address: string, suburb: string | null, app: "apple" | "google"): string {
  const query = encodeURIComponent([address, suburb].filter(Boolean).join(", ") + ", Australia");
  if (app === "apple") return `maps://?q=${query}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) {
        try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) }); } catch {}
      }
    });
    checkPermission();
  }, []);

  const checkPermission = async () => {
    if (Platform.OS === "web") {
      const perm = typeof Notification !== "undefined" ? Notification.permission : "denied";
      setPermissionGranted(perm === "granted");
      return perm === "granted";
    }
    const granted = await tryGetNativePermission();
    setPermissionGranted(granted);
    return granted;
  };

  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      if (typeof Notification === "undefined") return false;
      const result = await Notification.requestPermission();
      const granted = result === "granted";
      setPermissionGranted(granted);
      return granted;
    }
    const granted = await tryRequestNativePermission();
    setPermissionGranted(granted);
    return granted;
  };

  const updatePrefs = useCallback(async (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }, [prefs]);

  const cancelAllReminders = useCallback(async () => {
    if (Platform.OS === "web" || IS_EXPO_GO) return;
    try {
      const Notifications = await import("expo-notifications");
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {}
  }, []);

  const scheduleInspectionReminders = useCallback(async (inspections: any[]) => {
    if (!prefs.remindersEnabled || Platform.OS === "web") return;
    const hasPermission = await checkPermission();
    if (!hasPermission) return;
    await tryScheduleNative(inspections, prefs);
  }, [prefs]);

  const openAddressInMaps = useCallback((address: string, suburb: string | null) => {
    const open = async (app: "apple" | "google") => {
      const url = buildMapsUrl(address, suburb, app);
      try {
        const canOpen = await Linking.canOpenURL(url);
        await Linking.openURL(canOpen ? url : buildMapsUrl(address, suburb, "google"));
      } catch {
        await Linking.openURL(buildMapsUrl(address, suburb, "google"));
      }
    };

    if (prefs.mapApp === "ask") {
      const buttons: any[] = [
        { text: "Google Maps", onPress: () => open("google") },
        { text: "Cancel", style: "cancel" },
      ];
      if (Platform.OS === "ios") {
        buttons.unshift({ text: "Apple Maps", onPress: () => open("apple") });
      }
      Alert.alert("Open in Maps", "Choose your maps app", buttons);
    } else {
      open(prefs.mapApp === "apple" ? "apple" : "google");
    }
  }, [prefs.mapApp]);

  return (
    <NotificationsContext.Provider value={{
      prefs,
      updatePrefs,
      scheduleInspectionReminders,
      cancelAllReminders,
      permissionGranted,
      requestPermission,
      openAddressInMaps,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be inside NotificationsProvider");
  return ctx;
}
