import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  Platform,
  Animated,
  PanResponder,
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
  footings: "Footings", slab: "Slab", frame: "Frame", pre_plaster: "Pre-Plaster",
  waterproofing: "Waterproofing", lock_up: "Lock-Up", pool_barrier: "Pool Barrier",
  final: "Final", special: "Special",
  qc_footing: "QC — Footings", qc_frame: "QC — Frame", qc_fitout: "QC — Fit-Out",
  qc_pre_handover: "QC — Pre-Handover", non_conformance: "Non-Conformance",
  hold_point: "Hold Point", daily_site: "Daily Site Diary", trade_inspection: "Trade Inspection",
  safety_inspection: "Safety Inspection", hazard_assessment: "Hazard Assessment",
  incident_inspection: "Incident Investigation", toolbox: "Toolbox Talk",
  pre_purchase_building: "Building Inspection", pre_purchase_pest: "Pest Inspection",
  pre_purchase_combined: "Building & Pest",
  fire_active: "Active Systems", fire_passive: "Passive Systems",
  annual_fire_safety: "Annual Fire Safety", fire_egress: "Egress & Evacuation",
  structural_footing: "Structural — Footings", structural_frame: "Structural — Frame",
  structural_final: "Structural — Final",
  plumbing: "Plumbing", drainage: "Drainage", pressure_test: "Pressure Test",
  electrical: "Electrical",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Scheduled", color: Colors.secondary, bg: Colors.infoLight },
  in_progress: { label: "In Progress", color: "#D69E2E", bg: "#FFFFF0" },
  completed: { label: "Completed", color: Colors.success, bg: Colors.successLight },
  follow_up_required: { label: "Follow-up", color: Colors.danger, bg: Colors.dangerLight },
  cancelled: { label: "Cancelled", color: Colors.textTertiary, bg: Colors.borderLight },
};

const INSPECTION_REPORT_TYPE: Record<string, string> = {
  final: "inspection_certificate",
  pool_barrier: "compliance_report",
  frame: "compliance_report", footings: "compliance_report", slab: "compliance_report",
  pre_plaster: "compliance_report", waterproofing: "compliance_report",
  lock_up: "compliance_report", special: "compliance_report",
  qc_footing: "quality_control_report", qc_frame: "quality_control_report",
  qc_fitout: "quality_control_report", qc_pre_handover: "quality_control_report",
  non_conformance: "non_conformance_report",
  hold_point: "compliance_report", daily_site: "compliance_report",
  trade_inspection: "compliance_report",
  safety_inspection: "safety_inspection_report", hazard_assessment: "hazard_assessment_report",
  incident_inspection: "safety_inspection_report", toolbox: "safety_inspection_report",
  pre_purchase_building: "pre_purchase_report", pre_purchase_pest: "pre_purchase_report",
  pre_purchase_combined: "pre_purchase_report",
  fire_active: "fire_inspection_report", fire_passive: "fire_inspection_report",
  annual_fire_safety: "annual_fire_safety", fire_egress: "fire_inspection_report",
  structural_footing: "compliance_report", structural_frame: "compliance_report",
  structural_final: "inspection_certificate",
  plumbing: "compliance_report", drainage: "compliance_report",
  pressure_test: "compliance_report", electrical: "compliance_report",
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

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(6 * 60, Math.min(20 * 60, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

const PIXELS_PER_15MIN = 28;

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

const WEEK_CELL_WIDTH = 52;
const WEEK_CARD_PAD = 14;
const TODAY_INDEX = 2; // start is 2 days before today

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
  const scrollRef = useRef<ScrollView>(null);

  const days = useMemo(() => {
    const arr: { date: Date; str: string }[] = [];
    const start = new Date();
    start.setDate(start.getDate() - TODAY_INDEX);
    for (let i = 0; i < 33; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push({ date: d, str: toLocalDateStr(d) });
    }
    return arr;
  }, []);

  // On mount: scroll so today is roughly centred
  useEffect(() => {
    const offset = Math.max(0, TODAY_INDEX * WEEK_CELL_WIDTH - WEEK_CELL_WIDTH * 2);
    setTimeout(() => scrollRef.current?.scrollTo({ x: offset, animated: false }), 50);
  }, []);

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -WEEK_CARD_PAD }}
      contentContainerStyle={{ paddingHorizontal: WEEK_CARD_PAD, gap: 2 }}
    >
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
    </ScrollView>
  );
}

