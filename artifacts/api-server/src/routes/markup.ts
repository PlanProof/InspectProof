import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { PDFDocument, rgb, LineCapStyle } from "pdf-lib";
import {
  db,
  documentsTable,
  checklistResultsTable,
  issuesTable,
  projectsTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
const storage = new ObjectStorageService();

/**
 * POST /api/markup/generate
 *
 * Accepts per-page annotation SVG paths (strokes + text) and renders them
 * server-side onto each annotated PDF page as a transparent overlay.
 * All pages from the original PDF are preserved in the output document —
 * unannotated pages are copied verbatim; annotated pages get the overlay.
 *
 * Accepts an optional issueId to link the markup document to a specific
 * defect/issue record via the markupDocumentId foreign key.
 *
 * Body:
 *   documentUrl      — full storage URL of the original PDF
 *   annotatedPages   — array of { pageNumber, strokes, textAnnotations, viewportW, viewportH }
 *   documentName     — human-readable name for the output document
 *   projectId?       — links the new document to a project
 *   inspectionId?    — links the new document to an inspection
 *   itemId?          — checklist result id to attach this markup to
 *   issueId?         — issues.id to link this markup document to
 */
router.post("/markup/generate", requireAuth, async (req, res) => {
  const {
    documentUrl,
    mimeType,
    annotatedPages,
    documentName,
    projectId,
    inspectionId,
    itemId,
    issueId,
  } = req.body as {
    documentUrl: string;
    mimeType?: string;
    annotatedPages: {
      pageNumber: number;
      strokes: {
        points: { x: number; y: number }[];
        color: string;
        width: number;
      }[];
      textAnnotations: {
        text: string;
        x: number;
        y: number;
        fontSize: number;
        color: string;
      }[];
      viewportW: number;
      viewportH: number;
    }[];
    documentName: string;
    projectId?: number;
    inspectionId?: number;
    itemId?: number;
    issueId?: number;
  };

  if (!documentUrl || !annotatedPages?.length || !documentName) {
    res.status(400).json({ error: "missing_fields" });
    return;
  }

  // Normalise documentUrl — mobile sends the full API URL
  // (e.g. https://host/api/storage/objects/uploads/uuid), but
  // fetchObjectBuffer expects just the object path (/objects/uploads/uuid).
  let objectStoragePath = documentUrl;
  const apiStorageMarker = "/api/storage";
  const markerIdx = objectStoragePath.indexOf(apiStorageMarker);
  if (markerIdx !== -1) {
    objectStoragePath = objectStoragePath.slice(markerIdx + apiStorageMarker.length);
  }

  // Detect whether the source document is an image (JPEG/PNG) or a PDF.
  const isImageSource =
    mimeType?.startsWith("image/") ||
    /\.(jpe?g|png|gif|webp)$/i.test(documentUrl);

  try {
    // ── 1. Download the source file ───────────────────────────────────────────
    const { buffer: srcBuffer, contentType: detectedMime } = await storage.fetchObjectBuffer(objectStoragePath);

    let originalPdf: PDFDocument;
    let pageCount: number;

    if (isImageSource || detectedMime?.startsWith("image/")) {
      // ── Image source: embed image into a single-page PDF ─────────────────
      originalPdf = await PDFDocument.create();
      const isJpeg = (mimeType === "image/jpeg" || mimeType === "image/jpg" ||
        detectedMime === "image/jpeg" || detectedMime === "image/jpg" ||
        /\.jpe?g$/i.test(documentUrl));
      const embeddedImg = isJpeg
        ? await originalPdf.embedJpg(srcBuffer)
        : await originalPdf.embedPng(srcBuffer);

      // Use viewport dimensions if provided, otherwise use image natural size
      const ann0 = annotatedPages[0];
      const pgW = ann0?.viewportW > 0 ? ann0.viewportW : embeddedImg.width;
      const pgH = ann0?.viewportH > 0 ? ann0.viewportH : embeddedImg.height;
      const imgPage = originalPdf.addPage([pgW, pgH]);
      imgPage.drawImage(embeddedImg, { x: 0, y: 0, width: pgW, height: pgH });
      pageCount = 1;
    } else {
      // ── PDF source: load normally ─────────────────────────────────────────
      originalPdf = await PDFDocument.load(srcBuffer);
      pageCount = originalPdf.getPageCount();
    }

    // ── 2. Build output PDF — ALL pages preserved ────────────────────────────
    // Copy every page from the original.  For annotated pages we render the
    // strokes and text annotations as vector SVG embedded in the PDF page so
    // coordinates are correctly scaled regardless of the capture viewport size.
    const outputPdf = await PDFDocument.create();

    // Build a lookup of annotated page data keyed by 1-based page number
    const annotationMap = new Map(annotatedPages.map((p) => [p.pageNumber, p]));

    for (let zeroIdx = 0; zeroIdx < pageCount; zeroIdx++) {
      const pageNum = zeroIdx + 1;
      const [copiedPage] = await outputPdf.copyPages(originalPdf, [zeroIdx]);
      outputPdf.addPage(copiedPage);

      const ann = annotationMap.get(pageNum);
      if (!ann) continue; // unannotated — keep as-is

      const { width: pgW, height: pgH } = copiedPage.getSize();
      const { viewportW, viewportH, strokes, textAnnotations } = ann;

      // Guard against zero-size viewports
      const vpW = viewportW > 0 ? viewportW : pgW;
      const vpH = viewportH > 0 ? viewportH : pgH;

      // Scale factors: convert from viewport pixels → PDF points
      // PDF origin is bottom-left; viewport origin is top-left — flip Y.
      const scaleX = pgW / vpW;
      const scaleY = pgH / vpH;

      // ── Render strokes using drawSvgPath ─────────────────────────────────
      // pdf-lib's drawSvgPath operates in the PDF coordinate space where Y
      // increases upward (origin at bottom-left), so we flip Y.
      for (const stroke of strokes) {
        if (stroke.points.length < 2) continue;

        const col = parseHexColor(stroke.color);
        const pts = stroke.points;

        // Build an SVG path string with Y-flipped coordinates
        let pathData = `M ${(pts[0].x * scaleX).toFixed(2)} ${(pgH - pts[0].y * scaleY).toFixed(2)}`;
        for (let i = 1; i < pts.length; i++) {
          pathData += ` L ${(pts[i].x * scaleX).toFixed(2)} ${(pgH - pts[i].y * scaleY).toFixed(2)}`;
        }

        copiedPage.drawSvgPath(pathData, {
          borderColor: rgb(col.r, col.g, col.b),
          borderWidth: stroke.width * Math.min(scaleX, scaleY),
          borderLineCap: LineCapStyle.Round,
          opacity: 1,
          borderOpacity: 1,
        });
      }

      // ── Render text annotations ────────────────────────────────────────────
      for (const ta of textAnnotations) {
        try {
          const col = parseHexColor(ta.color);
          const pdfFontSize = ta.fontSize * Math.min(scaleX, scaleY);
          const pdfX = ta.x * scaleX;
          // Flip Y and account for font ascent (text drawn from baseline in PDF)
          const pdfY = pgH - ta.y * scaleY - pdfFontSize;

          const helvetica = await outputPdf.embedFont("Helvetica");
          const textColor = rgb(col.r, col.g, col.b);
          copiedPage.drawText(ta.text, {
            x: Math.max(0, pdfX),
            y: Math.max(0, pdfY),
            size: pdfFontSize,
            font: helvetica,
            color: textColor,
          });
        } catch {
          // Non-critical — skip unrenderable text annotations
        }
      }
    }

    // ── 3. Upload the result PDF ──────────────────────────────────────────────
    const outputBytes = Buffer.from(await outputPdf.save());
    const objectPath = await storage.uploadFile(outputBytes, "application/pdf");

    // ── 4. Create project document record ────────────────────────────────────
    const userId = req.authUser?.id;
    let newDocId: number | null = null;

    if (projectId && userId) {
      const [doc] = await db.insert(documentsTable).values({
        projectId,
        name: documentName,
        category: "markup",
        fileName: `${documentName}.pdf`,
        fileSize: outputBytes.length,
        mimeType: "application/pdf",
        version: "1",
        tags: ["markup"],
        uploadedById: userId,
        fileUrl: objectPath,
        folder: "Markups",
        includedInInspection: true,
        ...(inspectionId ? { inspectionId } : {}),
      }).returning();
      newDocId = doc?.id ?? null;
    } else if (projectId) {
      req.log.warn("No authenticated userId — document record not created");
    }

    // ── 5. Attach to checklist result (photoUrls) ─────────────────────────────
    if (itemId) {
      try {
        const [existing] = await db
          .select()
          .from(checklistResultsTable)
          .where(eq(checklistResultsTable.id, Number(itemId)));

        if (existing) {
          const existing_urls: string[] = existing.photoUrls
            ? JSON.parse(existing.photoUrls as string)
            : [];
          await db
            .update(checklistResultsTable)
            .set({
              photoUrls: JSON.stringify([...existing_urls, objectPath]),
              updatedAt: new Date(),
            })
            .where(eq(checklistResultsTable.id, Number(itemId)));
        }
      } catch (e) {
        req.log.warn({ e }, "Failed to attach markup to checklist item");
      }
    }

    // ── 6. Link to issue record ───────────────────────────────────────────────
    if (issueId && newDocId) {
      try {
        const user = req.authUser!;
        const allowed = await canModifyIssue(Number(issueId), user.id, user.isAdmin || user.isCompanyAdmin);
        if (allowed) {
          await db
            .update(issuesTable)
            .set({ markupDocumentId: newDocId, updatedAt: new Date() })
            .where(eq(issuesTable.id, Number(issueId)));
        } else {
          req.log.warn({ issueId }, "User lacks permission to link markup to this issue");
        }
      } catch (e) {
        req.log.warn({ e }, "Failed to link markup to issue");
      }
    }

    res.json({
      success: true,
      fileUrl: objectPath,
      mimeType: "application/pdf",
      name: documentName,
      documentId: newDocId,
      pages: annotatedPages.map((p) => p.pageNumber),
    });
  } catch (err) {
    req.log.error({ err }, "Generate markup PDF error");
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * PATCH /api/markup/link-issue
 *
 * Links an existing markup document to a specific issue.
 * Body: { documentId: number, issueId: number }
 */
router.patch("/markup/link-issue", requireAuth, async (req, res) => {
  const { documentId, issueId } = req.body as { documentId: number; issueId: number };
  if (!documentId || !issueId) {
    res.status(400).json({ error: "missing_fields" });
    return;
  }
  const user = req.authUser!;
  const allowed = await canModifyIssue(Number(issueId), user.id, user.isAdmin || user.isCompanyAdmin);
  if (!allowed) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    await db
      .update(issuesTable)
      .set({ markupDocumentId: Number(documentId), updatedAt: new Date() })
      .where(eq(issuesTable.id, Number(issueId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Link markup to issue error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the authenticated user is allowed to modify the given issue.
 * Admins and company admins can modify any issue.
 * Other users can only modify issues whose project they created.
 */
async function canModifyIssue(issueId: number, userId: number, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const [issue] = await db.select({ projectId: issuesTable.projectId }).from(issuesTable)
    .where(eq(issuesTable.id, issueId));
  if (!issue) return false;
  const [project] = await db.select({ createdById: projectsTable.createdById }).from(projectsTable)
    .where(eq(projectsTable.id, issue.projectId));
  if (!project) return false;
  return project.createdById === userId;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) / 255,
      g: parseInt(clean[1] + clean[1], 16) / 255,
      b: parseInt(clean[2] + clean[2], 16) / 255,
    };
  }
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

export default router;
