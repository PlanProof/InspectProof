import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
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

  // ── Logo badge (pear rounded rect with "IP") ─────────────────────────────
  const badgeX = MARGIN;
  const badgeY = 15;
  const badgeW = 36;
  const badgeH = 38;
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 5).fill(COLOR_PEAR);

  // Vertical bar accent inside badge (left edge)
  doc.rect(badgeX + 5, badgeY + 6, 3, badgeH - 12).fill(COLOR_NAVY);

  // "IP" centred in badge
  doc.fillColor(COLOR_NAVY).fontSize(13).font("Helvetica-Bold")
    .text("IP", badgeX + 8, badgeY + 12, { width: badgeW - 8, align: "center", lineBreak: false });

  // ── Brand text ────────────────────────────────────────────────────────────
  const textX = badgeX + badgeW + 9;
  doc.fillColor("#ffffff").fontSize(15).font("Helvetica-Bold")
    .text("InspectProof", textX, 19, { lineBreak: false });
  doc.fillColor(COLOR_PEAR).fontSize(7.5).font("Helvetica")
    .text("Certification & Inspection Platform", textX, 40, { lineBreak: false });

  // ── Report type label (right-aligned) ────────────────────────────────────
  doc.fillColor("rgba(255,255,255,0.75)").fontSize(7.5).font("Helvetica-Bold")
    .text(typeLabel.toUpperCase(), 0, 28, { align: "right", width: pageW - MARGIN, lineBreak: false });

  doc.restore();

  // ── CRITICAL: reset cursor below the header ───────────────────────────────
  // doc.save()/restore() preserves PDF graphics state but NOT the JS cursor.
  // Without this, content starts at wherever the last text() call landed (~y=28),
  // which is inside the navy bar and causes text/header overlap.
  doc.x = MARGIN;
  doc.y = CONTENT_TOP;
}

function addPageFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  doc.save();
  doc.rect(0, pageH - FOOTER_H, pageW, FOOTER_H).fill(COLOR_NAVY);
  doc.fillColor("#9CA3AF").fontSize(7).font("Helvetica")
    .text(
      `InspectProof Certification Services  ·  Confidential  ·  Page ${pageNum} of ${totalPages}`,
      MARGIN, pageH - FOOTER_H + 15,
      { align: "center", width: pageW - MARGIN * 2 },
    );
  doc.restore();
}

