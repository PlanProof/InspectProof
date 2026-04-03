import { useState } from "react";
import { useGetDashboardAnalytics } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import {
  FolderOpen, CheckSquare, AlertTriangle, FileText, ArrowRight,
  ChevronLeft, ChevronRight, Calendar, Clock, MapPin, User, CalendarDays,
  Send, CheckCircle2, Users, Zap,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday, parseISO,
} from "date-fns";

// ── Colour helpers ────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, { bg: string; dot: string; badge: string; border: string }> = {
  frame:       { bg: "bg-blue-50",   dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-800 border-blue-200",   border: "border-l-blue-400" },
  footing:     { bg: "bg-amber-50",  dot: "bg-amber-500",  badge: "bg-amber-100 text-amber-800 border-amber-200", border: "border-l-amber-400" },
  slab:        { bg: "bg-orange-50", dot: "bg-orange-500", badge: "bg-orange-100 text-orange-800 border-orange-200", border: "border-l-orange-400" },
  final:       { bg: "bg-green-50",  dot: "bg-green-500",  badge: "bg-green-100 text-green-800 border-green-200",  border: "border-l-green-400" },
  fire_safety: { bg: "bg-red-50",    dot: "bg-red-500",    badge: "bg-red-100 text-red-800 border-red-200",        border: "border-l-red-400" },
  pool_barrier:{ bg: "bg-cyan-50",   dot: "bg-cyan-500",   badge: "bg-cyan-100 text-cyan-800 border-cyan-200",     border: "border-l-cyan-400" },
  waterproofing:{ bg:"bg-sky-50",    dot: "bg-sky-500",    badge: "bg-sky-100 text-sky-800 border-sky-200",        border: "border-l-sky-400" },
  occupancy:   { bg: "bg-purple-50", dot: "bg-purple-500", badge: "bg-purple-100 text-purple-800 border-purple-200", border: "border-l-purple-400" },
  special:     { bg: "bg-rose-50",   dot: "bg-rose-500",   badge: "bg-rose-100 text-rose-800 border-rose-200",    border: "border-l-rose-400" },
};
const DEFAULT_COLOR = { bg: "bg-primary/5", dot: "bg-primary", badge: "bg-primary/10 text-primary border-primary/20", border: "border-l-primary" };

function typeColor(type: string) {
  const key = Object.keys(TYPE_COLORS).find(k => type?.toLowerCase().includes(k)) ?? "";
  return TYPE_COLORS[key] ?? DEFAULT_COLOR;
}
function typeLabel(type: string) {
  return type?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? type;
}

