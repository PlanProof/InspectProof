import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, documentsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

async function formatDoc(d: any) {
  let uploadedByName = "Unknown";
  if (d.uploadedById) {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, d.uploadedById));
    if (users[0]) uploadedByName = `${users[0].firstName} ${users[0].lastName}`;
  }
  return {
    id: d.id,
    projectId: d.projectId,
    name: d.name,
    category: d.category,
    fileName: d.fileName,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    version: d.version,
    tags: d.tags || [],
    uploadedById: d.uploadedById,
    uploadedByName,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { projectId, category, inspectionId, folder } = req.query;
    let docs = await db.select().from(documentsTable)
      .orderBy(sql`${documentsTable.createdAt} DESC`);

    if (projectId) docs = docs.filter(d => d.projectId === parseInt(projectId as string));
    if (category) docs = docs.filter(d => d.category === category);
    if (inspectionId) docs = docs.filter(d => d.inspectionId === parseInt(inspectionId as string));
    if (folder) docs = docs.filter(d => d.folder === (folder as string));

    const result = await Promise.all(docs.map(formatDoc));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List documents error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = req.body;
    const [doc] = await db.insert(documentsTable).values({
      projectId: data.projectId,
      name: data.name,
      category: data.category,
      fileName: data.fileName,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      version: data.version,
      tags: data.tags || [],
      uploadedById: data.uploadedById,
    }).returning();

    res.status(201).json(await formatDoc(doc));
  } catch (err) {
    req.log.error({ err }, "Create document error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
