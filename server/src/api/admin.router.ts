import { Router, Response } from "express";
import prisma from "../config/db";
import { authenticateJWT, requireRole, AuthenticatedRequest } from "../auth/auth.middleware";
import { mockState } from "../mock-departments/state";
import { retryAllWaitingWorkflows } from "../workflow/workflow.engine";

const router = Router();

// Apply auth middleware to all admin routes
router.use(authenticateJWT);
router.use(requireRole(["ADMIN"]));

// GET /api/admin/health
router.get("/health", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const totalRequests = await prisma.application.count();
    const activeWorkflows = await prisma.application.count({
      where: { status: { in: ["IN_PROGRESS", "WAITING", "RETRYING"] } },
    });
    const completed = await prisma.application.count({
      where: { status: "COMPLETED" },
    });
    const failed = await prisma.application.count({
      where: { status: "FAILED" },
    });

    const failedSteps = await prisma.workflowStep.count({
      where: { status: { in: ["FAILED", "WAITING", "RETRYING"] } },
    });

    const slaBreaches = await prisma.sLARecord.count({
      where: { status: "BREACHED" },
    });

    return res.json({
      status: "HEALTHY",
      environment: "Demonstration Environment",
      database: "CONNECTED",
      statistics: {
        totalRequests,
        activeWorkflows,
        completed,
        failed,
        failedSteps,
        slaBreaches,
      },
      departmentBStatus: mockState.isDepartmentBFailed ? "UNAVAILABLE" : "OPERATIONAL",
    });
  } catch (error) {
    console.error("Admin health error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/connectors
router.get("/connectors", (_req: AuthenticatedRequest, res: Response) => {
  const connectors = [
    {
      id: "conn-001",
      name: "IdentityConnector",
      department: "Identity Service (Dept A)",
      type: "REST_JSON",
      baseUrl: "/mock/identity/verify",
      status: "ACTIVE",
    },
    {
      id: "conn-002",
      name: "EligibilityConnector",
      department: "Income / Eligibility (Dept B)",
      type: "REST_DIFFERENT_SCHEMA",
      baseUrl: "/mock/eligibility/check",
      status: mockState.isDepartmentBFailed ? "UNAVAILABLE" : "ACTIVE",
    },
    {
      id: "conn-003",
      name: "EmploymentConnector",
      department: "Employment / Skill (Dept C)",
      type: "LEGACY_SIMULATED",
      baseUrl: "/mock/employment/verify",
      status: "ACTIVE",
    },
    {
      id: "conn-004",
      name: "BenefitsConnector",
      department: "Benefits / Scheme (Dept D)",
      type: "REST_JSON",
      baseUrl: "/mock/benefits/process",
      status: "ACTIVE",
    },
  ];

  return res.json(connectors);
});

// GET /api/admin/events
router.get("/events", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const events = await prisma.systemEvent.findMany({
      orderBy: { timestamp: "desc" },
      take: 50,
    });
    return res.json(events);
  } catch (error) {
    console.error("Admin events error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/logs
router.get("/logs", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    return res.json(logs);
  } catch (error) {
    console.error("Admin logs error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/workflows/failures
router.get("/workflows/failures", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const failures = await prisma.workflowStep.findMany({
      where: {
        status: { in: ["FAILED", "WAITING", "RETRYING"] },
      },
      include: {
        workflowInstance: {
          include: {
            application: {
              include: {
                citizen: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return res.json(failures);
  } catch (error) {
    console.error("Admin workflow failures error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/demo/department-b/failure
router.post("/demo/department-b/failure", async (req: AuthenticatedRequest, res: Response) => {
  mockState.isDepartmentBFailed = true;
  console.log(`[Admin] Simulated Department B Failure`);

  // Record audit log
  await prisma.auditLog.create({
    data: {
      actor: req.user?.email || "admin@setugov.in",
      role: "ADMIN",
      action: "SIMULATE_FAILURE",
      department: "Income / Eligibility (Dept B)",
      result: "SUCCESS",
      metadata: { detail: "Toggled Department B Eligibility Service to UNAVAILABLE" },
    },
  });

  // Record system event
  await prisma.systemEvent.create({
    data: {
      eventType: "DEPARTMENT_FAILED",
      payload: { department: "Income / Eligibility (Dept B)", triggeredBy: req.user?.email },
    },
  });

  return res.json({
    message: "Department B status set to UNAVAILABLE successfully",
    departmentBStatus: "UNAVAILABLE",
  });
});

// POST /api/admin/demo/department-b/restore
router.post("/demo/department-b/restore", async (req: AuthenticatedRequest, res: Response) => {
  mockState.isDepartmentBFailed = false;
  console.log(`[Admin] Restored Department B Service`);

  // Record audit log
  await prisma.auditLog.create({
    data: {
      actor: req.user?.email || "admin@setugov.in",
      role: "ADMIN",
      action: "RESTORE_SERVICE",
      department: "Income / Eligibility (Dept B)",
      result: "SUCCESS",
      metadata: { detail: "Restored Department B Eligibility Service to OPERATIONAL" },
    },
  });

  // Record system event
  await prisma.systemEvent.create({
    data: {
      eventType: "DEPARTMENT_COMPLETED",
      payload: { department: "Income / Eligibility (Dept B)", triggeredBy: req.user?.email },
    },
  });

  // Automatically trigger retry/resume of all waiting workflows
  retryAllWaitingWorkflows().catch((err) => {
    console.error("[AdminRouter] Error auto-resuming waiting workflows:", err);
  });

  return res.json({
    message: "Department B status restored to OPERATIONAL successfully. Resuming pending workflows.",
    departmentBStatus: "OPERATIONAL",
  });
});

// GET /api/admin/sla
router.get("/sla", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const slaRecords = await prisma.sLARecord.findMany({
      include: {
        department: true,
        application: true,
      },
      orderBy: { startTime: "desc" },
    });
    return res.json(slaRecords);
  } catch (error) {
    console.error("Admin SLA error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