// Inspector initials avatar
function InspectorAvatar({ name }: { name: string }) {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["bg-blue-500", "bg-teal-500", "bg-violet-500", "bg-rose-500", "bg-amber-500"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${color} text-white text-[9px] font-bold shrink-0`}>
      {initials}
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

// ── Send Run Sheet Dialog ─────────────────────────────────────────────────────
function SendRunSheetDialog({
  open, onClose, day, inspections,
}: {
  open: boolean;
  onClose: () => void;
  day: Date;
  inspections: any[];
}) {
  // Gather unique inspectors for that day
  const inspectorMap: Record<string, { name: string; inspections: any[] }> = {};
  for (const insp of inspections) {
    const name: string = insp.inspectorName || "Unassigned";
    if (!inspectorMap[name]) inspectorMap[name] = { name, inspections: [] };
    inspectorMap[name].inspections.push(insp);
  }
  const inspectors = Object.values(inspectorMap);
  const assignedInspectors = inspectors.filter(i => i.name !== "Unassigned");
  const hasUnassigned = inspectors.some(i => i.name === "Unassigned");

  const [selected, setSelected] = useState<Set<string>>(() => new Set(assignedInspectors.map(i => i.name)));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentNames, setSentNames] = useState<string[]>([]);

  const allSelected = assignedInspectors.length > 0 && assignedInspectors.every(i => selected.has(i.name));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(assignedInspectors.map(i => i.name)));
  };

  const toggle = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0) return;
    setSending(true);
    const names = [...selected];
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      await fetch(`${apiBase()}/api/inspections/run-sheet/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: format(day, "yyyy-MM-dd"),
          inspectorNames: names,
        }),
      });
      setSentNames(names);
      setSent(true);
    } catch {
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSent(false);
    setSentNames([]);
    setSelected(new Set(assignedInspectors.map(i => i.name)));
    onClose();
  };

  const dateLabel = format(day, "EEEE d MMMM yyyy");

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-secondary" />
            Send Run Sheet
          </DialogTitle>
        </DialogHeader>

        {sent ? (
          /* ── Success state ──────────────────────────────────────────── */
          <div className="py-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-sidebar text-base">Run sheet sent!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Sent to {sentNames.length === 1 ? sentNames[0] : `${sentNames.length} inspectors`}
              </p>
              {sentNames.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {sentNames.join(", ")}
                </p>
              )}
            </div>
            <Button onClick={handleClose} className="mt-2 w-full">Done</Button>
          </div>
        ) : (
          /* ── Selection state ─────────────────────────────────────────── */
          <div className="space-y-4">
            {/* Date label */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50 border border-muted">
              <CalendarDays className="h-4 w-4 text-secondary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-sidebar">{dateLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {inspections.length} inspection{inspections.length !== 1 ? "s" : ""} scheduled
                </p>
              </div>
            </div>

            {/* Recipient selection */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Send to</p>

              {assignedInspectors.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  <User className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  No assigned inspectors for this day
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Select all toggle */}
                  <button
                    onClick={toggleAll}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                      allSelected
                        ? "bg-secondary/8 border-secondary/30"
                        : "bg-card border-muted hover:bg-muted/40"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      allSelected ? "bg-secondary border-secondary" : "border-muted-foreground/40"
                    }`}>
                      {allSelected && <CheckCircle2 className="h-3 w-3 text-white" strokeWidth={3} />}
                    </div>
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold text-sidebar">
                      All inspectors ({assignedInspectors.length})
                    </span>
                  </button>

                  {/* Individual inspectors */}
                  {assignedInspectors.map(inspector => {
                    const isChecked = selected.has(inspector.name);
                    return (
                      <button
                        key={inspector.name}
                        onClick={() => toggle(inspector.name)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                          isChecked
                            ? "bg-secondary/8 border-secondary/30"
                            : "bg-card border-muted hover:bg-muted/40"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          isChecked ? "bg-secondary border-secondary" : "border-muted-foreground/40"
                        }`}>
                          {isChecked && <CheckCircle2 className="h-3 w-3 text-white" strokeWidth={3} />}
                        </div>
                        <InspectorAvatar name={inspector.name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-sidebar truncate">{inspector.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {inspector.inspections.length} inspection{inspector.inspections.length !== 1 ? "s" : ""}
                            {inspector.inspections.map(i => ` · ${typeLabel(i.inspectionType)}`).join("")}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {hasUnassigned && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  {inspectors.find(i => i.name === "Unassigned")?.inspections.length} inspection(s) have no assigned inspector
                </p>
              )}
            </div>

            {/* Run sheet preview */}
            {inspections.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
                <div className="rounded-lg border border-muted bg-muted/30 divide-y divide-muted max-h-40 overflow-y-auto">
                  {inspections.map(insp => (
                    <div key={insp.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-sidebar truncate">{insp.projectName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {insp.scheduledTime ?? "TBC"} · {typeLabel(insp.inspectionType)}
                          {insp.siteAddress ? ` · ${insp.siteAddress}` : ""}
                        </p>
                      </div>
                      {insp.inspectorName ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <InspectorAvatar name={insp.inspectorName} />
                          <span className="text-[10px] text-muted-foreground hidden sm:inline">{insp.inspectorName.split(" ")[0]}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-500 shrink-0 font-medium">Unassigned</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={selected.size === 0 || sending}
                className="flex-1 gap-2"
              >
                {sending ? (
                  <>Sending…</>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send{selected.size > 0 ? ` to ${selected.size === assignedInspectors.length ? "All" : selected.size}` : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Day Run Sheet ─────────────────────────────────────────────────────────────
function DayRunSheet({ day, inspections }: { day: Date; inspections: any[] }) {
  const [, navigate] = useLocation();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  const dayInspections = inspections
    .filter(i => { try { return isSameDay(parseISO(i.scheduledDate), day); } catch { return false; } })
    .sort((a, b) => {
      if (!a.scheduledTime && !b.scheduledTime) return 0;
      if (!a.scheduledTime) return 1;
      if (!b.scheduledTime) return -1;
      return a.scheduledTime.localeCompare(b.scheduledTime);
    });

  const isThisToday = isToday(day);
  const dayLabel = isThisToday ? "Today" : format(day, "EEEE");
  const dateLabel = format(day, "d MMMM yyyy");

  // Distinct assigned inspectors for the button label
  const assignedInspectors = [...new Set(dayInspections.filter(i => i.inspectorName).map(i => i.inspectorName as string))];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-muted/50 shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <CalendarDays className="h-4 w-4 text-secondary" />
          <h3 className="font-bold text-sidebar text-base">{dayLabel}</h3>
        </div>
        <p className="text-xs text-muted-foreground ml-6">{dateLabel}</p>
        {dayInspections.length > 0 && (
          <div className="ml-6 mt-1 flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-secondary">
              {dayInspections.length} inspection{dayInspections.length !== 1 ? "s" : ""} scheduled
            </p>
            {assignedInspectors.length > 0 && (
              <div className="flex items-center gap-1">
                {assignedInspectors.slice(0, 3).map(name => (
                  <InspectorAvatar key={name} name={name} />
                ))}
                {assignedInspectors.length > 3 && (
                  <span className="text-[10px] text-muted-foreground font-medium">+{assignedInspectors.length - 3}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <SendRunSheetDialog
        key={day.toISOString()}
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
        day={day}
        inspections={dayInspections}
      />

      {/* Inspection list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {dayInspections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center px-5">
            <Calendar className="h-10 w-10 text-muted-foreground/25 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No inspections</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Nothing scheduled for this day.</p>
          </div>
        ) : (
          <div className="divide-y divide-muted/40">
            {dayInspections.map((insp, idx) => {
              const c = typeColor(insp.inspectionType);
              const statusColors: Record<string, string> = {
                scheduled: "bg-blue-50 text-blue-700 border-blue-200",
                completed: "bg-green-50 text-green-700 border-green-200",
                in_progress: "bg-amber-50 text-amber-700 border-amber-200",
                follow_up_required: "bg-orange-50 text-orange-700 border-orange-200",
                cancelled: "bg-red-50 text-red-700 border-red-200",
              };
              const statusBadge = statusColors[insp.status] ?? "bg-muted text-muted-foreground border-muted/60";
              return (
                <button
                  key={insp.id}
                  onClick={() => navigate(`/inspections/${insp.id}`)}
                  className={`w-full text-left px-4 py-3.5 border-l-4 ${c.border} bg-card hover:bg-muted/30 transition-colors cursor-pointer`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    {/* Time */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-bold text-sidebar tabular-nums">
                        {insp.scheduledTime ?? "TBC"}
                      </span>
                    </div>
                    {/* Status badge */}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize shrink-0 ${statusBadge}`}>
                      {(insp.status ?? "").replace(/_/g, " ")}
                    </span>
                  </div>

                  {/* Project title */}
                  <p className="text-sm font-bold text-sidebar leading-snug mb-0.5">{insp.projectName}</p>

                  {/* Address */}
                  {insp.siteAddress && (
                    <div className="flex items-center gap-1 mb-1.5">
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">{insp.siteAddress}</p>
                    </div>
                  )}

                  {/* Type + Inspector */}
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${c.badge}`}>
                      {typeLabel(insp.inspectionType)}
                    </span>
                    {insp.inspectorName ? (
                      <div className="flex items-center gap-1 min-w-0">
                        <InspectorAvatar name={insp.inspectorName} />
                        <span className="text-xs text-muted-foreground truncate">{insp.inspectorName}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground/50">
                        <User className="h-3 w-3" />
                        <span className="text-xs italic">Unassigned</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer link + Send button */}
      <div className="border-t border-muted/50 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
        <Link href="/inspections" className="flex items-center gap-1.5 text-xs font-medium text-secondary hover:underline">
          View all inspections <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {dayInspections.length > 0 && (
          <button
            onClick={() => setSendDialogOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary text-white text-xs font-semibold hover:bg-secondary/90 transition-colors shrink-0 shadow-sm"
          >
            <Send className="h-3 w-3" />
            Send
          </button>
        )}
      </div>
    </div>
  );
}

// ── Calendar Widget ───────────────────────────────────────────────────────────
function CalendarWidget({
  inspections,
  selectedDay,
  onDaySelect,
}: {
  inspections: any[];
  selectedDay: Date | null;
  onDaySelect: (d: Date) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const weeks: Date[][] = [];
  let day = calStart;
  while (day <= calEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) { week.push(day); day = addDays(day, 1); }
    weeks.push(week);
  }

  function inspectionsOn(d: Date) {
    return inspections.filter(insp => {
      try { return isSameDay(parseISO(insp.scheduledDate), d); } catch { return false; }
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Month nav */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1.5 rounded-md hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-sidebar tracking-wide">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1.5 rounded-md hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-t border-b border-muted/50 shrink-0">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid — flex-1 so it fills remaining card height; auto-rows-fr distributes rows evenly */}
      <div className="grid grid-cols-7 auto-rows-fr flex-1 min-h-0">
        {weeks.map((week, wi) =>
          week.map((d, di) => {
            const dayInspections = inspectionsOn(d);
            const isCurrentMonth = isSameMonth(d, currentMonth);
            const isSelected = selectedDay ? isSameDay(d, selectedDay) : false;
            const todayDay = isToday(d);

            return (
              <button
                key={`${wi}-${di}`}
                onClick={() => onDaySelect(d)}
                className={[
                  "relative flex flex-col items-center pt-2 pb-1.5 border-b border-r border-muted/40 transition-colors",
                  di === 0 ? "border-l" : "",
                  isSelected ? "bg-primary/[0.07] ring-inset ring-1 ring-primary/20" : "hover:bg-muted/30",
                  !isCurrentMonth ? "opacity-35" : "",
                ].join(" ")}
              >
                <span className={[
                  "flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full mb-0.5",
                  todayDay ? "bg-primary text-white font-bold" : isSelected ? "text-primary font-semibold" : "text-sidebar",
                ].join(" ")}>
                  {format(d, "d")}
                </span>
                {dayInspections.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-0.5 px-0.5">
                    {dayInspections.slice(0, 3).map((insp, i) => (
                      <span key={i} className={`w-1.5 h-1.5 rounded-full ${typeColor(insp.inspectionType).dot}`} />
                    ))}
                    {dayInspections.length > 3 && (
                      <span className="text-[9px] text-muted-foreground font-medium">+{dayInspections.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Upgrade Banner ────────────────────────────────────────────────────────────
function UpgradeBanner() {
  const [, setLocation] = useLocation();
  const { data: sub } = useQuery({
    queryKey: ["billing-subscription-banner"],
    queryFn: async () => {
      const token = localStorage.getItem("inspectproof_token") ?? "";
      const r = await fetch("/api/billing/subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  if (!sub || sub.plan !== "free_trial") return null;

  const projectPct = sub.limits.maxProjects
    ? Math.round((sub.usage.projects / sub.limits.maxProjects) * 100)
    : 0;
  const inspPct = sub.limits.maxInspectionsTotal
    ? Math.round((sub.usage.inspections / sub.limits.maxInspectionsTotal) * 100)
    : 0;
  const isNearLimit = projectPct >= 70 || inspPct >= 70;

  return (
    <div className={`rounded-2xl border px-5 py-4 mb-7 flex items-center gap-5 flex-wrap ${
      isNearLimit
        ? "bg-amber-50 border-amber-200"
        : "bg-[#0B1933]/5 border-[#0B1933]/10"
    }`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        isNearLimit ? "bg-amber-100 text-amber-600" : "bg-[#C5D92D]/30 text-[#5a6600]"
      }`}>
        <Zap className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#0B1933] text-sm">
          {isNearLimit ? "You're approaching your plan limits" : "You're on the Free Trial"}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {sub.usage.projects} of {sub.limits.maxProjects} projects &nbsp;·&nbsp;
          {sub.usage.inspections} of {sub.limits.maxInspectionsTotal} total inspections used
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-[#0B1933] hover:bg-[#0B1933]/90 text-white text-xs h-8"
          onClick={() => setLocation("/billing")}
        >
          <Zap className="w-3.5 h-3.5 mr-1.5" />
          Upgrade plan
        </Button>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data, isLoading } = useGetDashboardAnalytics();
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  const { data: issues } = useQuery({
    queryKey: ["dashboard-issues"],
    queryFn: async () => {
      const token = localStorage.getItem("inspectproof_token") ?? "";
      const r = await fetch(`${apiBase()}/api/issues`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) return <AppLayout><div className="flex h-full items-center justify-center">Loading...</div></AppLayout>;
  if (!data) return <AppLayout><div>Error loading dashboard</div></AppLayout>;

  const allInspections = (data as any).allInspections ?? data.upcomingInspections ?? [];

  const openDefects = (issues as any[] ?? []).filter(i => i.status !== "resolved").length;
  const overdueDefects = (issues as any[] ?? []).filter(i => {
    if (!i.dueDate || i.status === "resolved") return false;
    return new Date(i.dueDate) < new Date();
  }).length;
  const today = new Date();
  const sevenDaysOut = addDays(today, 7);
  const upcomingCount = allInspections.filter((i: any) => {
    try {
      const d = parseISO(i.scheduledDate);
      return d >= today && d <= sevenDaysOut;
    } catch { return false; }
  }).length;

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Home</h1>
          <p className="text-muted-foreground mt-1">Welcome back. Here's what's happening.</p>
        </div>
        <Button asChild className="shadow-lg shadow-primary/20">
          <Link href="/inspections">Schedule Inspection</Link>
        </Button>
      </div>

      <UpgradeBanner />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 mb-8">
        <StatCard title="Active Projects" value={data.activeProjects} icon={FolderOpen} trend="Projects in progress" />
        <StatCard title="Inspections (Month)" value={data.inspectionsThisMonth} icon={CheckSquare} trend="This month" />
        <StatCard title="Reports Pending" value={data.reportsPending} icon={FileText} trend="Requires review" />
        <StatCard
          title="Open Defects"
          value={openDefects}
          icon={AlertTriangle}
          trend={overdueDefects > 0 ? `${overdueDefects} overdue` : "All on track"}
          isAlert={overdueDefects > 0}
          href="/issues"
        />
        <StatCard
          title="Upcoming (7 days)"
          value={upcomingCount}
          icon={CalendarDays}
          trend="Inspections scheduled"
          href="/inspections"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:h-[600px]">
        {/* Calendar */}
        <Card className="lg:col-span-2 shadow-md border-muted/60 overflow-hidden flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Inspection Calendar</CardTitle>
            </div>
            <Link href="/inspections" className="text-sm text-secondary font-medium flex items-center hover:underline">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden flex flex-col min-h-0">
            <CalendarWidget
              inspections={allInspections}
              selectedDay={selectedDay}
              onDaySelect={setSelectedDay}
            />
          </CardContent>
        </Card>

        {/* Day Run Sheet (right panel) */}
        <Card className="shadow-md border-muted/60 overflow-hidden flex flex-col">
          <CardHeader className="pb-2 border-b flex flex-row items-center gap-2 shrink-0">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Day Run Sheet</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden flex flex-col min-h-0">
            {selectedDay ? (
              <DayRunSheet day={selectedDay} inspections={allInspections} />
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 py-10 text-center px-5">
                <Calendar className="h-10 w-10 text-muted-foreground/25 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Select a day</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Click any date on the calendar to see that day's inspections.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, icon: Icon, trend, isAlert, href }: any) {
  const inner = (
    <Card className={`shadow-sm border-muted/60 hover:shadow-md transition-shadow relative overflow-hidden ${href ? "cursor-pointer" : ""}`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${isAlert ? "bg-destructive" : "bg-primary"}`} />
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground leading-none">{title}</p>
            <p className="text-3xl font-bold text-sidebar mt-2">{value ?? "–"}</p>
          </div>
          <div className={`p-2.5 rounded-xl ${isAlert ? "bg-destructive/10 text-destructive" : "bg-primary/20 text-sidebar"}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className={`text-xs mt-3 font-medium ${isAlert ? "text-destructive" : "text-muted-foreground"}`}>{trend}</p>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}
