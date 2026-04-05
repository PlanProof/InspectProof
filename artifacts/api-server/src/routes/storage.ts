import express, { Router, type IRouter, type Request, type Response } from "express";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import {
  isSupabaseStorageAvailable,
  getSupabaseSignedUploadURL,
  getSupabaseSignedDownloadURL,
} from "../lib/supabaseStorage";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";
import { db } from "@workspace/db";

const router: IRouter = Router();
const replitStorage = new ObjectStorageService();

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * IMAGE_MAGIC_BYTES – leading byte signatures for common image types.
 * Each entry has the declared Content-Type, the required byte offset, and the
 * hex bytes that must match at that offset.
 */
const IMAGE_SIGNATURES: Array<{
  mimeType: string;
  offset: number;
  bytes: number[];
}> = [
  { mimeType: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mimeType: "image/png",  offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: "image/gif",  offset: 0, bytes: [0x47, 0x49, 0x46] },
  { mimeType: "image/webp", offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP" at offset 8 in RIFF
  { mimeType: "image/bmp",  offset: 0, bytes: [0x42, 0x4d] },
  { mimeType: "image/tiff", offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mimeType: "image/tiff", offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { mimeType: "image/heic", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // "ftyp" box
];

function detectImageMimeType(buf: Buffer): string | null {
  for (const sig of IMAGE_SIGNATURES) {
    const end = sig.offset + sig.bytes.length;
    if (buf.length < end) continue;
    const matches = sig.bytes.every((b, i) => buf[sig.offset + i] === b);
    if (matches) return sig.mimeType;
  }
  return null;
}

function isImageContentType(ct: string): boolean {
  return ct.startsWith("image/");
}

function isSupabasePath(objectPath: string): boolean {
  return objectPath.startsWith("/objects/supabase/");
}

/**
 * Upload endpoint – validates magic bytes for image fields, enforces size limit.
 * If a DB update later fails, callers are responsible for cleanup (see PATCH routes).
 * This route itself only uploads the object; it does NOT write to DB.
 */
router.post(
  "/storage/uploads/file",
  requireAuth,
  express.raw({ type: "*/*", limit: "200mb" }),
  async (req: Request, res: Response) => {
    try {
      const buffer = req.body as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        res.status(400).json({ error: "empty_body" });
        return;
      }

      const declaredCt = (
        (req.headers["x-file-content-type"] as string) ||
        req.headers["content-type"] ||
        "application/octet-stream"
      ).split(";")[0].trim();

      // If caller declares an image content-type, validate magic bytes and size
      if (isImageContentType(declaredCt)) {
        if (buffer.length > MAX_IMAGE_BYTES) {
          res.status(413).json({
            error: "file_too_large",
            message: `Image must be ≤ 20 MB (received ${(buffer.length / 1024 / 1024).toFixed(1)} MB)`,
          });
          return;
        }

        const detected = detectImageMimeType(buffer);
        if (!detected) {
          res.status(415).json({
            error: "invalid_image",
            message: "File does not appear to be a valid image (magic bytes mismatch).",
          });
          return;
        }

        // Enforce that the declared subtype is compatible with the detected type.
        // Allow HEIC/HEIF to be declared as image/heic or image/heif (they share the ftyp box).
        // Allow image/jpg as an alias for image/jpeg.
        const normalizedDeclared = declaredCt === "image/jpg" ? "image/jpeg"
          : declaredCt === "image/heif" ? "image/heic"
          : declaredCt;
        const normalizedDetected = detected === "image/heif" ? "image/heic" : detected;

        if (normalizedDeclared !== normalizedDetected) {
          res.status(415).json({
            error: "content_type_mismatch",
            message: `Declared Content-Type (${declaredCt}) does not match detected image type (${detected}).`,
          });
          return;
        }
      }

      const objectPath = await replitStorage.uploadFile(buffer, declaredCt);
      res.json({ objectPath });
    } catch (err) {
      req.log.error({ err }, "Server upload error");
      res.status(500).json({ error: "internal_error" });
    }
  }
);

router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  try {
    if (isSupabaseStorageAvailable()) {
      const { uploadURL, objectPath } = await getSupabaseSignedUploadURL();
      res.json({ uploadURL, objectPath });
    } else {
      const uploadURL = await replitStorage.getObjectEntityUploadURL();
      const objectPath = replitStorage.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
    }
  } catch (err) {
    req.log.error({ err }, "Request upload URL error");
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * Storage proxy – serves objects with optional on-the-fly thumbnail resize.
 *
 * Query params:
 *   ?w=<pixels>  — resize image so the longest edge is at most <w> pixels.
 *                  Only applied for image/* content types.
 *
 * Cache-Control is set to 24 h for UUID-addressed objects (immutable once written).
 */
router.get("/storage/objects/{*path}", async (req: Request, res: Response) => {
  const rawPathParam = (req.params as any).path;
  const rawPath = Array.isArray(rawPathParam) ? rawPathParam.join("/") : String(rawPathParam);
  const objectPath = "/objects/" + rawPath;

  // Parse ?w= thumbnail width
  const wParam = req.query.w;
  const thumbWidth = wParam ? parseInt(String(wParam), 10) : null;
  const wantsThumb = thumbWidth !== null && thumbWidth > 0 && thumbWidth <= 4096;

  try {
    if (isSupabasePath(objectPath)) {
      const signedUrl = await getSupabaseSignedDownloadURL(objectPath);
      res.redirect(302, signedUrl);
      return;
    }

    const { buffer: rawBuffer, contentType } = await replitStorage.fetchObjectBuffer(objectPath);

    // Determine if the asset is effectively immutable (UUID path = content-addressed)
    // UUID regex: 8-4-4-4-12 hex chars
    const isContentAddressed = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rawPath);
    const maxAge = isContentAddressed ? 86400 : 3600;

    let outBuffer = rawBuffer;
    let outContentType = contentType;

    // Apply thumbnail resize if requested and file is an image
    if (wantsThumb && thumbWidth && contentType.startsWith("image/") && contentType !== "image/gif") {
      try {
        outBuffer = await sharp(rawBuffer)
          .resize({ width: thumbWidth, height: thumbWidth, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
        outContentType = "image/jpeg";
      } catch (resizeErr) {
        // Fall back to original if resize fails (e.g. unsupported format)
        req.log.warn({ resizeErr }, "Thumbnail resize failed, serving original");
      }
    }

    res.setHeader("Content-Type", outContentType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", `private, max-age=${maxAge}`);
    res.setHeader("Content-Length", outBuffer.length);
    res.send(outBuffer);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "not_found" });
    } else {
      req.log.error({ err }, "Serve object error");
      res.status(500).json({ error: "internal_error" });
    }
  }
});

/**
 * DELETE /api/storage/objects/<path>
 * Orphan-cleanup endpoint: only allows deleting an upload object that is NOT
 * referenced in any database record (checklist_results.photo_urls or documents.file_url).
 * This prevents a user from deleting objects they do not own or that are still in use.
 *
 * Rules enforced:
 *  1. User must be authenticated.
 *  2. Path must be under /objects/uploads/ (user-uploaded files only).
 *  3. The objectPath must NOT appear in checklist_results.photo_urls or documents.file_url —
 *     if it does, the object is referenced and may not be deleted via this endpoint.
 */
router.delete("/storage/objects/{*path}", requireAuth, async (req: Request, res: Response) => {
  const rawPathParam = (req.params as any).path;
  const rawPath = Array.isArray(rawPathParam) ? rawPathParam.join("/") : String(rawPathParam);
  const objectPath = "/objects/" + rawPath;

  // Only allow deletion of upload paths to prevent arbitrary deletion
  if (!objectPath.startsWith("/objects/uploads/")) {
    res.status(403).json({ error: "forbidden", message: "Only upload objects may be deleted via this endpoint." });
    return;
  }

  try {
    // Verify the object is truly orphaned: it must not appear in any DB record.
    // We check both checklist photo arrays and document file URLs.
    const escapedPath = objectPath.replace(/[%_]/g, "\\$&");

    const [checklistRef, docRef] = await Promise.all([
      db.execute(
        sql`SELECT 1 FROM checklist_results WHERE photo_urls LIKE ${"%" + escapedPath + "%"} LIMIT 1`
      ),
      db.execute(
        sql`SELECT 1 FROM documents WHERE file_url = ${objectPath} LIMIT 1`
      ),
    ]);

    const isReferenced =
      (checklistRef.rows && checklistRef.rows.length > 0) ||
      (docRef.rows && docRef.rows.length > 0);

    if (isReferenced) {
      res.status(403).json({
        error: "forbidden",
        message: "Object is referenced by an existing record and cannot be deleted via this endpoint.",
      });
      return;
    }

    await replitStorage.deleteFile(objectPath);
    res.json({ deleted: true, objectPath });
  } catch (err) {
    req.log.error({ err }, "Delete object error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
