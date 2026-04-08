import { useState, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import {
  Plus, Trash2, FileText, Eye, Edit3, Copy, Check, Link2, ClipboardList,
  Printer, ChevronDown, Folder, ChevronUp, AlertTriangle, Image, X,
} from "lucide-react";
import { useListChecklistTemplates, useListInspections } from "@workspace/api-client-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReportSection {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  editable: boolean;
  content?: string;
}

interface TemplateConfig {
  v: 2;
  reportType: string;
  sections: ReportSection[];
}

interface DocTemplate {
  id: string;
  name: string;
  config: TemplateConfig;
  backgroundImage?: string;
  linkedChecklistIds: number[];
  createdAt: string;
  updatedAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const DISCIPLINES = [
  "Building Surveyor", "Structural Engineer", "Plumbing Officer", "Builder / QC",
  "Site Supervisor", "WHS Officer", "Pre-Purchase Inspector", "Fire Safety Engineer",
];

const REPORT_TYPE_OPTIONS = [
  { value: "inspection_certificate",   label: "Inspection Certificate" },
  { value: "compliance_report",        label: "Compliance Report" },
  { value: "defect_notice",            label: "Defect Notice" },
  { value: "non_compliance_notice",    label: "Non-Compliance Notice" },
  { value: "summary",                  label: "Inspection Summary" },
  { value: "quality_control_report",   label: "Quality Control Report" },
  { value: "non_conformance_report",   label: "Non-Conformance Report" },
  { value: "safety_inspection_report", label: "Safety Inspection Report" },
  { value: "hazard_assessment_report", label: "Hazard Assessment Report" },
  { value: "corrective_action_report", label: "Corrective Action Report" },
  { value: "pre_purchase_report",      label: "Pre-Purchase Building Report" },
  { value: "annual_fire_safety",       label: "Annual Fire Safety Statement" },
  { value: "fire_inspection_report",   label: "Fire Safety Inspection Report" },
];

const DEFAULT_SECTIONS: ReportSection[] = [
  { id: "cover_page",          label: "Cover Page",             description: "Company logo, report type title, project name and inspection date",                    enabled: true,  editable: false },
  { id: "executive_summary",   label: "Executive Summary",      description: "Overall result (Pass/Fail/Pending), statistics breakdown, and key findings",           enabled: true,  editable: false },
  { id: "inspection_details",  label: "Inspection Details",     description: "Project info, DA number, NCC building class, client and builder details",              enabled: true,  editable: false },
  { id: "checklist_results",   label: "Checklist Results",      description: "All inspection items grouped by category with results, notes and code references",     enabled: true,  editable: false },
  { id: "issues",              label: "Issues & Non-Compliances", description: "Unresolved defects and non-compliant items raised during the inspection",            enabled: true,  editable: false },
  { id: "terms_and_conditions", label: "Terms & Conditions",    description: "Custom legal disclaimer inserted as its own page before sign-off",                    enabled: false, editable: true, content: "" },
  { id: "sign_off",            label: "Sign-Off & Certification", description: "Inspector and certifier signature blocks with certification declaration",            enabled: true,  editable: false },
];

const SECTION_ICONS: Record<string, string> = {
  cover_page: "📄",
  executive_summary: "📊",
  inspection_details: "ℹ️",
  checklist_results: "✅",
  issues: "⚠️",
  terms_and_conditions: "📝",
  sign_off: "✍️",
};

const API_BASE = "/api/doc-templates";

// ── Helpers ────────────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("inspectproof_token");
  const baseUrl = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const res = await fetch(url, {
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

function makeDefaultConfig(reportType = "inspection_certificate"): TemplateConfig {
  return { v: 2, reportType, sections: DEFAULT_SECTIONS.map(s => ({ ...s })) };
}

function parseConfig(content: string): TemplateConfig {
  try {
    const parsed = JSON.parse(content);
    if (parsed.v === 2 && Array.isArray(parsed.sections)) {
      const mergedSections = DEFAULT_SECTIONS.map(def => {
        const existing = parsed.sections.find((s: ReportSection) => s.id === def.id);
        return existing ? { ...def, ...existing } : { ...def };
      });
      return { ...parsed, sections: mergedSections };
    }
  } catch {}
  return makeDefaultConfig();
}

function fromApi(t: any): DocTemplate {
  return {
    id: String(t.id),
    name: t.name,
    config: parseConfig(t.content ?? ""),
    backgroundImage: t.backgroundImage ?? undefined,
    linkedChecklistIds: Array.isArray(t.linkedChecklistIds) ? t.linkedChecklistIds : [],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// ── Section Toggle Switch ──────────────────────────────────────────────────────
function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
        enabled ? "bg-secondary" : "bg-muted-foreground/30"
      }`}
      title={enabled ? "Disable section" : "Enable section"}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out mt-0.5 ${
        enabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"
      }`} />
    </button>
  );
}

// ── SectionCard ────────────────────────────────────────────────────────────────
function SectionCard({
  section, index, total, expanded,
  onToggle, onMoveUp, onMoveDown, onExpand, onContentChange,
  backgroundImage, onBgUpload, onBgRemove, bgInputRef,
}: {
  section: ReportSection; index: number; total: number; expanded: boolean;
  onToggle: () => void; onMoveUp: () => void; onMoveDown: () => void;
  onExpand: () => void; onContentChange: (content: string) => void;
  backgroundImage?: string; onBgUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBgRemove: () => void; bgInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className={`rounded-xl border transition-all ${
      section.enabled ? "border-border bg-card shadow-sm" : "border-muted/40 bg-muted/10"
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={onMoveUp} disabled={index === 0}
            className="p-0.5 rounded text-muted-foreground/50 hover:text-sidebar hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={onMoveDown} disabled={index === total - 1}
            className="p-0.5 rounded text-muted-foreground/50 hover:text-sidebar hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        {/* Icon */}
        <span className={`text-xl shrink-0 ${section.enabled ? "" : "opacity-40"}`}>
          {SECTION_ICONS[section.id] ?? "📋"}
        </span>

        {/* Label + description */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-tight ${section.enabled ? "text-sidebar" : "text-muted-foreground"}`}>
            {section.label}
          </p>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5 truncate">{section.description}</p>
        </div>

        {/* Cover Page: Letterhead upload button */}
        {section.id === "cover_page" && section.enabled && (
          <button
            onClick={() => bgInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-sidebar hover:border-secondary/50 transition-colors shrink-0"
          >
            <Image className="h-3 w-3" />
            Letterhead
          </button>
        )}

        {/* T&C: Edit button */}
        {section.editable && section.enabled && (
          <button
            onClick={onExpand}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors shrink-0 ${
              expanded
                ? "bg-secondary text-white border-secondary"
                : "border-border text-muted-foreground hover:text-sidebar hover:border-secondary/50"
            }`}
          >
            <Edit3 className="h-3 w-3" />
            {expanded ? "Close" : "Edit"}
          </button>
        )}

        {/* Auto-generated badge */}
        {!section.editable && (
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide shrink-0 hidden sm:block">
            Auto
          </span>
        )}

        {/* Toggle */}
        <ToggleSwitch enabled={section.enabled} onToggle={onToggle} />
      </div>

      {/* T&C inline editor */}
      {section.editable && expanded && section.enabled && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Enter your terms and conditions below. This will appear as a dedicated page immediately before the sign-off page in every generated report.
          </p>
          <textarea
            value={section.content ?? ""}
            onChange={e => onContentChange(e.target.value)}
            placeholder={"1. Limitation of Liability\nThis report is prepared for the exclusive use of the client...\n\n2. Scope of Inspection\nThe inspection covers items visible and accessible at time of inspection..."}
            rows={10}
            className="w-full text-xs font-mono border border-border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-secondary/50 resize-y bg-background"
          />
        </div>
      )}

      {/* Cover Page: Letterhead preview */}
      {section.id === "cover_page" && backgroundImage && section.enabled && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
            <img src={backgroundImage} alt="Letterhead" className="h-14 w-auto object-contain rounded border border-border" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar">Custom Letterhead Active</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">This image appears as the background of your Cover Page</p>
              <button onClick={onBgRemove} className="text-[10px] text-destructive hover:underline mt-1">Remove letterhead</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Generate Report Dialog ─────────────────────────────────────────────────────
function GenerateReportDialog({ template, onClose }: { template: DocTemplate; onClose: () => void }) {
  const { data: inspections } = useListInspections({});
  const [selectedInspId, setSelectedInspId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const config = template.config;
  const linked = template.linkedChecklistIds;
  const hasLinked = linked.length > 0;

  const allInspections = (inspections as any[] ?? []);
  const linkedMatches = allInspections.filter((i: any) => linked.includes(i.checklistTemplateId));
  const noMatches = hasLinked && linkedMatches.length === 0;
  const filtered = noMatches || showAll ? allInspections : (hasLinked ? linkedMatches : allInspections);

  const tcSection = config.sections.find(s => s.id === "terms_and_conditions");
  const coverEnabled   = config.sections.find(s => s.id === "cover_page")?.enabled !== false;
  const summaryEnabled = config.sections.find(s => s.id === "executive_summary")?.enabled !== false;
  const signOffEnabled = config.sections.find(s => s.id === "sign_off")?.enabled !== false;
  const tcContent = tcSection?.enabled && tcSection?.content ? tcSection.content : undefined;

  async function generate() {
    if (!selectedInspId) return;
    setGenerating(true);
    try {
      const result = await apiFetch("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({
          inspectionId: parseInt(selectedInspId),
          reportType: config.reportType,
          includeCoverPage: coverEnabled,
          includeSummary: summaryEnabled,
          includeSignOff: signOffEnabled,
          termsAndConditions: tcContent,
        }),
      });
      setReportHtml(result.content ?? "");
    } catch (e) {
      console.error("Generate report error:", e);
    } finally {
      setGenerating(false);
    }
  }

  function print() {
    if (!reportHtml) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>${template.name}</title>
<style>
  @page { margin: 60px 60px; }
  body { margin: 0; padding: 0; }
  @media print { .no-print { display: none; } }
</style>
</head><body>${reportHtml}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  const reportTypeLabel = REPORT_TYPE_OPTIONS.find(r => r.value === config.reportType)?.label ?? config.reportType;

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sidebar font-bold">
            <Printer className="h-4 w-4 text-secondary" />
            Generate Report — {template.name}
          </DialogTitle>
        </DialogHeader>

        {!reportHtml ? (
          <div className="space-y-4 pt-2">
            {/* Template summary */}
            <div className="rounded-lg bg-secondary/5 border border-secondary/20 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide">Template Configuration</p>
              <p className="text-sm text-sidebar"><span className="text-muted-foreground">Report type: </span>{reportTypeLabel}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {config.sections.filter(s => s.enabled).map(s => (
                  <span key={s.id} className="text-[10px] font-semibold bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">
                    {SECTION_ICONS[s.id]} {s.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Inspection selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Select Inspection</label>
              {hasLinked && (
                <div className="flex items-center justify-between rounded-lg bg-secondary/5 border border-secondary/20 px-3 py-2">
                  <p className="text-xs text-secondary font-medium flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    {noMatches ? "No matching inspections — showing all"
                      : showAll ? `${allInspections.length} inspections (all)`
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
                onClick={() => setReportHtml(null)}
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
                ref={printRef}
                className="bg-white shadow-xl"
                style={{ width: "794px", minHeight: "1123px", fontFamily: "Arial, sans-serif" }}
                dangerouslySetInnerHTML={{ __html: reportHtml }}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Checklists Panel ───────────────────────────────────────────────────────────
function ChecklistsPanel({
  checklistTemplates, linkedIds, onToggleAll, onToggleOne,
}: {
  checklistTemplates: any[]; linkedIds: number[];
  onToggleAll: (ids: number[], allLinked: boolean) => void;
  onToggleOne: (id: number) => void;
}) {
  const allIds = checklistTemplates.map((ct: any) => ct.id as number);
  const allLinked = allIds.length > 0 && allIds.every(id => linkedIds.includes(id));
  const someLinked = !allLinked && allIds.some(id => linkedIds.includes(id));
  const folders = Array.from(new Set(checklistTemplates.map((ct: any) => ct.folder ?? "Other")));

  return (
    <div className="space-y-3">
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

// ── Main Panel ────────────────────────────────────────────────────────────────
export function DocTemplatesPanel() {
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [checklistDiscipline, setChecklistDiscipline] = useState("Building Surveyor");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

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

  const { data: checklistTemplates } = useListChecklistTemplates({ discipline: checklistDiscipline });

  const selected = templates.find(t => t.id === selectedId) ?? null;

  async function saveConfig(id: string, config: TemplateConfig, silent = false) {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, config, updatedAt: new Date().toISOString() } : t));
    if (!silent) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    try {
      await apiFetch(`${API_BASE}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ content: JSON.stringify(config) }),
      });
    } catch (err) { console.error(err); }
  }

  function updateSection(sectionId: string, patch: Partial<ReportSection>) {
    if (!selected) return;
    const newSections = selected.config.sections.map(s => s.id === sectionId ? { ...s, ...patch } : s);
    const newConfig = { ...selected.config, sections: newSections };
    saveConfig(selected.id, newConfig, true);
  }

  function moveSection(index: number, dir: -1 | 1) {
    if (!selected) return;
    const sections = [...selected.config.sections];
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    const newConfig = { ...selected.config, sections };
    saveConfig(selected.id, newConfig, true);
  }

  function updateReportType(reportType: string) {
    if (!selected) return;
    const newConfig = { ...selected.config, reportType };
    saveConfig(selected.id, newConfig);
  }

  async function createTemplate() {
    try {
      const config = makeDefaultConfig();
      const result = await apiFetch(API_BASE, {
        method: "POST",
        body: JSON.stringify({ name: "Untitled Template", content: JSON.stringify(config) }),
      });
      const t = fromApi(result);
      setTemplates(prev => [...prev, t]);
      setSelectedId(t.id);
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
        body: JSON.stringify({
          name: `${src.name} (Copy)`,
          content: JSON.stringify(src.config),
          linkedChecklistIds: src.linkedChecklistIds,
          backgroundImage: src.backgroundImage ?? null,
        }),
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

  async function toggleChecklistLink(checklistId: number) {
    if (!selected) return;
    const ids = selected.linkedChecklistIds ?? [];
    const updated = ids.includes(checklistId) ? ids.filter(id => id !== checklistId) : [...ids, checklistId];
    setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, linkedChecklistIds: updated, updatedAt: new Date().toISOString() } : t));
    try {
      await apiFetch(`${API_BASE}/${selected.id}`, { method: "PUT", body: JSON.stringify({ linkedChecklistIds: updated }) });
    } catch (err) { console.error(err); }
  }

  async function toggleAllChecklists(ids: number[], allLinked: boolean) {
    if (!selected) return;
    const current = selected.linkedChecklistIds ?? [];
    const updated = allLinked ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])];
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

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  const linkedCount = selected?.linkedChecklistIds.length ?? 0;
  const enabledSectionCount = selected?.config.sections.filter(s => s.enabled).length ?? 0;

  // Migrate localStorage templates (legacy)
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
      {/* Hidden file inputs */}
      <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />

      {/* Migration banner */}
      {localCount > 0 && !templatesLoading && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <Folder className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="flex-1 text-amber-800">
            You have <strong>{localCount}</strong> template{localCount !== 1 ? "s" : ""} stored locally. Import them into the database to sync across devices.
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

        {/* ── Left: Template list ─────────────────────────────────────────────── */}
        <div className="w-56 shrink-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Templates</p>
            <button
              onClick={createTemplate}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-white text-[10px] font-semibold hover:bg-secondary/90 transition-colors shrink-0"
            >
              <Plus className="h-3 w-3" />New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-secondary border-t-transparent" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-6">
                <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No templates yet</p>
              </div>
            ) : templates.map(t => (
              <div key={t.id} className="group relative">
                {renamingId === t.id ? (
                  <div className="px-2 py-1">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                      className="w-full text-xs border border-secondary rounded px-2 py-1 focus:outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setSelectedId(t.id); setExpandedSection(null); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-start gap-2 ${
                      selectedId === t.id
                        ? "bg-secondary text-white shadow-sm"
                        : "text-sidebar hover:bg-muted/60"
                    }`}
                  >
                    <FileText className={`h-4 w-4 mt-0.5 shrink-0 ${selectedId === t.id ? "text-white" : "text-secondary"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate text-sm leading-tight">{t.name}</div>
                      <div className={`text-[10px] mt-0.5 ${selectedId === t.id ? "text-white/70" : "text-muted-foreground"}`}>
                        {formatDate(t.updatedAt)}
                      </div>
                    </div>
                  </button>
                )}
                {renamingId !== t.id && (
                  <div className={`absolute right-1 top-1 flex items-center gap-0.5 ${selectedId === t.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                    <button onClick={() => startRename(t)} title="Rename" className={`p-1 rounded ${selectedId === t.id ? "hover:bg-white/20 text-white" : "hover:bg-muted text-muted-foreground"}`}>
                      <Edit3 className="h-3 w-3" />
                    </button>
                    <button onClick={() => duplicateTemplate(t.id)} title="Duplicate" className={`p-1 rounded ${selectedId === t.id ? "hover:bg-white/20 text-white" : "hover:bg-muted text-muted-foreground"}`}>
                      <Copy className="h-3 w-3" />
                    </button>
                    <button onClick={() => deleteTemplate(t.id)} title="Delete" className={`p-1 rounded ${selectedId === t.id ? "hover:bg-red-500/30 text-white" : "hover:bg-destructive/10 text-destructive"}`}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: Section Builder ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {selected ? (
            <>
              {/* Header bar */}
              <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-3 shrink-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-sidebar truncate">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {enabledSectionCount} of {selected.config.sections.length} sections enabled
                    {saved && <span className="ml-2 text-green-600 font-medium">Saved ✓</span>}
                  </p>
                </div>
                <button
                  onClick={() => setGenerateOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-white text-xs font-semibold hover:bg-secondary/90 transition-colors shadow-sm shrink-0"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Generate Report
                </button>
              </div>

              {/* Intro */}
              <div className="px-4 pt-3 pb-1 shrink-0">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Toggle sections on or off, reorder them with the arrow buttons, and customise where applicable.
                  Reports are generated using your live inspection data — no manual editing required.
                </p>
              </div>

              {/* Sections list */}
              <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-2">
                {selected.config.sections.map((section, idx) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    index={idx}
                    total={selected.config.sections.length}
                    expanded={expandedSection === section.id}
                    onToggle={() => updateSection(section.id, { enabled: !section.enabled })}
                    onMoveUp={() => moveSection(idx, -1)}
                    onMoveDown={() => moveSection(idx, 1)}
                    onExpand={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                    onContentChange={content => updateSection(section.id, { content })}
                    backgroundImage={selected.backgroundImage}
                    onBgUpload={handleBgUpload}
                    onBgRemove={removeBgImage}
                    bgInputRef={bgInputRef}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-card rounded-xl">
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

        {/* ── Right: Settings ─────────────────────────────────────────────────── */}
        {selected && (
          <div className="w-[260px] shrink-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Settings</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Report Type */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Report Type
                </label>
                <div className="relative">
                  <select
                    value={selected.config.reportType}
                    onChange={e => updateReportType(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50 pr-7"
                  >
                    {REPORT_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Determines the report heading, styling and certification language.
                </p>
              </div>

              {/* Linked Checklists */}
              <div className="border-t border-muted/40 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Link2 className="h-3 w-3" />
                    Linked Checklists
                  </label>
                  {linkedCount > 0 && (
                    <span className="text-[10px] font-bold bg-secondary/10 text-secondary px-1.5 py-0.5 rounded-full">{linkedCount}</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
                  Link checklists so the "Generate" dialog shows only matching inspections.
                </p>
                {/* Discipline selector */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {DISCIPLINES.map(d => (
                    <button
                      key={d}
                      onClick={() => setChecklistDiscipline(d)}
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                        checklistDiscipline === d
                          ? "bg-secondary text-white border-secondary"
                          : "bg-card text-muted-foreground border-muted/60 hover:border-secondary/50 hover:text-sidebar"
                      }`}
                    >
                      {d.split(" ")[0]}
                    </button>
                  ))}
                </div>
                <div className="border-t border-muted/30 pt-2">
                  {!checklistTemplates || checklistTemplates.length === 0 ? (
                    <div className="text-center py-4">
                      <ClipboardList className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" />
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
              </div>
            </div>
          </div>
        )}
      </div>

      {generateOpen && selected && (
        <GenerateReportDialog template={selected} onClose={() => setGenerateOpen(false)} />
      )}
    </>
  );
}

// ── Page wrapper ───────────────────────────────────────────────────────────────
export default function DocTemplatesPage() {
  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Report Templates</h1>
          <p className="text-muted-foreground mt-1">Configure report sections, add custom terms, and link inspection checklists.</p>
        </div>
      </div>
      <DocTemplatesPanel />
    </AppLayout>
  );
}
