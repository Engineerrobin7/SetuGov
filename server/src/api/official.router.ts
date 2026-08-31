import { Router, Response } from "express";
import prisma from "../config/db";
import { authenticateJWT, requireRole, AuthenticatedRequest } from "../auth/auth.middleware";
import { runWorkflow } from "../workflow/workflow.engine";
import eventBus from "../events/event.bus";

const router = Router();

router.use(authenticateJWT);
router.use(requireRole(["OFFICIAL", "ADMIN"]));

// GET /api/official/applications
router.get("/applications", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const applications = await prisma.application.findMany({
      include: {
        service: true,
        citizen: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.json(applications);
  } catch (error) {
    console.error("Official applications error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/official/applications/:id
router.get("/applications/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: {
        service: true,
        citizen: true,
        consent: true,
        documents: true, // Include documents
        workflow: {
          include: {
            steps: true,
          },
        },
      },
    });

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    return res.json(application);
  } catch (error) {
    console.error("Official application detail error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/official/applications/:id/workflow
router.get("/applications/:id/workflow", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workflow = await prisma.workflowInstance.findUnique({
      where: { applicationId: req.params.id },
      include: {
        steps: true,
      },
    });

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found for this application" });
    }

    return res.json(workflow);
  } catch (error) {
    console.error("Official workflow detail error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/official/applications/:id/audit
router.get("/applications/:id/audit", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: { requestId: true },
    });

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: { requestId: application.requestId },
      orderBy: { timestamp: "desc" },
    });

    return res.json(auditLogs);
  } catch (error) {
    console.error("Official audit error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/official/workflow-steps/:id/approve
router.post("/workflow-steps/:id/approve", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const step = await prisma.workflowStep.findUnique({
      where: { id: req.params.id },
      include: { workflowInstance: { include: { application: true } } },
    });

    if (!step) {
      return res.status(404).json({ error: "Workflow step not found" });
    }

    if (step.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ error: "Step is not awaiting approval" });
    }

    // Mark as completed
    await prisma.workflowStep.update({
      where: { id: step.id },
      data: {
        status: "COMPLETED",
        approvedBy: req.user?.email || "official@setugov.in",
        approvalTimestamp: new Date(),
      },
    });

    eventBus.emitEvent("OFFICIAL_APPROVED", {
      applicationId: step.workflowInstance.applicationId,
      requestId: step.workflowInstance.application.requestId,
      officialEmail: req.user?.email,
      stepName: step.stepName,
    });

    // Resume workflow
    runWorkflow(step.workflowInstance.applicationId).catch((err) => {
      console.error(`[OfficialRouter] Error resuming workflow after approval:`, err);
    });

    return res.json({ message: "Step approved. Workflow resuming." });
  } catch (error) {
    console.error("Approve step error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/official/workflow-steps/:id/reject
router.post("/workflow-steps/:id/reject", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const step = await prisma.workflowStep.findUnique({
      where: { id: req.params.id },
      include: { workflowInstance: { include: { application: true } } },
    });

    if (!step) {
      return res.status(404).json({ error: "Workflow step not found" });
    }

    // Mark as failed
    await prisma.workflowStep.update({
      where: { id: step.id },
      data: {
        status: "FAILED",
        errorMessage: "Rejected by official review.",
        approvedBy: req.user?.email || "official@setugov.in",
        approvalTimestamp: new Date(),
      },
    });

    await prisma.application.update({
      where: { id: step.workflowInstance.applicationId },
      data: { status: "FAILED" },
    });

    eventBus.emitEvent("OFFICIAL_REJECTED", {
      applicationId: step.workflowInstance.applicationId,
      requestId: step.workflowInstance.application.requestId,
      officialEmail: req.user?.email,
      stepName: step.stepName,
      result: "FAILED",
    });

    return res.json({ message: "Step rejected. Application failed." });
  } catch (error) {
    console.error("Reject step error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