const weekStyles = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 4 },
  dayCell: { alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14, width: WEEK_CELL_WIDTH },
  dayCellSelected: { backgroundColor: Colors.primary },
  dayName: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.3 },
  dayNameSelected: { color: "rgba(255,255,255,0.65)" },
  dayNum: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  dayNumSelected: { backgroundColor: Colors.accent },
  dayNumToday: { borderWidth: 1.5, borderColor: Colors.secondary },
  dayNumText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  dayNumTextSelected: { color: Colors.primary },
  dayNumTextToday: { color: Colors.secondary },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.secondary },
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

interface DraggableCardProps {
  insp: any;
  isLast: boolean;
  shiftMode: boolean;
  onTimeChange: (id: number, newTime: string) => void;
}

function DraggableCard({ insp, isLast, shiftMode, onTimeChange }: DraggableCardProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const [previewTime, setPreviewTime] = useState<string | null>(null);
  const shiftModeRef = useRef(shiftMode);
  const baseMinutesRef = useRef(timeToMinutes(insp.displayTime));

  useEffect(() => { shiftModeRef.current = shiftMode; }, [shiftMode]);
  useEffect(() => {
    baseMinutesRef.current = timeToMinutes(insp.displayTime);
  }, [insp.displayTime]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => shiftModeRef.current,
      onMoveShouldSetPanResponder: (_, gs) => shiftModeRef.current && Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        setDragging(true);
        translateY.setOffset((translateY as any).__getValue?.() ?? 0);
        translateY.setValue(0);
      },
      onPanResponderMove: (_, gs) => {
        translateY.setValue(gs.dy);
        const deltaSlots = Math.round(gs.dy / PIXELS_PER_15MIN);
        const newMins = snapToGrid(baseMinutesRef.current + deltaSlots * 15);
        setPreviewTime(minutesToTime(newMins));
      },
      onPanResponderRelease: (_, gs) => {
        const deltaSlots = Math.round(gs.dy / PIXELS_PER_15MIN);
        const newMins = snapToGrid(baseMinutesRef.current + deltaSlots * 15);
        const newTime = minutesToTime(newMins);
        translateY.flattenOffset();
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 10 }).start();
        setDragging(false);
        setPreviewTime(null);
        onTimeChange(insp.id, newTime);
      },
      onPanResponderTerminate: () => {
        translateY.flattenOffset();
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        setDragging(false);
        setPreviewTime(null);
      },
    })
  ).current;

  const cfg = STATUS_CONFIG[insp.status] ?? STATUS_CONFIG.scheduled;
  const typeLabel = INSPECTION_TYPE_LABELS[insp.inspectionType] ?? insp.inspectionType;
  const hasAddress = !!(insp.projectAddress);
  const addressLine = [insp.projectAddress, insp.projectSuburb].filter(Boolean).join(", ");
  const displayedTime = previewTime || insp.displayTime;

  return (
    <Animated.View
      style={[
        tlStyles.item,
        { transform: [{ translateY }], zIndex: dragging ? 100 : 1 },
      ]}
      {...(shiftMode ? panResponder.panHandlers : {})}
    >
      {/* Time column */}
      <View style={tlStyles.timeCol}>
        <Text style={[tlStyles.time, previewTime && tlStyles.timePreview]}>
          {displayedTime}
        </Text>
        {!isLast && !dragging && <View style={tlStyles.connector} />}
      </View>

      {/* Card */}
      <View style={[
        tlStyles.card,
        insp.status === "completed" && tlStyles.cardCompleted,
        shiftMode && tlStyles.cardShift,
        dragging && tlStyles.cardDragging,
      ]}>
        {/* Drag handle */}
        {shiftMode && (
          <View style={tlStyles.dragHandle}>
            <Feather name="menu" size={16} color={Colors.secondary + "80"} />
          </View>
        )}

        <View style={tlStyles.cardInner}>
          <View style={tlStyles.cardTop}>
            <View style={[tlStyles.typePill, { backgroundColor: Colors.infoLight }]}>
              <Feather name="clipboard" size={11} color={Colors.secondary} />
              <Text style={tlStyles.typeText}>{typeLabel}</Text>
            </View>
            <View style={[tlStyles.statusPill, { backgroundColor: cfg.bg, flexDirection: "row", alignItems: "center", gap: 3 }]}>
              {insp.status === "completed" && <Feather name="check-circle" size={10} color={cfg.color} />}
              <Text style={[tlStyles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          <Text
            style={[tlStyles.projectName, insp.status === "completed" && { color: Colors.textSecondary }]}
            numberOfLines={1}
          >{insp.projectName}</Text>

          {hasAddress && (
            <View style={tlStyles.addressRow}>
              <Feather name="map-pin" size={11} color={Colors.textTertiary} />
              <Text style={tlStyles.addressText} numberOfLines={1}>{addressLine}</Text>
              {!shiftMode && <MapPinButton address={insp.projectAddress} suburb={insp.projectSuburb} />}
            </View>
          )}

          {insp.inspectorName && (
            <View style={tlStyles.metaRow}>
              <Feather name="user" size={11} color={Colors.textTertiary} />
              <Text style={tlStyles.metaText}>{insp.inspectorName}</Text>
            </View>
          )}

          {!shiftMode && insp.status === "completed" && (
            <View style={tlStyles.completedActions}>
              <Pressable
                onPress={() => router.push({
                  pathname: "/inspection/generate-report",
                  params: {
                    id: String(insp.id),
                    autoType: INSPECTION_REPORT_TYPE[insp.inspectionType] || "compliance_report",
                  },
                } as any)}
                style={({ pressed }) => [tlStyles.reportBtn, pressed && { opacity: 0.8 }]}
              >
                <Feather name="file-text" size={13} color="#FFFFFF" />
                <Text style={tlStyles.reportBtnText}>Generate Report</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push(`/inspection/${insp.id}` as any)}
                style={({ pressed }) => [tlStyles.viewBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={tlStyles.viewBtnText}>View Results</Text>
              </Pressable>
            </View>
          )}

          {!shiftMode && insp.status !== "completed" && insp.status !== "cancelled" && (
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

          {shiftMode && (
            <View style={tlStyles.shiftHint}>
              <Feather name="move" size={11} color={Colors.secondary + "99"} />
              <Text style={tlStyles.shiftHintText}>Drag to reschedule · 15 min intervals</Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

function ScheduleTimeline({
  inspections,
  selectedDate,
  shiftMode,
  onToggleShift,
  onTimeChange,
}: {
  inspections: any[];
  selectedDate: string;
  shiftMode: boolean;
  onToggleShift: () => void;
  onTimeChange: (id: number, newTime: string) => void;
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

  const { active, completed } = useMemo(() => {
    const all = [...inspections].sort((a, b) => a.displayTime.localeCompare(b.displayTime));
    return {
      active:    all.filter(i => i.status !== "completed" && i.status !== "cancelled"),
      completed: all.filter(i => i.status === "completed" || i.status === "cancelled"),
    };
  }, [inspections]);

  const sorted = [...active, ...completed];

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
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={tlStyles.dateLabel}>{dateLabel}</Text>
          <Text style={tlStyles.countLabel}>{active.length} inspection{active.length !== 1 ? "s" : ""}</Text>
        </View>
        <Pressable
          onPress={onToggleShift}
          style={({ pressed }) => [
            tlStyles.shiftToggle,
            shiftMode && tlStyles.shiftToggleActive,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="sliders" size={13} color={shiftMode ? Colors.primary : Colors.textSecondary} />
          <Text style={[tlStyles.shiftToggleText, shiftMode && tlStyles.shiftToggleTextActive]}>
            {shiftMode ? "Done" : "Shift"}
          </Text>
        </Pressable>
      </View>

      {shiftMode && (
        <View style={tlStyles.shiftBanner}>
          <Feather name="info" size={13} color={Colors.secondary} />
          <Text style={tlStyles.shiftBannerText}>
            Drag any inspection card up or down to reschedule it. Snaps to 15-minute intervals.
          </Text>
        </View>
      )}

      {/* Active inspections */}
      {active.length > 0 && (
        <View style={tlStyles.list}>
          {active.map((insp, idx) => (
            <DraggableCard
              key={insp.id}
              insp={insp}
              isLast={idx === active.length - 1}
              shiftMode={shiftMode}
              onTimeChange={onTimeChange}
            />
          ))}
        </View>
      )}

      {active.length === 0 && !shiftMode && (
        <View style={tlStyles.allDoneBox}>
          <Feather name="check-circle" size={15} color={Colors.success} />
          <Text style={tlStyles.allDoneText}>All done for {dateLabel.toLowerCase()}!</Text>
        </View>
      )}

      {/* Completed section */}
      {completed.length > 0 && (
        <View style={tlStyles.completedSection}>
          <View style={tlStyles.completedHeader}>
            <Feather name="check-circle" size={13} color={Colors.success} />
            <Text style={tlStyles.completedHeading}>Completed</Text>
            <Text style={tlStyles.completedCount}>{completed.length}</Text>
          </View>
          <View style={tlStyles.list}>
            {completed.map((insp, idx) => (
              <DraggableCard
                key={insp.id}
                insp={insp}
                isLast={idx === completed.length - 1}
                shiftMode={shiftMode}
                onTimeChange={onTimeChange}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const tlStyles = StyleSheet.create({
  wrap: { gap: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateLabel: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, letterSpacing: -0.3 },
  countLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  shiftToggle: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  shiftToggleActive: {
    backgroundColor: Colors.accent, borderColor: Colors.accent,
  },
  shiftToggleText: {
    fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary,
  },
  shiftToggleTextActive: { color: Colors.primary },
  shiftBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.infoLight, borderRadius: 10, padding: 11,
    borderWidth: 1, borderColor: Colors.secondary + "30",
  },
  shiftBannerText: {
    flex: 1, fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary, lineHeight: 17,
  },
  list: { gap: 0 },
  item: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 2 },
  timeCol: { width: 46, alignItems: "flex-end", paddingTop: 14 },
  time: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  timePreview: { color: Colors.secondary, fontSize: 13 },
  connector: { width: 1.5, flex: 1, backgroundColor: Colors.borderLight, marginTop: 6, marginBottom: -4, alignSelf: "center" },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardShift: {
    borderColor: Colors.secondary + "40",
    borderStyle: "dashed",
  },
  cardDragging: {
    borderColor: Colors.secondary,
    borderStyle: "solid",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
    backgroundColor: "#FAFEFF",
  },
  cardCompleted: {
    backgroundColor: "#F4F5F6",
    borderColor: "#D8DADD",
    shadowOpacity: 0.02,
  },
  dragHandle: {
    alignItems: "center",
    paddingVertical: 6,
    backgroundColor: Colors.infoLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cardInner: { padding: 13, gap: 6 },
  cardTop: { flexDirection: "row", gap: 6, alignItems: "center" },
  typePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  typeText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  statusPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginLeft: "auto" },
  statusText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  projectName: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 19 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  addressText: { flex: 1, fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  mapBtn: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: Colors.secondary + "15",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.secondary + "30",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start",
    backgroundColor: Colors.accent + "30",
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, marginTop: 2,
  },
  actionText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  completedActions: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2,
  },
  reportBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7,
  },
  reportBtnText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "#FFFFFF" },
  viewBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "transparent",
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7,
  },
  viewBtnText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  shiftHint: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  shiftHintText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary + "99" },
  emptyWrap: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.borderLight, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emptySub: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textAlign: "center", maxWidth: 240 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  emptyBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  allDoneBox: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: Colors.successLight,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  allDoneText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.success },
  completedSection: { gap: 10, marginTop: 6 },
  completedHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  completedHeading: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  completedCount: {
    fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.success,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
  },
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { scheduleInspectionReminders, prefs } = useNotifications();
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr(new Date()));
  const [shiftMode, setShiftMode] = useState(false);
  const [localTimes, setLocalTimes] = useState<Record<number, string>>({});

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { data: rawInspections = [], isRefetching, refetch } = useApiData<any[]>("/api/inspections");
  const { data: analytics } = useApiData<any>("/api/analytics/dashboard");

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const inspections = useMemo(() => {
    return (rawInspections as any[]).map((i) => ({
      ...i,
      displayTime: localTimes[i.id] || getDisplayTime(i),
    }));
  }, [rawInspections, localTimes]);

  const inspectionDates = useMemo(() => {
    const s = new Set<string>();
    inspections.forEach((i) => { if (i.scheduledDate) s.add(i.scheduledDate); });
    return s;
  }, [inspections]);

  const inspectionsForDay = useMemo(() => {
    return inspections.filter((i) => i.scheduledDate === selectedDate);
  }, [inspections, selectedDate]);

  const handleTimeChange = useCallback(async (inspId: number, newTime: string) => {
    setLocalTimes((prev) => ({ ...prev, [inspId]: newTime }));
    try {
      await fetch(`${baseUrl}/api/inspections/${inspId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scheduledTime: newTime }),
      });
    } catch {}
  }, [baseUrl, token]);

  useEffect(() => {
    if (inspections.length > 0 && prefs.remindersEnabled) {
      const todayStr = toLocalDateStr(new Date());
      const upcoming = inspections.filter((i) => i.scheduledDate && i.scheduledDate >= todayStr);
      scheduleInspectionReminders(upcoming);
    }
  }, [inspections, prefs.remindersEnabled]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + WEB_TOP + 16, paddingBottom: insets.bottom + 100 },
      ]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!shiftMode}
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
      <ScheduleTimeline
        inspections={inspectionsForDay}
        selectedDate={selectedDate}
        shiftMode={shiftMode}
        onToggleShift={() => setShiftMode((v) => !v)}
        onTimeChange={handleTimeChange}
      />

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
