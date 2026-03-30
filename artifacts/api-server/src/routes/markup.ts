import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import {
  db,
  documentsTable,
  checklistResultsTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
const storage = new ObjectStorageService();

/**
 * POST /api/markup/generate
 *
 * Accepts per-page transparent PNG annotations, downloads the original PDF,
 * embeds the annotation PNGs as overlays on the annotated pages, extracts
 * those pages into a new PDF, uploads and creates a document record.
 */
router.post("/markup/generate", requireAuth, async (req, res) => {
  const {
    documentUrl,
    annotatedPages,   // { pageNumber: number; pngBase64: string }[]
    documentName,
    projectId,
    inspectionId,
    itemId,           // checklistResults.id
  } = req.body as {
    documentUrl: string;
    annotatedPages: { pageNumber: number; pngBase64: string }[];
    viewportWidth?: number;
    viewportHeight?: number;
    documentName: string;
    projectId?: number;
    inspectionId?: number;
    itemId?: number;
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

  try {
    // ── 1. Download the original PDF ─────────────────────────────────────────
    const { buffer: pdfBuffer } = await storage.fetchObjectBuffer(objectStoragePath);
    const originalPdf = await PDFDocument.load(pdfBuffer);
    const pageCount = originalPdf.getPageCount();

    // ── 2. Build output PDF with only the annotated pages ────────────────────
    const outputPdf = await PDFDocument.create();
    const sorted = [...annotatedPages].sort((a, b) => a.pageNumber - b.pageNumber);

    for (const { pageNumber, pngBase64 } of sorted) {
      const zeroIdx = pageNumber - 1;
      if (zeroIdx < 0 || zeroIdx >= pageCount) continue;

      // Copy the original PDF page (preserves all vector content)
      const [copied] = await outputPdf.copyPages(originalPdf, [zeroIdx]);
      outputPdf.addPage(copied);

      // Embed the annotation layer as a transparent PNG overlay
      const pngBytes = Buffer.from(pngBase64, "base64");
      const pngImage = await outputPdf.embedPng(pngBytes);

      const { width: pgW, height: pgH } = copied.getSize();

      // Stretch the annotation layer to cover the full page.
      // PDF coordinate origin is bottom-left; y=0 means bottom of the page.
      copied.drawImage(pngImage, { x: 0, y: 0, width: pgW, height: pgH });
    }

    // ── 3. Upload the result PDF ──────────────────────────────────────────────
    const outputBytes = Buffer.from(await outputPdf.save());
    const objectPath = await storage.uploadFile(outputBytes, "application/pdf");

    // ── 4. Create project document record ────────────────────────────────────
    const userId = req.authUser?.id;
    let newDocId: number | null = null;

    if (projectId) {
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
      } as any).returning();
      newDocId = doc?.id ?? null;
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

    res.json({
      success: true,
      fileUrl: objectPath,
      mimeType: "application/pdf",
      name: documentName,
      documentId: newDocId,
      pages: sorted.map((p) => p.pageNumber),
    });
  } catch (err) {
    req.log.error({ err }, "Generate markup PDF error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
