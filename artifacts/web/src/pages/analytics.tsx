import { AppLayout } from "@/components/layout/AppLayout";
import { useGetDashboardAnalytics, useGetAnalyticsTrends } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { CheckSquare, Percent, AlertTriangle, FolderOpen, BarChart2 } from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  critical: "#ef4444",
  High: "#f97316",
  high: "#f97316",
  Medium: "#eab308",
  medium: "#eab308",
  Low: "#3b82f6",
  low: "#3b82f6",
};
const PIE_LABEL_COLORS: Record<string, string> = {
  Pass: "#C5D92D",
  Fail: "#ef4444",
  "N/A": "#9ca3af",
  Monitor: "#f97316",
};
const PIE_COLORS = ["#C5D92D", "#ef4444", "#9ca3af", "#f97316"];

export default function Analytics() {
  const { data: dash, isLoading: dashLoading } = useGetDashboardAnalytics();
  const { data: trends, isLoading: trendsLoading } = useGetAnalyticsTrends();

  const isLoading = dashLoading || trendsLoading;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading analytics…
        </div>
      </AppLayout>
    );
  }

  const inspectionsByMonth = (trends?.inspectionsByMonth ?? []).map((r: any) => ({
    name: r.month,
    total: r.total ?? r.count ?? 0,
  }));

  const trendsAny = trends as any;
  const dashAny = dash as any;

  const passFailBreakdown: { name: string; value: number }[] =
    trendsAny?.passFailBreakdown ?? [];

  const complianceTrend: { month: string; rate: number }[] =
    trendsAny?.complianceTrend ?? [];

  const issuesBySeverity = (
    trendsAny?.issuesBySeverity ?? dashAny?.issuesBySeverity ?? []
  ).map((r: any) => ({
    name: r.name ?? r.severity ?? "Unknown",
    count: r.count ?? 0,
  }));

  const complianceRate =
    trends?.complianceRate ?? dashAny?.complianceRate ?? null;

  const noInspections = inspectionsByMonth.length === 0;
  const noPassFail = passFailBreakdown.length === 0;
  const noTrend = complianceTrend.length === 0;
  const noIssues = issuesBySeverity.length === 0;

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-sidebar tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Live metrics from your inspections and checklist data.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Total Inspections"
          value={dash?.totalInspections ?? 0}
          icon={CheckSquare}
          trend="All time"
        />
        <StatCard
          title="Compliance Rate"
          value={complianceRate !== null ? `${complianceRate}%` : "—"}
          icon={Percent}
          trend={complianceRate !== null ? "Based on checklist results" : "No checklist data yet"}
        />
        <StatCard
          title="Open Issues"
          value={dash?.openIssues ?? 0}
          icon={AlertTriangle}
          trend="Across all projects"
        />
        <StatCard
          title="Active Projects"
          value={dash?.activeProjects ?? 0}
          icon={FolderOpen}
          trend="Currently running"
        />
      </div>

      {/* Row 1 charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Inspections by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {noInspections ? (
              <EmptyChart message="No inspection data in the last 12 months." />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inspectionsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "transparent" }}
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    />
                    <Bar dataKey="total" fill="#466DB5" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Checklist Results — Pass / Fail / N/A</CardTitle>
          </CardHeader>
          <CardContent>
            {noPassFail ? (
              <EmptyChart message="No checklist results recorded yet. Complete an inspection checklist to see data here." />
            ) : (
              <div className="h-[300px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={passFailBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {passFailBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_LABEL_COLORS[entry.name] ?? PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2 charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Compliance Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {noTrend ? (
              <EmptyChart message="No monthly compliance data yet. Compliance trends will appear as you complete checklists over time." />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={complianceTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                      formatter={(v: any) => [`${v}%`, "Compliance"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="#0B1933"
                      strokeWidth={3}
                      dot={{ r: 4, strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Open Issues by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            {noIssues ? (
              <EmptyChart message="No open issues at the moment." />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={issuesBySeverity} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      cursor={{ fill: "transparent" }}
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={30}>
                      {issuesBySeverity.map((entry: { name: string; count: number }, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={SEVERITY_COLORS[entry.name] ?? "#466DB5"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, icon: Icon, trend }: {
  title: string; value: string | number; icon: any; trend: string;
}) {
  return (
    <Card className="shadow-sm border-muted/60 hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-sidebar mt-2">{value}</p>
          </div>
          <div className="p-3 rounded-xl bg-primary/20 text-sidebar">
            <Icon className="h-6 w-6" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4 font-medium">{trend}</p>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground gap-3">
      <BarChart2 className="h-10 w-10 opacity-20" />
      <p className="text-sm text-center max-w-xs">{message}</p>
    </div>
  );
}
