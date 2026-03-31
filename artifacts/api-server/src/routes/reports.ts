import path from "path";
import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { ObjectStorageService } from "../lib/objectStorage";

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
import {
  db, reportsTable, projectsTable, inspectionsTable, issuesTable,
  usersTable, checklistResultsTable, checklistItemsTable, documentsTable,
} from "@workspace/db";
import { optionalAuth } from "../middleware/auth";

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

const ROLE_LABELS: Record<string, string> = {
  admin:        "Administrator",
  certifier:    "Building Certifier / Surveyor",
  inspector:    "Inspector",
  staff:        "Staff",
  engineer:     "Structural Engineer",
  plumber:      "Plumbing Inspector",
  builder:      "Builder",
  supervisor:   "Site Supervisor",
  whs:          "WHS Officer",
  pre_purchase: "Pre-Purchase Inspector",
  fire_engineer:"Fire Safety Engineer",
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

  const formatDate = (d: string | null) =>
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

  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  // Accent colors based on report type
  const accentMap: Record<string, { titleBg: string; titleBorder: string; titleColor: string; titleText: string; resultBg: string; resultBorder: string; resultColor: string }> = {
    inspection_certificate:  { titleBg: "#f9fafb", titleBorder: "#C5D92D", titleColor: "#0B1933", titleText: "Inspection Certificate", resultBg: "#f0fdf4", resultBorder: "#86efac", resultColor: "#15803d" },
    defect_notice:           { titleBg: "#fff7ed", titleBorder: "#f97316", titleColor: "#c2410c", titleText: "⚠ Defect Notice",        resultBg: "#fef2f2", resultBorder: "#fca5a5", resultColor: "#991b1b" },
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

  // Result summary box
  const resultLabel = isPending
    ? "PENDING — Inspection not yet fully conducted"
    : hasFails
      ? `RESULT: ${passItems.length} Pass / ${failItems.length} Fail — Non-Compliances Identified`
      : `✓ RESULT: ${passItems.length} Pass / ${failItems.length} Fail${passRate !== null ? ` (${passRate}% pass rate)` : ""}`;

  const resultBody = isPending
    ? "Some checklist items have not yet been assessed. A final result will be available once all items are completed."
    : hasFails
      ? `Non-compliances have been identified and are detailed in the checklist below. Re-inspection will be required following rectification.`
      : `This report confirms the above inspection has been carried out and the work is found to satisfy the relevant development consent and applicable standards.`;

  const resultBoxBg   = isPending ? "#f5f3ff" : hasFails ? "#fef2f2" : accent.resultBg;
  const resultBoxBdr  = isPending ? "#c4b5fd" : hasFails ? "#fca5a5" : accent.resultBorder;
  const resultBoxClr  = isPending ? "#6d28d9" : hasFails ? "#991b1b" : accent.resultColor;

  const summaryRows = [
    ["Total Items", String(total)],
    ["Pass", `<span style="color:#15803d;font-weight:700;">${passItems.length}</span>`],
    ["Fail", `<span style="color:#b91c1c;font-weight:700;">${failItems.length}</span>`],
    ["Monitor", `<span style="color:#b45309;font-weight:700;">${monitorItems.length}</span>`],
    ["N/A", String(naItems.length)],
    ...(pendingItems.length > 0 ? [["Pending", `<span style="color:#6d28d9;font-weight:700;">${pendingItems.length}</span>`]] : []),
    ...(passRate !== null ? [["Pass Rate", `<strong>${passRate}%</strong>`]] : []),
  ];

  const detailRows: [string, string][] = [
    ["Project Name",     project?.name || inspection?.projectName || "—"],
    ["Site Address",     siteAddress],
    ["Lot / DP Number",  project?.lotNumber || "—"],
    ["DA / BA Number",   project?.daNumber || "—"],
    ["Council / Permit", project?.councilRef || "—"],
    ["NCC Building Class", project?.buildingClassification || project?.nccClass || "—"],
    ["Inspection Type",  inspType],
    ["Inspection Date",  formatDate(inspection?.scheduledDate)],
    ["Inspection Time",  inspection?.scheduledTime || "—"],
    ["Inspector Name",   inspectorName],
  ];

  const checklistHtml = buildHtmlChecklistTable(checklistResults);

  const failIssues = issues.filter(i => i.status !== "resolved");

  return `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
  <!-- Header -->
  <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
    <div>
      <div style="font-size:22px;font-weight:700;letter-spacing:1px;">InspectProof</div>
      <div style="font-size:11px;color:#C5D92D;margin-top:4px;letter-spacing:0.5px;">Licensed Building Certifier · ABN —</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#ccc;">
      <div>${today}</div>
      <div style="margin-top:2px;color:#9ca3af;font-size:10px;">${typeLabel.toUpperCase()}</div>
    </div>
  </div>
  <!-- Title Banner -->
  <div style="border:2px solid ${accent.titleBorder};padding:18px 32px;background:${accent.titleBg};">
    <div style="font-size:18px;font-weight:700;color:${accent.titleColor};letter-spacing:1px;text-align:center;text-transform:uppercase;">${accent.titleText}</div>
    <div style="text-align:center;font-size:11px;color:#466DB5;margin-top:4px;">Issued under the Environmental Planning and Assessment Act 1979</div>
  </div>
  <!-- Body -->
  <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
    <!-- Details table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      ${detailRows.map(([label, value]) => `
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;width:36%;font-size:13px;">${label}</td>
        <td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">${value}</td>
      </tr>`).join("")}
    </table>

    <!-- Result box -->
    <div style="background:${resultBoxBg};border:1px solid ${resultBoxBdr};border-radius:6px;padding:14px 18px;margin-bottom:20px;">
      <div style="font-weight:700;color:${resultBoxClr};font-size:13px;margin-bottom:4px;">${resultLabel}</div>
      <div style="font-size:12px;color:${resultBoxClr};">${resultBody}</div>
    </div>

    <!-- Summary stats -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;">
      ${summaryRows.map(([k, v]) => `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px 14px;min-width:80px;text-align:center;">
        <div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${k}</div>
        <div style="font-size:18px;font-weight:700;color:#0B1933;margin-top:2px;">${v}</div>
      </div>`).join("")}
    </div>

    ${inspection?.notes ? `
    <!-- Inspector Notes -->
    <div style="margin-bottom:20px;">
      <div style="font-weight:600;color:#0B1933;font-size:13px;margin-bottom:8px;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">Inspector Notes</div>
      <div style="font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;">${inspection.notes}</div>
    </div>` : ""}

    ${failIssues.length > 0 ? `
    <!-- Open Issues -->
    <div style="margin-bottom:20px;">
      <div style="font-weight:600;color:#0B1933;font-size:13px;margin-bottom:8px;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">Open Issues / Defects (${failIssues.length})</div>
      ${failIssues.map((iss, i) => {
        const sevColor: Record<string, string> = { critical: "#b91c1c", major: "#c2410c", high: "#c2410c", minor: "#b45309", medium: "#b45309", low: "#15803d", cosmetic: "#6b7280" };
        const sevBg: Record<string, string> = { critical: "#fef2f2", major: "#fff7ed", high: "#fff7ed", minor: "#fffbeb", medium: "#fffbeb", low: "#f0fdf4", cosmetic: "#f9fafb" };
        const sc = sevColor[iss.severity ?? ""] ?? "#6b7280";
        const sb = sevBg[iss.severity ?? ""] ?? "#f9fafb";
        return `<div style="background:${sb};border-left:3px solid ${sc};padding:8px 12px;margin-bottom:6px;border-radius:0 4px 4px 0;">
          <div style="font-size:11px;font-weight:700;color:${sc};text-transform:uppercase;">${iss.severity || "Issue"} — ${iss.category || ""}</div>
          <div style="font-size:12px;color:#111827;margin-top:2px;">${iss.description || ""}</div>
          ${iss.nccReference ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">NCC: ${iss.nccReference}</div>` : ""}
        </div>`;
      }).join("")}
    </div>` : ""}

    <!-- Checklist -->
    <div style="margin-bottom:24px;">
      <div style="font-weight:600;color:#0B1933;font-size:13px;margin-bottom:12px;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">Inspection Checklist — Full Results</div>
      ${checklistHtml}
    </div>

    <!-- Signature -->
    <div style="border-top:2px solid #e5e7eb;padding-top:20px;">
      <div style="display:flex;justify-content:space-between;margin-top:16px;">
        <div>
          <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;padding-top:4px;"></div>
          <div style="font-size:11px;color:#6b7280;">Certifier Signature</div>
          <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">${inspectorName}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#6b7280;">Date Issued</div>
          <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">${today}</div>
        </div>
      </div>
    </div>
  </div>
  <!-- Footer -->
  <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
    This document was generated by InspectProof · ${project?.name || inspection?.projectName || ""} · ${today}
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
): Promise<string> {
  const typeLabel = REPORT_TYPE_LABELS[reportType] || reportType;
  const passItems = checklistResults.filter(i => i.result === "pass");
  const failItems = checklistResults.filter(i => i.result === "fail");
  const naItems = checklistResults.filter(i => i.result === "na");
  const pendingItems = checklistResults.filter(i => i.result === "pending");
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
    const relevantIssues = issues.filter(i => i.status !== "resolved");
    if (failItems.length === 0 && monitorItems.length === 0 && relevantIssues.length === 0) return "";
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
    if (relevantIssues.length > 0) {
      block += `\nOUTSTANDING ISSUES (${relevantIssues.length})\n`;
      relevantIssues.forEach((issue, idx) => {
        block += `\n${idx + 1}. ${issue.title} [${(issue.severity || "medium").toUpperCase()}]\n`;
        if (issue.description)     block += `   ${issue.description}\n`;
        if (issue.location)        block += `   Location: ${issue.location}\n`;
        if (issue.codeReference)   block += `   Code Ref: ${issue.codeReference}\n`;
        if (issue.responsibleParty) block += `   Responsible: ${issue.responsibleParty}\n`;
      });
    }
    return block;
  };

  // ── Universal summary — shown on every report type ─────────────────────────

  content += `
────────────────────────────────────────────────────────
CHECKLIST RESULTS SUMMARY
────────────────────────────────────────────────────────
Total Items Assessed: ${total}
Pass:                 ${passItems.length}
Monitor:              ${monitorItems.length}
Fail:                 ${failItems.length}
Not Applicable:       ${naItems.length}
Pending:              ${pendingItems.length}
Pass Rate:            ${passRate !== null ? `${passRate}%` : "—"}
Overall Result:       ${overallResult}
`;

  // ── Content sections per report type ───────────────────────────────────────
  // Consistent structure for every type:
  //   1. Type-specific summary stats (where relevant)
  //   2. Defects / non-conformance highlight block (when fails/monitors exist)
  //   3. INSPECTION CHECKLIST — FULL RESULTS (all items, always shown)

  if (reportType === "defect_notice" || reportType === "non_compliance_notice") {
    const heading = reportType === "non_compliance_notice" ? "NON-COMPLIANCE ITEMS" : "DEFECTS & NON-COMPLIANT ITEMS";
    const action  = reportType === "non_compliance_notice"
      ? "Action Required: Rectification required within 14 days; notify certifier upon completion."
      : "Action Required: Rectification required prior to re-inspection.";
    content += defectsBlock(heading, action);
    content += groupedChecklistBlock(checklistResults, "INSPECTION CHECKLIST — FULL RESULTS");
  }

  if (reportType === "inspection_certificate" || reportType === "compliance_report" || reportType === "summary") {
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
router.post("/generate", async (req, res) => {
  try {
    const { inspectionId, reportType, userId } = req.body;

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

    const issues = await db.select().from(issuesTable)
      .where(eq(issuesTable.inspectionId, inspection.id));

    let inspector: any = null;
    if (inspection.inspectorId) {
      const users = await db.select().from(usersTable).where(eq(usersTable.id, inspection.inspectorId));
      inspector = users[0] || null;
    }

    const inspType = (inspection.inspectionType || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    const typeLabel = REPORT_TYPE_LABELS[reportType] || reportType;
    const projectLabel = project?.name ?? "Standalone Inspection";
    const title = `${typeLabel} — ${inspType} — ${projectLabel}`;
    const content = generateReportHtml(reportType, project, inspection, checklistResults, issues, inspector);

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
        .set({ title, content, status: "draft", generatedById: userId || 1 })
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
      }).returning();
      report = inserted;
    }

    res.status(existing.length > 0 ? 200 : 201).json(await formatReport(report));
  } catch (err) {
    req.log.error({ err }, "Generate report error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = req.body;
    const generatedById = data.generatedById ?? data.userId ?? 1;
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

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const reports = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    const report = reports[0];
    if (!report) { res.status(404).json({ error: "not_found" }); return; }
    res.json(await formatReport(report));
  } catch (err) {
    req.log.error({ err }, "Get report error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Submit report for desktop review
router.post("/:id/submit", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
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
router.post("/:id/approve", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
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
router.post("/:id/send", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { sentTo } = req.body;
    const [updated] = await db.update(reportsTable)
      .set({ status: "sent", sentAt: new Date(), sentTo: sentTo || null })
      .where(eq(reportsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json(await formatReport(updated));
  } catch (err) {
    req.log.error({ err }, "Send report error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── PDF generation ────────────────────────────────────────────────────────────

const MARGIN = 50;
const FOOTER_H = 40;
const HEADER_H = 72;    // 68px navy + 4px pear accent
const CONTENT_TOP = 90; // cursor reset after header

function addPageHeader(doc: PDFKit.PDFDocument, typeLabel: string) {
  const pageW = doc.page.width;

  doc.save();

  // ── Background bars ──────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, 68).fill(COLOR_NAVY);
  doc.rect(0, 68, pageW, 4).fill(COLOR_PEAR);

  // ── Logo badge — pear rounded square matching the landing page icon ───────
  const badgeX = MARGIN;
  const badgeY = 14;
  const badgeS = 40; // square
  doc.roundedRect(badgeX, badgeY, badgeS, badgeS, 6).fill(COLOR_PEAR);

  // Clipboard body (navy) — sits inside the pear badge
  const cbX = badgeX + 7;
  const cbY = badgeY + 11;
  const cbW = badgeS - 14;
  const cbH = badgeS - 15;
  doc.roundedRect(cbX, cbY, cbW, cbH, 2).fill(COLOR_NAVY);

  // Clip at top centre (navy, overlapping top edge of body)
  const clipW = 10;
  const clipH = 5;
  const clipX = badgeX + (badgeS - clipW) / 2;
  const clipY = badgeY + 7;
  doc.roundedRect(clipX, clipY, clipW, clipH, 1.5).fill(COLOR_NAVY);

  // Three list lines (pear) inside the clipboard body
  const lineX = cbX + 3;
  const lineW = cbW - 6;
  for (let i = 0; i < 3; i++) {
    doc.rect(lineX, cbY + 4 + i * 5, lineW, 1.5).fill(COLOR_PEAR);
  }

  // ── Brand name — Oddlini, centred vertically in the 68px bar ─────────────
  const textX = badgeX + badgeS + 10;
  doc.fillColor("#ffffff").fontSize(16).font(FODDLINI)
    .text("InspectProof", textX, 25, { lineBreak: false });

  // ── Report type label (right-aligned) ────────────────────────────────────
  doc.fillColor("rgba(255,255,255,0.6)").fontSize(7.5).font(F)
    .text(typeLabel.toUpperCase(), 0, 28, { align: "right", width: pageW - MARGIN, lineBreak: false });

  doc.restore();

  // ── Reset cursor below the header ────────────────────────────────────────
  doc.x = MARGIN;
  doc.y = CONTENT_TOP;
}

function addPageFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  doc.save();
  doc.rect(0, pageH - FOOTER_H, pageW, FOOTER_H).fill(COLOR_NAVY);
  doc.fillColor("#9CA3AF").fontSize(7).font(F)
    .text(
      `InspectProof  ·  Confidential  ·  Page ${pageNum} of ${totalPages}`,
      MARGIN, pageH - FOOTER_H + 15,
      { align: "center", width: pageW - MARGIN * 2 },
    );
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
): PDFKit.PDFDocument {
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

  // Header on first page
  addPageHeader(doc, typeLabel);

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

  // ── Parse and render content ───────────────────────────────────────────────
  const lines = (report.content || "").split("\n");
  const bottomLimit = doc.page.height - FOOTER_H - 30;

  const checkPageBreak = (needed = 20) => {
    if (doc.y + needed > bottomLimit) {
      doc.addPage();
      addPageHeader(doc, typeLabel);
    }
  };

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

    // Section header: ALL CAPS, short, comes after or before a divider line
    const prevIsDivider = i > 0 && /^─{5,}$/.test(lines[i - 1].trim());
    const nextIsDivider = i + 1 < lines.length && /^─{5,}$/.test(lines[i + 1].trim());
    const looksLikeHeader = line.trim().length > 2 && line.trim().length < 65
      && line.trim() === line.trim().toUpperCase()
      && /[A-Z]/.test(line.trim())
      && !/^[\d\[\(✓✗—]/.test(line.trim())
      && (prevIsDivider || nextIsDivider);

    if (looksLikeHeader) {
      checkPageBreak(40);
      doc.moveDown(0.6);
      const headerY = doc.y;
      doc.rect(MARGIN, headerY, contentW, 22).fill("#E8ECF2");
      // Left accent bar
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
      checkPageBreak(18);
      const resultStr = checkMatch[2].trim();
      const desc = checkMatch[3].trim();
      const isPass = resultStr.includes("PASS");
      const isFail = resultStr.includes("FAIL");
      const isMonitor = resultStr.includes("MONITOR");
      const badgeColor = isPass ? "#16A34A" : isFail ? "#DC2626" : isMonitor ? "#D97706" : "#9CA3AF";
      const badgeBg = isPass ? "#F0FDF4" : isFail ? "#FEF2F2" : isMonitor ? "#FFFBEB" : "#F9FAFB";
      const badgeBorder = isPass ? "#BBF7D0" : isFail ? "#FECACA" : isMonitor ? "#FDE68A" : "#E5E7EB";
      const badgeText = isPass ? "PASS" : isFail ? "FAIL" : isMonitor ? "MON" : "N/A";
      const badgeW = isMonitor ? 36 : 36;

      // Subtle row bg for fail items
      if (isFail) {
        doc.rect(MARGIN - 4, doc.y - 2, contentW + 8, 18).fill("#FFF5F5");
      }

      const rowY = doc.y;
      doc.roundedRect(MARGIN, rowY + 1, badgeW, 13, 2).fillAndStroke(badgeBg, badgeBorder);
      doc.fillColor(badgeColor).fontSize(7).font(FB)
        .text(badgeText, MARGIN, rowY + 4, { width: badgeW, align: "center", lineBreak: false });
      doc.fillColor("#1F2937").fontSize(9).font(F)
        .text(desc, MARGIN + 43, rowY, { width: contentW - 43 });
      doc.moveDown(0.45);

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
      checkPageBreak(15);
      const subText = line.trim();
      const subKv = subText.match(/^([A-Za-z][A-Za-z 0-9\/]+?):\s+(.+)$/);
      if (subKv) {
        const rowY = doc.y;
        doc.fillColor("#6B7280").fontSize(8.5).font(FB)
          .text(subKv[1] + ":", MARGIN + 43, rowY, { width: 90, lineBreak: false });
        doc.fillColor("#374151").fontSize(8.5).font(F)
          .text(subKv[2], MARGIN + 135, rowY, { width: contentW - 135 });
        doc.moveDown(0.35);
      } else {
        doc.fillColor("#374151").fontSize(9).font(F)
          .text(subText, MARGIN + 43, doc.y, { width: contentW - 43 });
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
    if (line.includes("{{SIGNATURE}}")) {
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
          // fallback if image fails
          doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + 200, doc.y + 2)
            .strokeColor("#9CA3AF").lineWidth(0.75).stroke();
          doc.y = doc.y + 16;
        }
      } else {
        // Blank signature line
        doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + 200, doc.y + 2)
          .strokeColor("#9CA3AF").lineWidth(0.75).stroke();
        doc.y = doc.y + 16;
      }
      doc.moveDown(0.3);
      continue;
    }

    // Default body text
    checkPageBreak(18);
    doc.fillColor("#1F2937").fontSize(9.5).font(F)
      .text(line.trim(), MARGIN, doc.y, { width: contentW });
    doc.moveDown(0.3);
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
      addPageHeader(doc, "Photo Documentation");

      // Section heading
      const checkPageBreakAppendix = (needed = 20) => {
        if (doc.y + needed > doc.page.height - FOOTER_H - 30) {
          doc.addPage();
          addPageHeader(doc, "Photo Documentation");
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
    addPageFooter(doc, p + 1, totalPages);
  }

  return doc;
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

    const projects = report.projectId
      ? await db.select().from(projectsTable).where(eq(projectsTable.id, report.projectId))
      : [];
    const project = projects[0] ?? null;

    // Fetch inspector's signature if available
    let signatureBuffer: Buffer | undefined;
    if (report.inspectionId) {
      try {
        const inspections = await db.select().from(inspectionsTable)
          .where(eq(inspectionsTable.id, report.inspectionId));
        const inspectorId = inspections[0]?.inspectorId;
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

        // First pass: collect all paths and fetch buffers
        const rowsWithPhotos: Array<{ row: typeof checklistRows[0]; paths: string[] }> = [];

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
        }

        // Fetch all photo buffers concurrently
        const allPaths = [...new Set(rowsWithPhotos.flatMap(r => r.paths))];
        await Promise.allSettled(allPaths.map(async (photoPath) => {
          if (photoBuffers!.has(photoPath)) return;
          try {
            const { buffer } = await storageService.fetchObjectBuffer(photoPath);
            photoBuffers!.set(photoPath, buffer);
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
            const issRows = await db.select().from(issuesTable).where(eq(issuesTable.inspectionId, insp.id));
            const plainText = await generateReportContent(report.reportType || "summary", proj, insp, clResults, issRows, inspectorForPdf);
            formatted = { ...formatted, content: plainText };
          }
        }
      } catch (htmlFallbackErr) {
        req.log.warn({ htmlFallbackErr }, "Could not regenerate plain text for PDF; using stored content as-is");
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

    const doc = buildPdf(formatted, project, signatureBuffer, photosByDesc, photoBuffers, checklistPhotos);

    // ── Append markup pages at end of report ─────────────────────────────────
    if (markupBuffers.length > 0) {
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

      // Add a "Markups" cover page
      const coverPage = merged.addPage([595.28, 841.89]); // A4
      const { rgb } = await import("pdf-lib");
      coverPage.drawRectangle({ x: 0, y: 821.89, width: 595.28, height: 20, color: rgb(0.773, 0.851, 0.176) }); // pear bar
      coverPage.drawRectangle({ x: 0, y: 0, width: 595.28, height: 821.89, color: rgb(0.97, 0.98, 0.99) });
      coverPage.drawText("MARKUPS", {
        x: 40,
        y: 800,
        size: 18,
        color: rgb(0.043, 0.098, 0.2),
      });
      coverPage.drawText(`${markupBuffers.length} marked-up document${markupBuffers.length !== 1 ? "s" : ""} attached to this inspection.`, {
        x: 40,
        y: 775,
        size: 11,
        color: rgb(0.28, 0.43, 0.71),
      });

      // Embed each markup PDF
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

      const mergedBytes = await merged.save();
      const mergedBuffer = Buffer.from(mergedBytes);

      const safeName = (report.title || "report")
        .replace(/[^a-z0-9\s\-_]/gi, "")
        .replace(/\s+/g, "_")
        .slice(0, 80);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${safeName}.pdf"`);
      res.end(mergedBuffer);
      return;
    }

    const safeName = (report.title || "report")
      .replace(/[^a-z0-9\s\-_]/gi, "")
      .replace(/\s+/g, "_")
      .slice(0, 80);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}.pdf"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    req.log.error({ err }, "PDF generation error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Delete report ──────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
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
