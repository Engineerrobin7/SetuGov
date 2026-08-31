import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../config/db";
import { authenticateJWT, requireRole, AuthenticatedRequest } from "../auth/auth.middleware";
import eventBus from "../events/event.bus";
import { initializeWorkflow, runWorkflow } from "../workflow/workflow.engine";

const router = Router();

// Apply authentication to all application routes
router.use(authenticateJWT);

const createApplicationSchema = z.object({
  serviceId: z.string(),
  formValues: z.object({
    name: z.string().min(2),
    citizenId: z.string().min(3),
    dob: z.string(), // ISO String
    address: z.string().min(5),
    contact: z.string().min(10),
  }),
  documents: z.array(z.object({
    type: z.string(),
    name: z.string(),
  })).optional(),
});

const submitConsentSchema = z.object({
  status: z.enum(["GRANTED", "REVOKED"]),
  purpose: z.string(),
  version: z.string(),
});

// POST /api/applications (Citizen only)
router.post("/", requireRole(["CITIZEN"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = createApplicationSchema.parse(req.body);

    // Ensure citizen profile exists
    const citizen = await prisma.citizen.findUnique({
      where: { userId: req.user?.id },
    });

    if (!citizen) {
      return res.status(404).json({ error: "Citizen profile not found" });
    }

    // Check for duplicate active applications to prevent duplicate requests
    const activeApp = await prisma.application.findFirst({
      where: {
        citizenId: citizen.id,
        serviceId: data.serviceId,
        status: { in: ["CREATED", "VALIDATING", "CONSENT_PENDING", "READY", "IN_PROGRESS", "WAITING", "RETRYING"] },
      },
    });

    if (activeApp) {
      return res.status(400).json({
        error: "An active request for this service is already in progress.",
        applicationId: activeApp.id,
      });
    }

    // Generate Request ID (e.g. SG-2026-000123)
    const count = await prisma.application.count();
    const requestId = `SG-2026-${String(count + 1).padStart(6, "0")}`;

    // Create application
    const application = await prisma.application.create({
      data: {
        requestId,
        citizenId: citizen.id,
        serviceId: data.serviceId,
        status: "CREATED",
        canonicalData: {
          name: data.formValues.name,
          citizenId: data.formValues.citizenId,
          dob: data.formValues.dob,
          address: data.formValues.address,
          contact: data.formValues.contact,
        },
        currentStep: "VALIDATING",
        documents: data.documents ? {
          create: data.documents.map(doc => ({
            type: doc.type,
            fileName: doc.name,
            fileUrl: `https://storage.setugov.in/docs/${doc.name}`,
            fileSize: 1024 * 1024 * 2, // 2MB mock
            mimeType: "application/pdf",
            status: "PENDING"
          }))
        } : undefined
      },
      include: {
        service: true,
      },
    });

    // Fire REQUEST_CREATED event
    eventBus.emitEvent("REQUEST_CREATED", {
      applicationId: application.id,
      requestId: application.requestId,
      citizenProfileId: citizen.id,
      citizenEmail: req.user?.email,
      serviceName: application.service.name,
    });

    // Perform validation (Zod schema checking or conflicting info checks)
    // For demonstration, let's validate that the input matches the citizen profile.
    let isValid = true;
    let mismatchReason = "";

    if (data.formValues.citizenId !== citizen.citizenId) {
      isValid = false;
      mismatchReason = "Submitted Citizen ID does not match registered profile.";
    }

    if (isValid) {
      // Transition application to CONSENT_PENDING
      const updatedApp = await prisma.application.update({
        where: { id: application.id },
        data: {
          status: "CONSENT_PENDING",
          currentStep: "CONSENT_PENDING",
        },
      });

      eventBus.emitEvent("DATA_VALIDATED", {
        applicationId: application.id,
        requestId: application.requestId,
        citizenProfileId: citizen.id,
        result: "SUCCESS",
        detail: "Input form matches profile records.",
      });

      return res.status(201).json(updatedApp);
    } else {
      // Handle failed validation immediately
      const updatedApp = await prisma.application.update({
        where: { id: application.id },
        data: {
          status: "FAILED",
          currentStep: "VALIDATION_FAILED",
        },
      });

      eventBus.emitEvent("WORKFLOW_FAILED", {
        applicationId: application.id,
        requestId: application.requestId,
        citizenProfileId: citizen.id,
        failedStep: "VALIDATING",
        error: mismatchReason,
      });

      return res.status(400).json({
        error: "Validation failed: Citizen credentials mismatch",
        details: mismatchReason,
        application: updatedApp,
      });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Create application error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/applications (Citizen fetches their own, Admin/Official fetches all)
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    let whereClause = {};

    if (req.user?.role === "CITIZEN") {
      const citizen = await prisma.citizen.findUnique({
        where: { userId: req.user.id },
      });
      if (!citizen) {
        return res.status(404).json({ error: "Citizen profile not found" });
      }
      whereClause = { citizenId: citizen.id };
    }

    const applications = await prisma.application.findMany({
      where: whereClause,
      include: {
        service: true,
        citizen: true,
        workflow: {
          include: {
            steps: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(applications);
  } catch (error) {
    console.error("Fetch applications error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/applications/:id
router.get("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: {
        service: true,
        citizen: true,
        consent: true,
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

    // Citizen can only fetch their own application
    if (req.user?.role === "CITIZEN") {
      const citizen = await prisma.citizen.findUnique({
        where: { userId: req.user.id },
      });
      if (!citizen || application.citizenId !== citizen.id) {
        return res.status(403).json({ error: "Forbidden: Access denied" });
      }
    }

    return res.json(application);
  } catch (error) {
    console.error("Fetch application error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/applications/:id/consent (Citizen only)
router.post("/:id/consent", requireRole(["CITIZEN"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = submitConsentSchema.parse(req.body);

    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { citizen: true, service: true },
    });

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    // Verify ownership
    const citizen = await prisma.citizen.findUnique({
      where: { userId: req.user?.id },
    });
    if (!citizen || application.citizenId !== citizen.id) {
      return res.status(403).json({ error: "Forbidden: Access denied" });
    }

    // Save Consent
    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
    const consent = await prisma.consent.upsert({
      where: { applicationId: application.id },
      create: {
        applicationId: application.id,
        status: data.status,
        purpose: data.purpose,
        version: data.version,
        ipAddress,
      },
      update: {
        status: data.status,
        purpose: data.purpose,
        version: data.version,
        ipAddress,
        timestamp: new Date(),
      },
    });

    if (data.status === "GRANTED") {
      // Advance status
      const updatedApp = await prisma.application.update({
        where: { id: application.id },
        data: {
          status: "READY",
          currentStep: "READY",
        },
      });

      eventBus.emitEvent("CONSENT_GRANTED", {
        applicationId: application.id,
        requestId: application.requestId,
        citizenProfileId: citizen.id,
        citizenEmail: req.user?.email,
      });

      // Initialize and Start workflow execution asynchronously
      await initializeWorkflow(application.id);
      
      // We run this asynchronously so the request returns immediately, providing a fast responsive UI
      runWorkflow(application.id).catch((err) => {
        console.error(`[WorkflowLauncher] Error running workflow for ${application.id}:`, err);
      });

      return res.json({
        message: "Consent granted. Workflow integration started.",
        application: updatedApp,
        consent,
      });
    } else {
      // Revoked consent
      const updatedApp = await prisma.application.update({
        where: { id: application.id },
        data: {
          status: "CONSENT_PENDING",
        },
      });

      return res.json({
        message: "Consent was revoked or not granted.",
        application: updatedApp,
        consent,
      });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Submit consent error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/applications/:id/status
router.get("/:id/status", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: {
        requestId: true,
        status: true,
        currentStep: true,
        updatedAt: true,
      },
    });

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    return res.json(application);
  } catch (error) {
    console.error("Get application status error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/applications/:id/timeline (timeline events)
router.get("/:id/timeline", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: { requestId: true },
    });

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    // Query audit logs matching application's requestId
    const auditLogs = await prisma.auditLog.findMany({
      where: { requestId: application.requestId },
      orderBy: { timestamp: "asc" },
    });

    return res.json(auditLogs);
  } catch (error) {
    console.error("Get timeline error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
