import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui";
import { Search, Activity, FileText, CheckSquare, AlertTriangle, FolderOpen, Users, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function fetchActivity(entityType?: string) {
  const token = localStorage.getItem("inspectproof_token") || "";
  const url = entityType
    ? `${apiBase()}/api/activity?entityType=${entityType}&limit=200`
    : `${apiBase()}/api/activity?limit=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Failed to load activity");
  return res.json();
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  inspection: <CheckSquare className="h-4 w-4 text-blue-500" />,
  issue: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  project: <FolderOpen className="h-4 w-4 text-purple-500" />,
  report: <FileText className="h-4 w-4 text-green-500" />,
  user: <Users className="h-4 w-4 text-indigo-500" />,
};

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-100 text-green-700 border-green-200",
  updated: "bg-blue-100 text-blue-700 border-blue-200",
  closed: "bg-purple-100 text-purple-700 border-purple-200",
  deleted: "bg-red-100 text-red-700 border-red-200",
  submitted: "bg-indigo-100 text-indigo-700 border-indigo-200",
  assigned: "bg-amber-100 text-amber-700 border-amber-200",
};

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(dateStr);
}

const ENTITY_TYPES = ["All", "inspection", "issue", "project", "report", "user"];

export default function ActivityPage() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("All");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["activity", entityFilter],
    queryFn: () => fetchActivity(entityFilter === "All" ? undefined : entityFilter),
  });

  const filtered = logs.filter((log: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.description?.toLowerCase().includes(q) ||
      log.userName?.toLowerCase().includes(q) ||
      log.entityType?.toLowerCase().includes(q) ||
      log.action?.toLowerCase().includes(q)
    );
  });

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight flex items-center gap-3">
            <Activity className="h-7 w-7 text-secondary" />
            Audit Trail
          </h1>
          <p className="text-muted-foreground mt-1">A full record of actions taken across the platform.</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex flex-wrap items-center gap-3 bg-muted/20">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search activity…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {ENTITY_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setEntityFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize ${
                  entityFilter === type
                    ? "bg-sidebar text-white border-sidebar"
                    : "bg-background text-muted-foreground border-border hover:border-sidebar/30"
                }`}
              >
                {type === "All" ? "All Activity" : type}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading activity…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/25 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No activity found</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((log: any) => (
              <div key={log.id} className="px-5 py-3.5 flex items-start gap-4 hover:bg-muted/20 transition-colors">
                <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center border border-border/50">
                  {ENTITY_ICONS[log.entityType] ?? <Activity className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground border-muted"
                      }`}
                    >
                      {log.action}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 capitalize font-medium border border-border/40 bg-muted/30 px-1.5 py-0.5 rounded">
                      {log.entityType}
                    </span>
                  </div>
                  <p className="text-sm text-sidebar font-medium leading-snug">{log.description}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground font-medium">{log.userName}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(log.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground/60 shrink-0 text-right hidden sm:block">
                  {formatDate(log.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
