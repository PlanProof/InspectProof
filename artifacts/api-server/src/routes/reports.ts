import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db, reportsTable, projectsTable, inspectionsTable, issuesTable,
  usersTable, checklistResultsTable, checklistItemsTable,
} from "@workspace/db";

const router: IRouter = Router();

// ── Report content generator ──────────────────────────────────────────────────

const REPORT_TYPE_LABELS: Record<string, string> = {
  inspection_certificate: "Inspection Certificate",
  compliance_report: "Compliance Report",
  defect_notice: "Defect Notice",
  non_compliance_notice: "Non-Compliance Notice",
  summary: "Inspection Summary",
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
INSPECTOR QUALIFICATIONS: ${inspector?.role || "Building Certifier"}

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
Designer / Architect: ${project.designerName || "—"}

────────────────────────────────────────────────────────
INSPECTION DETAILS
────────────────────────────────────────────────────────
Inspection Type:      ${inspType}
Inspection Date:      ${formatDate(inspection?.scheduledDate)}
Completion Date:      ${formatDate(inspection?.completedDate)}
Weather Conditions:   ${inspection?.weatherConditions || "Not recorded"}
Duration:             ${inspection?.duration ? `${inspection.duration} minutes` : "Not recorded"}
`;

  if (reportType === "inspection_certificate" || reportType === "compliance_report" || reportType === "summary") {
    content += `
────────────────────────────────────────────────────────
CHECKLIST RESULTS SUMMARY
────────────────────────────────────────────────────────
Total Items Assessed: ${total}
Pass:                 ${passItems.length}
Fail:                 ${failItems.length}
Not Applicable:       ${naItems.length}
Pass Rate:            ${passRate !== null ? `${passRate}%` : "—"}
Overall Result:       ${overallResult}
`;

    if (checklistResults.length > 0) {
      const grouped: Record<string, any[]> = {};
      checklistResults.forEach(item => {
        const cat = item.category || "General";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      });

      content += `\n────────────────────────────────────────────────────────\nDETAILED CHECKLIST RESULTS\n────────────────────────────────────────────────────────\n`;
      Object.entries(grouped).forEach(([cat, items]) => {
        content += `\n${cat.toUpperCase()}\n${"-".repeat(cat.length)}\n`;
        items.forEach((item, idx) => {
          const resultIcon = item.result === "pass" ? "✓ PASS" : item.result === "fail" ? "✗ FAIL" : "— N/A";
          content += `${idx + 1}. [${resultIcon}] ${item.description}\n`;
          if (item.codeReference) content += `   Code Ref: ${item.codeReference}\n`;
          if (item.notes) content += `   Notes: ${item.notes}\n`;
        });
      });
    }
  }

  if (reportType === "defect_notice" || reportType === "non_compliance_notice" || failItems.length > 0) {
    const relevantIssues = issues.filter(i => i.status !== "resolved");

    if (failItems.length > 0 || relevantIssues.length > 0) {
      content += `\n────────────────────────────────────────────────────────\n`;
      content += reportType === "non_compliance_notice"
        ? "NON-COMPLIANCE ITEMS\n"
        : "DEFECTS & NON-COMPLIANT ITEMS\n";
      content += `────────────────────────────────────────────────────────\n`;

      failItems.forEach((item, idx) => {
        content += `\nItem ${idx + 1}: ${item.description}\n`;
        if (item.codeReference) content += `  NCC Reference: ${item.codeReference}\n`;
        if (item.notes) content += `  Inspector Notes: ${item.notes}\n`;
        content += `  Action Required: Rectification required prior to re-inspection\n`;
      });

      if (relevantIssues.length > 0) {
        content += `\nOUTSTANDING ISSUES (${relevantIssues.length})\n`;
        relevantIssues.forEach((issue, idx) => {
          content += `\n${idx + 1}. ${issue.title} [${(issue.severity || "medium").toUpperCase()}]\n`;
          if (issue.description) content += `   ${issue.description}\n`;
          if (issue.location) content += `   Location: ${issue.location}\n`;
          if (issue.codeReference) content += `   Code Ref: ${issue.codeReference}\n`;
          if (issue.responsibleParty) content += `   Responsible: ${issue.responsibleParty}\n`;
        });
      }
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
  } else {
    content += `This report has been prepared based on a site inspection conducted on the date noted above. All findings are based on conditions observed at the time of inspection.`;
  }

  content += `

Inspector Signature: ___________________________
Name: ${inspector ? `${inspector.firstName} ${inspector.lastName}` : "—"}
Date: ${formatDate(inspection?.completedDate || new Date().toISOString().split("T")[0])}

This document is issued by InspectProof Certification Services.
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
    const { projectId } = req.query;
    let reports = await db.select().from(reportsTable)
      .orderBy(sql`${reportsTable.createdAt} DESC`);

    if (projectId) reports = reports.filter(r => r.projectId === parseInt(projectId as string));

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

export default router;
