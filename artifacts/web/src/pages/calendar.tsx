import { useState, useCallback, useMemo } from "react";
import { Calendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import withDragAndDrop, { type withDragAndDropProps } from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from "date-fns";
import { enAU } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListProjects, useListUsers } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, ExternalLink, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, cn, formatInspectionType } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CalendarInspection {
  id: number;
  projectId: number | null;
  projectName: string;
  projectAddress: string | null;
  projectSuburb: string | null;
  inspectionType: string;
  status: string;
  scheduledDate: string;
  scheduledEndDate: string | null;
  scheduledTime: string | null;
  completedDate: string | null;
  inspectorId: number | null;
  inspectorName: string | null;
  duration: number | null;
  discipline: string | null;
  checklistTemplateId: number | null;
}

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: CalendarInspection;
  effectiveStatus: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const locales = { "en-AU": enAU };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), getDay, locales });

// Typed DnD calendar (Calendar is generic; we use CalendarEvent as the event type)
const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar);

type DnDCalendarProps = withDragAndDropProps<CalendarEvent>;

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("inspectproof_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Format a Date to YYYY-MM-DD using the *local* timezone (not UTC). */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's local date string for overdue detection. */
function todayLocalStr(): string {
  return toLocalDateStr(new Date());
}

function getEffectiveStatus(insp: CalendarInspection): string {
  if (insp.status === "scheduled" && insp.scheduledDate < todayLocalStr()) return "overdue";
  return insp.status;
}

// ── Styling ───────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  scheduled:          { bg: "#DBEAFE", border: "#3B82F6", text: "#1D4ED8" },
  in_progress:        { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" },
  completed:          { bg: "#D1FAE5", border: "#10B981", text: "#065F46" },
  follow_up_required: { bg: "#FEE2E2", border: "#EF4444", text: "#991B1B" },
  cancelled:          { bg: "#F3F4F6", border: "#9CA3AF", text: "#6B7280" },
  overdue:            { bg: "#FEE2E2", border: "#DC2626", text: "#7F1D1D" },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; cls?: string }> = {
    scheduled:           { variant: "secondary" },
    in_progress:         { variant: "outline", cls: "border-amber-400 bg-amber-50 text-amber-700" },
    completed:           { variant: "outline", cls: "border-green-400 bg-green-50 text-green-700" },
    follow_up_required:  { variant: "destructive" },
    cancelled:           { variant: "default" },
    overdue:             { variant: "destructive" },
  };
  const { variant, cls } = map[status] ?? { variant: "default" };
  return (
    <Badge variant={variant} className={cn("capitalize text-xs", cls)}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function PreviewCard({
  event,
  onClose,
  onNavigate,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const insp = event.resource;
  const effectiveStatus = getEffectiveStatus(insp);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              {formatInspectionType(insp.inspectionType)}
            </p>
            <h3 className="text-base font-bold text-sidebar leading-tight truncate">{insp.projectName}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground mb-4">
          {(insp.projectAddress || insp.projectSuburb) && (
            <div className="flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{[insp.projectAddress, insp.projectSuburb].filter(Boolean).join(", ")}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
            <span>{formatDate(insp.scheduledDate)}{insp.scheduledTime ? ` at ${insp.scheduledTime}` : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Inspector:</span>
            <span className="text-foreground font-medium text-xs">{insp.inspectorName || "Unassigned"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            <StatusBadge status={effectiveStatus} />
          </div>
          {insp.discipline && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Discipline:</span>
              <span className="text-foreground text-xs font-medium">{insp.discipline}</span>
            </div>
          )}
        </div>

        <Button
          size="sm"
          className="w-full gap-2 bg-secondary hover:bg-secondary/90 text-white"
          onClick={() => { onNavigate(`/inspections/${insp.id}`); onClose(); }}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View Full Record
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Filters
  const [filterInspector, setFilterInspector] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterDiscipline, setFilterDiscipline] = useState("");

  const { data: projects } = useListProjects({});
  const { data: users } = useListUsers({});

  const { data: availableDisciplines = [] } = useQuery<string[]>({
    queryKey: ["calendar-disciplines"],
    queryFn: async () => {
      const res = await fetch("/api/inspections/calendar/disciplines", { headers: authHeader() });
      if (!res.ok) return [];
      return res.json() as Promise<string[]>;
    },
  });

  // Build calendar date range based on current view
  const calRange = useMemo(() => {
    if (view === Views.MONTH) {
      const s = new Date(date.getFullYear(), date.getMonth() - 1, 1);
      const e = new Date(date.getFullYear(), date.getMonth() + 2, 0);
      return { start: toLocalDateStr(s), end: toLocalDateStr(e) };
    }
    if (view === Views.WEEK) {
      const s = startOfWeek(date, { weekStartsOn: 1 });
      const e = addDays(s, 6);
      return { start: toLocalDateStr(s), end: toLocalDateStr(e) };
    }
    // Agenda — show 60 days from current date
    const s = date;
    const e = addDays(date, 60);
    return { start: toLocalDateStr(s), end: toLocalDateStr(e) };
  }, [view, date]);

  const queryKey = ["calendar", calRange.start, calRange.end, filterInspector, filterProject, filterDiscipline] as const;

  const params = new URLSearchParams({
    start: calRange.start,
    end: calRange.end,
    ...(filterInspector ? { inspectorId: filterInspector } : {}),
    ...(filterProject ? { projectId: filterProject } : {}),
    ...(filterDiscipline ? { discipline: filterDiscipline } : {}),
  });

  const { data: inspections = [], isLoading } = useQuery<CalendarInspection[]>({
    queryKey: [...queryKey],
    queryFn: async () => {
      const res = await fetch(`/api/inspections/calendar?${params}`, { headers: authHeader() });
      if (!res.ok) throw new Error("Failed to fetch calendar");
      return res.json() as Promise<CalendarInspection[]>;
    },
  });

  const events = useMemo<CalendarEvent[]>(() => inspections.map(i => {
    const startDate = new Date(`${i.scheduledDate}T${i.scheduledTime ?? "08:00"}:00`);
    const endDate = i.scheduledEndDate
      ? new Date(`${i.scheduledEndDate}T${i.scheduledTime ?? "09:00"}:00`)
      : new Date(startDate.getTime() + (i.duration ? i.duration * 60 * 1000 : 60 * 60 * 1000));
    const effectiveStatus = getEffectiveStatus(i);
    return {
      id: i.id,
      title: `${i.projectName} — ${formatInspectionType(i.inspectionType)}`,
      start: startDate,
      end: endDate,
      resource: i,
      effectiveStatus,
    };
  }), [inspections]);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const colors = STATUS_COLORS[event.effectiveStatus] ?? STATUS_COLORS.scheduled;
    return {
      style: {
        backgroundColor: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        color: colors.text,
        borderRadius: "6px",
        fontSize: "11px",
        fontWeight: 600,
        padding: "1px 5px",
        border: "none",
      },
    };
  }, []);

  const handleNavigate = useCallback((newDate: Date) => setDate(newDate), []);
  const handleView = useCallback((newView: View) => setView(newView), []);
  const handleSelectEvent = useCallback((event: CalendarEvent) => setSelectedEvent(event), []);

  const handleEventDrop: DnDCalendarProps["onEventDrop"] = useCallback(({ event, start }: { event: CalendarEvent; start: Date | string; end: Date | string; isAllDay: boolean; delta: object; resourceId?: string | number }) => {
    // Use local date string to avoid UTC-conversion off-by-one errors
    const newDate = start instanceof Date ? toLocalDateStr(start) : String(start);
    setRescheduleError(null);
    // Optimistic update
    queryClient.setQueryData<CalendarInspection[]>(
      [...queryKey],
      (old = []) => old.map(i => i.id === event.id ? { ...i, scheduledDate: newDate } : i)
    );
    fetch(`/api/inspections/${event.id}/reschedule`, {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledDate: newDate }),
    }).then(res => {
      if (!res.ok) throw new Error("Failed to reschedule");
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    }).catch(() => {
      setRescheduleError("Failed to reschedule. Please try again.");
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    });
  }, [queryClient, queryKey]);

  const navPrev = () => {
    if (view === Views.MONTH) setDate(d => subMonths(d, 1));
    else if (view === Views.WEEK) setDate(d => subWeeks(d, 1));
    else setDate(d => subDays(d, 7));
  };
  const navNext = () => {
    if (view === Views.MONTH) setDate(d => addMonths(d, 1));
    else if (view === Views.WEEK) setDate(d => addWeeks(d, 1));
    else setDate(d => addDays(d, 7));
  };
  const navToday = () => setDate(new Date());

  const viewLabel = useMemo(() => {
    if (view === Views.MONTH) return format(date, "MMMM yyyy");
    if (view === Views.WEEK) {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);
      return `Week of ${format(weekStart, "dd MMM")} – ${format(weekEnd, "dd MMM yyyy")}`;
    }
    return `Agenda from ${format(date, "dd MMM yyyy")}`;
  }, [view, date]);

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Inspection Calendar</h1>
          <p className="text-muted-foreground mt-1">View and manage scheduled inspections across your team.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={filterInspector}
          onChange={e => setFilterInspector(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50"
        >
          <option value="">All Inspectors</option>
          {users?.map((u: { id: number; firstName: string; lastName: string }) => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
          ))}
        </select>

        <select
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50"
        >
          <option value="">All Projects</option>
          {projects?.map((p: { id: number; name: string }) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={filterDiscipline}
          onChange={e => setFilterDiscipline(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50"
        >
          <option value="">All Disciplines</option>
          {availableDisciplines.map((d: string) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {(filterInspector || filterProject || filterDiscipline) && (
          <button
            onClick={() => { setFilterInspector(""); setFilterProject(""); setFilterDiscipline(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(STATUS_COLORS).map(([status, c]) => (
          <div key={status} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: c.text }}>
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: c.bg, border: `2px solid ${c.border}` }} />
            <span className="capitalize">{status.replace(/_/g, " ")}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={navPrev} className="p-1.5 rounded-lg hover:bg-muted border border-border">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={navToday} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted">
            Today
          </button>
          <button onClick={navNext} className="p-1.5 rounded-lg hover:bg-muted border border-border">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-2 text-sm font-semibold text-sidebar">{viewLabel}</span>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {([Views.MONTH, Views.WEEK, Views.AGENDA] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold transition-colors",
                view === v ? "bg-secondary text-white" : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {rescheduleError && (
        <div className="flex items-center gap-2 mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {rescheduleError}
        </div>
      )}

      {/* Calendar */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden" style={{ minHeight: 600 }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">Loading calendar…</div>
        ) : (
          <div className="p-2" style={{ height: 680 }}>
            <style>{`
              .rbc-calendar { font-family: inherit; }
              .rbc-toolbar { display: none; }
              .rbc-header { font-size: 12px; font-weight: 600; padding: 8px 4px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
              .rbc-today { background-color: #eff6ff; }
              .rbc-off-range-bg { background-color: #f8fafc; }
              .rbc-event { border-radius: 6px; border: none !important; }
              .rbc-event:focus { outline: 2px solid #3B82F6; }
              .rbc-day-bg + .rbc-day-bg { border-left: 1px solid #e2e8f0; }
              .rbc-month-row + .rbc-month-row { border-top: 1px solid #e2e8f0; }
              .rbc-agenda-view table { border-radius: 0; }
              .rbc-agenda-date-cell { font-weight: 600; font-size: 13px; }
              .rbc-agenda-event-cell { font-size: 12px; }
              .rbc-show-more { font-size: 11px; font-weight: 600; color: #3B82F6; }
            `}</style>
            <DnDCalendar
              localizer={localizer}
              events={events}
              view={view}
              date={date}
              onNavigate={handleNavigate}
              onView={handleView}
              onSelectEvent={handleSelectEvent}
              onEventDrop={handleEventDrop}
              eventPropGetter={eventStyleGetter}
              toolbar={false}
              popup
              style={{ height: "100%" }}
              draggableAccessor={() => true}
              resizable={false}
            />
          </div>
        )}
      </div>

      {/* Preview card overlay */}
      {selectedEvent && (
        <PreviewCard
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onNavigate={navigate}
        />
      )}
    </AppLayout>
  );
}
