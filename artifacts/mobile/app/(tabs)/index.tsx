import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  frame: "Frame",
  footings: "Footings",
  slab: "Slab",
  final: "Final",
  pool_barrier: "Pool Barrier",
  special: "Special",
  plumbing: "Plumbing",
  electrical: "Electrical",
  fire: "Fire Safety",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Scheduled", color: Colors.secondary, bg: Colors.infoLight },
  in_progress: { label: "In Progress", color: "#D69E2E", bg: "#FFFFF0" },
  completed: { label: "Completed", color: Colors.success, bg: Colors.successLight },
  follow_up_required: { label: "Follow-up", color: Colors.danger, bg: Colors.dangerLight },
  cancelled: { label: "Cancelled", color: Colors.textTertiary, bg: Colors.borderLight },
};

const MOCK_TIMES = [
  "07:30", "08:00", "08:30", "09:00", "09:30", "10:00",
  "10:30", "11:00", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30",
];

function getMockTime(id: number): string {
  return MOCK_TIMES[id % MOCK_TIMES.length];
}

function getDisplayTime(insp: any): string {
  return insp.scheduledTime || getMockTime(insp.id);
}

function useApiData<T>(url: string) {
  const { token } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
  return useQuery<T>({
    queryKey: [url, token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}${url}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    enabled: !!token,
  });
}

function toLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function WeekStrip({
  selectedDate,
  onSelect,
  inspectionDates,
}: {
  selectedDate: string;
  onSelect: (d: string) => void;
  inspectionDates: Set<string>;
}) {
  const today = toLocalDateStr(new Date());
  const days = useMemo(() => {
    const arr: { date: Date; str: string }[] = [];
    const start = new Date();
    start.setDate(start.getDate() - 2);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push({ date: d, str: toLocalDateStr(d) });
    }
    return arr;
  }, []);

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <View style={weekStyles.row}>
      {days.map(({ date, str }) => {
        const isSelected = str === selectedDate;
        const isToday = str === today;
        const hasDot = inspectionDates.has(str);
        return (
          <Pressable
            key={str}
            onPress={() => onSelect(str)}
            style={({ pressed }) => [
              weekStyles.dayCell,
              isSelected && weekStyles.dayCellSelected,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={[weekStyles.dayName, isSelected && weekStyles.dayNameSelected]}>
              {DAY_NAMES[date.getDay()]}
            </Text>
            <View style={[weekStyles.dayNum, isSelected && weekStyles.dayNumSelected, isToday && !isSelected && weekStyles.dayNumToday]}>
              <Text style={[weekStyles.dayNumText, isSelected && weekStyles.dayNumTextSelected, isToday && !isSelected && weekStyles.dayNumTextToday]}>
                {date.getDate()}
              </Text>
            </View>
            {hasDot ? (
              <View style={[weekStyles.dot, isSelected && weekStyles.dotSelected]} />
            ) : (
              <View style={weekStyles.dotPlaceholder} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const weekStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  dayCell: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 14,
    flex: 1,
  },
  dayCellSelected: { backgroundColor: Colors.primary },
  dayName: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  dayNameSelected: { color: "rgba(255,255,255,0.65)" },
  dayNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumSelected: { backgroundColor: Colors.accent },
  dayNumToday: { borderWidth: 1.5, borderColor: Colors.secondary },
  dayNumText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  dayNumTextSelected: { color: Colors.primary },
  dayNumTextToday: { color: Colors.secondary },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.secondary,
  },
  dotSelected: { backgroundColor: Colors.accent },
  dotPlaceholder: { width: 5, height: 5 },
});

function MapPinButton({ address, suburb }: { address: string; suburb: string | null }) {
  const { openAddressInMaps } = useNotifications();
  return (
    <Pressable
      onPress={() => openAddressInMaps(address, suburb)}
      hitSlop={8}
      style={({ pressed }) => [tlStyles.mapBtn, pressed && { opacity: 0.6 }]}
    >
      <Feather name="send" size={13} color={Colors.secondary} />
    </Pressable>
  );
}

function ScheduleTimeline({
  inspections,
  selectedDate,
}: {
  inspections: any[];
  selectedDate: string;
}) {
  const today = toLocalDateStr(new Date());
  const isToday = selectedDate === today;
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return toLocalDateStr(d); })();
  const isTomorrow = selectedDate === tomorrow;

  const dateLabel = isToday
    ? "Today"
    : isTomorrow
    ? "Tomorrow"
    : new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  const sorted = useMemo(() => {
    return [...inspections]
      .map((i) => ({ ...i, displayTime: getDisplayTime(i) }))
      .sort((a, b) => a.displayTime.localeCompare(b.displayTime));
  }, [inspections]);

  if (sorted.length === 0) {
    return (
      <View style={tlStyles.emptyWrap}>
        <View style={tlStyles.emptyIcon}>
          <Feather name="calendar" size={22} color={Colors.textTertiary} />
        </View>
        <Text style={tlStyles.emptyTitle}>No inspections {isToday ? "today" : "this day"}</Text>
        <Text style={tlStyles.emptySub}>
          {isToday ? "Enjoy the break — or schedule one now." : "Nothing booked for this date."}
        </Text>
        <Pressable
          onPress={() => router.push("/inspection/create" as any)}
          style={({ pressed }) => [tlStyles.emptyBtn, pressed && { opacity: 0.8 }]}
        >
          <Feather name="plus" size={14} color={Colors.primary} />
          <Text style={tlStyles.emptyBtnText}>Schedule Inspection</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={tlStyles.wrap}>
      <View style={tlStyles.headerRow}>
        <Text style={tlStyles.dateLabel}>{dateLabel}</Text>
        <Text style={tlStyles.countLabel}>{sorted.length} inspection{sorted.length !== 1 ? "s" : ""}</Text>
      </View>
      <View style={tlStyles.list}>
        {sorted.map((insp, idx) => {
          const cfg = STATUS_CONFIG[insp.status] ?? STATUS_CONFIG.scheduled;
          const typeLabel = INSPECTION_TYPE_LABELS[insp.inspectionType] ?? insp.inspectionType;
          const isLast = idx === sorted.length - 1;
          const hasAddress = !!(insp.projectAddress);
          const addressLine = [insp.projectAddress, insp.projectSuburb].filter(Boolean).join(", ");
          return (
            <Pressable
              key={insp.id}
              onPress={() => router.push(`/inspection/${insp.id}` as any)}
              style={({ pressed }) => [tlStyles.item, pressed && { opacity: 0.8 }]}
            >
              {/* Time column */}
              <View style={tlStyles.timeCol}>
                <Text style={tlStyles.time}>{insp.displayTime}</Text>
                {!isLast && <View style={tlStyles.connector} />}
              </View>
              {/* Card */}
              <View style={tlStyles.card}>
                <View style={tlStyles.cardTop}>
                  <View style={[tlStyles.typePill, { backgroundColor: Colors.infoLight }]}>
                    <Feather name="clipboard" size={11} color={Colors.secondary} />
                    <Text style={tlStyles.typeText}>{typeLabel}</Text>
                  </View>
                  <View style={[tlStyles.statusPill, { backgroundColor: cfg.bg }]}>
                    <Text style={[tlStyles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
                <Text style={tlStyles.projectName} numberOfLines={1}>{insp.projectName}</Text>

                {/* Address row with map pin */}
                {hasAddress && (
                  <View style={tlStyles.addressRow}>
                    <Feather name="map-pin" size={11} color={Colors.textTertiary} />
                    <Text style={tlStyles.addressText} numberOfLines={1}>{addressLine}</Text>
                    <MapPinButton address={insp.projectAddress} suburb={insp.projectSuburb} />
                  </View>
                )}

                {insp.inspectorName && (
                  <View style={tlStyles.metaRow}>
                    <Feather name="user" size={11} color={Colors.textTertiary} />
                    <Text style={tlStyles.metaText}>{insp.inspectorName}</Text>
                  </View>
                )}
                {(insp.status === "scheduled" || insp.status === "in_progress") && (
                  <Pressable
                    onPress={() => router.push(`/inspection/conduct/${insp.id}` as any)}
                    style={({ pressed }) => [tlStyles.actionBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Feather name={insp.status === "in_progress" ? "play-circle" : "arrow-right"} size={13} color={Colors.primary} />
                    <Text style={tlStyles.actionText}>
                      {insp.status === "in_progress" ? "Continue" : "Start Inspection"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const tlStyles = StyleSheet.create({
  wrap: { gap: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  dateLabel: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, letterSpacing: -0.3 },
  countLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  list: { gap: 0 },
  item: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  timeCol: { width: 46, alignItems: "flex-end", paddingTop: 14 },
  time: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  connector: { width: 1.5, flex: 1, backgroundColor: Colors.borderLight, marginTop: 6, marginBottom: -4, alignSelf: "center" },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 13,
    marginBottom: 10,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTop: { flexDirection: "row", gap: 6, alignItems: "center" },
  typePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  typeText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  statusPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginLeft: "auto" },
  statusText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  projectName: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 19 },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  addressText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
  },
  mapBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: Colors.secondary + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: Colors.accent + "30",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    marginTop: 2,
  },
  actionText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  emptyWrap: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emptySub: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textAlign: "center", maxWidth: 240 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  emptyBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { scheduleInspectionReminders, prefs } = useNotifications();
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr(new Date()));

  const { data: inspections = [], isRefetching, refetch } = useApiData<any[]>("/api/inspections");
  const { data: analytics } = useApiData<any>("/api/analytics/dashboard");

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const inspectionDates = useMemo(() => {
    const s = new Set<string>();
    (inspections as any[]).forEach((i) => { if (i.scheduledDate) s.add(i.scheduledDate); });
    return s;
  }, [inspections]);

  const inspectionsForDay = useMemo(() => {
    return (inspections as any[]).filter((i) => i.scheduledDate === selectedDate);
  }, [inspections, selectedDate]);

  useEffect(() => {
    if (inspections.length > 0 && prefs.remindersEnabled) {
      const todayStr = toLocalDateStr(new Date());
      const upcoming = (inspections as any[]).filter(
        (i) => i.scheduledDate && i.scheduledDate >= todayStr
      ).map((i) => ({ ...i, displayTime: getDisplayTime(i) }));
      scheduleInspectionReminders(upcoming);
    }
  }, [inspections, prefs.remindersEnabled]);

  const stats = [
    { label: "Active Projects", value: analytics?.activeProjects ?? "—", icon: "folder" as const, color: Colors.secondary },
    { label: "Open Issues", value: analytics?.openIssues ?? "—", icon: "alert-circle" as const, color: analytics?.criticalIssues > 0 ? Colors.danger : Colors.warning },
    { label: "This Month", value: analytics?.inspectionsThisMonth ?? "—", icon: "check-circle" as const, color: Colors.success },
    { label: "Pending Reports", value: analytics?.reportsPending ?? "—", icon: "file-text" as const, color: "#DD6B20" },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + WEB_TOP + 16, paddingBottom: insets.bottom + 100 },
      ]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.userName}>{user?.firstName || "Inspector"}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => router.push("/analytics" as any)}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <Feather name="bar-chart-2" size={20} color={Colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/more" as any)}
            style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.avatarText}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Stats Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
        {stats.map((s) => (
          <View key={s.label} style={styles.statChip}>
            <Feather name={s.icon} size={14} color={s.color} />
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Calendar Section */}
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <View style={styles.calendarTitleRow}>
            <Feather name="calendar" size={15} color={Colors.secondary} />
            <Text style={styles.calendarTitle}>Schedule</Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/inspections" as any)}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.viewAll}>View All</Text>
          </Pressable>
        </View>
        <WeekStrip
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          inspectionDates={inspectionDates}
        />
      </View>

      {/* Timeline */}
      <ScheduleTimeline inspections={inspectionsForDay} selectedDate={selectedDate} />

      {/* Overdue alert */}
      {(analytics?.overdueIssues || 0) > 0 && (
        <Pressable
          onPress={() => router.push("/(tabs)/issues" as any)}
          style={({ pressed }) => [styles.alertBanner, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.alertIcon}>
            <Feather name="alert-circle" size={16} color={Colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>{analytics.overdueIssues} Overdue Issues</Text>
            <Text style={styles.alertSub}>Tap to review</Text>
          </View>
          <Feather name="chevron-right" size={16} color={Colors.danger} />
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, gap: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLeft: { gap: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  greeting: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  userName: { fontSize: 24, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, letterSpacing: -0.5 },
  iconButton: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.accent },
  statsRow: { gap: 8, paddingRight: 16 },
  statChip: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    gap: 3,
    minWidth: 90,
  },
  statValue: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold" },
  statLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textAlign: "center" },
  calendarCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  calendarTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  calendarTitle: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  viewAll: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  alertBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.dangerLight, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.dangerBorder,
  },
  alertIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: "#FED7D7", alignItems: "center", justifyContent: "center",
  },
  alertTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.danger },
  alertSub: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.danger + "99" },
});
