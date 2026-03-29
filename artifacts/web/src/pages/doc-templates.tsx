import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import {
  Plus, Trash2, FileText, Image, Eye, Edit3, ChevronRight,
  Copy, Check, X, Link2, ClipboardList, Printer, ChevronDown, Folder,
} from "lucide-react";
import { useListChecklistTemplates, useListInspections, useListProjects } from "@workspace/api-client-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DocTemplate {
  id: string;
  name: string;
  content: string;
  backgroundImage?: string;
  linkedChecklistIds: number[];
  defaultReportType?: string;
  createdAt: string;
  updatedAt: string;
}

const DISCIPLINES = [
  "Building Surveyor",
  "Structural Engineer",
  "Plumbing Officer",
  "Builder / QC",
  "Site Supervisor",
  "WHS Officer",
  "Pre-Purchase Inspector",
  "Fire Safety Engineer",
];

const REPORT_TYPE_OPTIONS = [
  { value: "inspection_certificate",    label: "Inspection Certificate" },
  { value: "compliance_report",         label: "Compliance Report" },
  { value: "defect_notice",             label: "Defect Notice" },
  { value: "non_compliance_notice",     label: "Non-Compliance Notice" },
  { value: "quality_control_report",    label: "Quality Control Report" },
  { value: "non_conformance_report",    label: "Non-Conformance Report" },
  { value: "safety_inspection_report",  label: "Safety Inspection Report" },
  { value: "hazard_assessment_report",  label: "Hazard Assessment Report" },
  { value: "corrective_action_report",  label: "Corrective Action Report" },
  { value: "pre_purchase_report",       label: "Pre-Purchase Building Report" },
  { value: "annual_fire_safety",        label: "Annual Fire Safety Statement" },
  { value: "fire_inspection_report",    label: "Fire Safety Inspection Report" },
];

// ── Data fields available for insertion ───────────────────────────────────────
const FIELD_GROUPS = [
  {
    label: "Project",
    fields: [
      { token: "{{project_name}}",     label: "Project Name" },
      { token: "{{project_address}}",  label: "Site Address" },
      { token: "{{council_number}}",   label: "Council / Permit No." },
      { token: "{{ncc_class}}",        label: "NCC Building Class" },
      { token: "{{lot_number}}",       label: "Lot Number" },
      { token: "{{da_number}}",        label: "DA / BA Number" },
    ],
  },
  {
    label: "Inspection",
    fields: [
      { token: "{{inspection_type}}",  label: "Inspection Type" },
      { token: "{{inspection_date}}",  label: "Inspection Date" },
      { token: "{{inspection_time}}",  label: "Inspection Time" },
      { token: "{{result}}",           label: "Result (Pass/Fail)" },
      { token: "{{notes}}",            label: "Inspector Notes" },
      { token: "{{checklist_items}}", label: "Checklist Items Table" },
    ],
  },
  {
    label: "Inspector / Certifier",
    fields: [
      { token: "{{inspector_name}}",   label: "Inspector Name" },
      { token: "{{certifier_name}}",   label: "Certifier Name" },
      { token: "{{license_number}}",   label: "License Number" },
      { token: "{{company_name}}",     label: "Company Name" },
      { token: "{{company_address}}",  label: "Company Address" },
      { token: "{{phone}}",            label: "Phone" },
      { token: "{{email}}",            label: "Email" },
    ],
  },
  {
    label: "Date & Time",
    fields: [
      { token: "{{today}}",            label: "Today's Date" },
      { token: "{{time_now}}",         label: "Current Time" },
      { token: "{{year}}",             label: "Year" },
    ],
  },
  {
    label: "Signature",
    fields: [
      { token: "{{signature_line}}",   label: "Signature Line" },
      { token: "{{signature_block}}",  label: "Signature Block" },
    ],
  },
];

