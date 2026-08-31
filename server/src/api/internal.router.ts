import { Router, Response, Request } from "express";
import { runWorkflow, retryAllWaitingWorkflows } from "../workflow/workflow.engine";
import prisma from "../config/db";

const router = Router();

// POST /api/internal/workflows/:id/start
router.post("/workflows/:id/start", async (req: Request, res: Response) => {
  const applicationId = req.params.id;
  try {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    // Trigger workflow run asynchronously
    runWorkflow(applicationId).catch((err) => {
      console.error(`[InternalRouter] Error running workflow:`, err);
    });

    return res.json({ message: "Workflow execution triggered successfully" });
  } catch (error) {
    console.error("Internal start error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/internal/workflows/:id/retry
router.post("/workflows/:id/retry", async (req: Request, res: Response) => {
  const applicationId = req.params.id;
  try {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    // Trigger workflow retry/run asynchronously
    runWorkflow(applicationId).catch((err) => {
      console.error(`[InternalRouter] Error retrying workflow:`, err);
    });

    return res.json({ message: "Workflow retry triggered successfully" });
  } catch (error) {
    console.error("Internal retry error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /health
router.get("/health", (_req: Request, res: Response) => {
  return res.json({ status: "healthy", environment: "demo" });
});

export default router;
export { retryAllWaitingWorkflows };