function buildPdf(report: any, _project: any): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 88, bottom: FOOTER_H + 20, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: report.title || "Report", Author: "InspectProof" },
  });

  const pageW = doc.page.width;
  const contentW = pageW - MARGIN * 2;
  const typeLabel = (report.reportTypeLabel || report.reportType || "Report").toUpperCase();

  // Header on first page
  addPageHeader(doc, typeLabel);

  // ── Document title ─────────────────────────────────────────────────────────
  doc.fillColor(COLOR_NAVY).fontSize(13).font("Helvetica-Bold")
    .text(report.title || "Inspection Report", { width: contentW });

  doc.moveDown(0.4);

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
  doc.roundedRect(pillX, pillY, 88, 15, 3).fill(sc);
  doc.fillColor("#ffffff").fontSize(7).font("Helvetica-Bold")
    .text(sl, pillX, pillY + 4, { width: 88, align: "center" });
  doc.y = pillY + 22;

  // Separator line
  doc.moveTo(MARGIN, doc.y)
    .lineTo(pageW - MARGIN, doc.y)
    .strokeColor(COLOR_PEAR).lineWidth(1.5).stroke();
  doc.moveDown(0.8);

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

    // Blank line → small gap
    if (line.trim() === "") {
      doc.moveDown(0.3);
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
      checkPageBreak(32);
      doc.moveDown(0.5);
      const headerY = doc.y;
      doc.rect(MARGIN, headerY, contentW, 17).fill("#E8ECF2");
      doc.fillColor(COLOR_NAVY).fontSize(8).font("Helvetica-Bold")
        .text(line.trim(), MARGIN + 6, headerY + 5, { width: contentW - 12 });
      doc.y = headerY + 22;
      continue;
    }

    // Key-value: "Label:   value" (2+ spaces after colon used for alignment)
    const kvMatch = line.match(/^([A-Za-z][A-Za-z 0-9\/\-&]+?):\s{2,}(.+)$/);
    if (kvMatch) {
      checkPageBreak(14);
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      const rowY = doc.y;
      // Key column
      doc.fillColor(COLOR_NAVY).fontSize(8).font("Helvetica-Bold")
        .text(key + ":", MARGIN, rowY, { width: 145, lineBreak: false });
      // Value column — start at fixed x offset
      doc.fillColor("#1F2937").fontSize(8).font("Helvetica")
        .text(val, MARGIN + 150, rowY, { width: contentW - 150 });
      // Advance past the taller of the two columns
      doc.moveDown(0.15);
      continue;
    }

    // Checklist item: "1. [✓ PASS] description" or "1. [✗ FAIL] ..."
    const checkMatch = line.match(/^(\d+)\.\s+\[(.+?)\]\s+(.*)$/);
    if (checkMatch) {
      checkPageBreak(14);
      const resultStr = checkMatch[2].trim();
      const desc = checkMatch[3].trim();
      const isPass = resultStr.includes("PASS");
      const isFail = resultStr.includes("FAIL");
      const badgeColor = isPass ? "#16A34A" : isFail ? "#DC2626" : "#9CA3AF";
      const badgeBg = isPass ? "#F0FDF4" : isFail ? "#FEF2F2" : "#F9FAFB";
      const badgeBorder = isPass ? "#BBF7D0" : isFail ? "#FECACA" : "#E5E7EB";
      const badgeText = isPass ? "PASS" : isFail ? "FAIL" : "N/A";

      const rowY = doc.y;
      // Badge box
      doc.roundedRect(MARGIN, rowY, 32, 12, 2).fillAndStroke(badgeBg, badgeBorder);
      doc.fillColor(badgeColor).fontSize(6.5).font("Helvetica-Bold")
        .text(badgeText, MARGIN, rowY + 3, { width: 32, align: "center", lineBreak: false });
      // Description
      doc.fillColor("#1F2937").fontSize(8).font("Helvetica")
        .text(desc, MARGIN + 38, rowY, { width: contentW - 38 });
      doc.moveDown(0.2);
      continue;
    }

    // Sub-detail lines (indented with spaces, e.g. "   Code Ref: ...")
    if (/^\s{2,}/.test(raw)) {
      checkPageBreak(12);
      const subText = line.trim();
      const subKv = subText.match(/^([A-Za-z][A-Za-z 0-9\/]+?):\s+(.+)$/);
      if (subKv) {
        const rowY = doc.y;
        doc.fillColor("#6B7280").fontSize(7.5).font("Helvetica-Bold")
          .text(subKv[1] + ":", MARGIN + 38, rowY, { width: 90, lineBreak: false });
        doc.fillColor("#374151").fontSize(7.5).font("Helvetica")
          .text(subKv[2], MARGIN + 130, rowY, { width: contentW - 130 });
        doc.moveDown(0.15);
      } else {
        doc.fillColor("#374151").fontSize(8).font("Helvetica")
          .text(subText, MARGIN + 38, doc.y, { width: contentW - 38 });
        doc.moveDown(0.1);
      }
      continue;
    }

    // Numbered items without brackets: "Item 1: ..." or "1. description"
    const numberedMatch = line.match(/^(Item \d+|[\d]+\.)\s+(.+)$/);
    if (numberedMatch) {
      checkPageBreak(14);
      doc.fillColor(COLOR_NAVY).fontSize(8).font("Helvetica-Bold")
        .text(numberedMatch[1], MARGIN, doc.y, { width: 45, lineBreak: false });
      doc.fillColor("#1F2937").fontSize(8).font("Helvetica")
        .text(numberedMatch[2], MARGIN + 48, doc.y - doc.currentLineHeight(), { width: contentW - 48 });
      doc.moveDown(0.2);
      continue;
    }

    // Default body text
    checkPageBreak(14);
    doc.fillColor("#1F2937").fontSize(8.5).font("Helvetica")
      .text(line.trim(), MARGIN, doc.y, { width: contentW });
    doc.moveDown(0.1);
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

    const formatted = await formatReport(report);
    const doc = buildPdf(formatted, project);

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
