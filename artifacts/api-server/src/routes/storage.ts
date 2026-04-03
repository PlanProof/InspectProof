import express, { Router, type IRouter, type Request, type Response } from "express";
import {
  isSupabaseStorageAvailable,
  getSupabaseSignedUploadURL,
  getSupabaseSignedDownloadURL,
} from "../lib/supabaseStorage";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
const replitStorage = new ObjectStorageService();

function isSupabasePath(objectPath: string): boolean {
  return objectPath.startsWith("/objects/supabase/");
}

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
      const contentType = (req.headers["x-file-content-type"] as string) || req.headers["content-type"] || "application/octet-stream";
      const objectPath = await replitStorage.uploadFile(buffer, contentType.split(";")[0].trim());
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

router.get("/storage/objects/{*path}", async (req: Request, res: Response) => {
  // Express {*path} wildcard passes segments as an array; join with "/" to avoid
  // Array.toString() which joins with "," and corrupts the path.
  const rawPathParam = (req.params as any).path;
  const rawPath = Array.isArray(rawPathParam) ? rawPathParam.join("/") : String(rawPathParam);
  const objectPath = "/objects/" + rawPath;

  try {
    if (isSupabasePath(objectPath)) {
      const signedUrl = await getSupabaseSignedDownloadURL(objectPath);
      res.redirect(302, signedUrl);
      return;
    }

    // Proxy the file through the server with proper headers so PDFs open inline
    // in the browser rather than being force-downloaded via GCS redirect.
    const { buffer, contentType } = await replitStorage.fetchObjectBuffer(objectPath);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "not_found" });
    } else {
      req.log.error({ err }, "Serve object error");
      res.status(500).json({ error: "internal_error" });
    }
  }
});

export default router;
