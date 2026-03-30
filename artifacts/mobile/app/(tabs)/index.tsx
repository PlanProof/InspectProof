import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

// ── Pre-download helpers ──────────────────────────────────────────────────────
const DOC_CACHE_DIR = Platform.OS !== "web" ? ((FileSystem.cacheDirectory ?? "") + "inspectproof-docs/") : "";

function mimeToExt(mime: string): string | null {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime.includes("word") || mime.includes("document")) return "docx";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "xlsx";
  return null;
}

function docUrlToFilename(url: string, mimeType?: string): string {
  const urlNoQuery = url.split("?")[0];
  const rawExt = urlNoQuery.split(".").pop()?.toLowerCase();
  const lastSegment = urlNoQuery.split("/").pop() ?? "";
  const hasRealExt = !!rawExt && rawExt.length <= 4 && rawExt !== lastSegment;
  const ext = hasRealExt ? rawExt : (mimeType ? mimeToExt(mimeType) : null);
  const safe = url.replace(/[^a-z0-9]/gi, "_");
  const trimmed = safe.slice(Math.max(0, safe.length - 80));
  return ext ? `${trimmed}.${ext}` : trimmed;
}

// In-memory set — once downloaded, stays "done" for the session
const downloadedProjects = new Set<number>();

const WEB_TOP = 0;

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  footing: "Footing", footings: "Footings", slab: "Slab", frame: "Frame", pre_plaster: "Pre-Plaster",
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
  structural_footing_slab: "Structural — Footing & Slab", structural_frame: "Structural — Frame",
  structural_final: "Structural — Final",
  plumbing: "Plumbing", drainage: "Drainage", pressure_test: "Pressure Test",
  electrical: "Electrical",
};

const toTitleCase = (str: string) =>
  str.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled:          { label: "Not Started",      color: Colors.textSecondary, bg: Colors.borderLight },
  in_progress:        { label: "In Progress",       color: "#B45309",            bg: "#FEF3C7" },
  completed:          { label: "Complete",           color: Colors.success,       bg: Colors.successLight },
  follow_up_required: { label: "Action Required",   color: Colors.danger,        bg: Colors.dangerLight },
  cancelled:          { label: "Cancelled",          color: Colors.textTertiary,  bg: Colors.borderLight },
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
  structural_footing_slab: "compliance_report", structural_frame: "compliance_report",
  structural_final: "inspection_certificate",
  plumbing: "compliance_report", drainage: "compliance_report",
  pressure_test: "compliance_report", electrical: "compliance_report",
};

