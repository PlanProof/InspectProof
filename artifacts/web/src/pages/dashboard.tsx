import { useState } from "react";
import { useGetDashboardAnalytics } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import {
  FolderOpen, CheckSquare, AlertTriangle, FileText, ArrowRight,
  ChevronLeft, ChevronRight, Calendar, Clock, MapPin, User, CalendarDays,
} from "lucide-react";
import { Link } from "wouter";
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

// ── Day Run Sheet ─────────────────────────────────────────────────────────────
function DayRunSheet({ day, inspections }: { day: Date; inspections: any[] }) {
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-muted/50">
        <div className="flex items-center gap-2 mb-0.5">
          <CalendarDays className="h-4 w-4 text-secondary" />
          <h3 className="font-bold text-sidebar text-base">{dayLabel}</h3>
        </div>
        <p className="text-xs text-muted-foreground ml-6">{dateLabel}</p>
        {dayInspections.length > 0 && (
          <p className="text-xs font-semibold text-secondary ml-6 mt-1">
            {dayInspections.length} inspection{dayInspections.length !== 1 ? "s" : ""} scheduled
          </p>
        )}
      </div>

      {/* Inspection list */}
      <div className="flex-1 overflow-y-auto">
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
                <div key={insp.id} className={`px-4 py-3.5 border-l-4 ${c.border} bg-card hover:bg-muted/20 transition-colors`}>
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer link */}
      <div className="border-t border-muted/50 px-4 py-3">
        <Link href="/inspections" className="flex items-center justify-center gap-1.5 text-xs font-medium text-secondary hover:underline">
          View all inspections <ArrowRight className="h-3.5 w-3.5" />
        </Link>
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
    <div className="flex flex-col gap-0">
      {/* Month nav */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
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
      <div className="grid grid-cols-7 border-t border-b border-muted/50">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
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
                  "relative flex flex-col items-center pt-2 pb-1.5 min-h-[56px] border-b border-r border-muted/40 transition-colors",
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

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data, isLoading } = useGetDashboardAnalytics();
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  if (isLoading) return <AppLayout><div className="flex h-full items-center justify-center">Loading...</div></AppLayout>;
  if (!data) return <AppLayout><div>Error loading dashboard</div></AppLayout>;

  const allInspections = (data as any).allInspections ?? data.upcomingInspections ?? [];

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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard title="Active Projects" value={data.activeProjects} icon={FolderOpen} trend="+2 from last month" />
        <StatCard title="Inspections (Month)" value={data.inspectionsThisMonth} icon={CheckSquare} trend="12 completed" />
        <StatCard title="Open Issues" value={data.openIssues} icon={AlertTriangle} trend={`${data.criticalIssues} critical`} isAlert={data.criticalIssues > 0} />
        <StatCard title="Reports Pending" value={data.reportsPending} icon={FileText} trend="Requires review" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calendar */}
        <Card className="lg:col-span-2 shadow-md border-muted/60 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Inspection Calendar</CardTitle>
            </div>
            <Link href="/inspections" className="text-sm text-secondary font-medium flex items-center hover:underline">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <CalendarWidget
              inspections={allInspections}
              selectedDay={selectedDay}
              onDaySelect={setSelectedDay}
            />
          </CardContent>
        </Card>

        {/* Day Run Sheet (right panel) */}
        <Card className="shadow-md border-muted/60 overflow-hidden flex flex-col">
          <CardHeader className="pb-2 border-b flex flex-row items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Day Run Sheet</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
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

function StatCard({ title, value, icon: Icon, trend, isAlert }: any) {
  return (
    <Card className="shadow-sm border-muted/60 hover:shadow-md transition-shadow relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-1 h-full ${isAlert ? "bg-destructive" : "bg-primary"}`} />
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-sidebar mt-2">{value}</p>
          </div>
          <div className={`p-3 rounded-xl ${isAlert ? "bg-destructive/10 text-destructive" : "bg-primary/20 text-sidebar"}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4 font-medium">{trend}</p>
      </CardContent>
    </Card>
  );
}
