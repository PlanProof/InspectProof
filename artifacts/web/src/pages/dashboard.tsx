import { useGetDashboardAnalytics } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { FolderOpen, CheckSquare, AlertTriangle, FileText, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";

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
        {/* Upcoming Inspections */}
        <Card className="lg:col-span-2 shadow-md border-muted/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <CardTitle>Upcoming Inspections</CardTitle>
            <Link href="/inspections" className="text-sm text-secondary font-medium flex items-center hover:underline">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.upcomingInspections?.slice(0, 5).map(insp => (
                <div key={insp.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sidebar">{insp.projectName}</p>
                    <p className="text-sm text-muted-foreground capitalize flex items-center gap-2 mt-1">
                      {insp.inspectionType.replace('_', ' ')} • {formatDate(insp.scheduledDate)}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-blue-50 text-secondary border-secondary/20">
                    {insp.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
              {(!data.upcomingInspections || data.upcomingInspections.length === 0) && (
                <div className="p-8 text-center text-muted-foreground">No upcoming inspections scheduled.</div>
              )}
            </div>
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
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(act.createdAt)}</p>
                </div>
              ))}
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
      <div className={`absolute top-0 left-0 w-1 h-full ${isAlert ? 'bg-destructive' : 'bg-primary'}`} />
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-sidebar mt-2">{value}</p>
          </div>
          <div className={`p-3 rounded-xl ${isAlert ? 'bg-destructive/10 text-destructive' : 'bg-primary/20 text-sidebar'}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4 font-medium">{trend}</p>
      </CardContent>
    </Card>
  );
}
