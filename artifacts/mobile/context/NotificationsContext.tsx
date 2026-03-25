import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

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
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) {
        try {
          setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
        } catch {}
      }
    });
    checkPermission();
    if (Platform.OS !== "web") {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
  }, []);

  const checkPermission = async () => {
    if (Platform.OS === "web") {
      const perm = (typeof Notification !== "undefined") ? Notification.permission : "denied";
      setPermissionGranted(perm === "granted");
      return perm === "granted";
    }
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionGranted(status === "granted");
    return status === "granted";
  };

  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      if (typeof Notification === "undefined") return false;
      const result = await Notification.requestPermission();
      const granted = result === "granted";
      setPermissionGranted(granted);
      return granted;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === "granted";
    setPermissionGranted(granted);
    return granted;
  };

  const updatePrefs = useCallback(async (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }, [prefs]);

  const cancelAllReminders = useCallback(async () => {
    if (Platform.OS !== "web") {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  }, []);

  const scheduleInspectionReminders = useCallback(async (inspections: any[]) => {
    if (!prefs.remindersEnabled) return;

    const hasPermission = await checkPermission();
    if (!hasPermission) return;

    if (Platform.OS === "web") return;

    await cancelAllReminders();

    const now = new Date();
    for (const insp of inspections) {
      if (!insp.scheduledDate) continue;
      const timeStr = insp.displayTime || insp.scheduledTime;
      if (!timeStr) continue;

      const [hh, mm] = timeStr.split(":").map(Number);
      const inspDate = new Date(insp.scheduledDate + "T00:00:00");
      inspDate.setHours(hh, mm, 0, 0);

      const triggerTime = new Date(inspDate.getTime() - prefs.reminderMinutesBefore * 60 * 1000);
      if (triggerTime <= now) continue;

      const typeLabel = insp.inspectionType?.replace(/_/g, " ") || "Inspection";
      const address = insp.projectAddress ? `, ${insp.projectAddress}` : "";

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Inspection in ${prefs.reminderMinutesBefore} min`,
          body: `${typeLabel} — ${insp.projectName}${address}`,
          data: { inspectionId: insp.id },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerTime,
        },
      });
    }
  }, [prefs, cancelAllReminders]);

  return (
    <NotificationsContext.Provider value={{
      prefs,
      updatePrefs,
      scheduleInspectionReminders,
      cancelAllReminders,
      permissionGranted,
      requestPermission,
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
