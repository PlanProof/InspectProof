import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Button, Input,
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui";
import {
  FileText, Loader2, Download, Eye, Trash2, CheckCircle,
  Award, BarChart2, AlertCircle, XCircle, Send, Calendar,
  Search, FolderOpen,
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { useLocation } from "wouter";

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${apiBase()}${path}`, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  inspection_certificate: "Inspection Certificate",
  compliance_report: "Compliance Report",
  defect_notice: "Defect Notice",
  non_compliance_notice: "Non-Compliance Notice",
  summary: "Inspection Summary",
  quality_control_report: "Quality Control Report",
  non_conformance_report: "Non-Conformance Report",
  safety_inspection_report: "Safety Inspection Report",
  hazard_assessment_report: "Hazard Assessment Report",
  corrective_action_report: "Corrective Action Report",
  pre_purchase_report: "Pre-Purchase Building Report",
  annual_fire_safety: "Annual Fire Safety Statement",
  fire_inspection_report: "Fire Safety Inspection Report",
};

const REPORT_STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  sent: "bg-green-50 text-green-700 border-green-200",
};

const REPORT_TYPE_ICONS: Record<string, React.ElementType> = {
  inspection_certificate: Award,
  compliance_report: BarChart2,
  defect_notice: AlertCircle,
  non_compliance_notice: XCircle,
  summary: FileText,
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent to Client" },
];

export default function Reports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [pdfViewUrl, setPdfViewUrl] = useState<string | null>(null);
  const [reportViewLoading, setReportViewLoading] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [, navigate] = useLocation();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/api/reports");
      setReports(Array.isArray(data) ? data : []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReport = async (report: any) => {
    setSelectedReport(report);
    setPdfViewUrl(null);
    setViewOpen(true);
    setReportViewLoading(true);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`/api/reports/${report.id}/pdf?includeMarkup=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        setPdfViewUrl(URL.createObjectURL(blob));
      }
    } catch {
    } finally {
      setReportViewLoading(false);
    }
  };

  const closeReport = () => {
    if (pdfViewUrl) URL.revokeObjectURL(pdfViewUrl);
    setPdfViewUrl(null);
    setViewOpen(false);
  };

  const approveReport = async (report: any) => {
    setActionBusy(true);
    try {
      await apiFetch(`/api/reports/${report.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" } });
      await load();
      closeReport();
    } catch {
    } finally {
      setActionBusy(false);
    }
  };

  const downloadPdf = async (report: any) => {
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`/api/reports/${report.id}/pdf?includeMarkup=true`, {
        headers: { Authorization: `Bearer ${token}` },
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

  const deleteReport = async (id: number) => {
    setDeleting(true);
    try {
      await apiFetch(`/api/reports/${id}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      await load();
    } catch {
    } finally {
      setDeleting(false);
    }
  };

  const filtered = reports.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || r.title?.toLowerCase().includes(q)
      || r.projectName?.toLowerCase().includes(q)
      || r.generatedByName?.toLowerCase().includes(q)
      || (REPORT_TYPE_LABELS[r.reportType] || "").toLowerCase().includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const grouped = filtered.reduce<Record<string, { projectName: string; projectId: number; reports: any[] }>>((acc, r) => {
    const key = String(r.projectId);
    if (!acc[key]) acc[key] = { projectName: r.projectName || `Project #${r.projectId}`, projectId: r.projectId, reports: [] };
    acc[key].reports.push(r);
    return acc;
  }, {});
  const projectGroups = Object.values(grouped).sort((a, b) => a.projectName.localeCompare(b.projectName));

  const pendingCount = reports.filter(r => r.status === "pending_review").length;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-sidebar">Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? "Loading…" : `${reports.length} report${reports.length !== 1 ? "s" : ""} across all projects`}
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs px-2 py-0.5 rounded-full font-medium">
                  {pendingCount} pending review
                </span>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search reports, projects, inspectors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-secondary"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading reports…
          </div>
        )}

        {/* Empty state */}
        {!loading && reports.length === 0 && (
          <div className="text-center py-24 border border-dashed rounded-xl">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="font-semibold text-sidebar">No reports yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              Reports are generated after completing inspections on the mobile app. They appear here once submitted.
            </p>
          </div>
        )}

        {/* No match on filter */}
        {!loading && reports.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No reports match your current filters.
          </div>
        )}

        {/* Grouped by project */}
        {!loading && projectGroups.map(group => (
          <div key={group.projectId} className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`/projects/${group.projectId}`)}
                className="flex items-center gap-1.5 text-sm font-semibold text-sidebar hover:text-secondary transition-colors"
              >
                <FolderOpen className="h-4 w-4 text-secondary" />
                {group.projectName}
              </button>
              <span className="text-xs text-muted-foreground">
                {group.reports.length} report{group.reports.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-2">
              {group.reports.map(report => {
                const Icon = REPORT_TYPE_ICONS[report.reportType] || FileText;
                const statusLabel =
                  report.status === "pending_review" ? "Pending Review"
                  : report.status === "approved" ? "Approved"
                  : report.status === "sent" ? "Sent to Client"
                  : "Draft";

                return (
                  <div
                    key={report.id}
                    className={cn(
                      "p-4 bg-card border rounded-xl transition-colors",
                      confirmDeleteId === report.id
                        ? "border-red-300 bg-red-50/30"
                        : "border-border hover:border-sidebar/30"
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                        report.reportType === "inspection_certificate" && "bg-green-100",
                        report.reportType === "compliance_report" && "bg-blue-100",
                        report.reportType === "defect_notice" && "bg-amber-100",
                        report.reportType === "non_compliance_notice" && "bg-red-100",
                        !["inspection_certificate", "compliance_report", "defect_notice", "non_compliance_notice"].includes(report.reportType) && "bg-muted",
                      )}>
                        <Icon className={cn(
                          "h-5 w-5",
                          report.reportType === "inspection_certificate" && "text-green-700",
                          report.reportType === "compliance_report" && "text-blue-700",
                          report.reportType === "defect_notice" && "text-amber-700",
                          report.reportType === "non_compliance_notice" && "text-red-700",
                          !["inspection_certificate", "compliance_report", "defect_notice", "non_compliance_notice"].includes(report.reportType) && "text-muted-foreground",
                        )} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sidebar text-sm leading-snug">{report.title}</p>
                          <span className={cn(
                            "shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium capitalize",
                            REPORT_STATUS_STYLES[report.status] || "bg-gray-50 text-gray-600 border-gray-200"
                          )}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Award className="h-3 w-3" />
                            {REPORT_TYPE_LABELS[report.reportType] || report.reportType}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(report.createdAt)}
                          </span>
                          {report.generatedByName && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {report.generatedByName}
                            </span>
                          )}
                          {report.sentTo && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Send className="h-3 w-3" />
                              {report.sentTo}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {report.status === "pending_review" && confirmDeleteId !== report.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => approveReport(report)}
                            disabled={actionBusy}
                            className="text-xs"
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                            Approve
                          </Button>
                        )}
                        {confirmDeleteId !== report.id && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReport(report)}
                              className="text-xs"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1.5" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadPdf(report)}
                              className="text-xs gap-1.5"
                              title="Download PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmDeleteId(report.id)}
                              className="text-xs text-red-500 border-red-200 hover:bg-red-50 hover:border-red-400"
                              title="Delete report"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {confirmDeleteId === report.id && (
                      <div className="mt-3 pt-3 border-t border-red-200 flex items-center justify-between gap-3">
                        <p className="text-sm text-red-700">
                          <span className="font-semibold">Delete this report?</span>
                          <span className="text-red-500 ml-1.5">This cannot be undone.</span>
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={deleting}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => deleteReport(report.id)}
                            disabled={deleting}
                            className="text-xs bg-red-600 hover:bg-red-700 text-white border-0"
                          >
                            {deleting
                              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Deleting…</>
                              : <><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete Report</>}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Report PDF viewer dialog */}
        <Dialog open={viewOpen} onOpenChange={o => { if (!o) closeReport(); }}>
          <DialogContent className="max-w-4xl w-full flex flex-col p-0 gap-0 overflow-hidden" style={{ maxHeight: "92vh" }}>
            <DialogTitle className="sr-only">{selectedReport?.title ?? "Report Viewer"}</DialogTitle>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-sidebar shrink-0" />
                <span className="text-sm font-semibold text-sidebar truncate">{selectedReport?.title}</span>
                {selectedReport?.sentTo && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <Send className="h-3 w-3" /> {selectedReport.sentTo}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedReport && downloadPdf(selectedReport)}
                  className="gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </Button>
                {selectedReport?.status === "pending_review" && (
                  <Button
                    onClick={async () => {
                      if (selectedReport) await approveReport(selectedReport);
                      closeReport();
                    }}
                    disabled={actionBusy}
                    size="sm"
                    className="text-xs"
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                    {actionBusy ? "Approving…" : "Approve & Mark as Final"}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={closeReport} className="text-xs px-2">✕</Button>
              </div>
            </div>

            <div className="flex-1 bg-muted/20" style={{ height: "75vh" }}>
              {reportViewLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm">Loading PDF…</span>
                </div>
              ) : pdfViewUrl ? (
                <iframe
                  src={pdfViewUrl}
                  className="w-full h-full"
                  title={selectedReport?.title ?? "Report PDF"}
                  style={{ border: "none" }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                  <FileText className="h-8 w-8 opacity-30" />
                  <span className="text-sm">Could not load PDF preview</span>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
