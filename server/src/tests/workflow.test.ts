import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Server } from "http";
import app from "../index";
import prisma from "../config/db";
import { mockState } from "../mock-departments/state";

let citizenToken = "";
let officialToken = "";
let adminToken = "";
let serviceId = "";
let applicationId = "";
let server: Server;

describe("SetuGov Integration & Workflow Orchestration Test Suite", () => {
  beforeAll(async () => {
    // Start listening on port 5001 so local fetch requests succeed
    server = app.listen(5001);

    // Make sure we have a clean test state in PostgreSQL
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.systemEvent.deleteMany();
    await prisma.consent.deleteMany();
    await prisma.workflowStep.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.application.deleteMany();
    await prisma.service.deleteMany();
    await prisma.official.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.user.deleteMany();

    // Create the demo service
    const service = await prisma.service.create({
      data: {
        name: "Test Employment Benefit Scheme",
        description: "Unified validation check scheme.",
      },
    });
    serviceId = service.id;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await prisma.$disconnect();
  });

  // 1. Authentication & RBAC Tests
  it("should register a new Citizen successfully", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "test.citizen@setugov.in",
        password: "password123",
        citizenId: "MH12345",
        name: "Rahul Sharma",
        dob: "2002-05-14T00:00:00.000Z",
        address: "Navi Mumbai, MH",
        contact: "9876543210",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.role).toBe("CITIZEN");
    citizenToken = res.body.token;
  });

  it("should register and log in an Admin user", async () => {
    // Create an Admin user via seed patterns
    const bcrypt = await import("bcryptjs");
    const adminPasswordHash = await bcrypt.default.hash("password123", 10);
    
    await prisma.user.create({
      data: {
        email: "test.admin@setugov.in",
        password: adminPasswordHash,
        role: "ADMIN",
      },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "test.admin@setugov.in",
        password: "password123",
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.role).toBe("ADMIN");
    adminToken = res.body.token;
  });

  // 2. Application Creation & Zod Schema Validation
  it("should prevent creating application with mismatched citizen ID (Input Validation)", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        serviceId,
        formValues: {
          name: "Rahul Sharma",
          citizenId: "WRONG_ID", // Does not match profile "MH12345"
          dob: "2002-05-14",
          address: "Navi Mumbai, MH",
          contact: "9876543210",
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Validation failed");
  });

  it("should create a request successfully and set status to CONSENT_PENDING", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        serviceId,
        formValues: {
          name: "Rahul Sharma",
          citizenId: "MH12345",
          dob: "2002-05-14",
          address: "Navi Mumbai, MH",
          contact: "9876543210",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CONSENT_PENDING");
    expect(res.body).toHaveProperty("requestId");
    applicationId = res.body.id;
  });

  // 3. E2E Workflow Simulation: Happy Path
  it("should execute all steps successfully when Dept B is operational (Happy Path)", async () => {
    mockState.isDepartmentBFailed = false;

    const res = await request(app)
      .post(`/api/applications/${applicationId}/consent`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        status: "GRANTED",
        purpose: "Testing",
        version: "1.0",
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Workflow integration started");

    // Wait a brief moment for async connectors to execute
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Inspect application state in database
    const appRecord = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        workflow: {
          include: { steps: true },
        },
      },
    });

    expect(appRecord?.status).toBe("COMPLETED");
    expect(appRecord?.workflow?.status).toBe("COMPLETED");
    
    // Verify each connector normalized correctly
    const eligibilityStep = appRecord?.workflow?.steps.find(
      (s) => s.stepName === "ELIGIBILITY_VERIFICATION"
    );
    expect(eligibilityStep?.status).toBe("COMPLETED");
    expect((appRecord?.canonicalData as any).eligibilityStatus).toBe("ELIGIBLE");
    expect((appRecord?.canonicalData as any).benefitStatus).toBe("PAID");
  });

  // 4. E2E Workflow Simulation: Failure and Resume Path
  it("should halt sequential execution and enter WAITING when Department B is simulated-failed", async () => {
    // 1. Create a second application
    const appRes = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        serviceId,
        formValues: {
          name: "Rahul Sharma",
          citizenId: "MH12345",
          dob: "2002-05-14",
          address: "Navi Mumbai, MH",
          contact: "9876543210",
        },
      });

    const secondAppId = appRes.body.id;

    // 2. Set Dept B to FAIL
    mockState.isDepartmentBFailed = true;

    // 3. Grant consent, launching workflow
    await request(app)
      .post(`/api/applications/${secondAppId}/consent`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        status: "GRANTED",
        purpose: "Testing Failure",
        version: "1.0",
      });

    // Wait for connectors to execute
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify application entered WAITING state
    let appRecord = await prisma.application.findUnique({
      where: { id: secondAppId },
      include: {
        workflow: { include: { steps: true } },
      },
    });

    expect(appRecord?.status).toBe("WAITING");
    
    const eligibilityStep = appRecord?.workflow?.steps.find(
      (s) => s.stepName === "ELIGIBILITY_VERIFICATION"
    );
    expect(eligibilityStep?.status).toBe("WAITING");

    // 4. Restore Dept B (Admin Action)
    mockState.isDepartmentBFailed = false;

    // 5. Trigger retry/resume
    await request(app)
      .post(`/api/admin/demo/department-b/restore`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    // Wait for the orchestrator to automatically retry and complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify application successfully advanced to COMPLETED
    appRecord = await prisma.application.findUnique({
      where: { id: secondAppId },
      include: {
        workflow: { include: { steps: true } },
      },
    });

    expect(appRecord?.status).toBe("COMPLETED");
    expect(appRecord?.workflow?.status).toBe("COMPLETED");
  });
});
