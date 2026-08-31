import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clean existing data in correct order of dependency
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.systemEvent.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.workflowStep.deleteMany();
  await prisma.workflowInstance.deleteMany();
  await prisma.sLARecord.deleteMany();
  await prisma.application.deleteMany();
  await prisma.workflowTemplateStep.deleteMany();
  await prisma.workflowTemplate.deleteMany();
  await prisma.service.deleteMany();
  await prisma.connector.deleteMany();
  await prisma.official.deleteMany();
  await prisma.department.deleteMany();
  await prisma.citizen.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  // 1. Create Departments
  const deptA = await prisma.department.create({
    data: {
      name: "Identity Service (Dept A)",
      code: "DEPT_A",
      description: "National Identity and Citizen Registry",
    },
  });

  const deptB = await prisma.department.create({
    data: {
      name: "Income / Eligibility (Dept B)",
      code: "DEPT_B",
      description: "Revenue and Welfare Eligibility Department",
    },
  });

  const deptC = await prisma.department.create({
    data: {
      name: "Employment / Skill (Dept C)",
      code: "DEPT_C",
      description: "Skill Development and Employment Certification",
    },
  });

  const deptD = await prisma.department.create({
    data: {
      name: "Benefits / Scheme (Dept D)",
      code: "DEPT_D",
      description: "Financial Benefits Disbursement Service",
    },
  });

  console.log("Created 4 Departments");

  // 2. Create Connectors
  const connA = await prisma.connector.create({
    data: {
      name: "IdentityConnector",
      departmentId: deptA.id,
      type: "REST_JSON",
      baseUrl: "/mock/identity/verify",
    },
  });

  const connB = await prisma.connector.create({
    data: {
      name: "EligibilityConnector",
      departmentId: deptB.id,
      type: "REST_DIFFERENT_SCHEMA",
      baseUrl: "/mock/eligibility/check",
    },
  });

  const connC = await prisma.connector.create({
    data: {
      name: "EmploymentConnector",
      departmentId: deptC.id,
      type: "LEGACY_SIMULATED",
      baseUrl: "/mock/employment/verify",
    },
  });

  const connD = await prisma.connector.create({
    data: {
      name: "BenefitsConnector",
      departmentId: deptD.id,
      type: "REST_JSON",
      baseUrl: "/mock/benefits/process",
    },
  });

  console.log("Created 4 Connectors");

  // 3. Create Users & Profiles
  // Citizen User
  const citizenUser = await prisma.user.create({
    data: {
      email: "citizen@setugov.in",
      password: passwordHash,
      role: "CITIZEN",
    },
  });

  await prisma.citizen.create({
    data: {
      userId: citizenUser.id,
      citizenId: "MH12345",
      name: "Rahul Sharma",
      dob: new Date("2002-05-14"),
      address: "Flat 402, Sector 15, Vashi, Navi Mumbai, Maharashtra - 400703",
      contact: "9876543210",
    },
  });

  // Official User
  const officialUser = await prisma.user.create({
    data: {
      email: "official@setugov.in",
      password: passwordHash,
      role: "OFFICIAL",
    },
  });

  await prisma.official.create({
    data: {
      userId: officialUser.id,
      name: "Aditya Patil",
      departmentId: deptC.id,
    },
  });

  // Admin User
  await prisma.user.create({
    data: {
      email: "admin@setugov.in",
      password: passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Created Users (Citizen, Official, Admin)");

  // 4. Create Service & Workflow Template
  const scholarshipService = await prisma.service.create({
    data: {
      name: "Scholarship & Employment Benefit",
      description: "Unified portal for verification and processing of skill-based unemployment benefits. Requires identity check, income verification, and employment status verification.",
    },
  });

  const template = await prisma.workflowTemplate.create({
    data: {
      name: "Standard Benefit Workflow",
      serviceId: scholarshipService.id,
    },
  });

  // Create Template Steps
  await prisma.workflowTemplateStep.createMany({
    data: [
      {
        templateId: template.id,
        connectorId: connA.id,
        stepName: "IDENTITY_VERIFICATION",
        order: 1,
        slaMinutes: 30,
      },
      {
        templateId: template.id,
        connectorId: connB.id,
        stepName: "ELIGIBILITY_VERIFICATION",
        order: 2,
        slaMinutes: 60,
      },
      {
        templateId: template.id,
        connectorId: connC.id,
        stepName: "EMPLOYMENT_VERIFICATION",
        order: 3,
        slaMinutes: 45,
      },
      {
        templateId: template.id,
        connectorId: connD.id,
        stepName: "SERVICE_PROCESSING",
        order: 4,
        slaMinutes: 120,
        requiresManualApproval: true,
      },
    ],
  });

  console.log("Created Scholarship Service and Workflow Template");

  console.log("Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
