import path from "path";
import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { ObjectStorageService } from "../lib/objectStorage";
import { sendReportEmail } from "../lib/email";

const FONT_DIR         = path.join(__dirname, "..", "fonts");
const FONT_REGULAR     = path.join(FONT_DIR, "PlusJakartaSans-Regular.ttf");
const FONT_MEDIUM      = path.join(FONT_DIR, "PlusJakartaSans-Medium.ttf");
const FONT_SEMIBOLD    = path.join(FONT_DIR, "PlusJakartaSans-SemiBold.ttf");
const FONT_BOLD        = path.join(FONT_DIR, "PlusJakartaSans-Bold.ttf");
const FONT_ODDLINI_UX  = path.join(FONT_DIR, "Oddlini-MediumUltraExpanded.otf");
const F        = "PJS";
const FM       = "PJS-Medium";
const FSB      = "PJS-SemiBold";
const FB       = "PJS-Bold";
const FODDLINI = "OddliniUX";

function markdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");
}

type TextSegment = { text: string; bold: boolean; italic: boolean };
function parseInlineMarkdown(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const re = /\*\*(.*?)\*\*|\*(.*?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), bold: false, italic: false });
    if (m[1] !== undefined) segments.push({ text: m[1], bold: true, italic: false });
    else if (m[2] !== undefined) segments.push({ text: m[2], bold: false, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false, italic: false });
  return segments.length ? segments : [{ text, bold: false, italic: false }];
}

import {
  db, reportsTable, projectsTable, inspectionsTable, issuesTable,
  usersTable, checklistResultsTable, checklistItemsTable, documentsTable,
} from "@workspace/db";
import { optionalAuth, requireAuth, type AuthUser } from "../middleware/auth";

/** Returns true if the authenticated user belongs to the same org as the project creator. */
async function canAccessProjectByCreator(projectCreatedById: number, user: AuthUser): Promise<boolean> {
  if (user.isAdmin) return true;
  const adminId = (user.isAdmin || user.isCompanyAdmin) ? user.id : (user.adminUserId ? parseInt(user.adminUserId) : user.id);
  if (projectCreatedById === user.id || projectCreatedById === adminId) return true;
  const [creator] = await db.select({ adminUserId: usersTable.adminUserId }).from(usersTable).where(eq(usersTable.id, projectCreatedById));
  return !!(creator?.adminUserId && parseInt(creator.adminUserId) === adminId);
}

/** Returns true if the authenticated user may access the given report (via its project). */
async function canAccessReport(report: { projectId: number | null; generatedById?: number | null }, user: AuthUser): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!report.projectId) return report.generatedById === user.id;
  const [project] = await db.select({ createdById: projectsTable.createdById }).from(projectsTable).where(eq(projectsTable.id, report.projectId));
  if (!project) return false;
  return canAccessProjectByCreator(project.createdById, user);
}

// ── Primary colors ─────────────────────────────────────────────────────────
const COLOR_NAVY  = "#0B1933";
const COLOR_BLUE  = "#466DB5";
const COLOR_PEAR  = "#C5D92D";
const COLOR_GREY  = "#F3F4F6";

const router: IRouter = Router();

// ── Report content generator ──────────────────────────────────────────────────

const REPORT_TYPE_LABELS: Record<string, string> = {
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

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  footing: "Footing", footings: "Footings", slab: "Slab", frame: "Frame",
  pre_plaster: "Pre-Plaster", waterproofing: "Waterproofing", lock_up: "Lock-Up",
  pool_barrier: "Pool Barrier", final: "Final", special: "Special",
  preliminary: "Preliminary", progress: "Progress",
  qc_footing: "QC — Footings", qc_frame: "QC — Frame", qc_fitout: "QC — Fit-Out",
  qc_pre_handover: "QC — Pre-Handover", non_conformance: "Non-Conformance",
  hold_point: "Hold Point", daily_site: "Daily Site Diary",
  fire_safety: "Fire Safety", annual_fire_safety: "Annual Fire Safety",
  fire_active: "Active Systems", fire_passive: "Passive Systems",
  fire_egress: "Egress & Evacuation",
  se_footing_slab: "Footing & Slab",
  structural_footing_slab: "Structural — Footing & Slab",
  structural_frame: "Structural — Frame", structural_final: "Structural — Final",
  plumbing: "Plumbing", drainage: "Drainage", pressure_test: "Pressure Test",
  electrical: "Electrical", compliance: "Compliance", structural: "Structural",
  pre_purchase_building: "Building Inspection", pre_purchase_pest: "Pest Inspection",
  pre_purchase_combined: "Building & Pest",
  safety_inspection: "Safety Inspection", hazard_assessment: "Hazard Assessment",
  incident_inspection: "Incident Investigation",
};

const ROLE_LABELS: Record<string, string> = {
  admin:                "Administrator",
  certifier:            "Building Certifier / Surveyor",
  inspector:            "Inspector",
  site_inspector:       "Site Inspector",
  building_inspector:   "Building Inspector",
  staff:                "Staff",
  engineer:             "Structural Engineer",
  structural_engineer:  "Structural Engineer",
  plumber:              "Plumbing Inspector",
  plumbing_inspector:   "Plumbing Inspector",
  builder:              "Builder",
  supervisor:           "Site Supervisor",
  site_supervisor:      "Site Supervisor",
  whs:                  "WHS Officer",
  whs_officer:          "WHS Officer",
  pre_purchase:         "Pre-Purchase Inspector",
  pre_purchase_inspector: "Pre-Purchase Inspector",
  fire_engineer:        "Fire Safety Engineer",
  fire_safety_engineer: "Fire Safety Engineer",
  building_surveyor:    "Building Surveyor / Certifier",
};

function isHtmlContent(s: string): boolean {
  return s.trimStart().startsWith("<");
}

function buildHtmlChecklistTable(checklistResults: any[]): string {
  if (!checklistResults || checklistResults.length === 0) {
    return "<p style='color:#6b7280;font-style:italic;font-size:12px;'>No checklist items recorded.</p>";
  }
  const sorted = [...checklistResults].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const categories = Array.from(new Set(sorted.map(r => r.category).filter(Boolean)));
  if (categories.length === 0) categories.push("General");

  const resultStyle = (res: string | null) => {
    switch (res) {
      case "pass":    return { bg: "#f0fdf4", border: "#86efac", color: "#15803d", label: "PASS" };
      case "fail":    return { bg: "#fef2f2", border: "#fca5a5", color: "#b91c1c", label: "FAIL" };
      case "monitor": return { bg: "#fffbeb", border: "#fde68a", color: "#b45309", label: "MON" };
      case "na":      return { bg: "#f9fafb", border: "#e5e7eb", color: "#6b7280", label: "N/A" };
      default:        return { bg: "#f5f3ff", border: "#c4b5fd", color: "#7c3aed", label: "PEND" };
    }
  };

  let html = "";
  for (const cat of categories) {
    const items = sorted.filter(r => (r.category || "General") === cat);
    html += `
      <div style="margin-bottom:16px;">
        <div style="background:#e8ecf2;border-left:3px solid #466DB5;padding:5px 10px;font-size:10px;font-weight:700;color:#0B1933;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${cat}</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="text-align:left;padding:5px 8px;font-size:10px;color:#6b7280;font-weight:600;border:1px solid #e5e7eb;width:26px;">#</th>
              <th style="text-align:left;padding:5px 8px;font-size:10px;color:#6b7280;font-weight:600;border:1px solid #e5e7eb;">Item</th>
              <th style="text-align:center;padding:5px 8px;font-size:10px;color:#6b7280;font-weight:600;border:1px solid #e5e7eb;width:60px;">Result</th>
              <th style="text-align:left;padding:5px 8px;font-size:10px;color:#6b7280;font-weight:600;border:1px solid #e5e7eb;width:30%;">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((r, i) => {
              const st = resultStyle(r.result ?? null);
              const rowBg = r.result === "fail" ? "#fff5f5" : r.result === "pass" ? "#f8fffe" : "#ffffff";
              return `<tr style="background:${rowBg};">
                <td style="padding:5px 8px;font-size:11px;color:#9ca3af;font-weight:600;border:1px solid #e5e7eb;">${i + 1}</td>
                <td style="padding:5px 8px;font-size:11px;color:#111827;border:1px solid #e5e7eb;">${r.description ?? ""}${r.codeReference ? ` <span style="font-size:9px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:1px 4px;border-radius:3px;font-weight:600;">${r.codeReference}</span>` : ""}</td>
                <td style="padding:5px 8px;text-align:center;border:1px solid #e5e7eb;">
                  <span style="display:inline-block;background:${st.bg};border:1px solid ${st.border};color:${st.color};font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;">${st.label}</span>
                </td>
                <td style="padding:5px 8px;font-size:11px;color:#6b7280;border:1px solid #e5e7eb;">${r.notes ?? ""}${r.severity ? ` <span style="font-size:9px;font-weight:600;color:#b45309;">[${r.severity}]</span>` : ""}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  }
  return html;
}

