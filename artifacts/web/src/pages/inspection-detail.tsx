import { useState, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import { DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Calendar, Clock, User, CloudSun, ClipboardList,
  CheckCircle2, XCircle, MinusCircle, AlertTriangle, MessageSquare,
  Building, Loader2, ChevronRight, FileText, Paperclip,
  Award, BarChart2, Send, Download, Zap, X,
  UserCheck, ChevronDown, FolderOpen, Upload, File,
  FileImage, FileSpreadsheet, CheckSquare, PencilLine,
  RefreshCw, Eye, ShieldCheck, Flame, Home, ClipboardCheck, Trash2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("inspectproof_token") || "";
  const res = await fetch(`${apiBase()}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChecklistStroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface ChecklistMarkupData {
  w: number;
  h: number;
  strokes: ChecklistStroke[];
}

interface ChecklistResult {
  id: number;
  checklistItemId: number;
  category: string;
  description: string;
  codeReference?: string;
  riskLevel?: string;
  requirePhoto?: boolean;
  defectTrigger?: boolean;
  recommendedActionDefault?: string | null;
  result: "pass" | "fail" | "monitor" | "na" | null;
  notes?: string;
  photoUrls?: string[];
  photoMarkups?: Record<string, ChecklistMarkupData>;
  severity?: string | null;
  location?: string | null;
  tradeAllocated?: string | null;
  defectStatus?: string;
  clientVisible?: boolean;
  recommendedAction?: string | null;
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
  source?: "checklist" | "manual";
  category?: string;
  result?: string;
  recommendedAction?: string;
  checklistResultId?: number;
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
  siteNotes?: string;
  clientEmail?: string;
  checklistTemplateId?: number;
  checklistTemplateName?: string;
  checklistTemplateDiscipline?: string | null;
  passCount: number;
  failCount: number;
  monitorCount: number;
  naCount: number;
  checklistResults: ChecklistResult[];
  issues: Issue[];
}

interface Inspector {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
}

interface ChecklistTemplate {
  id: number;
  name: string;
  folder: string;
  discipline: string;
  itemCount: number;
  inspectionType?: string;
}

interface ProjectDocument {
  id: number;
  name: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  folder?: string;
  uploadedByName?: string;
  createdAt: string;
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

const TABS = ["Overview", "Checklist", "Issues", "Documents", "Reports"] as const;
type Tab = typeof TABS[number];

// ── Report type catalogue ─────────────────────────────────────────────────────

const ALL_REPORT_TYPE_LABELS: Record<string, string> = {
  inspection_certificate:   "Inspection Certificate",
  compliance_report:        "Compliance Report",
  defect_notice:            "Defect Notice",
  non_compliance_notice:    "Non-Compliance Notice",
  summary:                  "Inspection Summary",
  quality_control_report:   "Quality Control Report",
  non_conformance_report:   "Non-Conformance Report",
  safety_inspection_report: "Safety Inspection Report",
  hazard_assessment_report: "Hazard Assessment Report",
  corrective_action_report: "Corrective Action Report",
  pre_purchase_report:      "Pre-Purchase Building Report",
  annual_fire_safety:       "Annual Fire Safety Statement",
  fire_inspection_report:   "Fire Safety Inspection Report",
};

const ALL_REPORT_TYPES_META: Array<{ key: string; label: string; icon: React.ElementType; desc: string }> = [
  { key: "inspection_certificate",   label: "Inspection Certificate",        icon: Award,          desc: "Formal certificate confirming compliance with NCC requirements" },
  { key: "compliance_report",        label: "Compliance Report",             icon: BarChart2,      desc: "Detailed checklist results and overall compliance status" },
  { key: "defect_notice",            label: "Defect Notice",                 icon: AlertTriangle,  desc: "Notice of defects requiring rectification before the next stage" },
  { key: "non_compliance_notice",    label: "Non-Compliance Notice",         icon: XCircle,        desc: "Formal notice of non-compliant work under the Building Act" },
  { key: "summary",                  label: "Inspection Summary",            icon: FileText,       desc: "Brief narrative summary of overall inspection outcomes" },
  { key: "quality_control_report",   label: "Quality Control Report",        icon: ClipboardCheck, desc: "QC results against approved plans and project specifications" },
  { key: "non_conformance_report",   label: "Non-Conformance Report",        icon: AlertTriangle,  desc: "Formal record of non-conformances against design standards" },
  { key: "safety_inspection_report", label: "Safety Inspection Report",      icon: ShieldCheck,    desc: "WHS site inspection findings and safety compliance status" },
  { key: "hazard_assessment_report", label: "Hazard Assessment Report",      icon: ShieldCheck,    desc: "Site hazard identification and risk control requirements" },
  { key: "corrective_action_report", label: "Corrective Action Report",      icon: RefreshCw,      desc: "Status of open corrective actions from prior inspections" },
  { key: "pre_purchase_report",      label: "Pre-Purchase Building Report",  icon: Home,           desc: "Property condition assessment for prospective buyers (AS 4349.1)" },
  { key: "annual_fire_safety",       label: "Annual Fire Safety Statement",  icon: Flame,          desc: "Annual certification of essential fire safety measures" },
  { key: "fire_inspection_report",   label: "Fire Safety Inspection Report", icon: Flame,          desc: "Fire safety compliance inspection findings and actions" },
];

const DISCIPLINE_REPORT_TYPES: Record<string, string[]> = {
  "Building Surveyor":      ["inspection_certificate", "compliance_report", "defect_notice", "non_compliance_notice", "summary"],
  "Structural Engineer":    ["compliance_report", "non_conformance_report", "defect_notice", "summary"],
  "Plumbing Officer":       ["inspection_certificate", "compliance_report", "defect_notice", "non_compliance_notice"],
  "Builder / QC":           ["quality_control_report", "defect_notice", "non_conformance_report", "corrective_action_report", "summary"],
  "WHS Officer":            ["safety_inspection_report", "hazard_assessment_report", "corrective_action_report", "non_compliance_notice"],
  "Pre-Purchase Inspector": ["pre_purchase_report", "defect_notice", "summary", "compliance_report"],
  "Fire Safety Engineer":   ["annual_fire_safety", "fire_inspection_report", "compliance_report", "defect_notice"],
};

const DEFAULT_DISCIPLINE_TYPES = ["inspection_certificate", "compliance_report", "defect_notice", "summary"];

function getAllowedReportTypes(discipline?: string | null): string[] {
  if (discipline && DISCIPLINE_REPORT_TYPES[discipline]) return DISCIPLINE_REPORT_TYPES[discipline];
  return DEFAULT_DISCIPLINE_TYPES;
}

function getSuggestedReportType(inspection: Inspection): string {
  const allowed = getAllowedReportTypes(inspection.checklistTemplateDiscipline);

  // 1. Check doc templates linked to this inspection's checklist template
  try {
    const raw = localStorage.getItem("inspectproof_doc_templates");
    if (raw) {
      const docTemplates: Array<{ defaultReportType?: string; linkedChecklistIds: number[] }> = JSON.parse(raw);
      const linked = docTemplates.find(
        dt => dt.defaultReportType && dt.linkedChecklistIds.includes(inspection.checklistTemplateId as number)
      );
      if (linked?.defaultReportType && allowed.includes(linked.defaultReportType)) return linked.defaultReportType;
    }
  } catch {}

  // 2. Heuristic: prefer a defect-type report when failures exist
  if (inspection.failCount > 0) {
    const defectType = allowed.find(k => ["defect_notice", "non_conformance_report", "safety_inspection_report", "hazard_assessment_report", "pre_purchase_report"].includes(k));
    if (defectType) return defectType;
  }

  // 3. First allowed type as default
  return allowed[0] || "compliance_report";
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function InspectionDetail() {
  const params = useParams<{ id: string }>();
  const inspId = parseInt(params.id || "0");
  const [tab, setTab] = useState<Tab>("Overview");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docsByItem, setDocsByItem] = useState<Record<number, { id: number; name: string; mimeType?: string }[]>>({});
  const [reports, setReports] = useState<any[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [viewingReport, setViewingReport] = useState<any | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState("inspection_certificate");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);
  const [submittingReport, setSubmittingReport] = useState(false);

  // Inspector / checklist / documents data
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>([]);

  const openReportDialog = useCallback((inspection: Inspection) => {
    const suggested = getSuggestedReportType(inspection);
    setSelectedReportType(suggested);
    setGeneratedReport(null);
    setReportDialogOpen(true);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/inspections/${inspId}`);
      setInspection(data);

      // Parallel loads
      const [docsWithLinks, reports, users, tmpls, projDocs] = await Promise.all([
        data.projectId ? apiFetch(`/api/projects/${data.projectId}/documents-with-links`).catch(() => []) : Promise.resolve([]),
        apiFetch(`/api/reports?inspectionId=${inspId}`).catch(() => []),
        apiFetch("/api/users").catch(() => []),
        apiFetch("/api/checklist-templates").catch(() => []),
        data.projectId ? apiFetch(`/api/projects/${data.projectId}/documents`).catch(() => []) : Promise.resolve([]),
      ]);

      // Build docsByItem map
      const byItem: Record<number, { id: number; name: string; mimeType?: string }[]> = {};
      for (const doc of docsWithLinks) {
        for (const itemId of (doc.linkedItemIds ?? [])) {
          if (!byItem[itemId]) byItem[itemId] = [];
          byItem[itemId].push({ id: doc.id, name: doc.name, mimeType: doc.mimeType });
        }
      }
      setDocsByItem(byItem);
      setReports(reports);
      setInspectors(users);
      setTemplates(tmpls);
      setProjectDocuments(projDocs);
    } catch {
      setError("Failed to load inspection");
    } finally {
      setLoading(false);
    }
  }, [inspId]);

  useState(() => { load(); });

  const disciplineReportTypes = inspection
    ? getAllowedReportTypes(inspection.checklistTemplateDiscipline)
    : DEFAULT_DISCIPLINE_TYPES;
  const REPORT_TYPES_DESKTOP = ALL_REPORT_TYPES_META.filter(rt => disciplineReportTypes.includes(rt.key));

  const generateReport = async () => {
    setGeneratingReport(true);
    setGeneratedReport(null);
    try {
      const data = await apiFetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: inspId, reportType: selectedReportType, userId: 1 }),
      });
      setGeneratedReport(data);
    } catch {
    } finally {
      setGeneratingReport(false);
    }
  };

  const refreshReports = useCallback(async () => {
    try {
      const updated = await apiFetch(`/api/reports?inspectionId=${inspId}`).catch(() => []);
      setReports(updated);
    } catch {}
  }, [inspId]);

  const submitReport = async () => {
    if (!generatedReport) return;
    setSubmittingReport(true);
    try {
      await apiFetch(`/api/reports/${generatedReport.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      setReportDialogOpen(false);
      setGeneratedReport(null);
      await refreshReports();
      setTab("Reports");
    } catch {
    } finally {
      setSubmittingReport(false);
    }
  };

  const saveReportDraft = async () => {
    if (!generatedReport) return;
    setReportDialogOpen(false);
    setGeneratedReport(null);
    await refreshReports();
    setTab("Reports");
  };

  const downloadReportPdf = async (report: any) => {
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`/api/reports/${report.id}/pdf`, {
        headers: { Authorization: `Basic ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.title?.replace(/[^a-z0-9\s\-_]/gi, "").replace(/\s+/g, "_") || "report"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

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

  const total = inspection.passCount + inspection.failCount + (inspection.monitorCount ?? 0) + inspection.naCount;
  const scored = inspection.passCount + inspection.failCount;
  const passRate = scored > 0 ? Math.round((inspection.passCount / scored) * 100) : null;

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

          {/* Stats pills + Generate Report */}
          <div className="flex sm:flex-col items-start gap-3 sm:text-right shrink-0">
            {total > 0 && (
              <div className="flex sm:flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                    <CheckCircle2 className="h-3 w-3" /> {inspection.passCount} Pass
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                    <XCircle className="h-3 w-3" /> {inspection.failCount} Fail
                  </span>
                  {(inspection.monitorCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      <Eye className="h-3 w-3" /> {inspection.monitorCount} Monitor
                    </span>
                  )}
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
            {(inspection.status === "completed" || inspection.status === "follow_up_required") && (
              <Button
                size="sm"
                onClick={() => openReportDialog(inspection)}
                className="gap-1.5 bg-brand-pear hover:bg-brand-pear/90 text-sidebar font-semibold"
              >
                <FileText className="h-3.5 w-3.5" />
                Generate Report
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Report creation prompt banner ── */}
      {(inspection.status === "completed" || inspection.status === "follow_up_required")
        && reports.length === 0
        && !bannerDismissed && (
        <div className="mb-5 rounded-xl border border-brand-pear/40 bg-sidebar text-white px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-pear shrink-0">
            <Zap className="h-4.5 w-4.5 text-sidebar" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug">
              {inspection.status === "follow_up_required"
                ? "Inspection complete — follow-up required"
                : "Inspection complete — ready to generate your report"}
            </p>
            <p className="text-xs text-white/65 mt-0.5">
              {inspection.failCount > 0
                ? `${inspection.failCount} item${inspection.failCount !== 1 ? "s" : ""} failed. A Defect Notice has been pre-selected — you can change it.`
                : "An Inspection Certificate has been pre-selected based on your results."}
              {" "}Linked template defaults can be configured in Templates.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => openReportDialog(inspection)}
              className="gap-1.5 bg-brand-pear hover:bg-brand-pear/90 text-sidebar font-bold shadow-sm"
            >
              <FileText className="h-3.5 w-3.5" />
              Create Report
            </Button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
            {t === "Reports" && reports.length > 0 && (
              <span className="text-xs bg-sidebar text-white font-semibold rounded-full px-1.5 py-0.5 leading-none">
                {reports.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <OverviewTab
          inspection={inspection}
          inspectors={inspectors}
          templates={templates}
          onReload={load}
        />
      )}
      {tab === "Checklist" && <ChecklistTab results={inspection.checklistResults} docsByItem={docsByItem} inspectionId={inspection.id} onReload={load} />}
      {tab === "Issues" && <IssuesTab issues={inspection.issues} />}
      {tab === "Documents" && (
        <DocumentsTab
          documents={projectDocuments}
          projectId={inspection.projectId}
          inspectionId={inspection.id}
          onReload={load}
        />
      )}

      {tab === "Reports" && (
        <ReportsTab
          reports={reports}
          inspection={inspection}
          onGenerate={() => openReportDialog(inspection)}
          onDownload={downloadReportPdf}
          onView={setViewingReport}
          onSendReport={async (report) => {
            try {
              await apiFetch(`/api/reports/${report.id}/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inspection.clientEmail ?? "" }),
              });
              await refreshReports();
            } catch {}
          }}
          onDelete={async (report) => {
            try {
              await apiFetch(`/api/reports/${report.id}`, { method: "DELETE" });
              await refreshReports();
            } catch {}
          }}
        />
      )}

      {/* ── View Report Content Modal ── */}
      <Dialog open={!!viewingReport} onOpenChange={o => { if (!o) setViewingReport(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-secondary" />
              {viewingReport?.title}
            </DialogTitle>
            <DialogDescription>
              {ALL_REPORT_TYPE_LABELS[viewingReport?.reportType] ?? viewingReport?.reportType}
              {viewingReport?.generatedByName ? ` · Generated by ${viewingReport.generatedByName}` : ""}
              {viewingReport?.createdAt ? ` · ${new Date(viewingReport.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {viewingReport?.content && renderReportContent(viewingReport.content)}
          </div>
          <DialogFooter className="mt-4 gap-2 flex-row justify-end">
            <Button variant="outline" onClick={() => setViewingReport(null)}>Close</Button>
            <Button
              onClick={() => downloadReportPdf(viewingReport)}
              className="gap-1.5 bg-sidebar hover:bg-sidebar/90 text-white"
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Generate Report Dialog ── */}
      <Dialog open={reportDialogOpen} onOpenChange={o => { setReportDialogOpen(o); if (!o) setGeneratedReport(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-sidebar" />
              Generate Inspection Report
            </DialogTitle>
          </DialogHeader>

          {!generatedReport ? (
            <>
              <div className="overflow-auto space-y-4">
                {inspection && (() => {
                  const suggested = getSuggestedReportType(inspection);
                  const discipline = inspection.checklistTemplateDiscipline;
                  return (
                    <>
                      {discipline && (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
                          <Building className="h-3.5 w-3.5 shrink-0" />
                          <span>Showing report types for <span className="font-semibold text-foreground">{discipline}</span></span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-sidebar text-white text-xs">
                        <Zap className="h-3.5 w-3.5 text-brand-pear shrink-0" />
                        <span>
                          <span className="font-semibold text-brand-pear">{ALL_REPORT_TYPE_LABELS[suggested]}</span>
                          {" "}has been pre-selected based on your results
                          {inspection.checklistTemplateId ? " and linked template settings" : ""}.
                          You can change it below.
                        </span>
                      </div>
                    </>
                  );
                })()}
                <div className="space-y-2">
                  {REPORT_TYPES_DESKTOP.map(rt => {
                    const Icon = rt.icon;
                    const isRecommended = inspection ? rt.key === getSuggestedReportType(inspection) : false;
                    return (
                      <label
                        key={rt.key}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          selectedReportType === rt.key
                            ? "border-sidebar bg-sidebar/5"
                            : "border-border hover:border-sidebar/30"
                        )}
                      >
                        <input
                          type="radio"
                          name="reportType"
                          value={rt.key}
                          checked={selectedReportType === rt.key}
                          onChange={() => setSelectedReportType(rt.key)}
                          className="sr-only"
                        />
                        <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", selectedReportType === rt.key ? "text-sidebar" : "text-muted-foreground")} />
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-sm font-medium block", selectedReportType === rt.key ? "text-sidebar" : "text-foreground")}>
                            {rt.label}
                          </span>
                          <span className="text-[11px] text-muted-foreground leading-snug">{rt.desc}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 mt-0.5">
                          {isRecommended && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-pear text-sidebar">Recommended</span>
                          )}
                          {selectedReportType === rt.key && (
                            <span className="text-xs text-sidebar font-semibold">Selected</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end pt-3 border-t border-border mt-2">
                <Button onClick={generateReport} disabled={generatingReport}>
                  {generatingReport ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Generating…</> : "Generate Report"}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Report generated — {generatedReport.reportTypeLabel}
              </div>
              <div className="flex-1 overflow-auto bg-muted/30 rounded-lg border border-border">
                <pre className="text-xs font-mono leading-relaxed p-4 whitespace-pre-wrap text-sidebar">
                  {generatedReport.content}
                </pre>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setGeneratedReport(null)}>
                  ← Choose Different Type
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadReportPdf(generatedReport)}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveReportDraft}
                    className="gap-1.5"
                  >
                    Save Draft
                  </Button>
                  <Button
                    size="sm"
                    onClick={submitReport}
                    disabled={submittingReport}
                    className="gap-1.5 bg-sidebar hover:bg-sidebar/90 text-white"
                  >
                    {submittingReport
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Approving…</>
                      : <><Send className="h-3.5 w-3.5" />Approve & Save</>
                    }
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

function renderReportContent(content: string) {
  return (
    <pre className="text-xs font-mono leading-relaxed p-4 whitespace-pre-wrap text-sidebar bg-muted/30 rounded-lg border border-border">
      {content}
    </pre>
  );
}

const REPORT_STATUS_STYLES: Record<string, string> = {
  draft:     "bg-yellow-50 text-yellow-700 border-yellow-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  approved:  "bg-green-50 text-green-700 border-green-200",
  sent:      "bg-purple-50 text-purple-700 border-purple-200",
};

function ReportsTab({
  reports,
  inspection,
  onGenerate,
  onDownload,
  onView,
  onSendReport,
  onDelete,
}: {
  reports: any[];
  inspection: any;
  onGenerate: () => void;
  onDownload: (r: any) => void;
  onView: (r: any) => void;
  onSendReport: (r: any) => void;
  onDelete: (r: any) => Promise<void>;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canGenerate = inspection.status === "completed" || inspection.status === "follow_up_required";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-sidebar">Reports</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {reports.length === 0
              ? "No reports generated yet"
              : `${reports.length} report${reports.length !== 1 ? "s" : ""} for this inspection`}
          </p>
        </div>
        {canGenerate && (
          <Button
            size="sm"
            onClick={onGenerate}
            className="gap-1.5 bg-brand-pear hover:bg-brand-pear/90 text-sidebar font-semibold"
          >
            <FileText className="h-3.5 w-3.5" />
            Generate Report
          </Button>
        )}
      </div>

      {/* Empty state */}
      {reports.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-border rounded-xl">
          <div className="w-14 h-14 rounded-2xl bg-sidebar/5 flex items-center justify-center mb-4">
            <FileText className="h-7 w-7 text-sidebar/40" />
          </div>
          <p className="font-semibold text-sidebar mb-1">No reports yet</p>
          <p className="text-sm text-muted-foreground mb-5 max-w-xs">
            {canGenerate
              ? "This inspection is complete. Generate your first report to document the findings."
              : "Reports can be generated once the inspection is marked as completed."}
          </p>
          {canGenerate && (
            <Button onClick={onGenerate} className="gap-1.5 bg-sidebar hover:bg-sidebar/90 text-white">
              <FileText className="h-3.5 w-3.5" />
              Generate First Report
            </Button>
          )}
        </div>
      )}

      {/* Report cards */}
      {reports.map((report) => {
        const statusStyle = REPORT_STATUS_STYLES[report.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
        const date = report.createdAt
          ? new Date(report.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
          : null;
        const preview = typeof report.content === "string"
          ? report.content.slice(0, 220).replace(/\n+/g, " ").trim()
          : null;

        return (
          <div key={report.id} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Card header */}
            <div className="px-5 py-4 flex items-start gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-sidebar/5 border border-sidebar/10 shrink-0">
                <FileText className="h-5 w-5 text-sidebar" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${statusStyle}`}>
                    {report.status}
                  </span>
                  <span className="text-xs text-muted-foreground border border-muted/40 rounded-full px-2 py-0.5">
                    {ALL_REPORT_TYPE_LABELS[report.reportType] ?? report.reportType}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-sidebar leading-snug">{report.title}</h4>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {report.generatedByName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {report.generatedByName}
                    </span>
                  )}
                  {date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {date}
                    </span>
                  )}
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {confirmDeleteId === report.id ? (
                  /* Inline delete confirmation */
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-red-700 font-medium">Delete this report?</span>
                    <button
                      onClick={async () => {
                        setDeleting(true);
                        await onDelete(report);
                        setDeleting(false);
                        setConfirmDeleteId(null);
                      }}
                      disabled={deleting}
                      className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <span className="text-red-300">|</span>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleting}
                      className="text-xs text-muted-foreground hover:text-sidebar transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onView(report)}
                      className="gap-1.5 text-xs h-8"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDownload(report)}
                      className="gap-1.5 text-xs h-8"
                    >
                      <Download className="h-3.5 w-3.5" /> PDF
                    </Button>
                    {report.status === "approved" && (
                      <Button
                        size="sm"
                        onClick={() => onSendReport(report)}
                        className="gap-1.5 text-xs h-8 bg-secondary hover:bg-secondary/90 text-white"
                      >
                        <Send className="h-3.5 w-3.5" /> Send
                      </Button>
                    )}
                    {report.status === "sent" && (
                      <span className="flex items-center gap-1 text-xs text-purple-600 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                      </span>
                    )}
                    <button
                      onClick={() => setConfirmDeleteId(report.id)}
                      title="Delete report"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Content preview */}
            {preview && (
              <div className="px-5 pb-4">
                <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 font-mono leading-relaxed line-clamp-3">
                  {preview}{preview.length < (report.content?.length ?? 0) ? "…" : ""}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  inspection,
  inspectors,
  templates,
  onReload,
}: {
  inspection: Inspection;
  inspectors: Inspector[];
  templates: ChecklistTemplate[];
  onReload: () => void;
}) {
  // ── Pre-inspection Details edit state ──
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailForm, setDetailForm] = useState({
    status: inspection.status,
    scheduledDate: inspection.scheduledDate,
    scheduledTime: inspection.scheduledTime ?? "",
    completedDate: inspection.completedDate ?? "",
    duration: inspection.duration ? String(inspection.duration) : "",
    weatherConditions: inspection.weatherConditions ?? "",
    siteNotes: inspection.siteNotes ?? "",
  });
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const saveDetails = async () => {
    setSavingDetails(true);
    setDetailsError("");
    try {
      await apiFetch(`/api/inspections/${inspection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: detailForm.status,
          scheduledDate: detailForm.scheduledDate,
          scheduledTime: detailForm.scheduledTime || null,
          completedDate: detailForm.completedDate || null,
          duration: detailForm.duration ? parseInt(detailForm.duration) : null,
          weatherConditions: detailForm.weatherConditions || null,
          notes: detailForm.siteNotes || null,
        }),
      });
      setEditingDetails(false);
      setDetailsSaved(true);
      onReload();
      setTimeout(() => setDetailsSaved(false), 3000);
    } catch {
      setDetailsError("Failed to save. Please try again.");
    } finally {
      setSavingDetails(false);
    }
  };

  const cancelDetailsEdit = () => {
    setDetailForm({
      status: inspection.status,
      scheduledDate: inspection.scheduledDate,
      scheduledTime: inspection.scheduledTime ?? "",
      completedDate: inspection.completedDate ?? "",
      duration: inspection.duration ? String(inspection.duration) : "",
      weatherConditions: inspection.weatherConditions ?? "",
      siteNotes: inspection.siteNotes ?? "",
    });
    setDetailsError("");
    setEditingDetails(false);
  };

  // ── Preliminary note state ──
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const submitNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await apiFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: inspection.id,
          projectId: inspection.projectId,
          content: noteText.trim(),
        }),
      });
      setNoteText("");
      setNoteSaved(true);
      onReload();
      setTimeout(() => setNoteSaved(false), 3000);
    } catch {
    } finally {
      setAddingNote(false);
    }
  };

  // ── Inspector assignment state ──
  const [assigningInspector, setAssigningInspector] = useState(false);
  const [selectedInspectorId, setSelectedInspectorId] = useState<string>(
    inspection.inspectorId ? String(inspection.inspectorId) : ""
  );
  const [savingInspector, setSavingInspector] = useState(false);
  const [inspectorSaved, setInspectorSaved] = useState(false);

  // Checklist template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    inspection.checklistTemplateId ? String(inspection.checklistTemplateId) : ""
  );
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [templateApplied, setTemplateApplied] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  const saveInspector = async () => {
    setSavingInspector(true);
    try {
      await apiFetch(`/api/inspections/${inspection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectorId: selectedInspectorId ? parseInt(selectedInspectorId) : null }),
      });
      setAssigningInspector(false);
      setInspectorSaved(true);
      onReload();
      setTimeout(() => setInspectorSaved(false), 3000);
    } catch {
    } finally {
      setSavingInspector(false);
    }
  };

  const applyTemplate = async () => {
    if (!selectedTemplateId) return;
    setApplyingTemplate(true);
    setTemplateError("");
    setConfirmReplaceOpen(false);
    try {
      await apiFetch(`/api/inspections/${inspection.id}/apply-checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: parseInt(selectedTemplateId) }),
      });
      setTemplateApplied(true);
      onReload();
      setTimeout(() => setTemplateApplied(false), 3500);
    } catch (err: any) {
      setTemplateError("Failed to apply template. It may have no items.");
    } finally {
      setApplyingTemplate(false);
    }
  };

  const handleApplyClick = () => {
    // If there are already scored results, confirm before overwriting
    const scored = inspection.passCount + inspection.failCount;
    if (scored > 0 && inspection.checklistTemplateId && parseInt(selectedTemplateId) !== inspection.checklistTemplateId) {
      setConfirmReplaceOpen(true);
    } else {
      applyTemplate();
    }
  };

  const selectedTemplate = templates.find(t => t.id === parseInt(selectedTemplateId));

  // Group templates by folder for the select
  const templatesByFolder: Record<string, ChecklistTemplate[]> = {};
  for (const t of templates) {
    const folder = t.folder || "Other";
    if (!templatesByFolder[folder]) templatesByFolder[folder] = [];
    templatesByFolder[folder].push(t);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Left (main) column ── */}
      <div className="lg:col-span-2 space-y-6">

        {/* ── Pre-Inspection Details Card ── */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sidebar flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Inspection Details
            </h2>
            <div className="flex items-center gap-2">
              {detailsSaved && !editingDetails && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </span>
              )}
              {!editingDetails && (
                <button
                  onClick={() => setEditingDetails(true)}
                  className="text-xs text-secondary hover:text-secondary/80 font-medium flex items-center gap-1 transition-colors"
                >
                  <PencilLine className="h-3.5 w-3.5" /> Edit Details
                </button>
              )}
            </div>
          </div>

          {/* Static read view */}
          {!editingDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                {[
                  { label: "Project", value: inspection.projectName },
                  { label: "Type", value: inspection.inspectionType.replace(/_/g, " ") },
                  { label: "Status", value: inspection.status.replace(/_/g, " ") },
                  { label: "Scheduled Date", value: formatDate(inspection.scheduledDate) },
                  { label: "Scheduled Time", value: inspection.scheduledTime ?? "TBC" },
                  { label: "Completed Date", value: inspection.completedDate ? formatDate(inspection.completedDate) : "—" },
                  { label: "Duration", value: inspection.duration ? `${inspection.duration} min` : "—" },
                  { label: "Weather", value: inspection.weatherConditions ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                    <div className="font-medium text-sidebar capitalize">{value}</div>
                  </div>
                ))}
              </div>
              {inspection.siteNotes && (
                <div className="text-sm border-t border-border pt-4">
                  <div className="text-xs text-muted-foreground mb-1">Site Briefing Notes</div>
                  <div className="font-medium text-sidebar whitespace-pre-wrap">{inspection.siteNotes}</div>
                </div>
              )}
            </div>
          )}

          {/* Edit form */}
          {editingDetails && (
            <div className="space-y-4">
              {/* Status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select
                    value={detailForm.status}
                    onChange={e => setDetailForm(f => ({ ...f, status: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Completed Date</label>
                  <input
                    type="date"
                    value={detailForm.completedDate}
                    onChange={e => setDetailForm(f => ({ ...f, completedDate: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Scheduled Date</label>
                  <input
                    type="date"
                    value={detailForm.scheduledDate}
                    onChange={e => setDetailForm(f => ({ ...f, scheduledDate: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Scheduled Time</label>
                  <input
                    type="time"
                    value={detailForm.scheduledTime}
                    onChange={e => setDetailForm(f => ({ ...f, scheduledTime: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {/* Duration + Weather */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Duration
                    <span className="ml-1 font-normal text-muted-foreground/70">(minutes)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={600}
                      placeholder="e.g. 90"
                      value={detailForm.duration}
                      onChange={e => setDetailForm(f => ({ ...f, duration: e.target.value }))}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">min</span>
                  </div>
                  {detailForm.duration && (
                    <p className="text-xs text-muted-foreground">
                      = {Math.floor(parseInt(detailForm.duration) / 60)}h {parseInt(detailForm.duration) % 60}m
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Weather Conditions</label>
                  <input
                    type="text"
                    placeholder="e.g. Fine, 22°C"
                    value={detailForm.weatherConditions}
                    onChange={e => setDetailForm(f => ({ ...f, weatherConditions: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {/* Quick weather picks */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {["Fine", "Partly Cloudy", "Overcast", "Light Rain", "Heavy Rain", "Windy"].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setDetailForm(f => ({ ...f, weatherConditions: f.weatherConditions ? `${f.weatherConditions}, ${w}` : w }))}
                        className="text-xs px-2 py-0.5 rounded-full border border-border hover:border-secondary/50 hover:bg-secondary/8 text-muted-foreground hover:text-secondary transition-colors"
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Site Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Site Briefing Notes</label>
                <textarea
                  rows={3}
                  placeholder="Persons on site, key observations, access notes…"
                  value={detailForm.siteNotes}
                  onChange={e => setDetailForm(f => ({ ...f, siteNotes: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {detailsError && (
                <p className="text-xs text-red-500">{detailsError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={saveDetails}
                  disabled={savingDetails}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-sidebar text-white hover:bg-sidebar/90 disabled:opacity-50 transition-colors"
                >
                  {savingDetails ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Save Details
                </button>
                <button
                  onClick={cancelDetailsEdit}
                  className="text-sm text-muted-foreground hover:text-sidebar transition-colors px-2 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Inspector Assignment Card ── */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sidebar flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground" /> Assigned Inspector
            </h2>
            {!assigningInspector && (
              <button
                onClick={() => setAssigningInspector(true)}
                className="text-xs text-secondary hover:text-secondary/80 font-medium flex items-center gap-1 transition-colors"
              >
                <PencilLine className="h-3.5 w-3.5" />
                {inspection.inspectorId ? "Change" : "Assign"}
              </button>
            )}
          </div>

          {!assigningInspector ? (
            <div className="flex items-center gap-3">
              {inspection.inspectorId ? (
                <>
                  <div className="h-10 w-10 rounded-full bg-secondary/20 text-secondary flex items-center justify-center text-sm font-bold shrink-0">
                    {(inspection.inspectorName ?? "?").split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-sidebar text-sm">{inspection.inspectorName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inspectors.find(i => i.id === inspection.inspectorId)?.role?.replace(/_/g, " ") ?? "Inspector"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-10 w-10 rounded-full border-2 border-dashed border-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">No inspector assigned</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Click "Assign" to allocate an inspector.</p>
                  </div>
                </div>
              )}
              {inspectorSaved && (
                <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedInspectorId}
                onChange={e => setSelectedInspectorId(e.target.value)}
                className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
              >
                <option value="">— Unassigned —</option>
                {inspectors.map(i => (
                  <option key={i.id} value={String(i.id)}>
                    {i.firstName} {i.lastName} ({i.role?.replace(/_/g, " ") ?? "Inspector"})
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveInspector}
                  disabled={savingInspector}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sidebar text-white hover:bg-sidebar/90 disabled:opacity-50 transition-colors"
                >
                  {savingInspector ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Save
                </button>
                <button
                  onClick={() => { setAssigningInspector(false); setSelectedInspectorId(inspection.inspectorId ? String(inspection.inspectorId) : ""); }}
                  className="text-xs text-muted-foreground hover:text-sidebar transition-colors px-2 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Checklist Template Card ── */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-sidebar flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" /> Checklist Template
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Select a template and apply it to load the checklist items for this inspection. Re-applying a different template on an inspection with scored results will ask for confirmation.
          </p>

          {/* Current template badge */}
          {inspection.checklistTemplateName && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-secondary/8 border border-secondary/20">
              <CheckSquare className="h-4 w-4 text-secondary shrink-0" />
              <div>
                <p className="text-xs font-semibold text-secondary">Currently applied</p>
                <p className="text-sm text-sidebar font-medium">{inspection.checklistTemplateName}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
            >
              <option value="">— Select a checklist template —</option>
              {Object.entries(templatesByFolder).map(([folder, tmplList]) => (
                <optgroup key={folder} label={folder}>
                  {tmplList.map(t => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name} ({t.itemCount} items)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {selectedTemplate && (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span>{selectedTemplate.folder} · {selectedTemplate.discipline} · {selectedTemplate.itemCount} items</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleApplyClick}
                disabled={!selectedTemplateId || applyingTemplate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-sidebar text-white hover:bg-sidebar/90 disabled:opacity-40 transition-colors"
              >
                {applyingTemplate
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</>
                  : <><RefreshCw className="h-3.5 w-3.5" /> Apply Template</>
                }
              </button>
              {templateApplied && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Template applied — checklist updated
                </span>
              )}
              {templateError && <span className="text-xs text-red-500">{templateError}</span>}
            </div>
          </div>
        </div>

        {/* Field Notes + Note Composer */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-sidebar mb-4 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" /> Field Notes
          </h2>

          {inspection.notes.length === 0 && (
            <p className="text-sm text-muted-foreground mb-4">No notes yet. Add a preliminary observation below.</p>
          )}

          {inspection.notes.length > 0 && (
            <div className="space-y-3 mb-5">
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
          )}

          {/* Inline note composer */}
          <div className="border-t border-border/50 pt-4 space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Send className="h-3 w-3" /> Add a note or preliminary observation
            </label>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNote(); }}
              placeholder="e.g. Site access confirmed. Builder's rep on-site. Will review drawings before commencing…"
              rows={3}
              className="w-full text-sm border border-input rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-secondary/30 bg-background leading-relaxed placeholder:text-muted-foreground/60"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Tip: <kbd className="px-1 py-0.5 text-xs border border-border rounded bg-muted">⌘↵</kbd> to submit quickly
              </p>
              <div className="flex items-center gap-2">
                {noteSaved && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Note added
                  </span>
                )}
                <button
                  onClick={submitNote}
                  disabled={!noteText.trim() || addingNote}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-sidebar text-white hover:bg-sidebar/90 disabled:opacity-40 transition-colors"
                >
                  {addingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Add Note
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right sidebar ── */}
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
              ].map(({ label, count, color, bg }) => {
                const scoredItems = inspection.passCount + inspection.failCount;
                const pct = scoredItems > 0 ? Math.round((count / scoredItems) * 100) : 0;
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
              {inspection.naCount > 0 && (
                <div className="pt-1 border-t border-border/50">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">N/A <span className="text-muted-foreground/60">(not scored)</span></span>
                    <span className="font-semibold text-gray-400">{inspection.naCount}</span>
                  </div>
                </div>
              )}
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
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {inspection.issues.length} Open {inspection.issues.length === 1 ? "Issue" : "Issues"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm replace checklist dialog */}
      <Dialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Replace Checklist?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This inspection already has <strong>{inspection.passCount + inspection.failCount}</strong> scored items. Switching to a different template will remove all existing checklist results and replace them with the new template items.
          </p>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setConfirmReplaceOpen(false)}
              className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={applyTemplate}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Yes, Replace
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Checklist Tab ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-300",
  major: "bg-orange-50 text-orange-700 border-orange-200",
  minor: "bg-yellow-50 text-yellow-700 border-yellow-200",
  cosmetic: "bg-green-50 text-green-700 border-green-200",
};

type ResultKey = "pass" | "fail" | "monitor" | "na" | "pending";

interface ItemDraft {
  result: ResultKey;
  notes: string;
  severity: string;
  location: string;
  tradeAllocated: string;
  recommendedAction: string;
}

function makeDefaultDraft(item: ChecklistResult): ItemDraft {
  return {
    result: (item.result as ResultKey) ?? "pending",
    notes: item.notes ?? "",
    severity: item.severity ?? "",
    location: item.location ?? "",
    tradeAllocated: item.tradeAllocated ?? "",
    recommendedAction: item.recommendedAction ?? item.recommendedActionDefault ?? "",
  };
}

function ChecklistTab({
  results: initialResults,
  docsByItem,
  inspectionId,
  onReload,
}: {
  results: ChecklistResult[];
  docsByItem: Record<number, { id: number; name: string; mimeType?: string }[]>;
  inspectionId: number;
  onReload: () => void;
}) {
  const [localResults, setLocalResults] = useState<ChecklistResult[]>(initialResults);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, ItemDraft>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const RESULT_OPTS: { key: ResultKey; label: string; icon: React.ReactNode; activeClass: string; pendingClass: string }[] = [
    { key: "pass",    label: "Pass",    icon: <CheckCircle2 className="h-4 w-4" />, activeClass: "bg-green-50 border-green-400 text-green-700",  pendingClass: "hover:bg-green-50/50" },
    { key: "fail",    label: "Fail",    icon: <XCircle className="h-4 w-4" />,      activeClass: "bg-red-50 border-red-400 text-red-700",        pendingClass: "hover:bg-red-50/50" },
    { key: "monitor", label: "Monitor", icon: <Eye className="h-4 w-4" />,          activeClass: "bg-amber-50 border-amber-400 text-amber-700",  pendingClass: "hover:bg-amber-50/50" },
    { key: "na",      label: "N/A",     icon: <MinusCircle className="h-4 w-4" />,  activeClass: "bg-gray-100 border-gray-400 text-gray-600",    pendingClass: "hover:bg-gray-50" },
  ];

  const openEdit = (item: ChecklistResult) => {
    setEditingId(item.id);
    if (!drafts[item.id]) {
      setDrafts(d => ({ ...d, [item.id]: makeDefaultDraft(item) }));
    }
  };

  const updateDraft = (itemId: number, patch: Partial<ItemDraft>) => {
    setDrafts(d => ({ ...d, [itemId]: { ...d[itemId], ...patch } }));
  };

  const handleResultClick = (item: ChecklistResult, key: ResultKey) => {
    const currentDraft = drafts[item.id] ?? makeDefaultDraft(item);
    const newDraft = { ...currentDraft, result: key };
    setDrafts(d => ({ ...d, [item.id]: newDraft }));
    if (key === "fail" || key === "monitor") {
      setEditingId(item.id);
    } else {
      saveItem(item.id, newDraft);
    }
  };

  const saveItem = async (itemId: number, draft: ItemDraft) => {
    setSaving(itemId);
    const showDefect = draft.result === "fail" || draft.result === "monitor";
    try {
      await apiFetch(`/api/inspections/${inspectionId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: draft.result === "pending" ? null : draft.result,
          notes: draft.notes || null,
          ...(showDefect ? {
            severity: draft.severity || null,
            location: draft.location || null,
            tradeAllocated: draft.tradeAllocated || null,
            recommendedAction: draft.recommendedAction || null,
          } : {}),
        }),
      });
      setLocalResults(rs => rs.map(r => r.id !== itemId ? r : {
        ...r,
        result: draft.result === "pending" ? null : draft.result,
        notes: draft.notes || undefined,
        severity: showDefect ? (draft.severity || null) : r.severity,
        location: showDefect ? (draft.location || null) : r.location,
        tradeAllocated: showDefect ? (draft.tradeAllocated || null) : r.tradeAllocated,
        recommendedAction: showDefect ? (draft.recommendedAction || null) : r.recommendedAction,
      }));
      setEditingId(null);
      onReload();
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  if (localResults.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No checklist items</p>
        <p className="text-sm mt-1">Apply a checklist template from the Overview tab to load items.</p>
      </div>
    );
  }

  const categories = Array.from(new Set(localResults.map(r => r.category)));
  const grouped: Record<string, ChecklistResult[]> = {};
  for (const r of localResults) {
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
            {grouped[cat].map((item, idx) => {
              const draft = drafts[item.id] ?? makeDefaultDraft(item);
              const activeResult = draft.result !== "pending" ? draft.result : (item.result ?? "pending");
              const isEditing = editingId === item.id;
              const showDefect = activeResult === "fail" || activeResult === "monitor";
              const isSaving = saving === item.id;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border transition-colors",
                    activeResult === "pass"    && "bg-green-50/60 border-green-200",
                    activeResult === "fail"    && "bg-red-50/60 border-red-200",
                    activeResult === "monitor" && "bg-amber-50/60 border-amber-200",
                    activeResult === "na"      && "bg-gray-50 border-gray-200",
                    activeResult === "pending" && "bg-card border-muted/50",
                  )}
                >
                  {/* ── Main row ── */}
                  <div className="flex items-start gap-3 p-3.5">
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
                            item.riskLevel === "high"   && "bg-red-50 text-red-700 border-red-200",
                            item.riskLevel === "medium" && "bg-amber-50 text-amber-700 border-amber-200",
                            item.riskLevel === "low"    && "bg-green-50 text-green-700 border-green-200",
                          )}>
                            {item.riskLevel} Risk
                          </span>
                        )}
                        {/* Defect badges for saved data */}
                        {item.severity && !isEditing && (
                          <span className={cn("text-xs px-1.5 py-0.5 rounded capitalize border font-medium", SEVERITY_COLORS[item.severity] ?? "bg-gray-50 text-gray-600 border-gray-200")}>
                            {item.severity}
                          </span>
                        )}
                        {item.location && !isEditing && (
                          <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-medium">
                            📍 {item.location}
                          </span>
                        )}
                        {item.tradeAllocated && !isEditing && (
                          <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded font-medium">
                            🔧 {item.tradeAllocated}
                          </span>
                        )}
                      </div>
                      {item.notes && !isEditing && (
                        <p className="text-xs text-muted-foreground mt-1.5 italic">"{item.notes}"</p>
                      )}
                      {item.recommendedAction && !isEditing && (
                        <p className="text-xs text-amber-700 mt-1 font-medium">→ {item.recommendedAction}</p>
                      )}
                      {/* Photos */}
                      {item.photoUrls && item.photoUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {item.photoUrls.map((photoPath, pi) => {
                            const markup = item.photoMarkups?.[photoPath];
                            return (
                              <a
                                key={pi}
                                href={`${apiBase()}/api/storage${photoPath}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative block rounded-md overflow-hidden border border-border hover:border-secondary/60 transition-colors flex-shrink-0"
                                style={{ width: 72, height: 72 }}
                              >
                                <img src={`${apiBase()}/api/storage${photoPath}`} alt={`Photo ${pi + 1}`} className="w-full h-full object-cover" />
                                {markup && markup.strokes.length > 0 && (
                                  <>
                                    <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${markup.w} ${markup.h}`} preserveAspectRatio="xMidYMid meet">
                                      {markup.strokes.map((stroke, si) => (
                                        <path key={si} d={stroke.points.map((p, i2) => `${i2 === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                      ))}
                                    </svg>
                                    <span className="absolute bottom-1 left-1 bg-secondary text-white text-[8px] px-1 rounded leading-tight font-semibold">Markup</span>
                                  </>
                                )}
                              </a>
                            );
                          })}
                        </div>
                      )}
                      {/* Linked docs */}
                      {(docsByItem[item.checklistItemId] ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {docsByItem[item.checklistItemId].map(doc => (
                            <span key={doc.id} className="inline-flex items-center gap-1 text-[11px] bg-secondary/8 text-secondary border border-secondary/20 px-2 py-0.5 rounded-full font-medium">
                              <Paperclip className="h-2.5 w-2.5 shrink-0" /> {doc.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* ── Result buttons ── */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-1">
                        {RESULT_OPTS.map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => handleResultClick(item, opt.key)}
                            disabled={isSaving}
                            title={opt.label}
                            className={cn(
                              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border transition-colors",
                              activeResult === opt.key ? opt.activeClass : `text-muted-foreground border-muted/50 bg-card ${opt.pendingClass}`,
                            )}
                          >
                            {opt.icon}
                            <span className="hidden sm:inline">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                      {(activeResult === "fail" || activeResult === "monitor") && !isEditing && (
                        <button
                          onClick={() => openEdit(item)}
                          className="text-[11px] text-amber-700 underline underline-offset-2 hover:text-amber-900 transition-colors"
                        >
                          {item.severity || item.location ? "Edit defect details" : "Add defect details"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Defect / Monitor detail panel ── */}
                  {isEditing && showDefect && (
                    <div className="border-t border-amber-200 bg-amber-50/80 px-4 py-4 rounded-b-lg space-y-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-800">
                        {activeResult === "fail" ? "Defect Details" : "Monitor Details"}
                      </p>

                      {/* Severity chips */}
                      <div>
                        <p className="text-xs text-muted-foreground font-medium mb-1.5">Severity</p>
                        <div className="flex flex-wrap gap-2">
                          {(["critical", "major", "minor", "cosmetic"] as const).map(s => (
                            <button
                              key={s}
                              onClick={() => updateDraft(item.id, { severity: draft.severity === s ? "" : s })}
                              className={cn(
                                "text-xs px-3 py-1 rounded-full border font-medium capitalize transition-colors",
                                draft.severity === s
                                  ? (SEVERITY_COLORS[s] ?? "bg-gray-100 border-gray-400 text-gray-700")
                                  : "bg-white border-amber-200 text-muted-foreground hover:border-amber-400",
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Location */}
                      <div>
                        <label className="text-xs text-muted-foreground font-medium block mb-1">Location / Area</label>
                        <input
                          type="text"
                          value={draft.location}
                          onChange={e => updateDraft(item.id, { location: e.target.value })}
                          placeholder="e.g. Bedroom 2, North wall"
                          className="w-full text-sm border border-amber-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </div>

                      {/* Trade */}
                      <div>
                        <label className="text-xs text-muted-foreground font-medium block mb-1">Trade Allocated</label>
                        <input
                          type="text"
                          value={draft.tradeAllocated}
                          onChange={e => updateDraft(item.id, { tradeAllocated: e.target.value })}
                          placeholder="e.g. Plumber, Electrician, Builder"
                          className="w-full text-sm border border-amber-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </div>

                      {/* Recommended action */}
                      <div>
                        <label className="text-xs text-muted-foreground font-medium block mb-1">Recommended Action</label>
                        <textarea
                          value={draft.recommendedAction}
                          onChange={e => updateDraft(item.id, { recommendedAction: e.target.value })}
                          placeholder="Describe the corrective action required…"
                          rows={2}
                          className="w-full text-sm border border-amber-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="text-xs text-muted-foreground font-medium block mb-1">Notes</label>
                        <textarea
                          value={draft.notes}
                          onChange={e => updateDraft(item.id, { notes: e.target.value })}
                          placeholder="Inspector notes…"
                          rows={2}
                          className="w-full text-sm border border-amber-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button onClick={() => setEditingId(null)} className="text-sm text-muted-foreground hover:text-sidebar transition-colors px-3 py-1">
                          Cancel
                        </button>
                        <button
                          onClick={() => saveItem(item.id, draft)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary text-white px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
                        >
                          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

function fileIcon(mimeType?: string) {
  if (!mimeType) return <File className="h-5 w-5 text-muted-foreground" />;
  if (mimeType.startsWith("image/")) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatBytes(bytes?: number) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentsTab({
  documents,
  projectId,
  inspectionId,
  onReload,
}: {
  documents: ProjectDocument[];
  projectId: number;
  inspectionId: number;
  onReload: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadDocument = async (file: File) => {
    setUploadError("");
    setUploading(true);
    try {
      // 1. Get a pre-signed upload URL
      const { uploadURL, objectPath } = await apiFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });

      // 2. Upload to signed URL
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload failed");

      // 3. Register document with project
      await apiFetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          fileUrl: objectPath,
          mimeType: file.type,
          fileSize: file.size,
          folder: "Inspection Documents",
          uploadedById: 1,
        }),
      });

      onReload();
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Group by folder
  const byFolder: Record<string, ProjectDocument[]> = {};
  for (const doc of documents) {
    const folder = doc.folder || "General";
    if (!byFolder[folder]) byFolder[folder] = [];
    byFolder[folder].push(doc);
  }

  return (
    <div className="space-y-6">
      {/* Upload bar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {documents.length === 0 ? "No documents yet." : `${documents.length} document${documents.length !== 1 ? "s" : ""} attached to this project.`}
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-sidebar text-white rounded-lg hover:bg-sidebar/90 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Upload Document"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) uploadDocument(file);
            e.target.value = "";
          }}
        />
      </div>

      {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}

      {documents.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-muted rounded-xl">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No documents uploaded</p>
          <p className="text-sm mt-1">Upload drawings, specs, or approval documents to keep them alongside this project.</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-sidebar text-white rounded-lg hover:bg-sidebar/90 transition-colors"
          >
            <Upload className="h-4 w-4" /> Upload First Document
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byFolder).map(([folder, docs]) => (
            <div key={folder}>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-sidebar">{folder}</span>
                <span className="text-xs text-muted-foreground">({docs.length})</span>
              </div>
              <div className="space-y-2">
                {docs.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-secondary/40 transition-colors group"
                  >
                    <div className="shrink-0">{fileIcon(doc.mimeType)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar truncate">{doc.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        {doc.uploadedByName && <span>{doc.uploadedByName}</span>}
                        {doc.fileSize && <span>· {formatBytes(doc.fileSize)}</span>}
                        <span>· {formatDate(doc.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={`${apiBase()}/api/storage${doc.fileUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-secondary border border-secondary/30 rounded-lg hover:bg-secondary/8 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </a>
                      <a
                        href={`${apiBase()}/api/storage${doc.fileUrl}`}
                        download={doc.name}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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

  const checklistIssues = issues.filter(i => i.source === "checklist");
  const manualIssues = issues.filter(i => i.source !== "checklist");

  return (
    <div className="space-y-6">
      {/* Checklist defects */}
      {checklistIssues.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-sidebar">Checklist Defects</span>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{checklistIssues.length}</span>
          </div>
          <div className="space-y-3">
            {checklistIssues.map(issue => (
              <div
                key={issue.id}
                className={cn(
                  "bg-card border rounded-xl p-5",
                  issue.result === "monitor"
                    ? "border-amber-200 bg-amber-50/30"
                    : "border-red-200 bg-red-50/20"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {issue.result === "monitor" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                          <Eye className="h-3 w-3" /> Monitor
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                          <XCircle className="h-3 w-3" /> Fail
                        </span>
                      )}
                      {issue.severity && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${severityColors(issue.severity)}`}>
                          {issue.severity}
                        </span>
                      )}
                      {issue.category && (
                        <span className="text-xs text-muted-foreground border border-muted/50 rounded px-2 py-0.5">
                          {issue.category}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground capitalize border border-muted/50 rounded px-2 py-0.5">
                        {(issue.status ?? "open").replace(/_/g, " ")}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sidebar leading-snug">{issue.title}</h3>
                  </div>
                </div>
                {issue.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mb-2">{issue.description}</p>
                )}
                {issue.recommendedAction && (
                  <div className="mt-2 p-2.5 rounded-lg bg-sidebar/5 border border-sidebar/10 text-xs text-sidebar">
                    <span className="font-semibold">Recommended action:</span> {issue.recommendedAction}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  {issue.location && <span><span className="font-medium">Location:</span> {issue.location}</span>}
                  {issue.codeReference && <span><span className="font-medium">Code ref:</span> {issue.codeReference}</span>}
                  {issue.responsibleParty && <span><span className="font-medium">Trade:</span> {issue.responsibleParty}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manually raised issues */}
      {manualIssues.length > 0 && (
        <div>
          {checklistIssues.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-sidebar">Raised Issues</span>
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{manualIssues.length}</span>
            </div>
          )}
          <div className="space-y-3">
            {manualIssues.map(issue => (
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
                  {issue.location && <span><span className="font-medium">Location:</span> {issue.location}</span>}
                  {issue.codeReference && <span><span className="font-medium">Code ref:</span> {issue.codeReference}</span>}
                  {issue.responsibleParty && <span><span className="font-medium">Responsible:</span> {issue.responsibleParty}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
