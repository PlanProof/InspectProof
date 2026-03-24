import { useState } from "react";
import { useGetDashboardAnalytics } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { FolderOpen, CheckSquare, AlertTriangle, FileText, ArrowRight, ChevronLeft, ChevronRight, Calendar, Clock, MapPin } from "lucide-react";
import { Link } from "wouter";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday, parseISO } from "date-fns";

// Colour per inspection type
const TYPE_COLORS: Record<string, { bg: string; dot: string; badge: string }> = {
  frame:      { bg: "bg-blue-50",   dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-800 border-blue-200" },
  footing:    { bg: "bg-amber-50",  dot: "bg-amber-500",  badge: "bg-amber-100 text-amber-800 border-amber-200" },
  slab:       { bg: "bg-orange-50", dot: "bg-orange-500", badge: "bg-orange-100 text-orange-800 border-orange-200" },
  final:      { bg: "bg-green-50",  dot: "bg-green-500",  badge: "bg-green-100 text-green-800 border-green-200" },
  fire_safety:{ bg: "bg-red-50",    dot: "bg-red-500",    badge: "bg-red-100 text-red-800 border-red-200" },
  pool_barrier:{ bg:"bg-cyan-50",   dot: "bg-cyan-500",   badge: "bg-cyan-100 text-cyan-800 border-cyan-200" },
};
const DEFAULT_COLOR = { bg: "bg-primary/5", dot: "bg-primary", badge: "bg-primary/10 text-primary border-primary/20" };

function typeColor(type: string) {
  const key = Object.keys(TYPE_COLORS).find(k => type?.toLowerCase().includes(k)) ?? "";
  return TYPE_COLORS[key] ?? DEFAULT_COLOR;
}

function typeLabel(type: string) {
  return type?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? type;
}

function CalendarWidget({ inspections }: { inspections: any[] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Mon
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Build weeks array
  const weeks: Date[][] = [];
  let day = calStart;
  while (day <= calEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }

  function inspectionsOn(d: Date) {
    return inspections.filter(insp => {
      try { return isSameDay(parseISO(insp.scheduledDate), d); } catch { return false; }
    });
  }

  const selectedInspections = selectedDay ? inspectionsOn(selectedDay) : [];

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
      <div className="grid grid-cols-7 flex-1">
        {weeks.map((week, wi) =>
          week.map((d, di) => {
            const dayInspections = inspectionsOn(d);
            const isCurrentMonth = isSameMonth(d, currentMonth);
            const isSelected = selectedDay ? isSameDay(d, selectedDay) : false;
            const todayDay = isToday(d);

            return (
              <button
                key={`${wi}-${di}`}
                onClick={() => setSelectedDay(d)}
                className={[
                  "relative flex flex-col items-center pt-2 pb-1.5 min-h-[60px] border-b border-r border-muted/40 transition-colors text-left",
                  di === 0 ? "border-l" : "",
                  isSelected ? "bg-primary/[0.06]" : "hover:bg-muted/30",
                  !isCurrentMonth ? "opacity-35" : "",
                ].join(" ")}
              >
                {/* Day number */}
                <span className={[
                  "flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full mb-1",
                  todayDay ? "bg-primary text-white font-bold" : isSelected ? "text-primary font-semibold" : "text-sidebar",
                ].join(" ")}>
                  {format(d, "d")}
                </span>

                {/* Inspection dots */}
                {dayInspections.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-0.5 px-1">
                    {dayInspections.slice(0, 3).map((insp, i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${typeColor(insp.inspectionType).dot}`}
                        title={insp.projectName}
                      />
                    ))}
                    {dayInspections.length > 3 && (
                      <span className="text-[9px] text-muted-foreground font-medium leading-none mt-0.5">+{dayInspections.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Selected day inspection list */}
      <div className="border-t border-muted/50 min-h-[90px]">
        {selectedDay && (
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {isToday(selectedDay) ? "Today" : format(selectedDay, "EEEE, d MMM")}
              {selectedInspections.length > 0 && ` · ${selectedInspections.length} inspection${selectedInspections.length > 1 ? "s" : ""}`}
            </p>
            {selectedInspections.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No inspections scheduled</p>
            ) : (
              <div className="space-y-2">
                {selectedInspections.map(insp => {
                  const c = typeColor(insp.inspectionType);
                  return (
                    <div key={insp.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${c.bg}`}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-sidebar truncate">{insp.projectName}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground capitalize">{typeLabel(insp.inspectionType)}</span>
                          {insp.scheduledTime && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />{insp.scheduledTime}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.badge} uppercase tracking-wide`}>
                        {insp.status?.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useGetDashboardAnalytics();

  if (isLoading) return <AppLayout><div className="flex h-full items-center justify-center">Loading...</div></AppLayout>;
  if (!data) return <AppLayout><div>Error loading dashboard</div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-1">Welcome back. Here's what's happening today.</p>
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
            <CalendarWidget inspections={data.upcomingInspections ?? []} />
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="shadow-md border-muted/60">
          <CardHeader className="pb-2 border-b">
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.recentActivity?.slice(0, 6).map(act => (
                <div key={act.id} className="p-4">
                  <p className="text-sm text-sidebar">
                    <span className="font-semibold">{act.userName}</span> {act.action} <span className="font-medium">{act.entityType}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(act.createdAt), "d MMM, h:mm a")}</p>
                </div>
              ))}
              {(!data.recentActivity || data.recentActivity.length === 0) && (
                <div className="p-8 text-center text-muted-foreground text-sm">No recent activity</div>
              )}
            </div>
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
