import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body;
  if (!name || !contentType) {
    res.status(400).json({ error: "name and contentType are required" });
    return;
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (err) {
    req.log.error({ err }, "Request upload URL error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/storage/objects/{*path}", async (req: Request, res: Response) => {
  const objectPath = "/objects/" + (req.params as any).path;
  try {
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(file);
    const headers = Object.fromEntries(response.headers.entries());
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(response.status);
    if (response.body) {
      Readable.fromWeb(response.body as any).pipe(res);
    } else {
      res.end();
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
