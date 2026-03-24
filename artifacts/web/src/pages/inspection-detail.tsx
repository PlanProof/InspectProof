import { useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, Badge } from "@/components/ui";
import {
  ArrowLeft, Calendar, Clock, User, CloudSun, ClipboardList,
  CheckCircle2, XCircle, MinusCircle, AlertTriangle, MessageSquare,
  Building, Loader2, ChevronRight, FileText, Link2, Paperclip
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${apiBase()}${path}`, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChecklistResult {
  id: number;
  checklistItemId: number;
  category: string;
  description: string;
  codeReference?: string;
  riskLevel?: string;
  result: "pass" | "fail" | "na" | null;
  notes?: string;
  orderIndex: number;
}

interface Issue {
  id: number;
  title: string;
  description: string;
  severity: string;
  status: string;
  location?: string;
  codeReference?: string;
  responsibleParty?: string;
  dueDate?: string;
}

interface Note {
  id: number;
  content: string;
  authorName?: string;
  createdAt: string;
}

interface Inspection {
  id: number;
  projectId: number;
  projectName: string;
  inspectionType: string;
  status: string;
  scheduledDate: string;
  scheduledTime?: string;
  completedDate?: string;
  inspectorId?: number;
  inspectorName?: string;
  duration?: number;
  notes: Note[];
  weatherConditions?: string;
  checklistTemplateId?: number;
  passCount: number;
  failCount: number;
  naCount: number;
  checklistResults: ChecklistResult[];
  issues: Issue[];
}

// ── Status / severity helpers ─────────────────────────────────────────────────

function statusColors(status: string) {
  const map: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    follow_up_required: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return map[status] ?? "bg-gray-100 text-gray-500 border-gray-200";
}

function severityColors(sev: string) {
  const map: Record<string, string> = {
    critical: "bg-red-50 text-red-700 border-red-300",
    high: "bg-orange-50 text-orange-700 border-orange-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-yellow-50 text-yellow-700 border-yellow-200",
  };
  return map[sev] ?? "bg-gray-50 text-gray-500 border-gray-200";
}

const TABS = ["Overview", "Checklist", "Issues"] as const;
type Tab = typeof TABS[number];

// ── Main ─────────────────────────────────────────────────────────────────────

export default function InspectionDetail() {
  const params = useParams<{ id: string }>();
  const inspId = parseInt(params.id || "0");
  const [tab, setTab] = useState<Tab>("Overview");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docsByItem, setDocsByItem] = useState<Record<number, { id: number; name: string; mimeType?: string }[]>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/inspections/${inspId}`);
      setInspection(data);
      // Load documents linked to checklist items for this project
      if (data.projectId) {
        const docsWithLinks = await apiFetch(`/api/projects/${data.projectId}/documents-with-links`).catch(() => []);
        const byItem: Record<number, { id: number; name: string; mimeType?: string }[]> = {};
        for (const doc of docsWithLinks) {
          for (const itemId of (doc.linkedItemIds ?? [])) {
            if (!byItem[itemId]) byItem[itemId] = [];
            byItem[itemId].push({ id: doc.id, name: doc.name, mimeType: doc.mimeType });
          }
        }
        setDocsByItem(byItem);
      }
    } catch {
      setError("Failed to load inspection");
    } finally {
      setLoading(false);
    }
  }, [inspId]);

  useState(() => { load(); });

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading inspection…
        </div>
      </AppLayout>
    );
  }

  if (error || !inspection) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">{error ?? "Inspection not found"}</div>
      </AppLayout>
    );
  }

  const total = inspection.passCount + inspection.failCount + inspection.naCount;
  const passRate = total > 0 ? Math.round((inspection.passCount / (total - inspection.naCount || 1)) * 100) : null;

  return (
    <AppLayout>
      {/* ── Breadcrumb / Back ── */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <Link href="/inspections" className="hover:text-sidebar transition-colors">Inspections</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={`/projects/${inspection.projectId}`} className="hover:text-sidebar transition-colors">{inspection.projectName}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-sidebar font-medium capitalize">{inspection.inspectionType.replace(/_/g, " ")} Inspection</span>
        </div>

        {/* ── Header card ── */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col sm:flex-row sm:items-start gap-5">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${statusColors(inspection.status)}`}>
                {inspection.status.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-muted-foreground border border-muted/50 rounded-full px-2.5 py-1 capitalize">
                {inspection.inspectionType.replace(/_/g, " ")} Inspection
              </span>
            </div>
            <h1 className="text-2xl font-bold text-sidebar leading-tight">
              {inspection.projectName}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(inspection.scheduledDate)}
                {inspection.scheduledTime && <span className="text-muted-foreground">at {inspection.scheduledTime}</span>}
              </span>
              {inspection.inspectorName && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {inspection.inspectorName}
                </span>
              )}
              {inspection.duration && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {inspection.duration} min
                </span>
              )}
              {inspection.weatherConditions && (
                <span className="flex items-center gap-1.5">
                  <CloudSun className="h-3.5 w-3.5" />
                  {inspection.weatherConditions}
                </span>
              )}
            </div>
          </div>

          {/* Stats pills */}
          {total > 0 && (
            <div className="flex sm:flex-col items-center gap-2 sm:text-right shrink-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                  <CheckCircle2 className="h-3 w-3" /> {inspection.passCount} Pass
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                  <XCircle className="h-3 w-3" /> {inspection.failCount} Fail
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                  <MinusCircle className="h-3 w-3" /> {inspection.naCount} N/A
                </span>
              </div>
              {passRate !== null && (
                <span className="text-sm font-semibold text-sidebar">
                  {passRate}% pass rate
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0 border-b mb-6">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
              tab === t
                ? "border-secondary text-secondary"
                : "border-transparent text-muted-foreground hover:text-sidebar"
            }`}
          >
            {t}
            {t === "Issues" && inspection.issues.length > 0 && (
              <span className="text-xs bg-red-100 text-red-600 font-semibold rounded-full px-1.5 py-0.5 leading-none">
                {inspection.issues.length}
              </span>
            )}
            {t === "Checklist" && total > 0 && (
              <span className="text-xs bg-muted text-muted-foreground font-semibold rounded-full px-1.5 py-0.5 leading-none">
                {total}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab inspection={inspection} />}
      {tab === "Checklist" && <ChecklistTab results={inspection.checklistResults} docsByItem={docsByItem} />}
      {tab === "Issues" && <IssuesTab issues={inspection.issues} />}
    </AppLayout>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ inspection }: { inspection: Inspection }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Details card */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-sidebar mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" /> Inspection Details
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {[
              { label: "Project", value: inspection.projectName },
              { label: "Type", value: inspection.inspectionType.replace(/_/g, " ") },
              { label: "Status", value: inspection.status.replace(/_/g, " ") },
              { label: "Scheduled Date", value: formatDate(inspection.scheduledDate) },
              { label: "Scheduled Time", value: inspection.scheduledTime ?? "TBC" },
              { label: "Completed Date", value: inspection.completedDate ? formatDate(inspection.completedDate) : "—" },
              { label: "Inspector", value: inspection.inspectorName ?? "Unassigned" },
              { label: "Duration", value: inspection.duration ? `${inspection.duration} minutes` : "—" },
              { label: "Weather", value: inspection.weatherConditions ?? "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                <div className="font-medium text-sidebar capitalize">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        {inspection.notes.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold text-sidebar mb-4 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" /> Field Notes
            </h2>
            <div className="space-y-3">
              {inspection.notes.map(note => (
                <div key={note.id} className="bg-muted/30 rounded-lg p-4 border border-muted/50">
                  <p className="text-sm text-sidebar leading-relaxed">{note.content}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{note.authorName ?? "Inspector"}</span>
                    <span>·</span>
                    <span>{formatDate(note.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="space-y-4">
        {/* Results summary */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-sidebar mb-3">Results Summary</h3>
          {inspection.passCount + inspection.failCount + inspection.naCount === 0 ? (
            <p className="text-sm text-muted-foreground">No checklist results yet.</p>
          ) : (
            <div className="space-y-2.5">
              {[
                { label: "Pass", count: inspection.passCount, color: "text-green-600", bg: "bg-green-500" },
                { label: "Fail", count: inspection.failCount, color: "text-red-600", bg: "bg-red-500" },
                { label: "N/A", count: inspection.naCount, color: "text-gray-500", bg: "bg-gray-300" },
              ].map(({ label, count, color, bg }) => {
                const total = inspection.passCount + inspection.failCount + inspection.naCount;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-semibold ${color}`}>{count}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-sidebar mb-3">Quick Links</h3>
          <div className="space-y-2">
            <Link
              href={`/projects/${inspection.projectId}`}
              className="flex items-center gap-2 text-sm text-secondary hover:text-secondary/80 transition-colors"
            >
              <Building className="h-3.5 w-3.5" /> View Project
            </Link>
            {inspection.issues.length > 0 && (
              <button
                className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 transition-colors"
                onClick={() => {}}
              >
                <AlertTriangle className="h-3.5 w-3.5" /> {inspection.issues.length} Open {inspection.issues.length === 1 ? "Issue" : "Issues"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Checklist Tab ─────────────────────────────────────────────────────────────

function ChecklistTab({
  results,
  docsByItem,
}: {
  results: ChecklistResult[];
  docsByItem: Record<number, { id: number; name: string; mimeType?: string }[]>;
}) {
  if (results.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No checklist results recorded</p>
        <p className="text-sm mt-1">Results are recorded via the mobile app during the field inspection.</p>
      </div>
    );
  }

  const categories = Array.from(new Set(results.map(r => r.category)));
  const grouped: Record<string, ChecklistResult[]> = {};
  for (const r of results) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  return (
    <div className="space-y-6">
      {categories.map(cat => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex-1 border-t border-muted/40" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{cat}</span>
            <span className="flex-1 border-t border-muted/40" />
          </div>
          <div className="space-y-2">
            {grouped[cat].map((item, idx) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-start gap-3 p-3.5 rounded-lg border transition-colors",
                  item.result === "pass" && "bg-green-50/60 border-green-200",
                  item.result === "fail" && "bg-red-50/60 border-red-200",
                  item.result === "na" && "bg-gray-50 border-gray-200",
                  !item.result && "bg-card border-muted/50",
                )}
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted/60 text-muted-foreground text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-sidebar font-medium leading-snug">{item.description}</p>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {item.codeReference && (
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-mono">
                        {item.codeReference}
                      </span>
                    )}
                    {item.riskLevel && (
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded capitalize border font-medium",
                        item.riskLevel === "high" && "bg-red-50 text-red-700 border-red-200",
                        item.riskLevel === "medium" && "bg-amber-50 text-amber-700 border-amber-200",
                        item.riskLevel === "low" && "bg-green-50 text-green-700 border-green-200",
                      )}>
                        {item.riskLevel} Risk
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground mt-1.5 italic">"{item.notes}"</p>
                  )}
                  {/* Linked documents */}
                  {(docsByItem[item.checklistItemId] ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {docsByItem[item.checklistItemId].map(doc => (
                        <span
                          key={doc.id}
                          className="inline-flex items-center gap-1 text-[11px] bg-secondary/8 text-secondary border border-secondary/20 px-2 py-0.5 rounded-full font-medium"
                        >
                          <Paperclip className="h-2.5 w-2.5 shrink-0" />
                          {doc.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {item.result === "pass" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  {item.result === "fail" && <XCircle className="h-5 w-5 text-red-600" />}
                  {item.result === "na" && <MinusCircle className="h-5 w-5 text-gray-400" />}
                  {!item.result && <MinusCircle className="h-5 w-5 text-muted-foreground/30" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Issues Tab ────────────────────────────────────────────────────────────────

function IssuesTab({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30 text-green-500" />
        <p className="font-medium">No issues raised</p>
        <p className="text-sm mt-1">All checklist items passed without defects.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {issues.map(issue => (
        <div key={issue.id} className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${severityColors(issue.severity)}`}>
                  {issue.severity}
                </span>
                <span className="text-xs text-muted-foreground capitalize border border-muted/50 rounded px-2 py-0.5">
                  {issue.status.replace(/_/g, " ")}
                </span>
              </div>
              <h3 className="font-semibold text-sidebar">{issue.title}</h3>
            </div>
            {issue.dueDate && (
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">Due</div>
                <div className="text-sm font-medium text-sidebar">{formatDate(issue.dueDate)}</div>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{issue.description}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {issue.location && (
              <span><span className="font-medium">Location:</span> {issue.location}</span>
            )}
            {issue.codeReference && (
              <span><span className="font-medium">Code ref:</span> {issue.codeReference}</span>
            )}
            {issue.responsibleParty && (
              <span><span className="font-medium">Responsible:</span> {issue.responsibleParty}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