function getDisplayTime(insp: any): string {
  return insp.scheduledTime || "TBD";
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

interface InspCardProps {
  insp: any;
  isLast: boolean;
  onEditTime: (inspId: number, currentTime: string, currentDate: string) => void;
  reportSent?: boolean;
  hasReport?: boolean;
}

function InspCard({ insp, onEditTime, reportSent, hasReport }: InspCardProps) {
  const typeLabel = INSPECTION_TYPE_LABELS[insp.inspectionType] ?? toTitleCase(insp.inspectionType ?? "");
  const hasAddress = !!(insp.projectAddress);
  const addressLine = [insp.projectAddress, insp.projectSuburb].filter(Boolean).join(", ");
  const isCompleted = insp.status === "completed";
  const isInProgress = insp.status === "in_progress";
  const isFollowUp = insp.status === "follow_up_required";

  const { token } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  type DlState = "checking" | "idle" | "downloading" | "done" | "error";
  const [dlState, setDlState] = useState<DlState>(
    downloadedProjects.has(insp.projectId) ? "done" : "checking"
  );
  const [dlProgress, setDlProgress] = useState(0);
  const [dlTotal, setDlTotal] = useState(0);
  const [dlCount, setDlCount] = useState(0);

  // On mount: check if docs are already in cache (native only, non-completed)
  useEffect(() => {
    if (Platform.OS === "web" || isCompleted || !insp.projectId || downloadedProjects.has(insp.projectId)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/projects/${insp.projectId}/documents`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || cancelled) { setDlState("idle"); return; }
        const docs: any[] = await res.json();
        const pdfs = docs.filter(d => d.mimeType === "application/pdf" && d.fileUrl);
        if (pdfs.length === 0) { setDlState("idle"); return; }
        await FileSystem.makeDirectoryAsync(DOC_CACHE_DIR, { intermediates: true });
        let allCached = true;
        for (const doc of pdfs) {
          const fileUrl = `${baseUrl}/api/storage${doc.fileUrl}`;
          const dest = DOC_CACHE_DIR + docUrlToFilename(fileUrl, doc.mimeType);
          const info = await FileSystem.getInfoAsync(dest);
          if (!info.exists || !(info as any).size) { allCached = false; break; }
        }
        if (!cancelled) {
          if (allCached) { downloadedProjects.add(insp.projectId); setDlState("done"); }
          else setDlState("idle");
        }
      } catch { if (!cancelled) setDlState("idle"); }
    })();
    return () => { cancelled = true; };
  }, [insp.projectId]);

  const downloadDocs = async () => {
    if (dlState === "downloading" || dlState === "done") return;
    setDlState("downloading");
    setDlProgress(0); setDlCount(0); setDlTotal(0);
    try {
      const res = await fetch(`${baseUrl}/api/projects/${insp.projectId}/documents`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("fetch failed");
      const docs: any[] = await res.json();
      const pdfs = docs.filter(d => d.mimeType === "application/pdf" && d.fileUrl);
      if (pdfs.length === 0) { setDlState("done"); return; }
      setDlTotal(pdfs.length);
      await FileSystem.makeDirectoryAsync(DOC_CACHE_DIR, { intermediates: true });
      for (let i = 0; i < pdfs.length; i++) {
        const doc = pdfs[i];
        const fileUrl = `${baseUrl}/api/storage${doc.fileUrl}`;
        const dest = DOC_CACHE_DIR + docUrlToFilename(fileUrl, doc.mimeType);
        const info = await FileSystem.getInfoAsync(dest);
        if (!info.exists || !(info as any).size) {
          const dl = FileSystem.createDownloadResumable(
            fileUrl, dest,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} },
          );
          await dl.downloadAsync();
        }
        setDlCount(i + 1);
        setDlProgress((i + 1) / pdfs.length);
      }
      downloadedProjects.add(insp.projectId);
      setDlState("done");
    } catch { setDlState("error"); }
  };

  return (
    <View style={tlStyles.item}>
      <View style={[tlStyles.card, isCompleted && tlStyles.cardCompleted]}>
        <View style={tlStyles.cardInner}>
          <View style={tlStyles.cardTop}>
            <View style={[tlStyles.typePill, { backgroundColor: Colors.infoLight }]}>
              <Feather name="clipboard" size={11} color={Colors.secondary} />
              <Text style={tlStyles.typeText}>{typeLabel}</Text>
            </View>
            <Pressable
              onPress={() => onEditTime(insp.id, insp.displayTime, insp.scheduledDate || toLocalDateStr(new Date()))}
              style={({ pressed }) => [tlStyles.timePill, pressed && { opacity: 0.6 }]}
            >
              <Feather name="clock" size={11} color={Colors.secondary} />
              <Text style={[tlStyles.timeInCard, { color: Colors.secondary }]}>{insp.displayTime}</Text>
              <Feather name="edit-2" size={9} color={Colors.secondary + "99"} />
            </Pressable>
          </View>

          <Text
            style={[tlStyles.projectName, isCompleted && { color: Colors.textSecondary }]}
            numberOfLines={1}
          >{insp.projectName}</Text>

          {hasAddress && (
            <View style={tlStyles.addressRow}>
              <Feather name="map-pin" size={11} color={Colors.textTertiary} />
              <Text style={tlStyles.addressText} numberOfLines={1}>{addressLine}</Text>
              <MapPinButton address={insp.projectAddress} suburb={insp.projectSuburb} />
            </View>
          )}

          {isCompleted && (
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

          {!isCompleted && insp.status !== "cancelled" && Platform.OS !== "web" && (
            dlState === "done" ? (
              <View style={tlStyles.dlDoneRow}>
                <Feather name="check-circle" size={12} color={Colors.success} />
                <Text style={tlStyles.dlDoneText}>Documents downloaded</Text>
              </View>
            ) : dlState === "downloading" ? (
              <View style={tlStyles.dlProgressRow}>
                <ActivityIndicator size="small" color={Colors.secondary} style={{ transform: [{ scale: 0.75 }] }} />
                <Text style={tlStyles.dlProgressText}>
                  {dlTotal > 0 ? `Downloading ${dlCount}/${dlTotal}…` : "Downloading…"}
                </Text>
                {dlTotal > 0 && (
                  <View style={tlStyles.dlBar}>
                    <View style={[tlStyles.dlBarFill, { width: `${Math.round(dlProgress * 100)}%` as any }]} />
                  </View>
                )}
              </View>
            ) : dlState === "idle" || dlState === "error" ? (
              <Pressable
                onPress={downloadDocs}
                style={({ pressed }) => [tlStyles.dlBtn, pressed && { opacity: 0.75 }]}
              >
                <Feather name="download" size={12} color={Colors.secondary} />
                <Text style={tlStyles.dlBtnText}>
                  {dlState === "error" ? "Retry download" : "Download for offline"}
                </Text>
              </Pressable>
            ) : null
          )}

          {!isCompleted && insp.status !== "cancelled" && (
            <Pressable
              onPress={() => router.push(`/inspection/conduct/${insp.id}` as any)}
              style={({ pressed }) => [
                tlStyles.actionBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Feather
                name="arrow-right"
                size={13}
                color={Colors.primary}
              />
              <Text style={tlStyles.actionText}>
                {isInProgress || isFollowUp ? "Continue Inspection" : "Start Inspection"}
              </Text>
            </Pressable>
          )}

          {/* Report Sent badge — bottom-right of card */}
          {isCompleted && (
            <View style={tlStyles.reportSentRow}>
              <View style={[tlStyles.reportSentBadge, reportSent ? tlStyles.reportSentBadgeDone : tlStyles.reportSentBadgePending]}>
                <Feather
                  name={reportSent ? "check-square" : "square"}
                  size={11}
                  color={reportSent ? Colors.success : Colors.textTertiary}
                />
                <Text style={[tlStyles.reportSentText, reportSent && tlStyles.reportSentTextDone]}>
                  {reportSent ? "Report Sent" : hasReport ? "Report Draft" : "No Report"}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const SCHEDULE_DATE_RANGE = 42; // show 6 weeks
const SCHEDULE_DATE_OFFSET = 14; // start 2 weeks before today

function buildDateOptions(): { date: Date; str: string }[] {
  const arr: { date: Date; str: string }[] = [];
  const start = new Date();
  start.setDate(start.getDate() - SCHEDULE_DATE_OFFSET);
  for (let i = 0; i < SCHEDULE_DATE_RANGE; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    arr.push({ date: d, str: toLocalDateStr(d) });
  }
  return arr;
}

const SCHEDULE_DATES = buildDateOptions();
const DATE_CELL_W = 48;
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ScheduleTimeline({
  inspections,
  selectedDate,
  onScheduleChange,
  reportMap = {},
}: {
  inspections: any[];
  selectedDate: string;
  onScheduleChange: (id: number, newTime: string, newDate: string) => void;
  reportMap?: Record<number, { hasReport: boolean; isSent: boolean }>;
}) {
  const today = toLocalDateStr(new Date());

  // Schedule editor — single shared modal lifted out of cards
  const [timeEditTarget, setTimeEditTarget] = useState<{ inspId: number } | null>(null);
  const [editHour, setEditHour] = useState("9");
  const [editMinute, setEditMinute] = useState("00");
  const [editAmPm, setEditAmPm] = useState<"AM" | "PM">("AM");
  const [editDate, setEditDate] = useState(today);
  const dateScrollRef = useRef<ScrollView>(null);

  const handleEditTime = useCallback((inspId: number, currentTime: string, currentDate: string) => {
    const hasTime = currentTime && currentTime !== "TBD" && currentTime.includes(":");
    if (hasTime) {
      const [h, m] = currentTime.split(":").map(Number);
      const isPM = h >= 12;
      const hour12 = h % 12 || 12;
      setEditHour(String(hour12));
      setEditMinute(String(m).padStart(2, "0"));
      setEditAmPm(isPM ? "PM" : "AM");
    } else {
      setEditHour("");
      setEditMinute("");
      setEditAmPm("AM");
    }
    setEditDate(currentDate);
    setTimeEditTarget({ inspId });
    // scroll date strip so selected date is visible
    const idx = SCHEDULE_DATES.findIndex(d => d.str === currentDate);
    if (idx >= 0) {
      setTimeout(() => {
        dateScrollRef.current?.scrollTo({ x: Math.max(0, idx * DATE_CELL_W - DATE_CELL_W * 2), animated: false });
      }, 50);
    }
  }, []);

  const confirmTimeEdit = useCallback(() => {
    if (!timeEditTarget) return;
    const parsedH = parseInt(editHour);
    const parsedM = parseInt(editMinute);
    const h = isNaN(parsedH) ? 9 : Math.max(1, Math.min(12, parsedH));
    const m = isNaN(parsedM) ? 0 : Math.max(0, Math.min(59, parsedM));
    let h24 = h % 12;
    if (editAmPm === "PM") h24 += 12;
    const newTime = `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    onScheduleChange(timeEditTarget.inspId, newTime, editDate);
    setTimeEditTarget(null);
  }, [timeEditTarget, editHour, editMinute, editAmPm, editDate, onScheduleChange]);

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

  const timeEditModal = (
    <Modal
      visible={!!timeEditTarget}
      transparent
      animationType="slide"
      onRequestClose={() => setTimeEditTarget(null)}
    >
      <View style={tlStyles.timeEditModalWrap}>
        <Pressable style={tlStyles.timeEditOverlay} onPress={() => setTimeEditTarget(null)} />
        <View style={tlStyles.timeEditSheet}>
          <View style={tlStyles.timeEditHandle} />
          <Text style={tlStyles.timeEditTitle}>Change Schedule</Text>

          {/* Date picker strip */}
          <View>
            <Text style={tlStyles.timeEditSectionLabel}>Date</Text>
            <ScrollView
              ref={dateScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={tlStyles.datePicker}
              contentContainerStyle={tlStyles.datePickerContent}
            >
              {SCHEDULE_DATES.map(({ date, str }) => {
                const isSelected = str === editDate;
                const isToday2 = str === today;
                return (
                  <Pressable
                    key={str}
                    onPress={() => setEditDate(str)}
                    style={[tlStyles.dateCell, isSelected && tlStyles.dateCellSelected]}
                  >
                    <Text style={[tlStyles.dateDayName, isSelected && tlStyles.dateDayNameSelected]}>
                      {DAY_SHORT[date.getDay()]}
                    </Text>
                    <View style={[tlStyles.dateDayNum, isSelected && tlStyles.dateDayNumSelected, isToday2 && !isSelected && tlStyles.dateDayNumToday]}>
                      <Text style={[tlStyles.dateDayNumText, isSelected && tlStyles.dateDayNumTextSelected, isToday2 && !isSelected && tlStyles.dateDayNumTextToday]}>
                        {date.getDate()}
                      </Text>
                    </View>
                    <Text style={[tlStyles.dateMonthText, isSelected && tlStyles.dateMonthTextSelected]}>
                      {date.toLocaleDateString("en-AU", { month: "short" })}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Time picker */}
          <View>
            <Text style={tlStyles.timeEditSectionLabel}>Time</Text>
            <View style={tlStyles.timeEditRow}>
              <View style={tlStyles.timeEditField}>
                <Text style={tlStyles.timeEditLabel}>Hour</Text>
                <TextInput
                  style={tlStyles.timeEditInput}
                  value={editHour}
                  onChangeText={setEditHour}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="--"
                  placeholderTextColor="#C0C8D8"
                  selectTextOnFocus
                />
              </View>
              <Text style={tlStyles.timeEditColon}>:</Text>
              <View style={tlStyles.timeEditField}>
                <Text style={tlStyles.timeEditLabel}>Min</Text>
                <TextInput
                  style={tlStyles.timeEditInput}
                  value={editMinute}
                  onChangeText={setEditMinute}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="--"
                  placeholderTextColor="#C0C8D8"
                  selectTextOnFocus
                />
              </View>
              <View style={tlStyles.amPmToggle}>
                {(["AM", "PM"] as const).map(v => (
                  <Pressable
                    key={v}
                    onPress={() => setEditAmPm(v)}
                    style={[tlStyles.amPmBtn, editAmPm === v && tlStyles.amPmBtnActive]}
                  >
                    <Text style={[tlStyles.amPmText, editAmPm === v && tlStyles.amPmTextActive]}>{v}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={tlStyles.timeEditActions}>
            <Pressable
              onPress={() => setTimeEditTarget(null)}
              style={({ pressed }) => [tlStyles.timeEditCancel, pressed && { opacity: 0.7 }]}
            >
              <Text style={tlStyles.timeEditCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={confirmTimeEdit}
              style={({ pressed }) => [tlStyles.timeEditConfirm, pressed && { opacity: 0.8 }]}
            >
              <Text style={tlStyles.timeEditConfirmText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (sorted.length === 0) {
    return (
      <>
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
        {timeEditModal}
      </>
    );
  }

  return (
    <>
      <View style={tlStyles.wrap}>
        <View style={tlStyles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={tlStyles.dateLabel}>{dateLabel}</Text>
            <Text style={tlStyles.countLabel}>{active.length} inspection{active.length !== 1 ? "s" : ""}</Text>
          </View>
        </View>

        {/* Active inspections */}
        {active.length > 0 && (
          <View style={tlStyles.list}>
            {active.map((insp, idx) => (
              <InspCard
                key={insp.id}
                insp={insp}
                isLast={idx === active.length - 1}
                onEditTime={handleEditTime}
                hasReport={reportMap[insp.id]?.hasReport}
                reportSent={reportMap[insp.id]?.isSent}
              />
            ))}
          </View>
        )}

        {active.length === 0 && (
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
                <InspCard
                  key={insp.id}
                  insp={insp}
                  isLast={idx === completed.length - 1}
                  onEditTime={handleEditTime}
                  hasReport={reportMap[insp.id]?.hasReport}
                  reportSent={reportMap[insp.id]?.isSent}
                />
              ))}
            </View>
          </View>
        )}
      </View>
      {timeEditModal}
    </>
  );
}

const tlStyles = StyleSheet.create({
  wrap: { gap: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateLabel: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, letterSpacing: -0.3 },
  countLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  list: { gap: 0 },
  item: { marginBottom: 10 },
  timePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.background },
  timeInCard: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardCompleted: {
    backgroundColor: "#F4F5F6",
    borderColor: "#D8DADD",
    shadowOpacity: 0.02,
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

  // Pre-download button
  dlBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start",
    borderWidth: 1, borderColor: Colors.secondary + "50",
    backgroundColor: Colors.secondary + "10",
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, marginTop: 2, marginBottom: 4,
  },
  dlBtnText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  dlProgressRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 2, marginBottom: 4,
  },
  dlProgressText: { fontSize: 11, color: Colors.textSecondary, fontFamily: "PlusJakartaSans_400Regular", flex: 1 },
  dlBar: {
    height: 3, width: 60, borderRadius: 2, backgroundColor: Colors.borderLight, overflow: "hidden",
  },
  dlBarFill: { height: 3, backgroundColor: Colors.secondary, borderRadius: 2 },
  dlDoneRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
    marginTop: 2, marginBottom: 4,
  },
  dlDoneText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.success },

  reportSentRow: {
    flexDirection: "row", justifyContent: "flex-end", marginTop: 6,
  },
  reportSentBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  reportSentBadgeDone: { backgroundColor: Colors.successLight },
  reportSentBadgePending: { backgroundColor: Colors.borderLight },
  reportSentText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  reportSentTextDone: { color: Colors.success },
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
  timeEditModalWrap: { flex: 1, justifyContent: "flex-end" },
  timeEditOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  timeEditSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, gap: 16,
  },
  timeEditHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: "center" },
  timeEditTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, textAlign: "center" },
  timeEditSectionLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  datePicker: { marginHorizontal: -20 },
  datePickerContent: { paddingHorizontal: 20, gap: 4 },
  dateCell: { alignItems: "center", gap: 3, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 12, width: DATE_CELL_W },
  dateCellSelected: { backgroundColor: Colors.primary },
  dateDayName: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.3 },
  dateDayNameSelected: { color: "rgba(255,255,255,0.65)" },
  dateDayNum: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  dateDayNumSelected: { backgroundColor: Colors.accent },
  dateDayNumToday: { borderWidth: 1.5, borderColor: Colors.secondary },
  dateDayNumText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  dateDayNumTextSelected: { color: Colors.primary },
  dateDayNumTextToday: { color: Colors.secondary },
  dateMonthText: { fontSize: 9, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  dateMonthTextSelected: { color: "rgba(255,255,255,0.55)" },
  timeEditRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  timeEditField: { alignItems: "center", gap: 4 },
  timeEditLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  timeEditInput: {
    width: 64, height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background, textAlign: "center",
    fontSize: 26, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text,
  },
  timeEditColon: { fontSize: 26, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, marginBottom: 4 },
  amPmToggle: { flexDirection: "column", gap: 4, marginLeft: 4 },
  amPmBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  amPmBtnActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  amPmText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  amPmTextActive: { color: "#fff" },
  timeEditActions: { flexDirection: "row", gap: 10 },
  timeEditCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, alignItems: "center",
  },
  timeEditCancelText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  timeEditConfirm: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: Colors.secondary, alignItems: "center",
  },
  timeEditConfirmText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
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
  const tabBarHeight = useTabBarHeight();
  const { user, token } = useAuth();
  const { scheduleInspectionReminders, prefs } = useNotifications();
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr(new Date()));
  const [localTimes, setLocalTimes] = useState<Record<number, string>>({});
  const [localDates, setLocalDates] = useState<Record<number, string>>({});
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { data: rawInspections = [], isRefetching, refetch } = useApiData<any[]>("/api/inspections");
  const { data: analytics } = useApiData<any>("/api/analytics/dashboard");
  const { data: rawReports = [] } = useApiData<any[]>("/api/reports");

  const reportMap = useMemo(() => {
    const m: Record<number, { hasReport: boolean; isSent: boolean }> = {};
    (rawReports as any[]).forEach((r) => {
      if (!r.inspectionId) return;
      const existing = m[r.inspectionId];
      const isSent = !!r.sentAt;
      if (!existing) {
        m[r.inspectionId] = { hasReport: true, isSent };
      } else {
        m[r.inspectionId] = { hasReport: true, isSent: existing.isSent || isSent };
      }
    });
    return m;
  }, [rawReports]);

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const inspections = useMemo(() => {
    return (rawInspections as any[]).map((i) => ({
      ...i,
      scheduledDate: localDates[i.id] || i.scheduledDate,
      displayTime: localTimes[i.id] || getDisplayTime(i),
    }));
  }, [rawInspections, localTimes, localDates]);

  const inspectionDates = useMemo(() => {
    const s = new Set<string>();
    inspections.forEach((i) => { if (i.scheduledDate) s.add(i.scheduledDate); });
    return s;
  }, [inspections]);

  const inspectionsForDay = useMemo(() => {
    return inspections.filter((i) => i.scheduledDate === selectedDate);
  }, [inspections, selectedDate]);

  const handleScheduleChange = useCallback(async (inspId: number, newTime: string, newDate: string) => {
    setLocalTimes((prev) => ({ ...prev, [inspId]: newTime }));
    setLocalDates((prev) => ({ ...prev, [inspId]: newDate }));
    try {
      await fetch(`${baseUrl}/api/inspections/${inspId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scheduledTime: newTime, scheduledDate: newDate }),
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
        { paddingTop: insets.top + WEB_TOP + 16, paddingBottom: tabBarHeight + 20 },
      ]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
      showsVerticalScrollIndicator={false}
      scrollEnabled
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.userName}>{user?.companyName || user?.firstName || "Inspector"}</Text>
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
            onPress={() => {
              const now = new Date();
              setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
              setShowCalendar(true);
            }}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.viewAll}>Expand</Text>
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
        onScheduleChange={handleScheduleChange}
        reportMap={reportMap}
      />

      {/* Full Calendar Modal */}
      <Modal
        visible={showCalendar}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCalendar(false)}
      >
        <View style={calStyles.container}>
          {/* Modal Header — navy branded bar */}
          <View style={calStyles.header}>
            <View style={calStyles.headerLeft}>
              <Feather name="calendar" size={16} color={Colors.accent} />
              <Text style={calStyles.headerTitle}>Schedule</Text>
            </View>
            <Pressable onPress={() => setShowCalendar(false)} hitSlop={12} style={calStyles.closeBtn}>
              <Feather name="x" size={18} color={Colors.textOnDark} />
            </Pressable>
          </View>

          {/* Month navigation */}
          <View style={calStyles.monthNav}>
            <Pressable
              hitSlop={12}
              style={calStyles.navBtn}
              onPress={() => setCalendarMonth(({ year, month }) => {
                const d = new Date(year, month - 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}
            >
              <Feather name="chevron-left" size={20} color={Colors.primary} />
            </Pressable>
            <Text style={calStyles.monthLabel}>
              {new Date(calendarMonth.year, calendarMonth.month).toLocaleString("default", { month: "long", year: "numeric" })}
            </Text>
            <Pressable
              hitSlop={12}
              style={calStyles.navBtn}
              onPress={() => setCalendarMonth(({ year, month }) => {
                const d = new Date(year, month + 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}
            >
              <Feather name="chevron-right" size={20} color={Colors.primary} />
            </Pressable>
          </View>

          {/* Day-of-week headers */}
          <View style={calStyles.dowRow}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <Text key={d} style={calStyles.dowLabel}>{d}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          {(() => {
            const { year, month } = calendarMonth;
            const firstDay = new Date(year, month, 1);
            // Monday-based: Mon=0 … Sun=6
            const startOffset = (firstDay.getDay() + 6) % 7;
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const cells: (number | null)[] = [
              ...Array(startOffset).fill(null),
              ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
            ];
            // Pad to complete last row
            while (cells.length % 7 !== 0) cells.push(null);
            const rows: (number | null)[][] = [];
            for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
            const todayStr = toLocalDateStr(new Date());

            return (
              <ScrollView style={calStyles.grid} contentContainerStyle={calStyles.gridContent} showsVerticalScrollIndicator={false}>
                {rows.map((row, ri) => (
                  <View key={ri} style={calStyles.week}>
                    {row.map((day, ci) => {
                      if (!day) return <View key={ci} style={calStyles.cell} />;
                      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const isToday = dateStr === todayStr;
                      const isSelected = dateStr === selectedDate;
                      const hasInspection = inspectionDates.has(dateStr);
                      const dayInspections = inspections.filter((i) => i.scheduledDate === dateStr);
                      return (
                        <Pressable
                          key={ci}
                          style={[calStyles.cell, isSelected && calStyles.cellSelected, isToday && !isSelected && calStyles.cellToday]}
                          onPress={() => {
                            setSelectedDate(dateStr);
                            setShowCalendar(false);
                          }}
                        >
                          <Text style={[calStyles.dayNum, isSelected && calStyles.dayNumSelected, isToday && !isSelected && calStyles.dayNumToday]}>
                            {day}
                          </Text>
                          {hasInspection && (
                            <View style={calStyles.dotsRow}>
                              {dayInspections.slice(0, 3).map((_, idx) => (
                                <View key={idx} style={[calStyles.dot, isSelected && calStyles.dotSelected]} />
                              ))}
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            );
          })()}
        </View>
      </Modal>
    </ScrollView>
  );
}

const calStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  // ── Navy branded header bar ───────────────────────────────────────────
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold", color: Colors.textOnDark },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  // ── Month navigation ─────────────────────────────────────────────────
  monthNav: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: "center", justifyContent: "center",
  },
  monthLabel: { fontSize: 15, fontFamily: "PlusJakartaSans_700Bold", color: Colors.primary },
  // ── Day-of-week header row ────────────────────────────────────────────
  dowRow: {
    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: Colors.primary,
  },
  dowLabel: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: "PlusJakartaSans_700Bold", color: Colors.accent, letterSpacing: 0.5 },
  // ── Calendar grid ────────────────────────────────────────────────────
  grid: { flex: 1, backgroundColor: Colors.surface },
  gridContent: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 32 },
  week: { flexDirection: "row" },
  cell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 8, margin: 2 },
  // Selected (non-today): solid navy background + pear text
  cellSelected: { backgroundColor: Colors.primary },
  // Today (not selected): pear accent border
  cellToday: { borderWidth: 2, borderColor: Colors.accent },
  dayNum: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium", color: Colors.text },
  dayNumSelected: { color: Colors.accent, fontFamily: "PlusJakartaSans_700Bold" },
  dayNumToday: { color: Colors.primary, fontFamily: "PlusJakartaSans_700Bold" },
  dotsRow: { flexDirection: "row", gap: 2, marginTop: 2 },
  // Regular dots: secondary blue
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.secondary },
  // Dots on selected (navy bg): pear
  dotSelected: { backgroundColor: Colors.accent },
});

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
});