// ── API helpers ────────────────────────────────────────────────────────────────
const API_BASE = "/api/doc-templates";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("inspectproof_token");
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fromApi(t: any): DocTemplate {
  return {
    id: String(t.id),
    name: t.name,
    content: t.content ?? "",
    backgroundImage: t.backgroundImage ?? undefined,
    linkedChecklistIds: Array.isArray(t.linkedChecklistIds) ? t.linkedChecklistIds : [],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

const DEFAULT_TEMPLATE_CONTENT = `<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0B1933;">INSPECTION REPORT</h2>
<p style="margin:0 0 8px;"><strong>Project:</strong> {{project_name}}</p>
<p style="margin:0 0 8px;"><strong>Site Address:</strong> {{project_address}}</p>
<p style="margin:0 0 8px;"><strong>Inspection Type:</strong> {{inspection_type}}</p>
<p style="margin:0 0 8px;"><strong>Date:</strong> {{inspection_date}}</p>
<p style="margin:0 0 8px;"><strong>Inspector:</strong> {{inspector_name}}</p>
<p style="margin:0 0 24px;"><strong>Result:</strong> {{result}}</p>
<p style="margin:0 0 8px;"><strong>Notes:</strong></p>
<p style="margin:0 0 24px;">{{notes}}</p>
<p style="margin:0 0 16px;"><strong>Checklist:</strong></p>
{{checklist_items}}
<p style="margin:32px 0 4px;border-top:1px solid #ccc;padding-top:12px;font-size:13px;color:#666;">{{certifier_name}} — License No. {{license_number}}</p>
<p style="margin:0;font-size:13px;color:#666;">{{company_name}}</p>`;

// ── Test Project sample data (used in Preview mode and field panel) ────────────
const TEST_PREVIEW_DATA: Record<string, string> = {
  "{{project_name}}":    "Test Project",
  "{{project_address}}": "1 Sample Street, Adelaide SA 5000",
  "{{council_number}}":  "DA-2024/001",
  "{{ncc_class}}":       "Class 1a — Dwelling",
  "{{lot_number}}":      "Lot 42",
  "{{da_number}}":       "DA-2024/001",
  "{{inspection_type}}": "Footing Inspection",
  "{{inspection_date}}": "15 March 2024",
  "{{inspection_time}}": "09:00 AM",
  "{{result}}":          "8 Pass / 1 Fail",
  "{{notes}}":           "Footing depths comply with engineering plans. Reinforcement spacing confirmed per structural drawings.",
  "{{inspector_name}}":  "John Doe",
  "{{certifier_name}}":  "John Doe",
  "{{license_number}}":  "BS-12345",
  "{{company_name}}":    "SA Building Certifications Pty Ltd",
  "{{company_address}}": "Level 2, 100 King William St, Adelaide SA 5000",
  "{{phone}}":           "+61 8 8123 4567",
  "{{email}}":           "john.doe@sabuildcert.com.au",
  "{{today}}":           new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
  "{{time_now}}":        new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
  "{{year}}":            new Date().getFullYear().toString(),
  "{{signature_line}}":  `<div style="margin-top:16px;border-top:1px solid #000;width:220px;padding-top:4px;font-size:12px;color:#555;">John Doe</div>`,
  "{{signature_block}}": `<div style="margin-top:16px;"><div style="border-top:1px solid #000;width:220px;margin-bottom:4px;"></div><div style="font-size:12px;color:#555;">John Doe — 15 March 2024</div></div>`,
  "{{checklist_items}}": `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;"><thead><tr style="background:#f3f4f6;"><th style="text-align:left;padding:5px 8px;border:1px solid #e5e7eb;">#</th><th style="text-align:left;padding:5px 8px;border:1px solid #e5e7eb;">Description</th><th style="text-align:center;padding:5px 8px;border:1px solid #e5e7eb;">Result</th></tr></thead><tbody><tr style="background:#f0fdf4;"><td style="padding:5px 8px;border:1px solid #e5e7eb;">1</td><td style="padding:5px 8px;border:1px solid #e5e7eb;">Footing depth per engineer's plans</td><td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:600;color:#15803d;">PASS</td></tr><tr><td style="padding:5px 8px;border:1px solid #e5e7eb;">2</td><td style="padding:5px 8px;border:1px solid #e5e7eb;">Reinforcement bar spacing</td><td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:600;color:#15803d;">PASS</td></tr><tr style="background:#fef2f2;"><td style="padding:5px 8px;border:1px solid #e5e7eb;">3</td><td style="padding:5px 8px;border:1px solid #e5e7eb;">Setback from boundary</td><td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:600;color:#b91c1c;">FAIL</td></tr></tbody></table>`,
};

// ── Token highlight (edit mode) ────────────────────────────────────────────────
function highlightTokens(html: string): string {
  return html.replace(
    /(\{\{[a-z_]+\}\})/g,
    `<span style="background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:0 3px;font-family:monospace;font-size:12px;">$1</span>`
  );
}

// ── Fill tokens with preview data (preview mode) ──────────────────────────────
function fillWithData(html: string, data: Record<string, string>): string {
  return html.replace(/\{\{[a-z_]+\}\}/g, m => data[m] ?? m);
}

// ── Build preview data from real project/inspection ───────────────────────────
function buildPreviewData(project: any, inspection: any): Record<string, string> {
  const today = new Date();
  const au = (d: string) => { try { return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }); } catch { return d; } };
  return {
    "{{project_name}}":    project?.name ?? "",
    "{{project_address}}": [project?.siteAddress, project?.suburb, project?.state].filter(Boolean).join(", "),
    "{{council_number}}":  project?.daNumber ?? "",
    "{{ncc_class}}":       project?.buildingClassification ?? "",
    "{{lot_number}}":      "",
    "{{da_number}}":       project?.daNumber ?? "",
    "{{inspection_type}}": inspection ? (inspection.inspectionType ?? "").replace(/_/g, " ") : "",
    "{{inspection_date}}": inspection?.scheduledDate ? au(inspection.scheduledDate) : "",
    "{{inspection_time}}": inspection?.scheduledTime ?? "",
    "{{result}}":          inspection ? `${inspection.passCount ?? 0} Pass / ${inspection.failCount ?? 0} Fail` : "",
    "{{notes}}":           inspection?.siteNotes ?? inspection?.notes ?? "",
    "{{inspector_name}}":  inspection?.inspectorName ?? "",
    "{{certifier_name}}":  inspection?.inspectorName ?? "",
    "{{license_number}}":  "",
    "{{company_name}}":    "",
    "{{company_address}}": "",
    "{{phone}}":           "",
    "{{email}}":           inspection?.clientEmail ?? "",
    "{{today}}":           today.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
    "{{time_now}}":        today.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
    "{{year}}":            today.getFullYear().toString(),
    "{{signature_line}}":  `<div style="margin-top:16px;border-top:1px solid #000;width:220px;padding-top:4px;font-size:12px;color:#555;">Signature</div>`,
    "{{signature_block}}": `<div style="margin-top:16px;"><div style="border-top:1px solid #000;width:220px;margin-bottom:4px;"></div><div style="font-size:12px;color:#555;">Signature &amp; Date</div></div>`,
    "{{checklist_items}}": TEST_PREVIEW_DATA["{{checklist_items}}"],
  };
}