function generateReportHtml(
  reportType: string,
  project: any,
  inspection: any,
  checklistResults: any[],
  issues: any[],
  inspector: any,
  storageBaseUrl?: string,
  orgInfo?: OrgInfo,
  reportOptions?: { includeCoverPage?: boolean; includeSummary?: boolean; includeSignOff?: boolean },
  certifier?: any,
): string {
  const typeLabel = REPORT_TYPE_LABELS[reportType] || reportType;
  const passItems = checklistResults.filter(i => i.result === "pass");
  const failItems = checklistResults.filter(i => i.result === "fail");
  const monitorItems = checklistResults.filter(i => i.result === "monitor");
  const naItems = checklistResults.filter(i => i.result === "na");
  const pendingItems = checklistResults.filter(i => !i.result || i.result === "pending");
  const total = checklistResults.length;
  const passRate = total > 0 && pendingItems.length === 0
    ? Math.round((passItems.length / Math.max(total - naItems.length, 1)) * 100)
    : null;
  const isPending = pendingItems.length > 0;
  const hasFails = failItems.length > 0;

  const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "—";

  const inspType = (inspection?.inspectionType || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const siteAddress = project
    ? [project.siteAddress, project.suburb, project.state, project.postcode].filter(Boolean).join(" ")
    : [inspection?.siteAddress].filter(Boolean).join(" ") || "—";

  const inspectorName = inspector
    ? `${inspector.firstName} ${inspector.lastName}`
    : inspection?.inspectorName || "—";

  const inspectionDate = formatDate(inspection?.scheduledDate);
  const issuedDate = formatDate(inspection?.completedDate || new Date().toISOString().split("T")[0]);

  const reportRef = `INS-${String(inspection?.id || 0).padStart(4, "0")}`;

  const companyName = orgInfo?.companyName || "InspectProof";
  const abnLine = orgInfo?.abn
    ? `${companyName} · ABN ${orgInfo.abn}`
    : orgInfo?.acn
    ? `${companyName} · ACN ${orgInfo.acn}`
    : companyName;

  const opts = {
    includeCoverPage: reportOptions?.includeCoverPage !== false,
    includeSummary: reportOptions?.includeSummary !== false,
    includeSignOff: reportOptions?.includeSignOff !== false,
  };

  const statusLabel = inspection?.status
    ? inspection.status.replace(/_/g, " ").toUpperCase()
    : "DRAFT";

  const statusBg: Record<string, string> = {
    draft: "#f1f5f9", approved: "#f0fdf4", sent: "#fefce8", pending_review: "#eff6ff",
  };
  const statusColor: Record<string, string> = {
    draft: "#475569", approved: "#16a34a", sent: "#b45309", pending_review: "#2563eb",
  };
  const statusBadgeBg = statusBg[inspection?.status ?? "draft"] ?? "#f1f5f9";
  const statusBadgeColor = statusColor[inspection?.status ?? "draft"] ?? "#475569";

  // Accent colors based on report type
  const accentMap: Record<string, { titleBg: string; titleBorder: string; titleColor: string; titleText: string; resultBg: string; resultBorder: string; resultColor: string }> = {
    inspection_certificate:  { titleBg: "#f9fafb", titleBorder: "#C5D92D", titleColor: "#0B1933", titleText: "Inspection Certificate", resultBg: "#f0fdf4", resultBorder: "#86efac", resultColor: "#15803d" },
    defect_notice:           { titleBg: "#fff7ed", titleBorder: "#f97316", titleColor: "#c2410c", titleText: "Defect Notice",          resultBg: "#fef2f2", resultBorder: "#fca5a5", resultColor: "#991b1b" },
    non_compliance_notice:   { titleBg: "#fef2f2", titleBorder: "#ef4444", titleColor: "#991b1b", titleText: "Non-Compliance Notice",  resultBg: "#fef2f2", resultBorder: "#fca5a5", resultColor: "#991b1b" },
    compliance_report:       { titleBg: "#f0fdf4", titleBorder: "#22c55e", titleColor: "#15803d", titleText: "Compliance Report",       resultBg: "#f0fdf4", resultBorder: "#86efac", resultColor: "#15803d" },
    quality_control_report:  { titleBg: "#eff6ff", titleBorder: "#466DB5", titleColor: "#1e40af", titleText: "Quality Control Report",  resultBg: "#eff6ff", resultBorder: "#bfdbfe", resultColor: "#1e40af" },
    safety_inspection_report:{ titleBg: "#fff7ed", titleBorder: "#f97316", titleColor: "#c2410c", titleText: "Safety Inspection Report",resultBg: "#fff7ed", resultBorder: "#fed7aa", resultColor: "#9a3412" },
    pre_purchase_report:     { titleBg: "#faf5ff", titleBorder: "#a855f7", titleColor: "#7e22ce", titleText: "Pre-Purchase Building Report", resultBg: "#faf5ff", resultBorder: "#e9d5ff", resultColor: "#6b21a8" },
  };
  const accent = accentMap[reportType] ?? {
    titleBg: "#f9fafb", titleBorder: "#466DB5", titleColor: "#0B1933", titleText: typeLabel,
    resultBg: "#f0fdf4", resultBorder: "#86efac", resultColor: "#15803d",
  };

  const overallOutcome = isPending ? "PENDING" : hasFails ? "FAIL" : "PASS";
  const overallBg = isPending ? "#f5f3ff" : hasFails ? "#fef2f2" : "#f0fdf4";
  const overallBorder = isPending ? "#c4b5fd" : hasFails ? "#fca5a5" : "#86efac";
  const overallColor = isPending ? "#6d28d9" : hasFails ? "#b91c1c" : "#15803d";

  // Result summary box
  const resultLabel = isPending
    ? "PENDING — Inspection not yet fully conducted"
    : hasFails
      ? `FAIL — ${passItems.length} Pass / ${failItems.length} Fail / ${monitorItems.length} Monitor — Non-Compliances Identified`
      : `PASS — ${passItems.length} Pass / ${failItems.length} Fail${passRate !== null ? ` (${passRate}% pass rate)` : ""}`;

  const resultBody = isPending
    ? "Some checklist items have not yet been assessed. A final result will be available once all items are completed."
    : hasFails
      ? `Non-compliances have been identified and are detailed in the checklist below. Re-inspection will be required following rectification.`
      : `This report confirms the above inspection has been carried out and the work is found to satisfy the relevant development consent and applicable standards.`;

  const resultBoxBg   = isPending ? "#f5f3ff" : hasFails ? "#fef2f2" : accent.resultBg;
  const resultBoxBdr  = isPending ? "#c4b5fd" : hasFails ? "#fca5a5" : accent.resultBorder;
  const resultBoxClr  = isPending ? "#6d28d9" : hasFails ? "#991b1b" : accent.resultColor;

  const summaryRows = [
    ["Total", String(total)],
    ["Pass", `<span style="color:#15803d;font-weight:700;">${passItems.length}</span>`],
    ["Fail", `<span style="color:#b91c1c;font-weight:700;">${failItems.length}</span>`],
    ["Monitor", `<span style="color:#b45309;font-weight:700;">${monitorItems.length}</span>`],
    ["N/A", String(naItems.length)],
    ...(pendingItems.length > 0 ? [["Pending", `<span style="color:#6d28d9;font-weight:700;">${pendingItems.length}</span>`]] : []),
    ...(passRate !== null ? [["Pass Rate", `<strong>${passRate}%</strong>`]] : []),
  ];

  const detailRows: [string, string][] = [
    ["Project Name",       project?.name || inspection?.projectName || "—"],
    ["Site Address",       siteAddress],
    ["DA / BA Number",     project?.daNumber || "—"],
    ["Certification No",   project?.certificationNumber || "—"],
    ["NCC Building Class", project?.buildingClassification || project?.nccClass || "—"],
    ...(project?.clientName  ? [["Client",              project.clientName]  as [string, string]] : []),
    ...(project?.ownerName   ? [["Owner",               project.ownerName]   as [string, string]] : []),
    ...(project?.builderName ? [["Builder",             project.builderName] as [string, string]] : []),
    ...(project?.designerName ? [["Designer / Architect", project.designerName] as [string, string]] : []),
    ...(certifier ? [["Assigned Certifier", `${certifier.firstName} ${certifier.lastName}`] as [string, string]] : []),
    ["Inspection Type",    inspType],
    ["Inspection Date",    inspectionDate],
    ["Date Issued",        issuedDate],
    ["Inspector",          inspectorName],
    ...(inspector?.profession || inspector?.role ? [["Inspector Role", inspector?.profession || ROLE_LABELS[inspector?.role ?? ""] || inspector?.role || "—"] as [string, string]] : []),
    ...(inspector?.licenceNumber ? [["Licence No.", inspector.licenceNumber] as [string, string]] : []),
    ...(orgInfo?.accreditationNumber ? [["Accreditation No.", orgInfo.accreditationNumber] as [string, string]] : []),
    ["Report Ref.",        reportRef],
    ["Status",             `<span style="background:${statusBadgeBg};color:${statusBadgeColor};font-weight:700;padding:2px 8px;border-radius:4px;font-size:11px;">${statusLabel}</span>`],
  ];

  const checklistHtml = buildHtmlChecklistTable(checklistResults);

  const failIssues = issues.filter(i => i.status !== "resolved");

  const topFailItems = [...failItems].sort((a, b) => {
    const sevOrder: Record<string, number> = { critical: 0, major: 1, high: 2, medium: 3, minor: 4, low: 5, cosmetic: 6 };
    return (sevOrder[a.severity ?? ""] ?? 7) - (sevOrder[b.severity ?? ""] ?? 7);
  }).slice(0, 5);

  const sectionHeading = (title: string) =>
    `<div style="background:#e8ecf2;border-left:3px solid #466DB5;padding:7px 14px;font-size:11px;font-weight:700;color:#0B1933;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">${title}</div>`;

  const coverPageHtml = opts.includeCoverPage ? `
  <!-- Cover Page -->
  <div style="background:#0B1933;min-height:240px;padding:40px 40px 32px;border-radius:8px 8px 0 0;position:relative;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:26px;font-weight:700;color:#C5D92D;letter-spacing:1.5px;font-family:'Courier New',monospace;">InspectProof</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${abnLine}</div>
        ${orgInfo?.address ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${orgInfo.address}</div>` : ""}
        ${orgInfo?.phone ? `<div style="font-size:10px;color:#64748b;margin-top:1px;">${orgInfo.phone}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="background:rgba(197,217,45,0.15);border:1px solid rgba(197,217,45,0.3);border-radius:6px;padding:6px 12px;display:inline-block;">
          <div style="font-size:10px;color:#94a3b8;letter-spacing:0.5px;">REPORT REF</div>
          <div style="font-size:15px;font-weight:700;color:#fff;letter-spacing:1px;">${reportRef}</div>
        </div>
      </div>
    </div>
    <div style="margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">
      <div style="font-size:28px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">${typeLabel}</div>
      <div style="font-size:16px;color:#94a3b8;margin-bottom:6px;">${project?.name || inspection?.projectName || "Inspection Report"}</div>
      <div style="font-size:13px;color:#64748b;">${siteAddress}</div>
    </div>
    <div style="display:flex;gap:24px;margin-top:28px;">
      <div>
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Inspection Date</div>
        <div style="font-size:13px;color:#cbd5e1;font-weight:600;margin-top:2px;">${inspectionDate}</div>
      </div>
      <div>
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Date Issued</div>
        <div style="font-size:13px;color:#cbd5e1;font-weight:600;margin-top:2px;">${issuedDate}</div>
      </div>
    </div>
    <div style="margin-top:20px;">
      <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Prepared By</div>
      <div style="font-size:13px;color:#cbd5e1;font-weight:600;margin-top:2px;">${inspectorName}</div>
      ${inspector?.profession || inspector?.role ? `<div style="font-size:11px;color:#64748b;">${inspector?.profession || ROLE_LABELS[inspector?.role ?? ""] || inspector?.role || ""}</div>` : ""}
      ${inspector?.licenceNumber ? `<div style="font-size:10px;color:#64748b;">Lic. No. ${inspector.licenceNumber}</div>` : ""}
    </div>
  </div>
  <!-- Cover accent bar -->
  <div style="height:5px;background:#C5D92D;"></div>` : "";

  const summaryHtml = opts.includeSummary ? `
  <!-- Executive Summary -->
  <div style="margin-bottom:20px;">
    ${sectionHeading("Executive Summary")}
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="background:${overallBg};border:2px solid ${overallBorder};border-radius:8px;padding:10px 20px;text-align:center;">
        <div style="font-size:10px;color:${overallColor};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Overall Result</div>
        <div style="font-size:22px;font-weight:700;color:${overallColor};margin-top:2px;">${overallOutcome}</div>
      </div>
      <div style="flex:1;min-width:200px;">
        <div style="font-size:12px;color:#374151;line-height:1.6;">${resultBody}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      ${summaryRows.map(([k, v]) => `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px;min-width:70px;text-align:center;">
        <div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${k}</div>
        <div style="font-size:16px;font-weight:700;color:#0B1933;margin-top:2px;">${v}</div>
      </div>`).join("")}
    </div>
    ${topFailItems.length > 0 ? `
    <div style="background:#fef9f0;border:1px solid #fde8c8;border-radius:6px;padding:10px 14px;">
      <div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:6px;">Key Findings — Items Requiring Attention</div>
      ${topFailItems.map(item => `<div style="font-size:11px;color:#374151;padding:3px 0;border-bottom:1px solid #fde8c8;">&#x2022; ${item.description || ""}${item.severity ? ` <span style="font-size:9px;color:#b45309;font-weight:700;">[${(item.severity || "").toUpperCase()}]</span>` : ""}</div>`).join("")}
    </div>` : ""}
  </div>` : "";

  const signOffHtml = opts.includeSignOff ? `
  <!-- Sign-Off Section -->
  <div style="border-top:2px solid #e5e7eb;padding-top:20px;margin-top:8px;">
    ${sectionHeading("Certification & Sign-Off")}
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:16px;">
      <div style="font-size:12px;color:#374151;line-height:1.7;margin-bottom:12px;">
        I, the undersigned, certify that I have carried out the inspection described in this report and that the findings are accurate to the best of my knowledge and belief.
      </div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:20px;margin-top:16px;">
        <div style="min-width:200px;">
          <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;padding-top:4px;"></div>
          <div style="font-size:11px;color:#6b7280;">Inspector Signature</div>
          <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">${inspectorName}</div>
          ${inspector?.profession || inspector?.role ? `<div style="font-size:11px;color:#6b7280;">${inspector?.profession || ROLE_LABELS[inspector?.role ?? ""] || ""}</div>` : ""}
          ${inspector?.licenceNumber ? `<div style="font-size:10px;color:#6b7280;">Lic. No. ${inspector.licenceNumber}</div>` : ""}
          ${inspector?.accreditationNumber ? `<div style="font-size:10px;color:#6b7280;">Acc. No. ${inspector.accreditationNumber}</div>` : ""}
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#6b7280;">Date Signed</div>
          <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">${issuedDate}</div>
        </div>
      </div>
    </div>
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Acknowledgement</div>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        ${project?.clientName ? `
        <div style="flex:1;min-width:200px;">
          <div style="font-size:11px;color:#6b7280;margin-bottom:2px;">Client: ${project.clientName}</div>
          <div style="border-top:1px solid #9ca3af;width:200px;margin-bottom:3px;"></div>
          <div style="font-size:10px;color:#9ca3af;">Signature &amp; Date</div>
        </div>` : ""}
        ${project?.builderName ? `
        <div style="flex:1;min-width:200px;">
          <div style="font-size:11px;color:#6b7280;margin-bottom:2px;">Builder: ${project.builderName}</div>
          <div style="border-top:1px solid #9ca3af;width:200px;margin-bottom:3px;"></div>
          <div style="font-size:10px;color:#9ca3af;">Signature &amp; Date</div>
        </div>` : ""}
      </div>
    </div>
  </div>` : "";

  const footerOrgLine = orgInfo?.companyName
    ? `${orgInfo.companyName}${orgInfo.abn ? ` · ABN ${orgInfo.abn}` : ""}${orgInfo.address ? ` · ${orgInfo.address}` : ""}`
    : "InspectProof";

  return `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
  ${coverPageHtml}
  <!-- Title Banner -->
  <div style="border:2px solid ${accent.titleBorder};padding:14px 32px;background:${accent.titleBg};${opts.includeCoverPage ? "" : "border-radius:8px 8px 0 0;"}">
    <div style="font-size:18px;font-weight:700;color:${accent.titleColor};letter-spacing:1px;text-align:center;text-transform:uppercase;">${accent.titleText}</div>
    <div style="text-align:center;font-size:11px;color:#466DB5;margin-top:4px;">Issued under the Environmental Planning and Assessment Act 1979</div>
    <div style="text-align:center;margin-top:6px;"><span style="background:${statusBadgeBg};color:${statusBadgeColor};font-weight:700;padding:2px 10px;border-radius:4px;font-size:11px;">${statusLabel}</span></div>
  </div>
  <!-- Body -->
  <div style="padding:24px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
    ${summaryHtml}

    <!-- Project Details -->
    <div style="margin-bottom:20px;">
      ${sectionHeading("Project Details")}
      <table style="width:100%;border-collapse:collapse;margin-bottom:0;">
        ${detailRows.map(([label, value], idx) => `
        <tr style="background:${idx % 2 === 0 ? "#f9fafb" : "#fff"};">
          <td style="padding:7px 10px;font-weight:600;color:#0B1933;width:36%;font-size:12px;border-bottom:1px solid #f1f5f9;">${label}</td>
          <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f1f5f9;">${value}</td>
        </tr>`).join("")}
      </table>
    </div>

    <!-- Result box -->
    <div style="background:${resultBoxBg};border:1px solid ${resultBoxBdr};border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      <div style="font-weight:700;color:${resultBoxClr};font-size:13px;margin-bottom:4px;">${resultLabel}</div>
      <div style="font-size:12px;color:${resultBoxClr};">${resultBody}</div>
    </div>

    ${inspection?.notes ? `
    <!-- Inspector Notes -->
    <div style="margin-bottom:20px;">
      ${sectionHeading("Inspector Notes")}
      <div style="font-size:12px;color:#374151;line-height:1.7;white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;">${inspection.notes}</div>
    </div>` : ""}

    ${failIssues.length > 0 ? `
    <!-- Open Issues / Defects -->
    <div style="margin-bottom:20px;">
      ${sectionHeading(`Open Issues / Defects (${failIssues.length})`)}
      ${failIssues.map((iss) => {
        const sevColor: Record<string, string> = { critical: "#b91c1c", major: "#c2410c", high: "#c2410c", minor: "#b45309", medium: "#b45309", low: "#15803d", cosmetic: "#6b7280" };
        const sevBg: Record<string, string> = { critical: "#fef2f2", major: "#fff7ed", high: "#fff7ed", minor: "#fffbeb", medium: "#fffbeb", low: "#f0fdf4", cosmetic: "#f9fafb" };
        const sc = sevColor[iss.severity ?? ""] ?? "#6b7280";
        const sb = sevBg[iss.severity ?? ""] ?? "#f9fafb";
        const markupImgHtml = (iss.markupFileUrl && storageBaseUrl)
          ? `<div style="margin-top:8px;"><div style="font-size:10px;color:#6b7280;font-weight:600;margin-bottom:4px;">PLAN MARKUP</div><a href="${storageBaseUrl}${iss.markupFileUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;color:#1d4ed8;font-size:11px;font-weight:600;text-decoration:none;">&#128196; View Annotated Plan (PDF)</a></div>`
          : "";
        return `<div style="background:${sb};border-left:3px solid ${sc};padding:8px 12px;margin-bottom:8px;border-radius:0 4px 4px 0;">
          <div style="font-size:11px;font-weight:700;color:${sc};text-transform:uppercase;">${iss.severity || "Issue"} — ${iss.category || ""}</div>
          <div style="font-size:12px;color:#111827;margin-top:2px;">${iss.description || ""}</div>
          ${iss.location ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">Location: ${iss.location}</div>` : ""}
          ${iss.nccReference ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">NCC: ${iss.nccReference}</div>` : ""}
          ${iss.recommendedAction ? `<div style="font-size:10px;color:#374151;margin-top:4px;font-weight:600;">Recommended: ${iss.recommendedAction}</div>` : ""}
          ${iss.responsibleParty ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">Responsible Party: ${iss.responsibleParty}</div>` : ""}
          ${markupImgHtml}
        </div>`;
      }).join("")}
    </div>` : ""}

    <!-- Checklist -->
    <div style="margin-bottom:24px;">
      ${sectionHeading("Inspection Checklist — Full Results")}
      ${checklistHtml}
    </div>

    ${signOffHtml}
  </div>
  <!-- Footer -->
  <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
    <div>${footerOrgLine} · ${project?.name || inspection?.projectName || ""} · ${issuedDate}</div>
    ${orgInfo?.reportFooterText ? `<div style="margin-top:4px;font-size:9px;color:#6B7280;">${markdownToHtml(orgInfo.reportFooterText)}</div>` : ""}
  </div>
</div>`;
}

async function generateReportContent(
  reportType: string,
  project: any,
  inspection: any,
  checklistResults: any[],
  issues: any[],
  inspector: any,
  certifier?: any,
): Promise<string> {
  const typeLabel = REPORT_TYPE_LABELS[reportType] || reportType;
  const passItems = checklistResults.filter(i => i.result === "pass");
  const failItems = checklistResults.filter(i => i.result === "fail");
  const naItems = checklistResults.filter(i => i.result === "na");
  const pendingItems = checklistResults.filter(i => !i.result || i.result === "pending");
  const total = checklistResults.length;
  const passRate = total > 0 && pendingItems.length === 0 ? Math.round((passItems.length / Math.max(total - naItems.length, 1)) * 100) : null;
  const overallResult = pendingItems.length > 0 ? "PENDING — Inspection not yet conducted" : failItems.length > 0 ? "FAIL" : passItems.length > 0 ? "PASS" : "PENDING";

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" }) : "—";

  const inspType = (inspection?.inspectionType || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const siteAddress = project
    ? [project.siteAddress, project.suburb, project.state, project.postcode].filter(Boolean).join(" ")
    : [inspection?.siteAddress, inspection?.suburb].filter(Boolean).join(" ") || "—";

  let content = `${typeLabel.toUpperCase()}
${"=".repeat(typeLabel.length)}

DOCUMENT REFERENCE: ${project?.certificationNumber || "—"}
DATE ISSUED: ${formatDate(inspection?.completedDate || new Date().toISOString().split("T")[0])}
PREPARED BY: ${inspector ? `${inspector.firstName} ${inspector.lastName}` : "—"}
INSPECTOR QUALIFICATIONS: ${ROLE_LABELS[inspector?.role ?? ""] || inspector?.role || "Built Environment Professional"}

────────────────────────────────────────────────────────
PROJECT DETAILS
────────────────────────────────────────────────────────
Project Name:         ${project?.name || inspection?.siteAddress || "Standalone Inspection"}
Site Address:         ${siteAddress}
DA / Approval No:     ${project?.daNumber || "—"}
Certification No:     ${project?.certificationNumber || "—"}
Building Class:       ${project?.buildingClassification || inspection?.buildingClassification || "—"}
Client / Owner:       ${project?.clientName || inspection?.clientName || "—"}
Builder:              ${project?.builderName || "—"}
Designer / Architect:  ${project?.designerName || "—"}

────────────────────────────────────────────────────────
INSPECTION DETAILS
────────────────────────────────────────────────────────
Inspection Type:      ${inspType}
Inspection Date:      ${formatDate(inspection?.scheduledDate)}
Completion Date:      ${formatDate(inspection?.completedDate)}
Weather Conditions:   ${inspection?.weatherConditions || "Not recorded"}
Duration:             ${inspection?.duration ? `${inspection.duration} minutes` : "Not recorded"}
Inspector:            ${inspector ? `${inspector.firstName} ${inspector.lastName}` : "—"}
Inspector Role:       ${ROLE_LABELS[inspector?.role ?? ""] || inspector?.role || "Built Environment Professional"}${inspector?.licenceNumber ? `
Licence No.:          ${inspector.licenceNumber}` : ""}${certifier ? `
Council / Certifier:  ${certifier.firstName} ${certifier.lastName}` : ""}
`;

  const monitorItems = checklistResults.filter(i => i.result === "monitor");

  // ── Helper: grouped checklist block ────────────────────────────────────────
  const groupedChecklistBlock = (items: any[], heading = "DETAILED CHECKLIST RESULTS") => {
    if (items.length === 0) return "";
    const grouped: Record<string, any[]> = {};
    items.forEach(item => {
      const cat = item.category || "General";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    let block = `\n────────────────────────────────────────────────────────\n${heading}\n────────────────────────────────────────────────────────\n`;
    Object.entries(grouped).forEach(([cat, its]) => {
      block += `\n${cat.toUpperCase()}\n${"-".repeat(cat.length)}\n`;
      its.forEach((item, idx) => {
        const icon = item.result === "pass" ? "✓ PASS" : item.result === "fail" ? "✗ FAIL" : item.result === "monitor" ? "◎ MONITOR" : item.result === "pending" ? "○ PENDING" : "— N/A";
        block += `${idx + 1}. [${icon}] ${item.description}\n`;
        if (item.codeReference) block += `   Code Ref: ${item.codeReference}\n`;
        if (item.severity)      block += `   Severity: ${item.severity.toUpperCase()}\n`;
        if (item.location)      block += `   Location: ${item.location}\n`;
        if (item.tradeAllocated) block += `   Trade: ${item.tradeAllocated}\n`;
        if (item.recommendedAction) block += `   Recommended Action: ${item.recommendedAction}\n`;
        if (item.notes)         block += `   Notes: ${item.notes}\n`;
        if (item.photoCount > 0) block += `   Photos: ${item.photoCount} photo(s) attached — see images below\n`;
      });
    });
    return block;
  };

  // ── Helper: defects / non-conformance block ─────────────────────────────────
  const defectsBlock = (heading: string, actionLabel: string) => {
    if (failItems.length === 0 && monitorItems.length === 0) return "";
    let block = `\n────────────────────────────────────────────────────────\n${heading}\n────────────────────────────────────────────────────────\n`;
    [...failItems, ...monitorItems].forEach((item, idx) => {
      block += `\nItem ${idx + 1}: ${item.description}\n`;
      if (item.severity)          block += `  Severity: ${item.severity.toUpperCase()}\n`;
      if (item.location)          block += `  Location: ${item.location}\n`;
      if (item.tradeAllocated)    block += `  Trade Allocated: ${item.tradeAllocated}\n`;
      if (item.codeReference)     block += `  Code Reference: ${item.codeReference}\n`;
      if (item.recommendedAction) block += `  Recommended Action: ${item.recommendedAction}\n`;
      if (item.notes)             block += `  Inspector Notes: ${item.notes}\n`;
      block += `  ${actionLabel}\n`;
    });
    return block;
  };

  // ── Content sections per report type ───────────────────────────────────────
  // Each type block provides:
  //   1. A type-appropriate summary of results
  //   2. Defects / non-conformance highlight block (when fails/monitors exist)
  //   3. INSPECTION CHECKLIST — FULL RESULTS (all items, always shown)

  if (reportType === "defect_notice" || reportType === "non_compliance_notice") {
    const heading = reportType === "non_compliance_notice" ? "NON-COMPLIANCE ITEMS" : "DEFECTS & NON-COMPLIANT ITEMS";
    const action  = reportType === "non_compliance_notice"
      ? "Action Required: Rectification required within 14 days; notify certifier upon completion."
      : "Action Required: Rectification required prior to re-inspection.";
    content += `
────────────────────────────────────────────────────────
INSPECTION RESULTS SUMMARY
────────────────────────────────────────────────────────
Total Items Assessed: ${total}
Pass:                 ${passItems.length}
Monitor:              ${monitorItems.length}
Fail:                 ${failItems.length}
Not Applicable:       ${naItems.length}${pendingItems.length > 0 ? `
Pending:              ${pendingItems.length}` : ""}
Pass Rate:            ${passRate !== null ? `${passRate}%` : "—"}
Overall Result:       ${overallResult}
`;
    content += defectsBlock(heading, action);
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "inspection_certificate" || reportType === "compliance_report" || reportType === "summary") {
    content += `
────────────────────────────────────────────────────────
INSPECTION RESULTS SUMMARY
────────────────────────────────────────────────────────
Total Items Assessed: ${total}
Compliant:            ${passItems.length}
Non-Compliant:        ${failItems.length}
Monitor:              ${monitorItems.length}
Not Applicable:       ${naItems.length}${pendingItems.length > 0 ? `
Pending:              ${pendingItems.length}` : ""}
Compliance Rate:      ${passRate !== null ? `${passRate}%` : "—"}
Overall Result:       ${overallResult}
`;
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("DEFECTS IDENTIFIED", "Action Required: Rectification required prior to re-inspection.");
    }
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "quality_control_report") {
    content += `
────────────────────────────────────────────────────────
QUALITY CONTROL RESULTS SUMMARY
────────────────────────────────────────────────────────
Total QC Items:       ${total}
Conforming:           ${passItems.length}
Non-Conforming:       ${failItems.length}
Under Observation:    ${monitorItems.length}
Not Applicable:       ${naItems.length}
Conformance Rate:     ${passRate !== null ? `${passRate}%` : "—"}
QC Outcome:           ${failItems.length === 0 ? "CONFORMING" : "NON-CONFORMING — Action Required"}
`;
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("NON-CONFORMING ITEMS", "Action Required: Corrective work required before sign-off.");
    }
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "non_conformance_report") {
    content += `
────────────────────────────────────────────────────────
NON-CONFORMANCE SUMMARY
────────────────────────────────────────────────────────
Total Items Assessed: ${total}
Conforming:           ${passItems.length}
Non-Conforming:       ${failItems.length}
Under Observation:    ${monitorItems.length}
Pass Rate:            ${passRate !== null ? `${passRate}%` : "—"}
`;
    content += defectsBlock("NON-CONFORMANCES IDENTIFIED", "Required Action: Corrective measure to be implemented per project specification and relevant standard.");
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "safety_inspection_report") {
    content += `
────────────────────────────────────────────────────────
WHS INSPECTION SUMMARY
────────────────────────────────────────────────────────
Total Safety Items:   ${total}
Compliant:            ${passItems.length}
Non-Compliant:        ${failItems.length}
Monitor / Caution:    ${monitorItems.length}
Not Applicable:       ${naItems.length}
Compliance Rate:      ${passRate !== null ? `${passRate}%` : "—"}
Safety Outcome:       ${failItems.length === 0 ? "COMPLIANT" : "NON-COMPLIANT — Immediate Action Required"}
`;
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("WHS BREACHES & CAUTIONS", "Required Action: Immediate rectification required under WHS Act 2011.");
    }
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "hazard_assessment_report") {
    content += `
────────────────────────────────────────────────────────
HAZARD ASSESSMENT SUMMARY
────────────────────────────────────────────────────────
Total Hazard Items:   ${total}
Acceptable:           ${passItems.length}
Hazards Identified:   ${failItems.length}
Monitor:              ${monitorItems.length}
Not Applicable:       ${naItems.length}
Risk Outcome:         ${failItems.length === 0 ? "ACCEPTABLE RISK" : "UNACCEPTABLE RISK — Action Required"}
`;
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("IDENTIFIED HAZARDS REQUIRING CONTROL", "Required Control Measure: Implement risk control(s) per hierarchy of controls before works resume.");
    }
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "corrective_action_report") {
    content += `
────────────────────────────────────────────────────────
CORRECTIVE ACTION SUMMARY
────────────────────────────────────────────────────────
Total Items Reviewed: ${total}
Closed Out:           ${passItems.length}
Open / Pending:       ${failItems.length}
Under Monitoring:     ${monitorItems.length}
`;
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("OPEN CORRECTIVE ACTIONS", "Status: Open — Corrective action required. Notify site supervisor upon completion.");
    }
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "pre_purchase_report") {
    const critical = failItems.filter(i => i.severity === "critical");
    const major    = failItems.filter(i => i.severity === "major" || (!i.severity && i.result === "fail"));
    const minor    = failItems.filter(i => i.severity === "minor" || i.severity === "cosmetic");
    const conditionRating = failItems.length === 0 ? "GOOD" : critical.length > 0 ? "POOR — Immediate attention required" : major.length > 2 ? "FAIR — Significant defects present" : "FAIR — Minor defects present";

    content += `
────────────────────────────────────────────────────────
PRE-PURCHASE INSPECTION SUMMARY
────────────────────────────────────────────────────────
Total Items Inspected: ${total}
Satisfactory:          ${passItems.length}
Requires Attention:    ${monitorItems.length}
Defects Found:         ${failItems.length}
  — Critical:          ${critical.length}
  — Major:             ${major.length}
  — Minor/Cosmetic:    ${minor.length}
Not Applicable:        ${naItems.length}
Overall Condition:     ${conditionRating}

IMPORTANT NOTICE: This report represents the condition of the property
as observed at the time of inspection. Concealed defects not observable
without destructive investigation are excluded. This report is prepared
for the exclusive use of the client named above.
`;
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("DEFECTS & ITEMS REQUIRING ATTENTION", "Recommended Action: Obtain specialist quotation before settlement.");
    }
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "annual_fire_safety") {
    content += `
────────────────────────────────────────────────────────
ANNUAL FIRE SAFETY STATEMENT
────────────────────────────────────────────────────────
Statement Reference:   ${project?.certificationNumber || "—"}
Building Address:      ${siteAddress}
Building Class:        ${project?.buildingClassification || inspection?.buildingClassification || "—"}

ESSENTIAL FIRE SAFETY MEASURES ASSESSMENT
────────────────────────────────────────────────────────
Total Measures Assessed: ${total}
Compliant:               ${passItems.length}
Non-Compliant:           ${failItems.length}
Under Observation:       ${monitorItems.length}
Not Applicable:          ${naItems.length}
Overall Compliance:      ${failItems.length === 0 ? "COMPLIANT" : "NON-COMPLIANT"}
`;
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("NON-COMPLIANT FIRE SAFETY MEASURES", "Action Required: Rectification required within 14 days. Council must be notified of non-compliance.");
    }
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "fire_inspection_report") {
    content += `
────────────────────────────────────────────────────────
FIRE SAFETY INSPECTION FINDINGS
────────────────────────────────────────────────────────
Total Items Inspected: ${total}
Compliant:             ${passItems.length}
Non-Compliant:         ${failItems.length}
Monitor:               ${monitorItems.length}
Not Applicable:        ${naItems.length}
Compliance Rate:       ${passRate !== null ? `${passRate}%` : "—"}
Inspection Outcome:    ${failItems.length === 0 ? "COMPLIANT" : "NON-COMPLIANT — Action Required"}
`;
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("NON-COMPLIANT FIRE SAFETY ITEMS", "Required Action: Rectification required prior to re-inspection. Do not occupy if fire egress is compromised.");
    }
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  // ── Fallback: ensure any unrecognised/future report type still gets a full checklist ──
  const HANDLED_TYPES = new Set([
    "defect_notice", "non_compliance_notice", "inspection_certificate",
    "compliance_report", "summary", "quality_control_report",
    "non_conformance_report", "safety_inspection_report",
    "hazard_assessment_report", "corrective_action_report",
    "pre_purchase_report", "annual_fire_safety", "fire_inspection_report",
  ]);
  if (!HANDLED_TYPES.has(reportType)) {
    content += `
────────────────────────────────────────────────────────
INSPECTION RESULTS SUMMARY
────────────────────────────────────────────────────────
Total Items Assessed: ${total}
Pass:                 ${passItems.length}
Monitor:              ${monitorItems.length}
Fail:                 ${failItems.length}
Not Applicable:       ${naItems.length}${pendingItems.length > 0 ? `
Pending:              ${pendingItems.length}` : ""}
Pass Rate:            ${passRate !== null ? `${passRate}%` : "—"}
Overall Result:       ${overallResult}
`;
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("DEFECTS IDENTIFIED", "Action Required: Rectification required prior to re-inspection.");
    }
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (inspection?.notes) {
    content += `\n────────────────────────────────────────────────────────\nINSPECTOR NOTES\n────────────────────────────────────────────────────────\n${inspection.notes}\n`;
  }

  content += `
────────────────────────────────────────────────────────
CERTIFICATION
────────────────────────────────────────────────────────
`;

  if (reportType === "inspection_certificate") {
    content += overallResult === "PASS"
      ? `I hereby certify that the above-referenced work has been inspected and complies with the requirements of the National Construction Code and the relevant conditions of the Development Approval / Construction Certificate.`
      : `I hereby certify that the above-referenced work has been inspected. Non-compliances have been identified and are detailed in this report. Re-inspection will be required following rectification works.`;
  } else if (reportType === "non_compliance_notice") {
    content += `This Non-Compliance Notice is issued pursuant to the Environmental Planning and Assessment Act 1979 / Building Act. The responsible party is required to rectify all identified non-compliances within the specified timeframe and notify the certifier upon completion.`;
  } else if (reportType === "defect_notice") {
    content += `This Defect Notice is issued to advise that defects have been identified during the above inspection. All defects must be rectified and a re-inspection arranged prior to proceeding to the next stage of construction.`;
  } else if (reportType === "quality_control_report") {
    content += `I confirm that the above Quality Control inspection was carried out in accordance with the approved Quality Management Plan. All non-conformances must be closed out before the next stage of works commences.`;
  } else if (reportType === "non_conformance_report") {
    content += `This Non-Conformance Report has been prepared in accordance with the Project Quality Plan. All identified non-conformances must be reviewed and corrective actions implemented within the timeframe agreed with the project team.`;
  } else if (reportType === "safety_inspection_report") {
    content += `This WHS Inspection has been conducted in accordance with the Work Health and Safety Act 2011 and the applicable Safe Work Method Statements. All identified non-compliances must be rectified immediately.`;
  } else if (reportType === "hazard_assessment_report") {
    content += `This Hazard Assessment was conducted in accordance with the WHS Act 2011 and AS/NZS ISO 31000. All identified hazards must have appropriate controls implemented prior to the commencement or continuation of works.`;
  } else if (reportType === "corrective_action_report") {
    content += `This Corrective Action Report documents the status of all identified corrective actions. Open items must be closed by the responsible party within the agreed timeframe.`;
  } else if (reportType === "pre_purchase_report") {
    content += `This Pre-Purchase Building Inspection Report has been prepared in accordance with AS 4349.1-2007 Inspection of Buildings. The report is intended solely for the use of the commissioning client. This report does not represent an approval of the property for purchase.`;
  } else if (reportType === "annual_fire_safety") {
    content += `I, the undersigned accredited fire safety practitioner, certify that each essential fire safety measure installed in the above building has been assessed by a suitably qualified person and found to be capable of performing to the standard required by the current fire safety schedule.`;
  } else if (reportType === "fire_inspection_report") {
    content += `This Fire Safety Inspection Report has been prepared in accordance with the Environmental Planning and Assessment (Development Certification and Fire Safety) Regulation 2021. All identified non-compliances must be rectified within 14 days.`;
  } else {
    content += `This report has been prepared based on a site inspection conducted on the date noted above. All findings are based on conditions observed at the time of inspection.`;
  }

  content += `

Inspector Signature: {{SIGNATURE}}
Name: ${inspector ? `${inspector.firstName} ${inspector.lastName}` : "—"}
Date: ${formatDate(inspection?.completedDate || new Date().toISOString().split("T")[0])}

This document is issued by InspectProof.
`;

  return content;
}

// ── Formatters ────────────────────────────────────────────────────────────────

async function formatReport(r: any) {
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, r.projectId));
  const pName = projects[0]?.name || "Unknown";

  let generatedByName = "Unknown";
  if (r.generatedById) {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, r.generatedById));
    if (users[0]) generatedByName = `${users[0].firstName} ${users[0].lastName}`;
  }

  return {
    id: r.id,
    projectId: r.projectId,
    inspectionId: r.inspectionId,
    title: r.title,
    reportType: r.reportType,
    reportTypeLabel: REPORT_TYPE_LABELS[r.reportType] || r.reportType,
    status: r.status,
    content: r.content,
    sentTo: r.sentTo,
    sentAt: r.sentAt instanceof Date ? r.sentAt.toISOString() : r.sentAt,
    submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : r.submittedAt,
    generatedById: r.generatedById,
    generatedByName,
    projectName: pName,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/", optionalAuth, async (req, res) => {
  try {
    const { projectId, inspectionId } = req.query;
    let reports = await db.select().from(reportsTable)
      .orderBy(sql`${reportsTable.createdAt} DESC`);

    // Scope to user-owned projects (admins see all; unauthenticated see nothing)
    if (req.authUser && !req.authUser.isAdmin) {
      const ownedProjects = await db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(eq(projectsTable.createdById, req.authUser.id));
      const ownedIds = new Set(ownedProjects.map(p => p.id));
      reports = reports.filter(r => r.projectId !== null && ownedIds.has(r.projectId));
    } else if (!req.authUser) {
      reports = [];
    }

    if (projectId) reports = reports.filter(r => r.projectId === parseInt(projectId as string));
    if (inspectionId) reports = reports.filter(r => r.inspectionId === parseInt(inspectionId as string));

    const result = await Promise.all(reports.map(formatReport));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List reports error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Generate report content from inspection data and save as draft
router.post("/generate", requireAuth, async (req, res) => {
  try {
    const { inspectionId, reportType, userId, includeCoverPage, includeSummary, includeSignOff } = req.body;
    const reportOptions = {
      includeCoverPage: includeCoverPage !== false,
      includeSummary: includeSummary !== false,
      includeSignOff: includeSignOff !== false,
    };

    const inspections = await db.select().from(inspectionsTable)
      .where(eq(inspectionsTable.id, parseInt(inspectionId)));
    const inspection = inspections[0];
    if (!inspection) { res.status(404).json({ error: "inspection_not_found" }); return; }

    const projects = inspection.projectId
      ? await db.select().from(projectsTable).where(eq(projectsTable.id, inspection.projectId))
      : [];
    const project = projects[0] || null;

    const checklistRows = await db.select({
      result: checklistResultsTable,
      item: checklistItemsTable,
    }).from(checklistResultsTable)
      .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
      .where(eq(checklistResultsTable.inspectionId, inspection.id));

    let checklistResults = checklistRows.map(r => {
      let photoCount = 0;
      if (r.result.photoUrls) {
        try {
          const parsed = Array.isArray(r.result.photoUrls) ? r.result.photoUrls : JSON.parse(r.result.photoUrls as string);
          photoCount = parsed.length;
        } catch { photoCount = 0; }
      }
      return {
        result: r.result.result,
        notes: r.result.notes,
        severity: r.result.severity,
        location: r.result.location,
        tradeAllocated: r.result.tradeAllocated,
        recommendedAction: r.result.recommendedAction,
        photoCount,
        category: r.item.category,
        description: r.item.description,
        codeReference: r.item.codeReference,
        riskLevel: r.item.riskLevel,
      };
    });

    // If no results yet but a template is linked, fall back to template items as "pending"
    if (checklistResults.length === 0 && inspection.checklistTemplateId) {
      const templateItems = await db.select().from(checklistItemsTable)
        .where(eq(checklistItemsTable.templateId, inspection.checklistTemplateId))
        .orderBy(checklistItemsTable.orderIndex);
      checklistResults = templateItems.map(item => ({
        result: "pending" as any,
        notes: null,
        severity: null,
        location: null,
        tradeAllocated: null,
        recommendedAction: null,
        photoCount: 0,
        category: item.category,
        description: item.description,
        codeReference: item.codeReference,
        riskLevel: item.riskLevel,
      }));
    }

    const rawIssues = await db.select().from(issuesTable)
      .where(eq(issuesTable.inspectionId, inspection.id));

    // Enrich issues with the markup file URL from linked documents
    const issues = await Promise.all(rawIssues.map(async (iss) => {
      if (!iss.markupDocumentId) return iss;
      const [doc] = await db.select({ fileUrl: documentsTable.fileUrl }).from(documentsTable)
        .where(eq(documentsTable.id, iss.markupDocumentId));
      return { ...iss, markupFileUrl: doc?.fileUrl ?? null };
    }));

    let inspector: any = null;
    if (inspection.inspectorId) {
      const users = await db.select().from(usersTable).where(eq(usersTable.id, inspection.inspectorId));
      inspector = users[0] || null;
    }

    let certifierForHtml: any = null;
    const certifierIdForHtml = project?.assignedCertifierId ?? null;
    if (certifierIdForHtml) {
      const cRows = await db.select().from(usersTable).where(eq(usersTable.id, certifierIdForHtml));
      certifierForHtml = cRows[0] ?? null;
    }

    const inspType = inspection.inspectionType
      ? (INSPECTION_TYPE_LABELS[inspection.inspectionType]
          || inspection.inspectionType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()))
      : "";

    const typeLabel = REPORT_TYPE_LABELS[reportType] || reportType;
    const projectLabel = project?.name ?? "Standalone Inspection";
    const title = inspType
      ? `${typeLabel} — ${inspType} — ${projectLabel}`
      : `${typeLabel} — ${projectLabel}`;

    // Build a storage base URL so the report HTML can reference markup images directly
    const storageBaseUrl = req.protocol + "://" + req.get("host") + "/api/storage";

    // Fetch org info for branding in the HTML report
    // Priority: inspection's assigned inspector → authenticated user (fallback when no inspector)
    let generateOrgInfo: OrgInfo | undefined;
    const orgLookupId = inspection.inspectorId ?? req.authUser!.id;
    if (orgLookupId) {
      try {
        const [inspUser] = await db.select({
          companyName: usersTable.companyName,
          abn: usersTable.abn,
          acn: usersTable.acn,
          companyAddress: usersTable.companyAddress,
          companySuburb: usersTable.companySuburb,
          companyState: usersTable.companyState,
          companyPhone: usersTable.companyPhone,
          accreditationNumber: usersTable.accreditationNumber,
          reportFooterText: usersTable.reportFooterText,
          isCompanyAdmin: usersTable.isCompanyAdmin,
          adminUserId: usersTable.adminUserId,
        }).from(usersTable).where(eq(usersTable.id, orgLookupId));
        let orgUser = inspUser;
        if (inspUser && !inspUser.isCompanyAdmin && inspUser.adminUserId) {
          const adminId = parseInt(inspUser.adminUserId);
          if (!isNaN(adminId)) {
            const [adminRec] = await db.select({
              companyName: usersTable.companyName,
              abn: usersTable.abn,
              acn: usersTable.acn,
              companyAddress: usersTable.companyAddress,
              companySuburb: usersTable.companySuburb,
              companyState: usersTable.companyState,
              companyPhone: usersTable.companyPhone,
              accreditationNumber: usersTable.accreditationNumber,
              reportFooterText: usersTable.reportFooterText,
              isCompanyAdmin: usersTable.isCompanyAdmin,
              adminUserId: usersTable.adminUserId,
            }).from(usersTable).where(eq(usersTable.id, adminId));
            if (adminRec) orgUser = adminRec;
          }
        }
        if (orgUser) {
          const addrParts = [orgUser.companyAddress, orgUser.companySuburb, orgUser.companyState].filter(Boolean);
          generateOrgInfo = {
            companyName: orgUser.companyName || undefined,
            abn: orgUser.abn || undefined,
            acn: orgUser.acn || undefined,
            address: addrParts.length ? addrParts.join(", ") : undefined,
            phone: orgUser.companyPhone || undefined,
            accreditationNumber: orgUser.accreditationNumber || undefined,
            reportFooterText: orgUser.reportFooterText || undefined,
          };
        }
      } catch { /* ignore org fetch errors */ }
    }

    const content = generateReportHtml(reportType, project, inspection, checklistResults, issues, inspector, storageBaseUrl, generateOrgInfo, reportOptions, certifierForHtml);

    // Check if a report already exists for this inspection + reportType.
    // If so, regenerate it in place (update content, reset to draft) rather
    // than creating a duplicate.
    const existing = await db.select().from(reportsTable)
      .where(and(
        eq(reportsTable.inspectionId, inspection.id),
        eq(reportsTable.reportType, reportType),
      ));

    let report;
    if (existing.length > 0) {
      const [updated] = await db.update(reportsTable)
        .set({ title, content, status: "draft", generatedById: userId || 1, reportOptions })
        .where(eq(reportsTable.id, existing[0].id))
        .returning();
      report = updated;
    } else {
      const [inserted] = await db.insert(reportsTable).values({
        projectId: project?.id ?? null,
        inspectionId: inspection.id,
        title,
        reportType,
        status: "draft",
        content,
        generatedById: userId || 1,
        reportOptions,
      }).returning();
      report = inserted;
    }

    res.status(existing.length > 0 ? 200 : 201).json(await formatReport(report));
  } catch (err) {
    req.log.error({ err }, "Generate report error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const data = req.body;
    const generatedById = data.generatedById ?? data.userId ?? req.authUser!.id;
    const [report] = await db.insert(reportsTable).values({
      projectId: data.projectId,
      inspectionId: data.inspectionId,
      title: data.title,
      reportType: data.reportType || "summary",
      status: "draft",
      content: data.content,
      generatedById,
    }).returning();

    res.status(201).json(await formatReport(report));
  } catch (err) {
    req.log.error({ err }, "Create report error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const reports = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    const report = reports[0];
    if (!report) { res.status(404).json({ error: "not_found" }); return; }
    if (!await canAccessReport(report, req.authUser!)) {
      res.status(403).json({ error: "forbidden" }); return;
    }
    res.json(await formatReport(report));
  } catch (err) {
    req.log.error({ err }, "Get report error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Submit report for desktop review
router.post("/:id/submit", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    if (!report) { res.status(404).json({ error: "not_found" }); return; }
    if (!await canAccessReport(report, req.authUser!)) {
      res.status(403).json({ error: "forbidden" }); return;
    }
    const [updated] = await db.update(reportsTable)
      .set({ status: "pending_review", submittedAt: new Date() })
      .where(eq(reportsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json(await formatReport(updated));
  } catch (err) {
    req.log.error({ err }, "Submit report error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Approve report (certifier review complete)
router.post("/:id/approve", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    if (!report) { res.status(404).json({ error: "not_found" }); return; }
    if (!await canAccessReport(report, req.authUser!)) {
      res.status(403).json({ error: "forbidden" }); return;
    }
    const [updated] = await db.update(reportsTable)
      .set({ status: "approved" })
      .where(eq(reportsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json(await formatReport(updated));
  } catch (err) {
    req.log.error({ err }, "Approve report error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Send report directly to client
router.post("/:id/send", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { sentTo, recipientName } = req.body;
    if (!sentTo) { res.status(400).json({ error: "sentTo_required", message: "Recipient email is required" }); return; }

    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    if (!report) { res.status(404).json({ error: "not_found" }); return; }
    if (!await canAccessReport(report, req.authUser!)) {
      res.status(403).json({ error: "forbidden" }); return;
    }

    // Look up project and sender
    const [project] = report.projectId
      ? await db.select().from(projectsTable).where(eq(projectsTable.id, report.projectId))
      : [null];

    // Use authenticated user as sender
    const [senderUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.authUser!.id));

    const senderName = senderUser
      ? `${senderUser.firstName ?? ""} ${senderUser.lastName ?? ""}`.trim() || senderUser.email
      : "InspectProof";
    const senderCompany = senderUser?.companyName || undefined;

    // Generate PDF buffer (without photos for email attachment)
    let pdfBuffer: Buffer | undefined;
    try {
      let formatted = await formatReport(report);

      // If the stored content is HTML, regenerate as plain text for pdfkit
      if (isHtmlContent(formatted.content || "") && report.inspectionId) {
        try {
          const inspRows = await db.select().from(inspectionsTable)
            .where(eq(inspectionsTable.id, report.inspectionId));
          const insp = inspRows[0] ?? null;
          if (insp) {
            const clRows = await db.select({ result: checklistResultsTable, item: checklistItemsTable })
              .from(checklistResultsTable)
              .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
              .where(eq(checklistResultsTable.inspectionId, insp.id));
            const clResults = clRows.map(r => ({
              result: r.result.result, notes: r.result.notes, severity: r.result.severity,
              location: r.result.location, tradeAllocated: r.result.tradeAllocated,
              recommendedAction: r.result.recommendedAction, photoCount: 0,
              category: r.item.category, description: r.item.description,
              codeReference: r.item.codeReference, riskLevel: r.item.riskLevel,
              orderIndex: r.item.orderIndex,
            }));
            let inspectorForPdf: any = null;
            if (insp.inspectorId) {
              const uRows = await db.select().from(usersTable).where(eq(usersTable.id, insp.inspectorId));
              inspectorForPdf = uRows[0] ?? null;
            }
            let certifierForPdf: any = null;
            const certifierId = project?.assignedCertifierId ?? null;
            if (certifierId) {
              const cRows = await db.select().from(usersTable).where(eq(usersTable.id, certifierId));
              certifierForPdf = cRows[0] ?? null;
            }
            const issRows = await db.select().from(issuesTable).where(eq(issuesTable.inspectionId, insp.id));
            const plainText = await generateReportContent(report.reportType || "summary", project ?? null, insp, clResults, issRows, inspectorForPdf, certifierForPdf);
            formatted = { ...formatted, content: plainText };
          }
        } catch (convErr) {
          req.log.warn({ convErr }, "Could not convert HTML report to plain text for PDF — using stored content");
        }
      }

      const doc = buildPdf(formatted, project ?? null);
      pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        doc.end();
      });
    } catch (pdfErr) {
      req.log.warn({ pdfErr }, "Could not generate PDF for email attachment — sending without attachment");
    }

    // Send the email via Resend
    try {
      await sendReportEmail({
        to: sentTo,
        recipientName: recipientName || undefined,
        reportTitle: report.title || "Inspection Report",
        reportType: report.reportType || "summary",
        projectName: project?.name || "Unknown Project",
        projectAddress: project
          ? [project.siteAddress, project.suburb, project.state, project.postcode].filter(Boolean).join(", ") || undefined
          : undefined,
        senderName,
        senderCompany,
        reportId: id,
        pdfBuffer,
        log: req.log as any,
      });
    } catch (emailErr) {
      req.log.error({ emailErr, to: sentTo }, "Failed to send report email");
      res.status(500).json({ error: "email_failed", message: "Report status updated but email delivery failed. Please try again." });
      return;
    }

    const [updated] = await db.update(reportsTable)
      .set({ status: "sent", sentAt: new Date(), sentTo })
      .where(eq(reportsTable.id, id))
      .returning();

    res.json(await formatReport(updated));
  } catch (err) {
    req.log.error({ err }, "Send report error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Markup compositing ────────────────────────────────────────────────────────

interface StrokePoint { x: number; y: number; }
interface Stroke { points: StrokePoint[]; color: string; width: number; }
interface MarkupData { w: number; h: number; strokes: Stroke[]; }

function strokeToSvgPath(points: StrokePoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${(points[0].x + 0.5).toFixed(1)} ${points[0].y.toFixed(1)}`;
  }
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

async function applyMarkupToPhoto(photoBuffer: Buffer, markup: MarkupData): Promise<Buffer> {
  if (!markup?.strokes?.length) return photoBuffer;
  try {
    const meta = await sharp(photoBuffer).metadata();
    const imgW = meta.width;
    const imgH = meta.height;
    if (!imgW || !imgH) return photoBuffer;

    const pathEls = markup.strokes.map(stroke => {
      const d = strokeToSvgPath(stroke.points);
      if (!d) return "";
      const color = (stroke.color || "#FF0000").replace(/"/g, "");
      const w = Math.max(1, stroke.width || 3);
      return `<path d="${d}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    }).filter(Boolean).join("");

    const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}" viewBox="0 0 ${markup.w} ${markup.h}" preserveAspectRatio="none">${pathEls}</svg>`;

    return await sharp(photoBuffer)
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    return photoBuffer;
  }
}

// ── PDF generation ────────────────────────────────────────────────────────────

const MARGIN = 50;
const FOOTER_H = 40;
const HEADER_H = 72;    // 68px navy + 4px pear accent
const CONTENT_TOP = 90; // cursor reset after header

function addPageHeader(doc: PDFKit.PDFDocument, typeLabel: string, logoBuffer?: Buffer, companyName?: string) {
  const pageW = doc.page.width;

  doc.save();

  // ── Background bars ──────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, 68).fill(COLOR_NAVY);
  doc.rect(0, 68, pageW, 4).fill(COLOR_PEAR);

  if (logoBuffer) {
    // ── Company logo (uploaded) ───────────────────────────────────────────
    try {
      const logoMaxW = 130;
      const logoMaxH = 44;
      const logoX = MARGIN;
      const logoY = (68 - logoMaxH) / 2;
      doc.image(logoBuffer, logoX, logoY, {
        fit: [logoMaxW, logoMaxH],
        align: "left",
        valign: "center",
      });
    } catch {
      // fallback to default badge if logo is corrupt
      _drawDefaultBadge(doc);
    }
  } else {
    // ── Default InspectProof vector badge ────────────────────────────────
    _drawDefaultBadge(doc);
  }

  // ── Brand / company name text ─────────────────────────────────────────
  if (!logoBuffer) {
    const textX = MARGIN + 50; // badge is 40px + 10px gap
    doc.fillColor("#ffffff").fontSize(16).font(FODDLINI)
      .text("InspectProof", textX, 25, { lineBreak: false });
  } else if (companyName) {
    // Show company name beside logo when logo is loaded
    const textX = MARGIN + 140;
    doc.fillColor("#ffffff").fontSize(13).font(FODDLINI)
      .text(companyName, textX, 26, { lineBreak: false });
  }

  // ── Report type label (right-aligned) ────────────────────────────────────
  doc.fillColor("rgba(255,255,255,0.6)").fontSize(7.5).font(F)
    .text(typeLabel.toUpperCase(), 0, 28, { align: "right", width: pageW - MARGIN, lineBreak: false });

  doc.restore();

  // ── Reset cursor below the header ────────────────────────────────────────
  doc.x = MARGIN;
  doc.y = CONTENT_TOP;
}

function _drawDefaultBadge(doc: PDFKit.PDFDocument) {
  const badgeX = MARGIN;
  const badgeY = 14;
  const badgeS = 40;
  doc.roundedRect(badgeX, badgeY, badgeS, badgeS, 6).fill(COLOR_PEAR);
  const cbX = badgeX + 7;
  const cbY = badgeY + 11;
  const cbW = badgeS - 14;
  const cbH = badgeS - 15;
  doc.roundedRect(cbX, cbY, cbW, cbH, 2).fill(COLOR_NAVY);
  const clipW = 10;
  const clipH = 5;
  const clipX = badgeX + (badgeS - clipW) / 2;
  const clipY = badgeY + 7;
  doc.roundedRect(clipX, clipY, clipW, clipH, 1.5).fill(COLOR_NAVY);
  const lineX = cbX + 3;
  const lineW = cbW - 6;
  for (let i = 0; i < 3; i++) {
    doc.rect(lineX, cbY + 4 + i * 5, lineW, 1.5).fill(COLOR_PEAR);
  }
}

interface OrgInfo {
  companyName?: string;
  abn?: string;
  acn?: string;
  address?: string;
  phone?: string;
  accreditationNumber?: string;
  reportFooterText?: string;
  inspectorRole?: string;
  inspectorLicenceNumber?: string;
}

function addPageFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number, orgInfo?: OrgInfo, footerH = FOOTER_H) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  doc.save();
  doc.rect(0, pageH - footerH, pageW, footerH).fill(COLOR_NAVY);

  let footerLeft = "InspectProof · Confidential";
  if (orgInfo?.companyName) {
    const parts: string[] = [orgInfo.companyName];
    if (orgInfo.abn) parts.push(`ABN ${orgInfo.abn}`);
    else if (orgInfo.acn) parts.push(`ACN ${orgInfo.acn}`);
    if (orgInfo.address) parts.push(orgInfo.address);
    if (orgInfo.phone) parts.push(orgInfo.phone);
    if (orgInfo.accreditationNumber) parts.push(`Acc. No. ${orgInfo.accreditationNumber}`);
    footerLeft = parts.join("  ·  ");
  }

  const hasDisclaimer = !!orgInfo?.reportFooterText;
  const footerRight = `Page ${pageNum} of ${totalPages}`;
  // Top line: company info + page number — sit 8pt from the top of the footer band
  const footerY = pageH - footerH + 8;
  const halfW = (pageW - MARGIN * 2) / 2 - 10;

  doc.fillColor("#9CA3AF").fontSize(7).font(F)
    .text(footerLeft, MARGIN, footerY, { width: halfW * 1.6, lineBreak: false, ellipsis: true });
  doc.fillColor("#9CA3AF").fontSize(7).font(F)
    .text(footerRight, pageW - MARGIN - 60, footerY, { width: 60, align: "right", lineBreak: false });

  // Custom disclaimer — wraps across multiple lines within the footer band.
  // Strip inline markdown (too small to matter at 6.5pt) and render with lineBreak
  // so the full text is visible. Height is capped to the available footer space so
  // text can never overflow below the page.
  if (hasDisclaimer) {
    const plainDisclaimer = orgInfo!.reportFooterText!
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/\r?\n/g, "  ");
    const maxW  = pageW - MARGIN * 2;
    const disclaimerY = footerY + 12;
    // Available height from the disclaimer start to 4pt above the page edge
    const availH = pageH - 4 - disclaimerY;
    if (availH > 4) {
      doc.font(F).fontSize(6.5).fillColor("#9CA3AF")
        .text(plainDisclaimer, MARGIN, disclaimerY, {
          width: maxW,
          height: availH,
          lineBreak: true,
          ellipsis: true,
        });
    }
  }

  doc.restore();
}

interface ChecklistPhotoEntry {
  description: string;
  category: string;
  result: string;
  paths: string[];
}

function buildPdf(
  report: any,
  _project: any,
  signatureBuffer?: Buffer,
  photosByDesc?: Map<string, string[]>,        // description → [storagePath, ...]
  photoBuffers?: Map<string, Buffer>,          // storagePath → image buffer
  checklistPhotos?: ChecklistPhotoEntry[],     // ordered list for photo appendix
  orgInfo?: OrgInfo,
  logoBuffer?: Buffer,
  pdfReportOptions?: { includeCoverPage?: boolean; includeSummary?: boolean; includeSignOff?: boolean },
  inspectionForPdf?: any,                      // raw inspection record for cover page data
): PDFKit.PDFDocument {
  const pdfOpts = {
    includeCoverPage: pdfReportOptions?.includeCoverPage !== false,
    includeSummary: pdfReportOptions?.includeSummary !== false,
    includeSignOff: pdfReportOptions?.includeSignOff !== false,
  };

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 88, bottom: 0, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: report.title || "Report", Author: "InspectProof" },
  });

  doc.registerFont(F,        FONT_REGULAR);
  doc.registerFont(FM,       FONT_MEDIUM);
  doc.registerFont(FSB,      FONT_SEMIBOLD);
  doc.registerFont(FB,       FONT_BOLD);
  doc.registerFont(FODDLINI, FONT_ODDLINI_UX);

  const pageW = doc.page.width;
  const contentW = pageW - MARGIN * 2;
  const typeLabel = (report.reportTypeLabel || report.reportType || "Report").toUpperCase();

  // Dynamic footer height: taller when a multi-line disclaimer is present.
  // 72pt gives ~6 lines of 6.5pt text — enough for any reasonable disclaimer.
  const effectiveFooterH = orgInfo?.reportFooterText ? 72 : FOOTER_H;

  const formatDatePdf = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "—";

  // ── Cover page ──────────────────────────────────────────────────────────────
  if (pdfOpts.includeCoverPage) {
    // Full navy background cover page
    doc.rect(0, 0, pageW, doc.page.height).fill(COLOR_NAVY);

    // Pear accent bar at top
    doc.rect(0, 0, pageW, 8).fill(COLOR_PEAR);

    // Brand block
    const companyDisplayName = orgInfo?.companyName || "InspectProof";
    doc.fillColor(COLOR_PEAR).fontSize(28).font(FODDLINI)
      .text("InspectProof", MARGIN, 50, { width: contentW, lineBreak: false });

    if (companyDisplayName !== "InspectProof" || orgInfo?.companyName) {
      doc.fillColor("#94a3b8").fontSize(11).font(F)
        .text(companyDisplayName, MARGIN, 85, { width: contentW / 2, lineBreak: false });
    }

    const abnCoverLine = orgInfo?.abn
      ? `ABN ${orgInfo.abn}`
      : orgInfo?.acn
      ? `ACN ${orgInfo.acn}`
      : "";
    if (abnCoverLine) {
      doc.fillColor("#64748b").fontSize(9).font(F)
        .text(abnCoverLine, MARGIN, 100, { width: contentW / 2, lineBreak: false });
    }
    if (orgInfo?.address) {
      doc.fillColor("#64748b").fontSize(9).font(F)
        .text(orgInfo.address, MARGIN, abnCoverLine ? 113 : 100, { width: contentW / 2 });
    }

    // Report reference block (right side)
    const refBoxX = pageW - MARGIN - 120;
    doc.roundedRect(refBoxX, 50, 120, 48, 4).fillAndStroke("#1C2B0A", COLOR_PEAR);
    doc.fillColor("#94a3b8").fontSize(8).font(FB)
      .text("REPORT REF", refBoxX, 58, { width: 120, align: "center", lineBreak: false });
    const reportRef = inspectionForPdf?.id ? `INS-${String(inspectionForPdf.id).padStart(4, "0")}` : "INS-0000";
    doc.fillColor("#ffffff").fontSize(16).font(FB)
      .text(reportRef, refBoxX, 72, { width: 120, align: "center", lineBreak: false });

    // Divider bar
    const divY = 160;
    doc.moveTo(MARGIN, divY).lineTo(pageW - MARGIN, divY)
      .strokeColor("#1E3260").lineWidth(1).stroke();

    // Report type (large)
    doc.fillColor("#ffffff").fontSize(30).font(FB)
      .text(typeLabel, MARGIN, divY + 24, { width: contentW });
    const typeLabelH = doc.currentLineHeight() * Math.ceil(typeLabel.length / 35);

    // Project name & address
    const projNameY = divY + 24 + typeLabelH + 16;
    doc.fillColor("#94a3b8").fontSize(14).font(FSB)
      .text(report.projectName || "Inspection Report", MARGIN, projNameY, { width: contentW });
    doc.fillColor("#64748b").fontSize(11).font(F)
      .text(
        inspectionForPdf
          ? [inspectionForPdf.siteAddress, inspectionForPdf.suburb, inspectionForPdf.state, inspectionForPdf.postcode].filter(Boolean).join(", ")
          : "",
        MARGIN, doc.y + 4, { width: contentW }
      );

    // Date issued / inspection date info block
    const dateBlockY = doc.y + 24;
    const dateColW = 130;
    doc.fillColor("#64748b").fontSize(8).font(FSB)
      .text("INSPECTION DATE", MARGIN, dateBlockY, { width: dateColW, lineBreak: false });
    doc.fillColor("#cbd5e1").fontSize(11).font(FB)
      .text(formatDatePdf(inspectionForPdf?.scheduledDate), MARGIN, dateBlockY + 14, { width: dateColW, lineBreak: false });
    doc.fillColor("#64748b").fontSize(8).font(FSB)
      .text("DATE ISSUED", MARGIN + dateColW + 20, dateBlockY, { width: dateColW, lineBreak: false });
    doc.fillColor("#cbd5e1").fontSize(11).font(FB)
      .text(formatDatePdf(inspectionForPdf?.completedDate || new Date().toISOString().split("T")[0]), MARGIN + dateColW + 20, dateBlockY + 14, { width: dateColW, lineBreak: false });

    // Prepared by block at bottom
    const preparedY = doc.page.height - 140;
    doc.moveTo(MARGIN, preparedY).lineTo(pageW - MARGIN, preparedY)
      .strokeColor("#162040").lineWidth(1).stroke();
    doc.fillColor("#64748b").fontSize(8).font(FSB)
      .text("PREPARED BY", MARGIN, preparedY + 14, { width: contentW, lineBreak: false });
    const inspectorDisplayName = report.generatedByName || "—";
    doc.fillColor("#cbd5e1").fontSize(12).font(FB)
      .text(inspectorDisplayName, MARGIN, preparedY + 28, { width: contentW, lineBreak: false });
    if (orgInfo?.companyName) {
      doc.fillColor("#64748b").fontSize(9).font(F)
        .text(orgInfo.companyName, MARGIN, preparedY + 44, { width: contentW, lineBreak: false });
    }

    // Pear accent bar at bottom
    doc.rect(0, doc.page.height - 6, pageW, 6).fill(COLOR_PEAR);

    // Start a new page for the actual report content
    doc.addPage();
  }

  // Header on content pages
  addPageHeader(doc, typeLabel, logoBuffer, orgInfo?.companyName);

  // ── Document title ─────────────────────────────────────────────────────────
  doc.fillColor(COLOR_NAVY).fontSize(15).font(FB)
    .text(report.title || "Inspection Report", { width: contentW });

  doc.moveDown(0.6);

  // Status pill (inline text)
  const statusLabels: Record<string, string> = {
    approved: "APPROVED", sent: "SENT TO CLIENT",
    pending_review: "PENDING REVIEW", draft: "DRAFT",
  };
  const statusColors: Record<string, string> = {
    approved: COLOR_BLUE, sent: "#16A34A",
    pending_review: "#D97706", draft: "#6B7280",
  };
  const sl = statusLabels[report.status] || "DRAFT";
  const sc = statusColors[report.status] || "#6B7280";

  const pillX = doc.x;
  const pillY = doc.y;
  doc.roundedRect(pillX, pillY, 96, 18, 3).fill(sc);
  doc.fillColor("#ffffff").fontSize(7.5).font(FB)
    .text(sl, pillX, pillY + 5, { width: 96, align: "center" });
  doc.y = pillY + 28;

  // Separator line
  doc.moveTo(MARGIN, doc.y)
    .lineTo(pageW - MARGIN, doc.y)
    .strokeColor(COLOR_PEAR).lineWidth(1.5).stroke();
  doc.moveDown(1.2);

  // ── Parse and render content — setup ─────────────────────────────────────
  const lines = (report.content || "").split("\n");
  const bottomLimit = doc.page.height - effectiveFooterH - 30;

  const checkPageBreak = (needed = 20) => {
    if (doc.y + needed > bottomLimit) {
      doc.addPage();
      addPageHeader(doc, typeLabel, logoBuffer, orgInfo?.companyName);
    }
  };

  // ── Executive Summary section ─────────────────────────────────────────────
  if (pdfOpts.includeSummary) {
    checkPageBreak(100);
    const sumHeaderY = doc.y;
    doc.rect(MARGIN, sumHeaderY, contentW, 22).fill("#E8ECF2");
    doc.rect(MARGIN, sumHeaderY, 3, 22).fill(COLOR_BLUE);
    doc.fillColor(COLOR_NAVY).fontSize(9).font(FB)
      .text("EXECUTIVE SUMMARY", MARGIN + 10, sumHeaderY + 7, { width: contentW - 16 });
    doc.y = sumHeaderY + 30;

    // Derive quick stats from the content text
    const rawLines = (report.content || "").split("\n");
    const passCount = rawLines.filter(l => /\[✓ PASS\]/.test(l)).length;
    const failCount = rawLines.filter(l => /\[✗ FAIL\]/.test(l)).length;
    const monCount  = rawLines.filter(l => /\[◎ MONITOR\]/.test(l)).length;
    const totalCount = passCount + failCount + monCount + rawLines.filter(l => /\[○ PENDING\]/.test(l)).length + rawLines.filter(l => /\[— N\/A\]/.test(l)).length;
    const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : null;
    const outcome = failCount === 0 ? "COMPLIANT" : "NON-COMPLIANT";
    const outcomeColor = failCount === 0 ? "#16A34A" : "#DC2626";

    // Outcome badge
    const badgeW = 120;
    doc.roundedRect(MARGIN, doc.y, badgeW, 20, 3).fill(outcomeColor);
    doc.fillColor("#ffffff").fontSize(9).font(FB)
      .text(outcome, MARGIN, doc.y + 5, { width: badgeW, align: "center", lineBreak: false });
    doc.y += 28;

    // Summary metrics row — 5 columns
    const metricColW = (contentW - 16) / 5;
    const metrics: [string, string | number, string][] = [
      ["Total Items", totalCount || "—", COLOR_BLUE],
      ["Compliant", passCount, "#16A34A"],
      ["Non-Compliant", failCount, "#DC2626"],
      ["Monitor", monCount, "#D97706"],
      ["Pass Rate", passRate !== null ? `${passRate}%` : "—", COLOR_BLUE],
    ];
    const mY = doc.y;
    metrics.forEach(([label, val, accentColor], mi) => {
      const mx = MARGIN + mi * (metricColW + 4);
      doc.roundedRect(mx, mY, metricColW, 44, 4).fill("#F8FAFC");
      doc.rect(mx, mY, metricColW, 2).fill(accentColor);
      doc.fillColor(COLOR_NAVY).fontSize(14).font(FB)
        .text(String(val), mx, mY + 10, { width: metricColW, align: "center", lineBreak: false });
      doc.fillColor("#6B7280").fontSize(7.5).font(FSB)
        .text(label.toUpperCase(), mx, mY + 30, { width: metricColW, align: "center", lineBreak: false });
    });
    doc.y = mY + 56;

    // Narrative — use scheduledDate for inspection date, completedDate for issued date
    const inspType = inspectionForPdf?.inspectionType
      ? inspectionForPdf.inspectionType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "inspection";
    const dateConducted = inspectionForPdf?.scheduledDate
      ? new Date(inspectionForPdf.scheduledDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    const narrative = failCount === 0
      ? `This ${inspType} was conducted on ${dateConducted}. All ${totalCount} inspection item${totalCount !== 1 ? "s" : ""} assessed were found to be compliant with the applicable building standards and requirements.`
      : `This ${inspType} was conducted on ${dateConducted}. Of the ${totalCount} items assessed, ${failCount} non-compliance${failCount !== 1 ? "s were" : " was"} identified requiring rectification prior to re-inspection. ${monCount > 0 ? `${monCount} item${monCount !== 1 ? "s require" : " requires"} ongoing monitoring.` : ""}`;
    doc.fillColor("#374151").fontSize(9.5).font(F)
      .text(narrative, MARGIN, doc.y, { width: contentW });
    doc.moveDown(0.8);

    // Key findings: top-severity fail items (up to 5)
    const failLines = rawLines.filter(l => /\[✗ FAIL\]/.test(l));
    if (failLines.length > 0) {
      doc.fillColor(COLOR_NAVY).fontSize(8.5).font(FSB)
        .text("KEY FINDINGS:", MARGIN, doc.y, { width: contentW });
      doc.moveDown(0.3);
      const topFails = failLines.slice(0, 5);
      topFails.forEach(fl => {
        const cleaned = fl.replace(/\[✗ FAIL\]\s*/g, "").replace(/^\s*[\[\]•·◦\-]+\s*/, "").trim();
        if (cleaned) {
          checkPageBreak(14);
          const bullet = doc.y;
          doc.fillColor("#DC2626").fontSize(7).font(FB).text("✗", MARGIN, bullet, { width: 12, lineBreak: false });
          doc.fillColor("#374151").fontSize(8.5).font(F).text(cleaned, MARGIN + 14, bullet, { width: contentW - 14 });
          doc.moveDown(0.3);
        }
      });
      if (failLines.length > 5) {
        doc.fillColor("#6B7280").fontSize(8).font(F)
          .text(`… and ${failLines.length - 5} more non-compliant item${failLines.length - 5 !== 1 ? "s" : ""}.`, MARGIN, doc.y, { width: contentW });
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(0.5);
  }

  // ── Parse and render content ───────────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Skip pure divider lines
    if (/^─{5,}$/.test(line.trim())) continue;

    // Blank line → breathing room
    if (line.trim() === "") {
      doc.moveDown(0.55);
      continue;
    }

    // Skip standalone divider lines (both "───────" box chars and "-------" hyphens)
    // They are structural markers used to detect headers — no visual rendering needed
    if (/^[-─]{4,}$/.test(line.trim())) continue;

    // Section header: ALL CAPS, short, comes after or before a divider line
    // Dividers can be box-drawing "─" chars (outer sections) or "-" hyphens (category sub-headers)
    const prevIsDivider = i > 0 && /^[-─]{4,}$/.test(lines[i - 1].trim());
    const nextIsDivider = i + 1 < lines.length && /^[-─]{4,}$/.test(lines[i + 1].trim());
    const looksLikeHeader = line.trim().length > 2 && line.trim().length < 65
      && line.trim() === line.trim().toUpperCase()
      && /[A-Z]/.test(line.trim())
      && !/^[\d\[\(✓✗—]/.test(line.trim())
      && (prevIsDivider || nextIsDivider);

    if (looksLikeHeader) {
      checkPageBreak(40);
      doc.moveDown(0.6);
      const headerY = doc.y;
      // Grey filled header with blue left accent bar — matches HTML table preview
      doc.rect(MARGIN, headerY, contentW, 22).fill("#E8ECF2");
      doc.rect(MARGIN, headerY, 3, 22).fill(COLOR_BLUE);
      doc.fillColor(COLOR_NAVY).fontSize(9).font(FB)
        .text(line.trim(), MARGIN + 10, headerY + 7, { width: contentW - 16 });
      doc.y = headerY + 30;
      continue;
    }

    // Key-value: "Label:   value" (2+ spaces after colon used for alignment)
    const kvMatch = line.match(/^([A-Za-z][A-Za-z 0-9\/\-&]+?):\s{2,}(.+)$/);
    if (kvMatch) {
      checkPageBreak(18);
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      const rowY = doc.y;
      // Subtle alternating row background (every other row)
      doc.fillColor(COLOR_NAVY).fontSize(9).font(FB)
        .text(key + ":", MARGIN, rowY, { width: 148, lineBreak: false });
      doc.fillColor("#1F2937").fontSize(9).font(F)
        .text(val, MARGIN + 152, rowY, { width: contentW - 152 });
      doc.moveDown(0.45);
      continue;
    }

    // Checklist item: "1. [✓ PASS] description" or "1. [✗ FAIL] ..."
    const checkMatch = line.match(/^(\d+)\.\s+\[(.+?)\]\s+(.*)$/);
    if (checkMatch) {
      const itemNum = checkMatch[1];
      const resultStr = checkMatch[2].trim();
      const desc = checkMatch[3].trim();

      // Look ahead: capture Code Ref from the next indented sub-line so we can render it inline
      let inlineCodeRef: string | null = null;
      if (i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim();
        const crMatch = nextTrimmed.match(/^Code Ref:\s+(.+)$/);
        if (crMatch && /^\s{2,}/.test(lines[i + 1])) {
          inlineCodeRef = crMatch[1].trim();
          i++; // consume the Code Ref line so it won't be processed again
        }
      }

      const isPass = resultStr.includes("PASS");
      const isFail = resultStr.includes("FAIL");
      const isMonitor = resultStr.includes("MONITOR");
      const badgeColor = isPass ? "#16A34A" : isFail ? "#DC2626" : isMonitor ? "#D97706" : "#9CA3AF";
      const badgeBg = isPass ? "#F0FDF4" : isFail ? "#FEF2F2" : isMonitor ? "#FFFBEB" : "#F9FAFB";
      const badgeBorder = isPass ? "#BBF7D0" : isFail ? "#FECACA" : isMonitor ? "#FDE68A" : "#E5E7EB";
      const badgeText = isPass ? "Pass" : isFail ? "Fail" : isMonitor ? "Monitor" : "N/A";
      const badgeW = isMonitor ? 44 : 34;

      // Layout columns: [num 16px] [desc…] [badge 34-44px]
      const numCircleD = 16;
      const numX = MARGIN;
      const descX = MARGIN + numCircleD + 6;
      const badgeX = MARGIN + contentW - badgeW;
      const descW = contentW - numCircleD - 6 - badgeW - 8;

      // Estimate row height (desc + optional code ref line)
      doc.fontSize(9).font(F);
      const descH = doc.heightOfString(desc, { width: descW });
      const rowH = Math.max(22, descH + (inlineCodeRef ? 14 : 0) + 8);
      checkPageBreak(rowH);

      const rowY = doc.y;

      // Subtle row bg for fail items
      if (isFail) {
        doc.rect(MARGIN - 4, rowY - 2, contentW + 8, rowH).fill("#FFF5F5");
      }

      // Number circle
      doc.circle(numX + numCircleD / 2, rowY + 8, numCircleD / 2).fill("#F3F4F6");
      doc.fillColor("#6B7280").fontSize(7).font(FB)
        .text(itemNum, numX, rowY + 4.5, { width: numCircleD, align: "center", lineBreak: false });

      // Description text
      doc.fillColor("#1F2937").fontSize(9).font(F)
        .text(desc, descX, rowY, { width: descW });

      // Code ref chip inline, below description — blue, matching HTML preview style
      if (inlineCodeRef) {
        doc.fontSize(7.5).font(FB);
        const chipTextW = doc.widthOfString(inlineCodeRef);
        const chipW = Math.min(chipTextW + 8, descW);
        const chipY = doc.y + 1;
        doc.roundedRect(descX, chipY, chipW, 11, 2).fillAndStroke("#EFF6FF", "#BFDBFE");
        doc.fillColor("#2563EB").fontSize(7.5).font(FB)
          .text(inlineCodeRef, descX + 4, chipY + 2, { width: chipW - 8, lineBreak: false });
        doc.y = chipY + 13;
      }

      // Status badge on the right (vertically aligned with the first description line)
      doc.roundedRect(badgeX, rowY + 1, badgeW, 13, 3).fillAndStroke(badgeBg, badgeBorder);
      doc.fillColor(badgeColor).fontSize(7).font(FB)
        .text(badgeText, badgeX, rowY + 4, { width: badgeW, align: "center", lineBreak: false });

      doc.y = rowY + rowH;
      doc.moveDown(0.2);

      // Render photos for this item (if any)
      if (photosByDesc && photoBuffers) {
        const descKey = desc.toLowerCase().trim();
        const photoPaths = photosByDesc.get(descKey) || [];
        if (photoPaths.length > 0) {
          const photoW = 165;
          const photoH = 124;
          const photoGap = 6;
          const photoIndent = MARGIN + 43;
          const availW = contentW - 43;
          const photoCols = Math.max(1, Math.floor((availW + photoGap) / (photoW + photoGap)));

          let photoX = photoIndent;
          let photoY = doc.y;
          let colIdx = 0;

          for (const photoPath of photoPaths) {
            const buf = photoBuffers.get(photoPath);
            if (!buf) continue;

            if (colIdx === 0) {
              checkPageBreak(photoH + 16);
              photoY = doc.y;
            }

            try {
              // Subtle border + rounded rect
              doc.roundedRect(photoX, photoY, photoW, photoH, 4)
                .strokeColor("#D1D5DB").lineWidth(0.75).stroke();
              doc.image(buf, photoX + 2, photoY + 2, {
                width: photoW - 4,
                height: photoH - 4,
                fit: [photoW - 4, photoH - 4],
                align: "center",
                valign: "center",
              });
            } catch {
              // skip broken image silently
            }

            photoX += photoW + photoGap;
            colIdx++;
            if (colIdx >= photoCols) {
              colIdx = 0;
              photoX = photoIndent;
              doc.y = photoY + photoH + photoGap;
              photoY = doc.y;
            }
          }
          if (colIdx > 0) {
            doc.y = photoY + photoH + photoGap;
          }
          doc.moveDown(0.5);
        }
      }
      continue;
    }

    // Sub-detail lines (indented with spaces, e.g. "   Code Ref: ...")
    if (/^\s{2,}/.test(raw)) {
      const subText = line.trim();
      const subKv = subText.match(/^([A-Za-z][A-Za-z 0-9\/\-&]+?):\s+(.+)$/);
      if (subKv) {
        const label = subKv[1].trim();
        const val = subKv[2].trim();
        const indentX = MARGIN + 22;
        const availW = contentW - 22;

        if (label === "Code Ref") {
          // Render as teal pill badge (matching mobile style)
          checkPageBreak(14);
          const pillY = doc.y;
          doc.fontSize(7.5).font(FB);
          const pillTextW = doc.widthOfString(val);
          const pillW = Math.min(pillTextW + 10, availW);
          doc.roundedRect(indentX, pillY, pillW, 12, 3)
            .fill("#ECFDF5");
          doc.fillColor("#059669").fontSize(7.5).font(FB)
            .text(val, indentX + 5, pillY + 2, { width: pillW - 10, lineBreak: false });
          doc.y = pillY + 14;
          doc.moveDown(0.25);
        } else {
          checkPageBreak(15);
          const kvX = indentX;
          const kvAvailW = availW;
          doc.fillColor("#6B7280").fontSize(8.5).font(FB)
            .text(label + ": ", kvX, doc.y, { continued: true, width: kvAvailW });
          doc.fillColor("#374151").fontSize(8.5).font(F)
            .text(val, { width: kvAvailW });
          doc.moveDown(0.35);
        }
      } else {
        checkPageBreak(15);
        doc.fillColor("#374151").fontSize(9).font(F)
          .text(subText, MARGIN + 22, doc.y, { width: contentW - 22 });
        doc.moveDown(0.3);
      }
      continue;
    }

    // Numbered items without brackets: "Item 1: ..." or "1. description"
    const numberedMatch = line.match(/^(Item \d+|[\d]+\.)\s+(.+)$/);
    if (numberedMatch) {
      checkPageBreak(18);
      doc.fillColor(COLOR_NAVY).fontSize(9).font(FB)
        .text(numberedMatch[1], MARGIN, doc.y, { width: 48, lineBreak: false });
      doc.fillColor("#1F2937").fontSize(9).font(F)
        .text(numberedMatch[2], MARGIN + 52, doc.y - doc.currentLineHeight(), { width: contentW - 52 });
      doc.moveDown(0.45);
      continue;
    }

    // Signature line: "Inspector Signature: {{SIGNATURE}}"
    // Skip entirely when formal sign-off page is enabled (avoids duplication)
    if (line.includes("{{SIGNATURE}}")) {
      if (!pdfOpts.includeSignOff) {
        // Only render inline signature when formal sign-off page is disabled
        checkPageBreak(70);
        const sigLabelY = doc.y;
        doc.fillColor(COLOR_NAVY).fontSize(9).font(FB)
          .text("Inspector Signature:", MARGIN, sigLabelY, { width: contentW, lineBreak: false });
        doc.y = sigLabelY + 16;

        if (signatureBuffer) {
          try {
            const sigH = 48;
            doc.image(signatureBuffer, MARGIN, doc.y, { height: sigH, fit: [200, sigH] });
            doc.y = doc.y + sigH + 4;
          } catch {
            doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + 200, doc.y + 2)
              .strokeColor("#9CA3AF").lineWidth(0.75).stroke();
            doc.y = doc.y + 16;
          }
        } else {
          doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + 200, doc.y + 2)
            .strokeColor("#9CA3AF").lineWidth(0.75).stroke();
          doc.y = doc.y + 16;
        }
        doc.moveDown(0.3);
      }
      continue;
    }

    // Default body text
    checkPageBreak(18);
    doc.fillColor("#1F2937").fontSize(9.5).font(F)
      .text(line.trim(), MARGIN, doc.y, { width: contentW });
    doc.moveDown(0.3);
  }

  // ── Formal Sign-Off Section ───────────────────────────────────────────────
  if (pdfOpts.includeSignOff) {
    checkPageBreak(180);
    doc.addPage();
    addPageHeader(doc, typeLabel, logoBuffer, orgInfo?.companyName);

    const soHeaderY = doc.y;
    doc.rect(MARGIN, soHeaderY, contentW, 22).fill("#E8ECF2");
    doc.rect(MARGIN, soHeaderY, 3, 22).fill(COLOR_BLUE);
    doc.fillColor(COLOR_NAVY).fontSize(9).font(FB)
      .text("ACKNOWLEDGEMENT & SIGN-OFF", MARGIN + 10, soHeaderY + 7, { width: contentW - 16 });
    doc.y = soHeaderY + 36;

    // Certification statement
    const certStatement = `I, the undersigned, confirm that I have reviewed this report and understand the findings and requirements as set out herein. This report was prepared following an inspection carried out in accordance with applicable statutory and professional requirements. Any non-compliances identified require rectification and re-inspection prior to the next stage of works proceeding.`;
    doc.fillColor("#374151").fontSize(9.5).font(F)
      .text(certStatement, MARGIN, doc.y, { width: contentW });
    doc.moveDown(1.5);

    // Inspector sign-off block
    const signoffBlockW = (contentW - 24) / 2;
    const inspBlockX = MARGIN;
    const clientBlockX = MARGIN + signoffBlockW + 24;
    const blockY = doc.y;

    // Inspector column
    doc.fillColor("#6B7280").fontSize(8).font(FSB)
      .text("INSPECTOR / CERTIFIER", inspBlockX, blockY, { width: signoffBlockW, lineBreak: false });
    doc.y = blockY + 14;
    doc.fillColor(COLOR_NAVY).fontSize(10).font(FB)
      .text(report.generatedByName || "—", inspBlockX, doc.y, { width: signoffBlockW, lineBreak: false });
    doc.moveDown(0.2);
    // Inspector role, licence and accreditation
    if (orgInfo?.inspectorRole) {
      doc.fillColor("#6B7280").fontSize(8).font(F)
        .text(orgInfo.inspectorRole, inspBlockX, doc.y, { width: signoffBlockW, lineBreak: false });
      doc.moveDown(0.2);
    } else if (orgInfo?.companyName) {
      doc.fillColor("#6B7280").fontSize(8).font(F)
        .text(orgInfo.companyName, inspBlockX, doc.y, { width: signoffBlockW, lineBreak: false });
      doc.moveDown(0.2);
    }
    if (orgInfo?.inspectorLicenceNumber) {
      doc.fillColor("#6B7280").fontSize(8).font(F)
        .text(`Licence No. ${orgInfo.inspectorLicenceNumber}`, inspBlockX, doc.y, { width: signoffBlockW, lineBreak: false });
      doc.moveDown(0.2);
    }
    if (orgInfo?.accreditationNumber) {
      doc.fillColor("#6B7280").fontSize(8).font(F)
        .text(`Accreditation No. ${orgInfo.accreditationNumber}`, inspBlockX, doc.y, { width: signoffBlockW, lineBreak: false });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.2);
    if (signatureBuffer) {
      try {
        doc.image(signatureBuffer, inspBlockX, doc.y, { height: 44, fit: [160, 44] });
        doc.y += 50;
      } catch {
        doc.moveTo(inspBlockX, doc.y + 2).lineTo(inspBlockX + 180, doc.y + 2)
          .strokeColor("#9CA3AF").lineWidth(0.75).stroke();
        doc.y += 14;
      }
    } else {
      doc.moveTo(inspBlockX, doc.y + 2).lineTo(inspBlockX + 180, doc.y + 2)
        .strokeColor("#9CA3AF").lineWidth(0.75).stroke();
      doc.y += 14;
    }
    doc.fillColor("#6B7280").fontSize(8).font(F)
      .text("Signature", inspBlockX, doc.y, { width: signoffBlockW, lineBreak: false });
    doc.moveDown(0.8);
    doc.fillColor("#6B7280").fontSize(8).font(FSB)
      .text("Date: ____________________", inspBlockX, doc.y, { width: signoffBlockW, lineBreak: false });
    // Capture inspector column bottom BEFORE client column resets doc.y
    const inspectorEndY = doc.y + 16;

    // Client / Owner column
    const clientY = blockY;
    doc.fillColor("#6B7280").fontSize(8).font(FSB)
      .text("CLIENT / OWNER ACKNOWLEDGEMENT", clientBlockX, clientY, { width: signoffBlockW, lineBreak: false });
    doc.fillColor(COLOR_NAVY).fontSize(10).font(FB)
      .text(_project?.clientName || inspectionForPdf?.clientName || "—", clientBlockX, clientY + 14, { width: signoffBlockW, lineBreak: false });
    doc.moveTo(clientBlockX, clientY + 34).lineTo(clientBlockX + 180, clientY + 34)
      .strokeColor("#9CA3AF").lineWidth(0.75).stroke();
    doc.fillColor("#6B7280").fontSize(8).font(F)
      .text("Signature", clientBlockX, clientY + 38, { width: signoffBlockW, lineBreak: false });
    doc.fillColor("#6B7280").fontSize(8).font(FSB)
      .text("Date: ____________________", clientBlockX, clientY + 54, { width: signoffBlockW, lineBreak: false });

    // Builder column (below) — use the inspector column's true bottom, not the reset doc.y
    doc.y = Math.max(inspectorEndY, clientY + 68) + 24;
    const builderY = doc.y;
    doc.fillColor("#6B7280").fontSize(8).font(FSB)
      .text("BUILDER / CONTRACTOR ACKNOWLEDGEMENT", inspBlockX, builderY, { width: contentW, lineBreak: false });
    doc.fillColor(COLOR_NAVY).fontSize(10).font(FB)
      .text(_project?.builderName || inspectionForPdf?.builderName || "—", inspBlockX, builderY + 14, { width: signoffBlockW, lineBreak: false });
    doc.moveTo(inspBlockX, builderY + 34).lineTo(inspBlockX + 180, builderY + 34)
      .strokeColor("#9CA3AF").lineWidth(0.75).stroke();
    doc.fillColor("#6B7280").fontSize(8).font(F)
      .text("Signature", inspBlockX, builderY + 38, { width: signoffBlockW, lineBreak: false });
    doc.fillColor("#6B7280").fontSize(8).font(FSB)
      .text("Date: ____________________", inspBlockX, builderY + 54, { width: signoffBlockW, lineBreak: false });

    doc.moveDown(2);
  }

  // ── Photo Documentation Appendix ──────────────────────────────────────────
  // Full-size photos at the end of the report, one item reference per section
  if (checklistPhotos && checklistPhotos.length > 0 && photoBuffers && photoBuffers.size > 0) {
    // Only include items that have at least one loadable photo
    const itemsWithPhotos = checklistPhotos.filter(entry =>
      entry.paths.some(p => photoBuffers!.has(p))
    );

    if (itemsWithPhotos.length > 0) {
      doc.addPage();
      addPageHeader(doc, "Photo Documentation", logoBuffer, orgInfo?.companyName);

      // Section heading
      const checkPageBreakAppendix = (needed = 20) => {
        if (doc.y + needed > doc.page.height - effectiveFooterH - 30) {
          doc.addPage();
          addPageHeader(doc, "Photo Documentation", logoBuffer, orgInfo?.companyName);
        }
      };

      // Header bar
      doc.rect(MARGIN, doc.y, contentW, 26).fill("#E8ECF2");
      doc.rect(MARGIN, doc.y, 3, 26).fill(COLOR_PEAR);
      doc.fillColor(COLOR_NAVY).fontSize(10).font(FB)
        .text("PHOTO DOCUMENTATION", MARGIN + 10, doc.y + 8, { width: contentW - 16 });
      doc.y += 36;

      const resultColors: Record<string, { color: string; bg: string; label: string }> = {
        pass:    { color: "#16A34A", bg: "#F0FDF4", label: "PASS" },
        fail:    { color: "#DC2626", bg: "#FEF2F2", label: "FAIL" },
        monitor: { color: "#D97706", bg: "#FFFBEB", label: "MONITOR" },
        na:      { color: "#9CA3AF", bg: "#F9FAFB", label: "N/A" },
        pending: { color: "#9CA3AF", bg: "#F9FAFB", label: "PENDING" },
      };

      for (const entry of itemsWithPhotos) {
        const validPaths = entry.paths.filter(p => photoBuffers!.has(p));
        if (validPaths.length === 0) continue;

        const rc = resultColors[entry.result] ?? resultColors.pending;
        const fullPhotoW = contentW;
        // Decide height: if photo is portrait use more height, otherwise standard
        const fullPhotoH = 340;

        // One photo per page (full-width), or two small ones side-by-side
        for (let pi = 0; pi < validPaths.length; pi++) {
          const buf = photoBuffers!.get(validPaths[pi]);
          if (!buf) continue;

          checkPageBreakAppendix(fullPhotoH + 80);

          // ── Item reference header ──────────────────────────────────────────
          const refY = doc.y;
          // Result badge
          const badgeW = rc.label === "MONITOR" ? 48 : 40;
          doc.roundedRect(MARGIN, refY, badgeW, 16, 2).fillAndStroke(rc.bg, rc.color);
          doc.fillColor(rc.color).fontSize(7.5).font(FB)
            .text(rc.label, MARGIN, refY + 4, { width: badgeW, align: "center", lineBreak: false });

          // Category label (right side)
          if (entry.category) {
            doc.fillColor("#6B7280").fontSize(8).font(F)
              .text(entry.category.toUpperCase(), MARGIN + badgeW + 8, refY + 4, {
                width: contentW - badgeW - 8,
                align: "right",
                lineBreak: false,
              });
          }

          doc.y = refY + 22;

          // Description
          doc.fillColor(COLOR_NAVY).fontSize(10).font(FB)
            .text(entry.description || "Inspection Item", MARGIN, doc.y, { width: contentW });
          doc.y += 4;

          // Photo count indicator (e.g. "Photo 2 of 3")
          if (validPaths.length > 1) {
            doc.fillColor("#9CA3AF").fontSize(8).font(F)
              .text(`Photo ${pi + 1} of ${validPaths.length}`, MARGIN, doc.y, {
                width: contentW,
                align: "right",
                lineBreak: false,
              });
          }
          doc.y += 10;

          // ── Full-size photo ────────────────────────────────────────────────
          try {
            doc.roundedRect(MARGIN, doc.y, fullPhotoW, fullPhotoH, 6)
              .strokeColor("#D1D5DB").lineWidth(0.75).stroke();
            doc.image(buf, MARGIN + 3, doc.y + 3, {
              width:  fullPhotoW - 6,
              height: fullPhotoH - 6,
              fit:    [fullPhotoW - 6, fullPhotoH - 6],
              align:  "center",
              valign: "center",
            });
          } catch {
            // draw a placeholder if image is corrupt
            doc.rect(MARGIN, doc.y, fullPhotoW, fullPhotoH).fill("#F3F4F6");
            doc.fillColor("#9CA3AF").fontSize(10).font(F)
              .text("Image unavailable", MARGIN, doc.y + fullPhotoH / 2 - 6, {
                width: fullPhotoW,
                align: "center",
              });
          }
          doc.y += fullPhotoH + 24;
        }
      }
    }
  }

  // ── Footers on all pages ───────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let p = 0; p < totalPages; p++) {
    doc.switchToPage(range.start + p);
    addPageFooter(doc, p + 1, totalPages, orgInfo, effectiveFooterH);
  }

  return doc;
}

// ── PDF filename helper ────────────────────────────────────────────────────────

function sanitiseSegment(s: string, fallback: string, maxLen = 40): string {
  return (
    s
      .replace(/[^a-z0-9 \-_]/gi, "")   // keep alphanumeric, space, dash, underscore
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, maxLen) || fallback
  );
}

function buildPdfFilename(report: { title?: string | null }, project: { name?: string | null } | null): string {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const projectPart = sanitiseSegment(project?.name || "", "Project");
  const titlePart   = sanitiseSegment(report.title || "", "Report");
  return `InspectProof_${projectPart}_${titlePart}_${dateStr}.pdf`;
}

// Download report as PDF
router.get("/:id/pdf", async (req, res) => {
  // Support ?_token= query param for browser-based access (mobile in-app browser)
  if (req.query._token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query._token}`;
  }

  try {
    const id = parseInt(req.params.id);
    const reports = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    const report = reports[0];
    if (!report) { res.status(404).json({ error: "not_found" }); return; }

    // Report options: query params take precedence (explicit caller intent); fall back to
    // persisted options saved at generation time; default to true for all toggles.
    const savedOpts = (report.reportOptions as Record<string, boolean> | null) ?? {};
    const pdfReportOptions = {
      includeCoverPage: req.query.includeCoverPage !== undefined
        ? req.query.includeCoverPage !== "false"
        : (savedOpts.includeCoverPage !== false),
      includeSummary: req.query.includeSummary !== undefined
        ? req.query.includeSummary !== "false"
        : (savedOpts.includeSummary !== false),
      includeSignOff: req.query.includeSignOff !== undefined
        ? req.query.includeSignOff !== "false"
        : (savedOpts.includeSignOff !== false),
    };

    const projects = report.projectId
      ? await db.select().from(projectsTable).where(eq(projectsTable.id, report.projectId))
      : [];
    const project = projects[0] ?? null;

    // Fetch inspector's signature if available
    let signatureBuffer: Buffer | undefined;
    let pdfInspection: any = null;
    if (report.inspectionId) {
      try {
        const inspections = await db.select().from(inspectionsTable)
          .where(eq(inspectionsTable.id, report.inspectionId));
        pdfInspection = inspections[0] ?? null;
        const inspectorId = pdfInspection?.inspectorId;
        if (inspectorId) {
          const users = await db.select().from(usersTable).where(eq(usersTable.id, inspectorId));
          const signatureUrl = users[0]?.signatureUrl;
          if (signatureUrl) {
            const storageService = new ObjectStorageService();
            const { buffer } = await storageService.fetchObjectBuffer(signatureUrl);
            signatureBuffer = buffer;
          }
        }
      } catch (sigErr) {
        req.log.warn({ sigErr }, "Could not load signature — omitting from PDF");
      }
    }

    // Fetch checklist results (with photoUrls) for this report's inspection
    let photosByDesc: Map<string, string[]> | undefined;
    let photoBuffers: Map<string, Buffer> | undefined;
    let checklistPhotos: ChecklistPhotoEntry[] | undefined;
    if (report.inspectionId) {
      try {
        const checklistRows = await db.select({
          result: checklistResultsTable,
          item: checklistItemsTable,
        }).from(checklistResultsTable)
          .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
          .where(eq(checklistResultsTable.inspectionId, report.inspectionId))
          .orderBy(checklistItemsTable.orderIndex);

        photosByDesc = new Map<string, string[]>();
        photoBuffers = new Map<string, Buffer>();

        const storageService = new ObjectStorageService();

        // First pass: collect all paths, fetch buffers, and gather markup data
        const rowsWithPhotos: Array<{ row: typeof checklistRows[0]; paths: string[] }> = [];

        // Map from storage path → MarkupData (strokes to composite onto the photo)
        const markupByPath = new Map<string, MarkupData>();

        for (const row of checklistRows) {
          const rawUrls = row.result.photoUrls;
          if (!rawUrls) continue;
          let paths: string[];
          try {
            paths = Array.isArray(rawUrls) ? rawUrls : JSON.parse(rawUrls as string);
          } catch { continue; }
          if (!paths || !paths.length) continue;
          rowsWithPhotos.push({ row, paths });

          const descKey = (row.item.description || "").toLowerCase().trim();
          if (!photosByDesc!.has(descKey)) photosByDesc!.set(descKey, []);
          photosByDesc!.get(descKey)!.push(...paths);

          // Parse photoMarkups: { [storagePath]: MarkupData }
          if (row.result.photoMarkups) {
            try {
              const markups: Record<string, MarkupData> =
                typeof row.result.photoMarkups === "string"
                  ? JSON.parse(row.result.photoMarkups)
                  : row.result.photoMarkups;
              for (const [p, md] of Object.entries(markups)) {
                if (md?.strokes?.length) markupByPath.set(p, md);
              }
            } catch { /* ignore malformed markup */ }
          }
        }

        // Fetch all photo buffers concurrently, then composite markups
        const allPaths = [...new Set(rowsWithPhotos.flatMap(r => r.paths))];
        await Promise.allSettled(allPaths.map(async (photoPath) => {
          if (photoBuffers!.has(photoPath)) return;
          try {
            const { buffer: rawBuf } = await storageService.fetchObjectBuffer(photoPath);
            const markup = markupByPath.get(photoPath);
            const finalBuf = markup ? await applyMarkupToPhoto(rawBuf, markup) : rawBuf;
            photoBuffers!.set(photoPath, finalBuf);
          } catch {
            // skip — photo unavailable
          }
        }));

        // Build ordered list for Photo Documentation appendix
        checklistPhotos = rowsWithPhotos.map(({ row, paths }) => ({
          description: row.item.description || "",
          category:    row.item.category    || "",
          result:      row.result.result    || "pending",
          paths,
        }));
      } catch (photoErr) {
        req.log.warn({ photoErr }, "Could not load checklist photos — omitting from PDF");
      }
    }

    // If the report was saved as HTML (from template or new generator), re-generate
    // plain text content for the styled pdfkit renderer
    let formatted = await formatReport(report);
    if (isHtmlContent(formatted.content || "")) {
      try {
        if (report.inspectionId) {
          const inspRows = await db.select().from(inspectionsTable)
            .where(eq(inspectionsTable.id, report.inspectionId));
          const insp = inspRows[0] ?? null;
          if (insp) {
            const projRows = insp.projectId
              ? await db.select().from(projectsTable).where(eq(projectsTable.id, insp.projectId))
              : [];
            const proj = projRows[0] ?? null;
            const clRows = await db.select({ result: checklistResultsTable, item: checklistItemsTable })
              .from(checklistResultsTable)
              .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
              .where(eq(checklistResultsTable.inspectionId, insp.id));
            const clResults = clRows.map(r => ({
              result: r.result.result, notes: r.result.notes, severity: r.result.severity,
              location: r.result.location, tradeAllocated: r.result.tradeAllocated,
              recommendedAction: r.result.recommendedAction, photoCount: 0,
              category: r.item.category, description: r.item.description,
              codeReference: r.item.codeReference, riskLevel: r.item.riskLevel,
              orderIndex: r.item.orderIndex,
            }));
            let inspectorForPdf: any = null;
            if (insp.inspectorId) {
              const uRows = await db.select().from(usersTable).where(eq(usersTable.id, insp.inspectorId));
              inspectorForPdf = uRows[0] ?? null;
            }
            let certifierForPdf2: any = null;
            const certifierId2 = proj?.assignedCertifierId ?? null;
            if (certifierId2) {
              const cRows = await db.select().from(usersTable).where(eq(usersTable.id, certifierId2));
              certifierForPdf2 = cRows[0] ?? null;
            }
            const issRows = await db.select().from(issuesTable).where(eq(issuesTable.inspectionId, insp.id));
            const plainText = await generateReportContent(report.reportType || "summary", proj, insp, clResults, issRows, inspectorForPdf, certifierForPdf2);
            formatted = { ...formatted, content: plainText };
          }
        }
      } catch (htmlFallbackErr) {
        req.log.warn({ htmlFallbackErr }, "Could not regenerate plain text for PDF; using stored content as-is");
      }
    }

    // ── Fetch plan documents for this project (Plans Appendix) ────────────────
    let planBuffers: Buffer[] = [];
    let planNames: string[] = [];
    let planMimeTypes: string[] = [];
    if (report.projectId) {
      try {
        const planDocs = await db
          .select()
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.projectId, report.projectId),
              eq(documentsTable.category, "plan")
            )
          );
        const storageService = new ObjectStorageService();
        await Promise.allSettled(
          planDocs.map(async (pdoc) => {
            if (!pdoc.fileUrl) return;
            try {
              const { buffer } = await storageService.fetchObjectBuffer(pdoc.fileUrl);
              planBuffers.push(buffer);
              planNames.push(pdoc.name);
              planMimeTypes.push(pdoc.mimeType || "application/pdf");
            } catch {
              // skip unavailable plan
            }
          })
        );
      } catch (planErr) {
        req.log.warn({ planErr }, "Could not load plan documents — omitting from PDF");
      }
    }

    // ── Fetch markup documents for this inspection (if requested) ────────────
    const includeMarkup = req.query.includeMarkup === "true";
    let markupBuffers: Buffer[] = [];
    let markupNames: string[] = [];

    if (includeMarkup && report.inspectionId) {
      try {
        const markupDocs = await db
          .select()
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.inspectionId, report.inspectionId),
              eq(documentsTable.folder, "Markups")
            )
          );

        const storageService = new ObjectStorageService();
        await Promise.allSettled(
          markupDocs.map(async (mdoc) => {
            if (!mdoc.fileUrl) return;
            try {
              const { buffer } = await storageService.fetchObjectBuffer(mdoc.fileUrl);
              markupBuffers.push(buffer);
              markupNames.push(mdoc.name);
            } catch {
              // skip unavailable markup
            }
          })
        );
      } catch (markupErr) {
        req.log.warn({ markupErr }, "Could not load markups — omitting from PDF");
      }
    }

    // Fetch org info from the report's inspector (or generator) for the PDF header/footer
    let orgInfo: OrgInfo | undefined;
    let logoBuffer: Buffer | undefined;
    try {
      let inspectorId: number | null = null;
      if (report.inspectionId) {
        const [insp] = await db.select({ inspectorId: inspectionsTable.inspectorId })
          .from(inspectionsTable).where(eq(inspectionsTable.id, report.inspectionId));
        inspectorId = insp?.inspectorId ?? null;
      }
      // Fall back to the report's generator if no inspector is assigned to the inspection
      if (!inspectorId && report.generatedById) {
        inspectorId = report.generatedById;
      }
      if (inspectorId) {
        const [inspectorUser] = await db.select({
          companyName: usersTable.companyName,
          abn: usersTable.abn,
          acn: usersTable.acn,
          companyAddress: usersTable.companyAddress,
          companySuburb: usersTable.companySuburb,
          companyState: usersTable.companyState,
          companyPhone: usersTable.companyPhone,
          accreditationNumber: usersTable.accreditationNumber,
          reportFooterText: usersTable.reportFooterText,
          logoUrl: usersTable.logoUrl,
          isCompanyAdmin: usersTable.isCompanyAdmin,
          adminUserId: usersTable.adminUserId,
          role: usersTable.role,
          licenceNumber: usersTable.licenceNumber,
        }).from(usersTable).where(eq(usersTable.id, inspectorId));

        // For team members, inherit company branding from the admin's record
        let orgUser = inspectorUser;
        if (inspectorUser && !inspectorUser.isCompanyAdmin && inspectorUser.adminUserId) {
          const adminId = parseInt(inspectorUser.adminUserId);
          if (!isNaN(adminId)) {
            const [adminRecord] = await db.select({
              companyName: usersTable.companyName,
              abn: usersTable.abn,
              acn: usersTable.acn,
              companyAddress: usersTable.companyAddress,
              companySuburb: usersTable.companySuburb,
              companyState: usersTable.companyState,
              companyPhone: usersTable.companyPhone,
              accreditationNumber: usersTable.accreditationNumber,
              reportFooterText: usersTable.reportFooterText,
              logoUrl: usersTable.logoUrl,
              isCompanyAdmin: usersTable.isCompanyAdmin,
              adminUserId: usersTable.adminUserId,
              role: usersTable.role,
              licenceNumber: usersTable.licenceNumber,
            }).from(usersTable).where(eq(usersTable.id, adminId));
            if (adminRecord) orgUser = adminRecord;
          }
        }

        if (orgUser) {
          const addrParts = [orgUser.companyAddress, orgUser.companySuburb, orgUser.companyState].filter(Boolean);
          const ROLE_LABELS_PDF: Record<string, string> = {
            building_surveyor:      "Building Surveyor / Certifier",
            structural_engineer:    "Structural Engineer",
            plumbing_inspector:     "Plumbing Inspector",
            building_inspector:     "Building Inspector",
            site_inspector:         "Site Inspector",
            certifier:              "Building Certifier / Surveyor",
            fire_safety_engineer:   "Fire Safety Engineer",
            whs_officer:            "WHS Officer",
            site_supervisor:        "Site Supervisor",
            builder:                "Builder / QC Inspector",
            pre_purchase_inspector: "Pre-Purchase Inspector",
            inspector:              "Inspector",
            engineer:               "Structural Engineer",
            plumber:                "Plumbing Inspector",
            supervisor:             "Site Supervisor",
            whs:                    "WHS Officer",
            pre_purchase:           "Pre-Purchase Inspector",
            fire_engineer:          "Fire Safety Engineer",
          };
          orgInfo = {
            companyName: orgUser.companyName || undefined,
            abn: orgUser.abn || undefined,
            acn: orgUser.acn || undefined,
            address: addrParts.length ? addrParts.join(", ") : undefined,
            phone: orgUser.companyPhone || undefined,
            accreditationNumber: orgUser.accreditationNumber || undefined,
            reportFooterText: orgUser.reportFooterText || undefined,
            inspectorRole: orgUser.role ? (ROLE_LABELS_PDF[orgUser.role] || orgUser.role) : undefined,
            inspectorLicenceNumber: inspectorUser?.licenceNumber || undefined,
          };
          // Fetch company logo if set
          if (orgUser.logoUrl) {
            try {
              const logoStorage = new ObjectStorageService();
              const { buffer: logoBuf } = await logoStorage.fetchObjectBuffer(orgUser.logoUrl);
              logoBuffer = logoBuf;
            } catch (logoErr) {
              req.log.warn({ logoErr }, "Could not fetch company logo for PDF header");
            }
          }
        }
      }
    } catch (orgErr) {
      req.log.warn({ orgErr }, "Could not load org info for PDF");
    }

    const doc = buildPdf(formatted, project, signatureBuffer, photosByDesc, photoBuffers, checklistPhotos, orgInfo, logoBuffer, pdfReportOptions, pdfInspection);

    // ── Append markup/plan pages at end of report ─────────────────────────────
    const needsMerge = markupBuffers.length > 0 || planBuffers.length > 0;
    if (needsMerge) {
      const { PDFDocument: LibPdf } = await import("pdf-lib");
      const reportBytes = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        doc.end();
      });

      const merged = await LibPdf.create();

      // Copy all pages from the base report
      const basePdf = await LibPdf.load(reportBytes);
      const basePageCount = basePdf.getPageCount();
      const basePagesCopied = await merged.copyPages(basePdf, Array.from({ length: basePageCount }, (_, i) => i));
      basePagesCopied.forEach((p) => merged.addPage(p));

      const { rgb } = await import("pdf-lib");

      // ── Markups Appendix (before Plans) ──────────────────────────────────────
      if (markupBuffers.length > 0) {
        const coverPage = merged.addPage([595.28, 841.89]); // A4
        coverPage.drawRectangle({ x: 0, y: 821.89, width: 595.28, height: 20, color: rgb(0.773, 0.851, 0.176) }); // pear bar
        coverPage.drawRectangle({ x: 0, y: 0, width: 595.28, height: 821.89, color: rgb(0.97, 0.98, 0.99) });
        coverPage.drawText("MARKUPS", {
          x: 40, y: 800, size: 18, color: rgb(0.043, 0.098, 0.2),
        });
        coverPage.drawText(`${markupBuffers.length} marked-up document${markupBuffers.length !== 1 ? "s" : ""} attached to this inspection.`, {
          x: 40, y: 775, size: 11, color: rgb(0.28, 0.43, 0.71),
        });
        for (let mi = 0; mi < markupBuffers.length; mi++) {
          try {
            const markupPdf = await LibPdf.load(markupBuffers[mi]);
            const markupPageCount = markupPdf.getPageCount();
            const copiedPages = await merged.copyPages(markupPdf, Array.from({ length: markupPageCount }, (_, i) => i));
            copiedPages.forEach((p) => merged.addPage(p));
          } catch {
            // skip malformed markup PDF
          }
        }
      }

      // ── Plans Appendix (terminal appendix) ───────────────────────────────────
      if (planBuffers.length > 0) {
        const planCoverPage = merged.addPage([595.28, 841.89]);
        planCoverPage.drawRectangle({ x: 0, y: 821.89, width: 595.28, height: 20, color: rgb(0.773, 0.851, 0.176) });
        planCoverPage.drawRectangle({ x: 0, y: 0, width: 595.28, height: 821.89, color: rgb(0.97, 0.98, 0.99) });
        planCoverPage.drawText("PLANS APPENDIX", {
          x: 40, y: 800, size: 18, color: rgb(0.043, 0.098, 0.2),
        });
        planCoverPage.drawText(`${planBuffers.length} plan document${planBuffers.length !== 1 ? "s" : ""} attached for this project.`, {
          x: 40, y: 775, size: 11, color: rgb(0.28, 0.43, 0.71),
        });
        for (let pi = 0; pi < planBuffers.length; pi++) {
          const mime = planMimeTypes[pi] || "application/pdf";
          const name = planNames[pi] || `Plan ${pi + 1}`;
          try {
            if (mime === "image/jpeg" || mime === "image/jpg") {
              // Embed JPEG image as a full-page PDF page (landscape if wider than tall)
              const embedImg = await merged.embedJpg(planBuffers[pi]);
              const { width: iw, height: ih } = embedImg;
              const landscape = iw > ih;
              const pageW = landscape ? 841.89 : 595.28;
              const pageH = landscape ? 595.28 : 841.89;
              const scaleFactor = Math.min((pageW - 40) / iw, (pageH - 60) / ih);
              const drawW = iw * scaleFactor;
              const drawH = ih * scaleFactor;
              const imgPage = merged.addPage([pageW, pageH]);
              imgPage.drawRectangle({ x: 0, y: pageH - 20, width: pageW, height: 20, color: rgb(0.043, 0.098, 0.2) });
              imgPage.drawText(name, { x: 10, y: pageH - 14, size: 9, color: rgb(1, 1, 1) });
              imgPage.drawImage(embedImg, { x: (pageW - drawW) / 2, y: (pageH - drawH - 20) / 2, width: drawW, height: drawH });
            } else if (mime === "image/png") {
              const embedImg = await merged.embedPng(planBuffers[pi]);
              const { width: iw, height: ih } = embedImg;
              const landscape = iw > ih;
              const pageW = landscape ? 841.89 : 595.28;
              const pageH = landscape ? 595.28 : 841.89;
              const scaleFactor = Math.min((pageW - 40) / iw, (pageH - 60) / ih);
              const drawW = iw * scaleFactor;
              const drawH = ih * scaleFactor;
              const imgPage = merged.addPage([pageW, pageH]);
              imgPage.drawRectangle({ x: 0, y: pageH - 20, width: pageW, height: 20, color: rgb(0.043, 0.098, 0.2) });
              imgPage.drawText(name, { x: 10, y: pageH - 14, size: 9, color: rgb(1, 1, 1) });
              imgPage.drawImage(embedImg, { x: (pageW - drawW) / 2, y: (pageH - drawH - 20) / 2, width: drawW, height: drawH });
            } else {
              // Default: treat as PDF
              const planPdf = await LibPdf.load(planBuffers[pi]);
              const planPageCount = planPdf.getPageCount();
              const copiedPlanPages = await merged.copyPages(planPdf, Array.from({ length: planPageCount }, (_, i) => i));
              copiedPlanPages.forEach((p) => merged.addPage(p));
            }
          } catch {
            // skip malformed / unsupported plan document
          }
        }
      }

      const mergedBytes = await merged.save();
      const mergedBuffer = Buffer.from(mergedBytes);

      const downloadFilename = buildPdfFilename(report, project);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename}"`);
      res.end(mergedBuffer);
      return;
    }

    const downloadFilename = buildPdfFilename(report, project);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename}"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    req.log.error({ err }, "PDF generation error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Delete report ──────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

    const [deleted] = await db.delete(reportsTable)
      .where(eq(reportsTable.id, id))
      .returning();

    if (!deleted) { res.status(404).json({ error: "not_found" }); return; }

    res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "Delete report error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
