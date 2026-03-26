import path from "path";
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { ObjectStorageService } from "../lib/objectStorage";

const FONT_DIR        = path.join(__dirname, "..", "fonts");
const FONT_REGULAR    = path.join(FONT_DIR, "PlusJakartaSans-Regular.ttf");
const FONT_BOLD       = path.join(FONT_DIR, "PlusJakartaSans-Bold.ttf");
const FONT_ODDLINI_UX = path.join(FONT_DIR, "Oddlini-MediumUltraExpanded.otf");
const F        = "PJS";
const FB       = "PJS-Bold";
const FODDLINI = "OddliniUX";
import {
  db, reportsTable, projectsTable, inspectionsTable, issuesTable,
  usersTable, checklistResultsTable, checklistItemsTable,
} from "@workspace/db";

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
  const total = checklistResults.length;
  const passRate = total > 0 ? Math.round((passItems.length / Math.max(total - naItems.length, 1)) * 100) : null;
  const overallResult = failItems.length > 0 ? "FAIL" : passItems.length > 0 ? "PASS" : "PENDING";

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" }) : "—";

  const inspType = (inspection?.inspectionType || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  let content = `${typeLabel.toUpperCase()}
${"=".repeat(typeLabel.length)}

DOCUMENT REFERENCE: ${project.certificationNumber || "—"}
DATE ISSUED: ${formatDate(inspection?.completedDate || new Date().toISOString().split("T")[0])}
PREPARED BY: ${inspector ? `${inspector.firstName} ${inspector.lastName}` : "—"}
INSPECTOR QUALIFICATIONS: ${ROLE_LABELS[inspector?.role ?? ""] || inspector?.role || "Built Environment Professional"}

────────────────────────────────────────────────────────
PROJECT DETAILS
────────────────────────────────────────────────────────
Project Name:         ${project.name}
Site Address:         ${project.siteAddress}, ${project.suburb} ${project.state} ${project.postcode}
DA / Approval No:     ${project.daNumber || "—"}
Certification No:     ${project.certificationNumber || "—"}
Building Class:       ${project.buildingClassification}
Client / Owner:       ${project.clientName}
Builder:              ${project.builderName || "—"}
Designer / Architect:  ${project.designerName || "—"}

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
        const icon = item.result === "pass" ? "✓ PASS" : item.result === "fail" ? "✗ FAIL" : item.result === "monitor" ? "◎ MONITOR" : "— N/A";
        block += `${idx + 1}. [${icon}] ${item.description}\n`;
        if (item.codeReference) block += `   Code Ref: ${item.codeReference}\n`;
        if (item.severity)      block += `   Severity: ${item.severity.toUpperCase()}\n`;
        if (item.location)      block += `   Location: ${item.location}\n`;
        if (item.tradeAllocated) block += `   Trade: ${item.tradeAllocated}\n`;
        if (item.recommendedAction) block += `   Recommended Action: ${item.recommendedAction}\n`;
        if (item.notes)         block += `   Notes: ${item.notes}\n`;
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

  // ── Content sections per report type ───────────────────────────────────────

  if (reportType === "inspection_certificate" || reportType === "compliance_report" || reportType === "summary") {
    content += `
────────────────────────────────────────────────────────
CHECKLIST RESULTS SUMMARY
────────────────────────────────────────────────────────
Total Items Assessed: ${total}
Pass:                 ${passItems.length}
Monitor:              ${monitorItems.length}
Fail:                 ${failItems.length}
Not Applicable:       ${naItems.length}
Pass Rate:            ${passRate !== null ? `${passRate}%` : "—"}
Overall Result:       ${overallResult}
`;
    content += groupedChecklistBlock(checklistResults.filter(i => i.result !== "na"));
  }

  if (reportType === "defect_notice" || reportType === "non_compliance_notice") {
    const heading = reportType === "non_compliance_notice" ? "NON-COMPLIANCE ITEMS" : "DEFECTS & NON-COMPLIANT ITEMS";
    const action  = reportType === "non_compliance_notice"
      ? "Action Required: Rectification required within 14 days; notify certifier upon completion."
      : "Action Required: Rectification required prior to re-inspection.";
    content += defectsBlock(heading, action);
  } else if (failItems.length > 0) {
    content += defectsBlock("DEFECTS IDENTIFIED", "Action Required: Rectification required prior to re-inspection.");
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
    content += groupedChecklistBlock(checklistResults.filter(i => i.result !== "na"), "QC ITEM DETAIL");
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("NON-CONFORMING ITEMS", "Action Required: Corrective work required before sign-off.");
    }
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
    content += groupedChecklistBlock(passItems, "CONFORMING ITEMS");
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
    content += groupedChecklistBlock(checklistResults.filter(i => i.result !== "na"), "WHS INSPECTION FINDINGS");
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("WHS BREACHES & CAUTIONS", "Required Action: Immediate rectification required under WHS Act 2011.");
    }
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
    content += groupedChecklistBlock(checklistResults.filter(i => i.result !== "na"), "HAZARD ASSESSMENT FINDINGS");
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("IDENTIFIED HAZARDS REQUIRING CONTROL", "Required Control Measure: Implement risk control(s) per hierarchy of controls before works resume.");
    }
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
    content += defectsBlock("OPEN CORRECTIVE ACTIONS", "Status: Open — Corrective action required. Notify site supervisor upon completion.");
    content += groupedChecklistBlock(passItems, "CLOSED / COMPLETED ACTIONS");
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
    content += groupedChecklistBlock(checklistResults.filter(i => i.result !== "na"), "PROPERTY CONDITION FINDINGS");
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("DEFECTS & ITEMS REQUIRING ATTENTION", "Recommended Action: Obtain specialist quotation before settlement.");
    }
  }

  if (reportType === "annual_fire_safety") {
    content += `
────────────────────────────────────────────────────────
ANNUAL FIRE SAFETY STATEMENT
────────────────────────────────────────────────────────
Statement Reference:   ${project.certificationNumber || "—"}
Building Address:      ${project.siteAddress}, ${project.suburb} ${project.state} ${project.postcode}
Building Class:        ${project.buildingClassification}

ESSENTIAL FIRE SAFETY MEASURES ASSESSMENT
────────────────────────────────────────────────────────
Total Measures Assessed: ${total}
Compliant:               ${passItems.length}
Non-Compliant:           ${failItems.length}
Under Observation:       ${monitorItems.length}
Not Applicable:          ${naItems.length}
Overall Compliance:      ${failItems.length === 0 ? "COMPLIANT" : "NON-COMPLIANT"}
`;
    content += groupedChecklistBlock(checklistResults.filter(i => i.result !== "na"), "ESSENTIAL FIRE SAFETY MEASURES");
    if (failItems.length > 0) {
      content += defectsBlock("NON-COMPLIANT FIRE SAFETY MEASURES", "Action Required: Rectification required within 14 days. Council must be notified of non-compliance.");
    }
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
    content += groupedChecklistBlock(checklistResults.filter(i => i.result !== "na"), "FIRE SAFETY INSPECTION ITEMS");
    if (failItems.length > 0 || monitorItems.length > 0) {
      content += defectsBlock("NON-COMPLIANT FIRE SAFETY ITEMS", "Required Action: Rectification required prior to re-inspection. Do not occupy if fire egress is compromised.");
    }
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

router.get("/", async (req, res) => {
  try {
    const { projectId, inspectionId } = req.query;
    let reports = await db.select().from(reportsTable)
      .orderBy(sql`${reportsTable.createdAt} DESC`);

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

    const projects = await db.select().from(projectsTable)
      .where(eq(projectsTable.id, inspection.projectId));
    const project = projects[0];
    if (!project) { res.status(404).json({ error: "project_not_found" }); return; }

    const checklistRows = await db.select({
      result: checklistResultsTable,
      item: checklistItemsTable,
    }).from(checklistResultsTable)
      .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
      .where(eq(checklistResultsTable.inspectionId, inspection.id));

    const checklistResults = checklistRows.map(r => ({
      result: r.result.result,
      notes: r.result.notes,
      category: r.item.category,
      description: r.item.description,
      codeReference: r.item.codeReference,
      riskLevel: r.item.riskLevel,
    }));

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
    const title = `${typeLabel} — ${inspType} — ${project.name}`;
    const content = await generateReportContent(reportType, project, inspection, checklistResults, issues, inspector);

    const [report] = await db.insert(reportsTable).values({
      projectId: project.id,
      inspectionId: inspection.id,
      title,
      reportType,
      status: "draft",
      content,
      generatedById: userId || 1,
    }).returning();

    res.status(201).json(await formatReport(report));
  } catch (err) {
    req.log.error({ err }, "Generate report error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = req.body;
    const [report] = await db.insert(reportsTable).values({
      projectId: data.projectId,
      inspectionId: data.inspectionId,
      title: data.title,
      reportType: data.reportType || "summary",
      status: "draft",
      content: data.content,
      generatedById: data.generatedById,
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

function buildPdf(report: any, _project: any, signatureBuffer?: Buffer): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 88, bottom: FOOTER_H + 20, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: report.title || "Report", Author: "InspectProof" },
  });

  doc.registerFont(F,        FONT_REGULAR);
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
      const badgeColor = isPass ? "#16A34A" : isFail ? "#DC2626" : "#9CA3AF";
      const badgeBg = isPass ? "#F0FDF4" : isFail ? "#FEF2F2" : "#F9FAFB";
      const badgeBorder = isPass ? "#BBF7D0" : isFail ? "#FECACA" : "#E5E7EB";
      const badgeText = isPass ? "PASS" : isFail ? "FAIL" : "N/A";

      const rowY = doc.y;
      // Badge box — slightly larger for readability
      doc.roundedRect(MARGIN, rowY + 1, 36, 13, 2).fillAndStroke(badgeBg, badgeBorder);
      doc.fillColor(badgeColor).fontSize(7).font(FB)
        .text(badgeText, MARGIN, rowY + 4, { width: 36, align: "center", lineBreak: false });
      // Description
      doc.fillColor("#1F2937").fontSize(9).font(F)
        .text(desc, MARGIN + 43, rowY, { width: contentW - 43 });
      doc.moveDown(0.45);
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
  try {
    const id = parseInt(req.params.id);
    const reports = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    const report = reports[0];
    if (!report) { res.status(404).json({ error: "not_found" }); return; }

    const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, report.projectId));
    const project = projects[0];

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
            const file = await storageService.getObjectEntityFile(signatureUrl);
            const response = await storageService.downloadObject(file);
            if (response.body) {
              const chunks: Buffer[] = [];
              const reader = response.body.getReader();
              let done = false;
              while (!done) {
                const result = await reader.read();
                done = result.done;
                if (result.value) chunks.push(Buffer.from(result.value));
              }
              signatureBuffer = Buffer.concat(chunks);
            }
          }
        }
      } catch (sigErr) {
        req.log.warn({ sigErr }, "Could not load signature — omitting from PDF");
      }
    }

    const formatted = await formatReport(report);
    const doc = buildPdf(formatted, project, signatureBuffer);

    const safeName = (report.title || "report")
      .replace(/[^a-z0-9\s\-_]/gi, "")
      .replace(/\s+/g, "_")
      .slice(0, 80);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    req.log.error({ err }, "PDF generation error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