// ── Checklist table builder ────────────────────────────────────────────────────
function buildChecklistTable(results: any[]): string {
  if (!results || results.length === 0) return "<p style='color:#666;font-style:italic;'>No checklist items recorded.</p>";
  const rows = results
    .slice()
    .sort((a: any, b: any) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map((r: any, i: number) => {
      const color = r.result === "pass" ? "#15803d" : r.result === "fail" ? "#b91c1c" : "#6b7280";
      const bg = r.result === "pass" ? "#f0fdf4" : r.result === "fail" ? "#fef2f2" : "transparent";
      return `<tr style="background:${bg};">
        <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:12px;color:#374151;">${i + 1}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:12px;">${r.description ?? ""}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:12px;text-align:center;font-weight:600;color:${color};">${(r.result ?? "pending").toUpperCase()}</td>
        <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${r.notes ?? ""}</td>
      </tr>`;
    }).join("");
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;font-weight:600;width:32px;">#</th>
        <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;font-weight:600;">Description</th>
        <th style="text-align:center;padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;font-weight:600;width:80px;">Result</th>
        <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;font-weight:600;">Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Token filler ──────────────────────────────────────────────────────────────
function fillTokens(content: string, inspection: any, project: any): string {
  const today = new Date();
  const au = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const vals: Record<string, string> = {
    "{{project_name}}":     inspection.projectName ?? "",
    "{{project_address}}":  project?.siteAddress ?? "",
    "{{council_number}}":   project?.councilRef ?? "",
    "{{ncc_class}}":        project?.nccClass ?? "",
    "{{lot_number}}":       project?.lotNumber ?? "",
    "{{da_number}}":        project?.daNumber ?? "",
    "{{inspection_type}}":  (inspection.inspectionType ?? "").replace(/_/g, " "),
    "{{inspection_date}}":  inspection.scheduledDate ? au(inspection.scheduledDate) : "",
    "{{inspection_time}}":  inspection.scheduledTime ?? "",
    "{{result}}":           `${inspection.passCount ?? 0} Pass / ${inspection.failCount ?? 0} Fail`,
    "{{notes}}":            inspection.notes ?? "",
    "{{inspector_name}}":   inspection.inspectorName ?? "",
    "{{certifier_name}}":   inspection.inspectorName ?? "",
    "{{license_number}}":   "",
    "{{company_name}}":     "InspectProof",
    "{{company_address}}":  "",
    "{{phone}}":            "",
    "{{email}}":            "",
    "{{today}}":            today.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
    "{{time_now}}":         today.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
    "{{year}}":             today.getFullYear().toString(),
    "{{signature_line}}":   `<div style="margin-top:16px;border-top:1px solid #000;width:220px;padding-top:4px;font-size:12px;color:#555;">Signature</div>`,
    "{{signature_block}}":  `<div style="margin-top:16px;"><div style="border-top:1px solid #000;width:220px;margin-bottom:4px;"></div><div style="font-size:12px;color:#555;">Signature &amp; Date</div></div>`,
    "{{checklist_items}}":  buildChecklistTable(inspection.checklistResults ?? []),
  };
  return content.replace(/\{\{[a-z_]+\}\}/g, m => vals[m] ?? m);
}

// ── Generate Report Dialog ─────────────────────────────────────────────────────
function GenerateReportDialog({ template, onClose }: { template: DocTemplate; onClose: () => void }) {
  const { data: inspections } = useListInspections({});
  const [selectedInspId, setSelectedInspId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [filledHtml, setFilledHtml] = useState<string | null>(null);
  const [project, setProject] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const hasLinked = template.linkedChecklistIds.length > 0;
  const linkedMatches = (inspections ?? []).filter(i =>
    template.linkedChecklistIds.includes((i as any).checklistTemplateId)
  );
  const noMatches = hasLinked && linkedMatches.length === 0;
  const filtered = (!hasLinked || showAll || noMatches) ? (inspections ?? []) : linkedMatches;

  async function generate() {
    if (!selectedInspId) return;
    setGenerating(true);
    try {
      const token = localStorage.getItem("inspectproof_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Basic ${token}`;
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

      const [inspRes, ] = await Promise.all([
        fetch(`${baseUrl}/api/inspections/${selectedInspId}`, { headers }),
      ]);
      const insp = await inspRes.json();

      let proj = null;
      if (insp.projectId) {
        const projRes = await fetch(`${baseUrl}/api/projects/${insp.projectId}`, { headers });
        if (projRes.ok) proj = await projRes.json();
      }
      setProject(proj);
      const filled = fillTokens(template.content, insp, proj);
      setFilledHtml(filled);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  function print() {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Report</title>
<style>
  @page { margin: 72px 80px; }
  body { font-family: Georgia, serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #e5e7eb; }
</style>
</head><body>${printRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sidebar font-bold">
            <Printer className="h-4 w-4 text-secondary" />
            Generate Report — {template.name}
          </DialogTitle>
        </DialogHeader>

        {!filledHtml ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Select Inspection</label>
              {hasLinked && (
                <div className="flex items-center justify-between rounded-lg bg-secondary/5 border border-secondary/20 px-3 py-2">
                  <p className="text-xs text-secondary font-medium flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    {noMatches
                      ? "No matching inspections — showing all"
                      : showAll
                      ? `${(inspections ?? []).length} inspections (all)`
                      : `${linkedMatches.length} matched to linked checklists`}
                  </p>
                  {!noMatches && (
                    <button
                      onClick={() => { setShowAll(s => !s); setSelectedInspId(""); }}
                      className="text-xs underline text-secondary hover:text-secondary/70"
                    >
                      {showAll ? "Linked only" : "Show all"}
                    </button>
                  )}
                </div>
              )}
              <div className="relative">
                <select
                  value={selectedInspId}
                  onChange={e => setSelectedInspId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50 pr-9"
                >
                  <option value="">Choose an inspection…</option>
                  {filtered.map((i: any) => (
                    <option key={i.id} value={i.id}>
                      {i.projectName} — {(i.inspectionType ?? "").replace(/_/g, " ")} — {i.scheduledDate}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button
                disabled={!selectedInspId || generating}
                onClick={generate}
                className="flex-1 gap-2 bg-secondary hover:bg-secondary/90 text-white"
              >
                {generating ? "Generating…" : "Generate Report"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setFilledHtml(null)}
                className="text-xs text-muted-foreground hover:text-sidebar flex items-center gap-1"
              >
                ← Back
              </button>
              <div className="flex-1" />
              <button
                onClick={print}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold hover:bg-secondary/90 transition-colors shadow-sm"
              >
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-muted/30 rounded-xl border border-border p-6 flex justify-center">
              <div
                className="bg-white shadow-xl relative"
                style={{ width: "794px", minHeight: "1123px", fontFamily: "Georgia, serif", fontSize: "14px", lineHeight: "1.6", color: "#1a1a1a" }}
              >
                {template.backgroundImage && (
                  <img src={template.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity: 1 }} />
                )}
                <div
                  ref={printRef}
                  style={{ padding: "72px 80px", position: "relative" }}
                  dangerouslySetInnerHTML={{ __html: filledHtml }}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Checklists Panel (right-panel sub-component) ──────────────────────────────
function ChecklistsPanel({
  checklistTemplates,
  linkedIds,
  onToggleAll,
  onToggleOne,
}: {
  checklistTemplates: any[];
  linkedIds: number[];
  onToggleAll: (ids: number[], allLinked: boolean) => void;
  onToggleOne: (id: number) => void;
}) {
  const allIds = checklistTemplates.map((ct: any) => ct.id as number);
  const allLinked = allIds.length > 0 && allIds.every(id => linkedIds.includes(id));
  const someLinked = !allLinked && allIds.some(id => linkedIds.includes(id));
  const folders = Array.from(new Set(checklistTemplates.map((ct: any) => ct.folder ?? "Other")));

  return (
    <div className="space-y-3">
      {/* Master select-all row */}
      <button
        onClick={() => onToggleAll(allIds, allLinked)}
        className="w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 bg-muted/40 hover:bg-muted border border-muted/60"
      >
        <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${allLinked ? "bg-secondary border-secondary" : someLinked ? "bg-secondary/40 border-secondary/60" : "border-muted-foreground/40 bg-white"}`}>
          {allLinked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
          {someLinked && <div className="w-1.5 h-1.5 rounded-sm bg-secondary" />}
        </div>
        <span className={`font-semibold ${allLinked ? "text-secondary" : "text-muted-foreground"}`}>
          {allLinked ? "Deselect all" : "Select all"}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {linkedIds.filter(id => allIds.includes(id)).length}/{allIds.length}
        </span>
      </button>

      {folders.map(folder => {
        const items = checklistTemplates.filter((ct: any) => (ct.folder ?? "Other") === folder);
        const folderIds = items.map((ct: any) => ct.id as number);
        const folderAllLinked = folderIds.length > 0 && folderIds.every(id => linkedIds.includes(id));
        const folderSomeLinked = !folderAllLinked && folderIds.some(id => linkedIds.includes(id));
        return (
          <div key={folder}>
            <button
              onClick={() => onToggleAll(folderIds, folderAllLinked)}
              className="flex items-center gap-1.5 px-1 mb-1 w-full group"
            >
              <Folder className="h-3 w-3 text-amber-500 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate flex-1 text-left">{folder}</span>
              <div className={`w-3 h-3 rounded border shrink-0 flex items-center justify-center ${folderAllLinked ? "bg-secondary border-secondary" : folderSomeLinked ? "bg-secondary/40 border-secondary/60" : "border-muted-foreground/30 group-hover:border-secondary/50"}`}>
                {folderAllLinked && <Check className="h-2 w-2 text-white" strokeWidth={3} />}
                {folderSomeLinked && <div className="w-1 h-1 rounded-sm bg-secondary" />}
              </div>
            </button>
            <div className="space-y-0.5">
              {items.map((ct: any) => {
                const isLinked = linkedIds.includes(ct.id);
                return (
                  <button
                    key={ct.id}
                    onClick={() => onToggleOne(ct.id)}
                    className={`w-full text-left pl-5 pr-2 py-1.5 rounded-lg text-xs transition-colors flex items-start gap-2 ${
                      isLinked ? "bg-secondary/10 text-secondary" : "hover:bg-muted text-sidebar"
                    }`}
                  >
                    <div className={`mt-0.5 w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${isLinked ? "bg-secondary border-secondary" : "border-muted-foreground/40"}`}>
                      {isLinked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate leading-tight">{ct.name}</div>
                      <div className="text-muted-foreground text-[10px] capitalize">{(ct.inspectionType ?? "").replace(/_/g, " ")}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Panel (embeddable, no AppLayout) ─────────────────────────────────────
export function DocTemplatesPanel() {
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [mode, setMode] = useState<"edit" | "preview">("preview");

  useEffect(() => {
    apiFetch(API_BASE)
      .then((rows: any[]) => {
        const ts = rows.map(fromApi);
        setTemplates(ts);
        if (ts.length > 0) setSelectedId(ts[0].id);
      })
      .catch(console.error)
      .finally(() => setTemplatesLoading(false));
  }, []);
  const [rightTab, setRightTab] = useState<"fields" | "checklists">("fields");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [checklistDiscipline, setChecklistDiscipline] = useState("Building Surveyor");

  const editorRef = useRef<HTMLDivElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const { data: checklistTemplates } = useListChecklistTemplates({ discipline: checklistDiscipline });
  const { data: allProjects } = useListProjects({});
  const { data: allInspections } = useListInspections({});
  const [previewProjectId, setPreviewProjectId] = useState<string>("");
  const [previewInspectionId, setPreviewInspectionId] = useState<string>("");

  const selected = templates.find(t => t.id === selectedId) ?? null;

  // Default preview project to first project when data loads
  useEffect(() => {
    if ((allProjects as any[])?.length && !previewProjectId) {
      setPreviewProjectId(String((allProjects as any[])[0].id));
    }
  }, [allProjects]);

  // Default preview inspection to first inspection of selected project
  useEffect(() => {
    const projectInspections = (allInspections as any[] ?? []).filter((i: any) => String(i.projectId) === previewProjectId);
    if (projectInspections.length) {
      setPreviewInspectionId(String(projectInspections[0].id));
    } else {
      setPreviewInspectionId("");
    }
  }, [previewProjectId, allInspections]);

  const previewProject = (allProjects as any[] ?? []).find((p: any) => String(p.id) === previewProjectId) ?? null;
  const previewProjectInspections = (allInspections as any[] ?? []).filter((i: any) => String(i.projectId) === previewProjectId);
  const previewInspection = previewProjectInspections.find((i: any) => String(i.id) === previewInspectionId) ?? previewProjectInspections[0] ?? null;
  const previewData = previewProject ? buildPreviewData(previewProject, previewInspection) : TEST_PREVIEW_DATA;

  async function createTemplate() {
    try {
      const result = await apiFetch(API_BASE, {
        method: "POST",
        body: JSON.stringify({ name: "Untitled Template", content: DEFAULT_TEMPLATE_CONTENT }),
      });
      const t = fromApi(result);
      setTemplates(prev => [...prev, t]);
      setSelectedId(t.id);
      setMode("edit");
    } catch (err) { console.error(err); }
  }

  async function deleteTemplate(id: string) {
    try {
      await apiFetch(`${API_BASE}/${id}`, { method: "DELETE" });
      setTemplates(prev => {
        const updated = prev.filter(t => t.id !== id);
        if (selectedId === id) setSelectedId(updated.length > 0 ? updated[0].id : null);
        return updated;
      });
    } catch (err) { console.error(err); }
  }

  async function duplicateTemplate(id: string) {
    const src = templates.find(t => t.id === id);
    if (!src) return;
    try {
      const result = await apiFetch(API_BASE, {
        method: "POST",
        body: JSON.stringify({ name: `${src.name} (Copy)`, content: src.content, linkedChecklistIds: src.linkedChecklistIds, backgroundImage: src.backgroundImage ?? null }),
      });
      const copy = fromApi(result);
      setTemplates(prev => [...prev, copy]);
      setSelectedId(copy.id);
    } catch (err) { console.error(err); }
  }

  function startRename(t: DocTemplate) { setRenamingId(t.id); setRenameValue(t.name); }

  async function commitRename() {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    const name = renameValue.trim();
    setTemplates(prev => prev.map(t => t.id === renamingId ? { ...t, name, updatedAt: new Date().toISOString() } : t));
    setRenamingId(null);
    try {
      await apiFetch(`${API_BASE}/${renamingId}`, { method: "PUT", body: JSON.stringify({ name }) });
    } catch (err) { console.error(err); }
  }

  useEffect(() => {
    if (mode === "edit" && editorRef.current && selected) {
      editorRef.current.innerHTML = selected.content;
    }
  }, [selectedId, mode]);

  async function saveContent() {
    if (!editorRef.current || !selected) return;
    const content = editorRef.current.innerHTML;
    setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, content, updatedAt: new Date().toISOString() } : t));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    try {
      await apiFetch(`${API_BASE}/${selected.id}`, { method: "PUT", body: JSON.stringify({ content }) });
    } catch (err) { console.error(err); }
  }

  function insertToken(token: string) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(token));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorRef.current.innerHTML += token;
    }
  }

  async function toggleChecklistLink(checklistId: number) {
    if (!selected) return;
    const ids = selected.linkedChecklistIds ?? [];
    const updated = ids.includes(checklistId)
      ? ids.filter(id => id !== checklistId)
      : [...ids, checklistId];
    setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, linkedChecklistIds: updated, updatedAt: new Date().toISOString() } : t));
    try {
      await apiFetch(`${API_BASE}/${selected.id}`, { method: "PUT", body: JSON.stringify({ linkedChecklistIds: updated }) });
    } catch (err) { console.error(err); }
  }

  async function toggleAllChecklists(ids: number[], allLinked: boolean) {
    if (!selected) return;
    const current = selected.linkedChecklistIds ?? [];
    const updated = allLinked
      ? current.filter(id => !ids.includes(id))
      : [...new Set([...current, ...ids])];
    setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, linkedChecklistIds: updated, updatedAt: new Date().toISOString() } : t));
    try {
      await apiFetch(`${API_BASE}/${selected.id}`, { method: "PUT", body: JSON.stringify({ linkedChecklistIds: updated }) });
    } catch (err) { console.error(err); }
  }

  function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string;
      setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, backgroundImage: dataUrl, updatedAt: new Date().toISOString() } : t));
      try {
        await apiFetch(`${API_BASE}/${selected.id}`, { method: "PUT", body: JSON.stringify({ backgroundImage: dataUrl }) });
      } catch (err) { console.error(err); }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function removeBgImage() {
    if (!selected) return;
    setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, backgroundImage: undefined, updatedAt: new Date().toISOString() } : t));
    try {
      await apiFetch(`${API_BASE}/${selected.id}`, { method: "PUT", body: JSON.stringify({ backgroundImage: null }) });
    } catch (err) { console.error(err); }
  }

  function execCmd(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  const linkedCount = selected?.linkedChecklistIds.length ?? 0;

  const [migrating, setMigrating] = useState(false);
  const localCount = (() => { try { return JSON.parse(localStorage.getItem("inspectproof_doc_templates") ?? "[]").length; } catch { return 0; } })();

  async function migrateFromLocal() {
    setMigrating(true);
    try {
      const raw: any[] = JSON.parse(localStorage.getItem("inspectproof_doc_templates") ?? "[]");
      const migrated: DocTemplate[] = [];
      for (const t of raw) {
        const result = await apiFetch(API_BASE, {
          method: "POST",
          body: JSON.stringify({ name: t.name, content: t.content ?? "", linkedChecklistIds: t.linkedChecklistIds ?? [], backgroundImage: t.backgroundImage ?? null }),
        });
        migrated.push(fromApi(result));
      }
      localStorage.removeItem("inspectproof_doc_templates");
      setTemplates(prev => [...prev, ...migrated]);
      if (migrated.length > 0 && !selectedId) setSelectedId(migrated[0].id);
    } catch (err) { console.error(err); }
    setMigrating(false);
  }

  return (
    <>
      {/* Migration banner — shown when localStorage has templates not yet imported */}
      {localCount > 0 && !templatesLoading && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <Folder className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="flex-1 text-amber-800">
            You have <strong>{localCount}</strong> template{localCount !== 1 ? "s" : ""} stored locally in this browser. Import them into the database to sync with mobile.
          </span>
          <button
            onClick={migrateFromLocal}
            disabled={migrating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors shrink-0 disabled:opacity-60"
          >
            {migrating ? "Importing…" : "Import Now"}
          </button>
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-260px)] min-h-[520px]">

        {/* ── Left: Template list ───────────────────────────────────────────── */}
        <div className="w-56 shrink-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Report Templates</p>
            <button
              onClick={createTemplate}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-white text-[10px] font-semibold hover:bg-secondary/90 transition-colors shrink-0"
            >
              <Plus className="h-3 w-3" />New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {templatesLoading ? (
              <div className="py-8 text-center">
                <div className="h-5 w-5 border-2 border-secondary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Loading…</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No templates yet</p>
              </div>
            ) : templates.map(t => (
              <div key={t.id} className="group relative">
                {renamingId === t.id ? (
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                      className="flex-1 text-xs px-1.5 py-0.5 rounded border border-secondary focus:outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setSelectedId(t.id); setMode("preview"); }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors flex items-start gap-2 ${
                      selectedId === t.id ? "bg-secondary text-white" : "hover:bg-muted text-sidebar"
                    }`}
                  >
                    <FileText className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${selectedId === t.id ? "text-white" : "text-muted-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs font-medium truncate ${selectedId === t.id ? "text-white" : ""}`}>{t.name}</div>
                      <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${selectedId === t.id ? "text-blue-100" : "text-muted-foreground"}`}>
                        {formatDate(t.updatedAt)}
                        {t.linkedChecklistIds.length > 0 && (
                          <span className={`flex items-center gap-0.5 ${selectedId === t.id ? "text-blue-200" : "text-secondary"}`}>
                            <Link2 className="h-2.5 w-2.5" />
                            {t.linkedChecklistIds.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )}
                {selectedId === t.id && renamingId !== t.id && (
                  <div className="absolute right-1 top-1.5 hidden group-hover:flex items-center gap-0.5 bg-white/90 rounded-md shadow-sm border border-border p-0.5">
                    <button title="Rename" onClick={() => startRename(t)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-sidebar"><Edit3 className="h-3 w-3" /></button>
                    <button title="Duplicate" onClick={() => duplicateTemplate(t.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-sidebar"><Copy className="h-3 w-3" /></button>
                    <button title="Delete" onClick={() => deleteTemplate(t.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: Editor / Preview ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <div className="flex rounded-lg border border-border overflow-hidden bg-card shadow-sm mr-2">
                  <button onClick={() => setMode("edit")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${mode === "edit" ? "bg-secondary text-white" : "text-muted-foreground hover:bg-muted"}`}>
                    <Edit3 className="h-3.5 w-3.5" />Edit
                  </button>
                  <button onClick={() => { saveContent(); setMode("preview"); }} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${mode === "preview" ? "bg-secondary text-white" : "text-muted-foreground hover:bg-muted"}`}>
                    <Eye className="h-3.5 w-3.5" />Preview
                  </button>
                </div>

                {mode === "edit" && (
                  <>
                    <div className="flex rounded-lg border border-border overflow-hidden bg-card shadow-sm">
                      <button onClick={() => execCmd("bold")} title="Bold" className="px-2.5 py-1.5 text-xs font-bold hover:bg-muted border-r border-border">B</button>
                      <button onClick={() => execCmd("italic")} title="Italic" className="px-2.5 py-1.5 text-xs italic hover:bg-muted border-r border-border">I</button>
                      <button onClick={() => execCmd("underline")} title="Underline" className="px-2.5 py-1.5 text-xs underline hover:bg-muted">U</button>
                    </div>
                    <select
                      onChange={e => { if (e.target.value) { execCmd("formatBlock", e.target.value); e.target.value = ""; } }}
                      className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm focus:outline-none"
                      defaultValue=""
                    >
                      <option value="" disabled>Style…</option>
                      <option value="h1">Heading 1</option>
                      <option value="h2">Heading 2</option>
                      <option value="h3">Heading 3</option>
                      <option value="p">Paragraph</option>
                    </select>
                    <button onClick={() => bgInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted shadow-sm text-muted-foreground">
                      <Image className="h-3.5 w-3.5" />Background
                    </button>
                    {selected.backgroundImage && (
                      <button onClick={removeBgImage} className="p-1.5 rounded-lg border border-border bg-card hover:bg-red-50 hover:text-red-600 text-muted-foreground shadow-sm">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
                    <button onClick={saveContent} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all ${saved ? "bg-green-50 text-green-700 border border-green-200" : "bg-secondary text-white hover:bg-secondary/90"}`}>
                      {saved ? <><Check className="h-3.5 w-3.5" />Saved</> : "Save"}
                    </button>
                  </>
                )}

                {/* Generate Report button */}
                <button
                  onClick={() => setGenerateOpen(true)}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1933] text-white text-xs font-semibold hover:bg-[#0B1933]/90 transition-colors shadow-sm"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Generate Report
                  {linkedCount > 0 && (
                    <span className="ml-1 bg-white/20 text-white text-[10px] rounded-full px-1.5 py-0.5 font-semibold">
                      {linkedCount} linked
                    </span>
                  )}
                </button>
              </div>

              {/* Preview mode banner */}
              {mode === "preview" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs font-medium">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${previewProject ? "bg-green-200 text-green-900" : "bg-amber-200 text-amber-900"}`}>
                    {previewProject ? "Live Data" : "Test Data"}
                  </span>
                  <span className="truncate">
                    Previewing with <strong>{previewProject?.name ?? "Test Project"}</strong>
                    {previewProject?.siteAddress ? ` — ${previewProject.siteAddress}` : ""}
                    {previewInspection ? ` — ${(previewInspection.inspectionType ?? "").replace(/_/g, " ")}` : ""}
                  </span>
                </div>
              )}

              {/* A4 document */}
              <div className="flex-1 overflow-auto bg-muted/30 rounded-xl border border-border p-6 flex justify-center">
                <div
                  className="relative bg-white shadow-xl"
                  style={{ width: "794px", minHeight: "1123px", fontFamily: "Georgia, serif", fontSize: "14px", lineHeight: "1.6", color: "#1a1a1a" }}
                >
                  {selected.backgroundImage && (
                    <img src={selected.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity: 1 }} />
                  )}
                  <div
                    ref={editorRef}
                    contentEditable={mode === "edit"}
                    suppressContentEditableWarning
                    onBlur={saveContent}
                    style={{ padding: "72px 80px", position: "relative", minHeight: "1123px", outline: "none" }}
                    dangerouslySetInnerHTML={mode === "preview" ? { __html: fillWithData(selected.content, previewData) } : undefined}
                  />
                  {mode === "edit" && (
                    <div className="absolute top-2 right-2 text-[10px] text-muted-foreground bg-white/80 rounded px-1.5 py-0.5 pointer-events-none">Click to edit</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-card rounded-xl border border-border">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium mb-1">No template selected</p>
              <p className="text-sm text-muted-foreground/70 mb-4">Create your first template to get started</p>
              <Button onClick={createTemplate} className="gap-2 bg-secondary hover:bg-secondary/90 text-white">
                <Plus className="h-4 w-4" />
                New Template
              </Button>
            </div>
          )}
        </div>

        {/* ── Right panel: Fields + Linked Checklists ───────────────────────── */}
        {selected && (
          <div className="w-52 shrink-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            {/* Tab bar */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setRightTab("fields")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${rightTab === "fields" ? "bg-secondary text-white" : "text-muted-foreground hover:bg-muted"}`}
              >
                <ChevronRight className="h-3 w-3" />
                Fields
              </button>
              <button
                onClick={() => setRightTab("checklists")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors relative ${rightTab === "checklists" ? "bg-secondary text-white" : "text-muted-foreground hover:bg-muted"}`}
              >
                <Link2 className="h-3 w-3" />
                Checklists
                {linkedCount > 0 && (
                  <span className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${rightTab === "checklists" ? "bg-white text-secondary" : "bg-secondary text-white"}`}>
                    {linkedCount}
                  </span>
                )}
              </button>
            </div>

            {rightTab === "fields" ? (
              <div className="flex-1 overflow-y-auto p-2 space-y-3">
                <div className="px-1 pt-1">
                  <p className="text-[10px] text-muted-foreground">Click a field to insert at cursor</p>
                  <div className="mt-1.5 flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                    <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wide shrink-0">Project</span>
                    <select
                      value={previewProjectId}
                      onChange={e => setPreviewProjectId(e.target.value)}
                      className="flex-1 min-w-0 text-[9px] text-amber-700 bg-transparent border-none outline-none cursor-pointer font-medium"
                    >
                      {!(allProjects as any[])?.length && <option value="">Loading…</option>}
                      {(allProjects as any[] ?? []).map((p: any) => (
                        <option key={p.id} value={String(p.id)}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {previewProjectInspections.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-md px-2 py-1">
                      <span className="text-[9px] font-bold text-blue-700 uppercase tracking-wide shrink-0">Insp</span>
                      <select
                        value={previewInspectionId}
                        onChange={e => setPreviewInspectionId(e.target.value)}
                        className="flex-1 min-w-0 text-[9px] text-blue-700 bg-transparent border-none outline-none cursor-pointer font-medium"
                      >
                        {previewProjectInspections.map((i: any) => (
                          <option key={i.id} value={String(i.id)}>
                            {(i.inspectionType ?? "").replace(/_/g, " ")} — {i.scheduledDate}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {FIELD_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">{group.label}</p>
                    <div className="space-y-0.5">
                      {group.fields.map(f => {
                        const sample = previewData[f.token];
                        const displaySample = sample && !sample.startsWith("<") ? sample : null;
                        return (
                          <button
                            key={f.token}
                            onClick={() => insertToken(f.token)}
                            title={f.token}
                            className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-secondary/10 hover:text-secondary transition-colors flex items-start gap-2 group"
                          >
                            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50 group-hover:text-secondary shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{f.label}</div>
                              {displaySample && (
                                <div className="text-[10px] text-muted-foreground truncate mt-0.5 group-hover:text-secondary/70">{displaySample}</div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                <p className="text-[10px] text-muted-foreground px-1 pt-1 pb-1 leading-snug">
                  Link checklists to this template. Select a discipline to browse its checklists.
                </p>
                {/* Discipline selector */}
                <div className="px-1 pb-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Discipline</label>
                  <div className="flex flex-wrap gap-1">
                    {DISCIPLINES.map(d => (
                      <button
                        key={d}
                        onClick={() => setChecklistDiscipline(d)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                          checklistDiscipline === d
                            ? "bg-secondary text-white border-secondary"
                            : "bg-card text-muted-foreground border-muted/60 hover:border-secondary/50 hover:text-sidebar"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-muted/50 pt-1" />
                {!checklistTemplates || checklistTemplates.length === 0 ? (
                  <div className="text-center py-6">
                    <ClipboardList className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No checklists found</p>
                  </div>
                ) : (
                  <ChecklistsPanel
                    checklistTemplates={checklistTemplates}
                    linkedIds={selected?.linkedChecklistIds ?? []}
                    onToggleAll={toggleAllChecklists}
                    onToggleOne={toggleChecklistLink}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {generateOpen && selected && (
        <GenerateReportDialog template={selected} onClose={() => setGenerateOpen(false)} />
      )}
    </>
  );
}

// ── Standalone page (keeps existing /doc-templates route working) ──────────────
export default function DocTemplatesPage() {
  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Report Templates</h1>
          <p className="text-muted-foreground mt-1">Create reusable document templates with your letterhead and data fields.</p>
        </div>
      </div>
      <DocTemplatesPanel />
    </AppLayout>
  );
}
