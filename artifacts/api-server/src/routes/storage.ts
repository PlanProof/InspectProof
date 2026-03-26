import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  isSupabaseStorageAvailable,
  getSupabaseSignedUploadURL,
  streamFromSupabase,
} from "../lib/supabaseStorage";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const replitStorage = new ObjectStorageService();

function isSupabasePath(objectPath: string): boolean {
  return objectPath.startsWith("/objects/supabase/");
}

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const { name, contentType } = req.body;
  if (!name && !contentType) {
    res.status(400).json({ error: "name and contentType are required" });
    return;
  }
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
  const rawPath = (req.params as any).path as string;
  const objectPath = "/objects/" + rawPath;

  try {
    if (isSupabasePath(objectPath)) {
      const upstream = await streamFromSupabase(objectPath);
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: "not_found" });
        return;
      }
      const headers = Object.fromEntries(upstream.headers.entries());
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      res.status(upstream.status);
      if (upstream.body) {
        Readable.fromWeb(upstream.body as any).pipe(res);
      } else {
        res.end();
      }
    } else {
      const file = await replitStorage.getObjectEntityFile(objectPath);
      const response = await replitStorage.downloadObject(file);
      const headers = Object.fromEntries(response.headers.entries());
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      res.status(response.status);
      if (response.body) {
        Readable.fromWeb(response.body as any).pipe(res);
      } else {
        res.end();
      }
    }
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
