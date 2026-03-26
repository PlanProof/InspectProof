import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import inspectionsRouter from "./inspections";
import checklistsRouter from "./checklists";
import issuesRouter from "./issues";
import documentsRouter from "./documents";
import notesRouter from "./notes";
import reportsRouter from "./reports";
import analyticsRouter from "./analytics";
import notificationsRouter from "./notifications";
import usersRouter from "./users";
import storageRouter from "./storage";
import billingRouter from "./billing";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/projects", projectsRouter);
router.use("/inspections", inspectionsRouter);
router.use("/checklist-templates", checklistsRouter);
router.use("/issues", issuesRouter);
router.use("/documents", documentsRouter);
router.use("/notes", notesRouter);
router.use("/reports", reportsRouter);
router.use("/analytics", analyticsRouter);
router.use("/notifications", notificationsRouter);
router.use("/users", usersRouter);
router.use(storageRouter);
router.use(billingRouter);
router.use(adminRouter);

export default router;
