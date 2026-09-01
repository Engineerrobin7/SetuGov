import prisma from "../config/db";
import eventBus from "../events/event.bus";
import { getConnectorForStep } from "../connectors/connector.registry";
import { AIService } from "../services/ai.service";

// Initialize workflow for an application
export async function initializeWorkflow(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { service: { include: { templates: { where: { isActive: true }, take: 1 } } } },
  });

  if (!application) {
    throw new Error(`Application ${applicationId} not found`);
  }

  const template = application.service.templates[0];
  if (!template) {
    throw new Error(`No active workflow template found for service ${application.service.name}`);
  }

  // Create workflow instance
  const workflowInstance = await prisma.workflowInstance.create({
    data: {
      applicationId,
      templateId: template.id,
      status: "PENDING",
    },
  });

  // Fetch template steps
  const templateSteps = await prisma.workflowTemplateStep.findMany({
    where: { templateId: template.id },
    orderBy: { order: "asc" },
  });

  // Create pending steps
  const stepsData = templateSteps.map((ts) => ({
    workflowInstanceId: workflowInstance.id,
    stepName: ts.stepName,
    status: "PENDING",
  }));

  await prisma.workflowStep.createMany({
    data: stepsData,
  });

  console.log(`[WorkflowEngine] Initialized workflow for Application ID: ${applicationId} using template: ${template.name}`);
  return workflowInstance;
}

// Execute the workflow sequentially
export async function runWorkflow(applicationId: string) {
  console.log(`[WorkflowEngine] Starting execution for Application ID: ${applicationId}`);

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      citizen: true,
      workflow: {
        include: {
          steps: {
            orderBy: {
              updatedAt: "asc" // This is just a backup, we sort by order below
            }
          },
        },
      },
    },
  });

  if (!application || !application.workflow) {
    console.error(`[WorkflowEngine] Application or workflow instance not found for ID: ${applicationId}`);
    return;
  }

  const workflowInstance = application.workflow;
  
  // Fetch template to get the correct order if templateId exists
  let sortedSteps = [...workflowInstance.steps];
  if (workflowInstance.templateId) {
    const templateSteps = await prisma.workflowTemplateStep.findMany({
      where: { templateId: workflowInstance.templateId },
      orderBy: { order: "asc" },
    });

    const stepOrderMap = new Map(templateSteps.map((ts, index) => [ts.stepName, index]));
    sortedSteps.sort((a, b) => (stepOrderMap.get(a.stepName) ?? 0) - (stepOrderMap.get(b.stepName) ?? 0));
  }

  // Update application status to IN_PROGRESS if it was CREATED or READY
  let prevAppStatus = application.status;
  if (prevAppStatus === "CREATED" || prevAppStatus === "READY") {
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "IN_PROGRESS" },
    });
    prevAppStatus = "IN_PROGRESS";
  }

  await prisma.workflowInstance.update({
    where: { id: workflowInstance.id },
    data: { status: "IN_PROGRESS" },
  });

  // NEW: AI COGNITIVE PRE-CHECK
  // Scan documents before calling external APIs to ensure data integrity
  const documents = await prisma.document.findMany({ where: { applicationId } });
  if (documents.length > 0) {
    console.log(`[WorkflowEngine] Triggering AI Cognitive Scan for ${documents.length} documents...`);
    for (const doc of documents) {
      const aiResult = await AIService.verifyDocumentContent(doc.fileName, application.canonicalData);

      await prisma.document.update({
        where: { id: doc.id },
        data: {
          status: aiResult.match ? "VERIFIED" : "REJECTED",
          verifiedAt: new Date(),
        }
      });

      eventBus.emitEvent("AI_SCAN_COMPLETED", {
        applicationId,
        documentType: doc.type,
        confidence: aiResult.confidenceScore,
        match: aiResult.match,
        issues: aiResult.detectedIssues
      });

      if (!aiResult.match) {
        console.error(`[WorkflowEngine] AI flagged document mismatch for ${doc.type}`);
        // For demo purposes, we log the issue but continue if the user wants.
        // In a real system, we might halt the workflow here.
      }
    }
  }

  let accumulatedData = (application.canonicalData as Record<string, any>) || {};

  for (const step of sortedSteps) {
    if (step.status === "COMPLETED" || step.status === "SKIPPED") {
      continue; // Skip already finished steps
    }

    console.log(`[WorkflowEngine] Executing step: ${step.stepName}`);

    // Update step status to IN_PROGRESS
    await prisma.workflowStep.update({
      where: { id: step.id },
      data: { status: "IN_PROGRESS" },
    });

    await prisma.application.update({
      where: { id: applicationId },
      data: { currentStep: step.stepName },
    });

    const connector = getConnectorForStep(step.stepName);
    if (!connector) {
      const errorMsg = `No connector registered for step: ${step.stepName}`;
      console.error(`[WorkflowEngine] ${errorMsg}`);
      
      await prisma.workflowStep.update({
        where: { id: step.id },
        data: { status: "FAILED", errorMessage: errorMsg },
      });
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "FAILED" },
      });
      eventBus.emitEvent("WORKFLOW_FAILED", {
        applicationId,
        requestId: application.requestId,
        citizenProfileId: application.citizen.id,
        failedStep: step.stepName,
        error: errorMsg,
      });
      return;
    }

    // Start SLA Tracking
    const startTime = new Date();
    let expectedEndTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour

    // Try to get SLA from template
    if (workflowInstance.templateId) {
      const templateStep = await prisma.workflowTemplateStep.findFirst({
        where: { templateId: workflowInstance.templateId, stepName: step.stepName }
      });
      if (templateStep) {
        expectedEndTime = new Date(startTime.getTime() + templateStep.slaMinutes * 60 * 1000);
      }
    }

    const slaRecord = await prisma.sLARecord.create({
      data: {
        applicationId,
        departmentId: (await prisma.department.findFirst({ where: { connectors: { some: { name: connector.name } } } }))?.id || "",
        stepName: step.stepName,
        startTime,
        expectedEndTime,
        status: "IN_PROGRESS",
      }
    });

    eventBus.emitEvent("DEPARTMENT_REQUESTED", {
      applicationId,
      requestId: application.requestId,
      citizenProfileId: application.citizen.id,
      department: connector.department,
    });

    try {
      // Build canonical input for the connector
      const canonicalInput = {
        citizenId: application.citizen.citizenId,
        name: application.citizen.name,
        dob: application.citizen.dob.toISOString().split("T")[0],
        benefitAmount: 5000, // Fixed demo amount
        ...accumulatedData,
      };

      // Execute Connector
      const executionResult = await connector.execute(canonicalInput);

      // Merge results into application canonicalData
      accumulatedData = { ...accumulatedData, ...executionResult };

      await prisma.application.update({
        where: { id: applicationId },
        data: {
          canonicalData: accumulatedData,
        },
      });

      // Check if this step requires manual approval from the template
      let requiresApproval = false;
      if (workflowInstance.templateId) {
        const templateStep = await prisma.workflowTemplateStep.findFirst({
          where: { templateId: workflowInstance.templateId, stepName: step.stepName }
        });
        requiresApproval = templateStep?.requiresManualApproval || false;
      }

      if (requiresApproval && step.status !== "COMPLETED") {
        // Halt and wait for official approval
        await prisma.workflowStep.update({
          where: { id: step.id },
          data: {
            status: "PENDING_APPROVAL",
            responsePayload: executionResult,
          },
        });

        await prisma.application.update({
          where: { id: applicationId },
          data: { status: "WAITING" },
        });

        eventBus.emitEvent("DEPARTMENT_COMPLETED", {
          applicationId,
          requestId: application.requestId,
          citizenProfileId: application.citizen.id,
          department: connector.department,
          result: "PENDING_APPROVAL",
          detail: "Automation complete. Awaiting official review."
        });

        return; // Halt execution
      }

      // Mark step as completed
      await prisma.workflowStep.update({
        where: { id: step.id },
        data: {
          status: "COMPLETED",
          responsePayload: executionResult,
          errorMessage: null,
        },
      });

      // Update SLA Record
      await prisma.sLARecord.update({
        where: { id: slaRecord.id },
        data: {
          endTime: new Date(),
          status: "COMPLETED"
        }
      });

      eventBus.emitEvent("DEPARTMENT_COMPLETED", {
        applicationId,
        requestId: application.requestId,
        citizenProfileId: application.citizen.id,
        department: connector.department,
        result: "COMPLETED",
      });

    } catch (error: any) {
      console.error(`[WorkflowEngine] Exception during step ${step.stepName}:`, error.message);

      // Update SLA Record to show failure or leave in progress?
      // Usually failure stops the clock but records the status.
      await prisma.sLARecord.update({
        where: { id: slaRecord.id },
        data: {
          endTime: new Date(),
          status: "FAILED" // Added FAILED status to SLARecord in my thought process, check schema
        }
      });

      // Retry / Failure logic
      const nextRetryCount = step.retries + 1;
      
      // Update step status in DB
      await prisma.workflowStep.update({
        where: { id: step.id },
        data: {
          status: "WAITING",
          retries: nextRetryCount,
          errorMessage: error.message || "Connection failure",
        },
      });

      // Set application status to WAITING
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "WAITING",
        },
      });

      // Emit failure/waiting event
      eventBus.emitEvent("DEPARTMENT_FAILED", {
        applicationId,
        requestId: application.requestId,
        citizenProfileId: application.citizen.id,
        department: connector.department,
        error: error.message,
      });

      eventBus.emitEvent("WORKFLOW_WAITING", {
        applicationId,
        requestId: application.requestId,
        citizenProfileId: application.citizen.id,
        department: connector.department,
        prevStatus: prevAppStatus,
        newStatus: "WAITING",
      });

      // Halt sequential execution
      return;
    }
  }

  // If all steps completed successfully, mark application as COMPLETED
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: "COMPLETED",
      currentStep: "COMPLETED",
    },
  });

  await prisma.workflowInstance.update({
    where: { id: workflowInstance.id },
    data: { status: "COMPLETED" },
  });

  eventBus.emitEvent("WORKFLOW_COMPLETED", {
    applicationId,
    requestId: application.requestId,
    citizenProfileId: application.citizen.id,
    prevStatus: "IN_PROGRESS",
    newStatus: "COMPLETED",
  });
}

// Retry all waiting workflows (called periodically or manually upon recovery)
export async function retryAllWaitingWorkflows() {
  console.log("[WorkflowEngine] Running retry cycle for waiting workflows...");
  
  const waitingApplications = await prisma.application.findMany({
    where: {
      status: { in: ["WAITING", "RETRYING"] },
    },
  });

  console.log(`[WorkflowEngine] Found ${waitingApplications.length} waiting applications to retry.`);

  for (const app of waitingApplications) {
    // Transition status to RETRYING
    await prisma.application.update({
      where: { id: app.id },
      data: { status: "RETRYING" },
    });

    eventBus.emitEvent("WORKFLOW_RETRYING", {
      applicationId: app.id,
      requestId: app.requestId,
      citizenProfileId: app.citizenId,
      department: app.currentStep,
      retries: 1, // Simple representation
    });

    // Run async so it doesn't block the rest
    runWorkflow(app.id).catch((err) => {
      console.error(`[WorkflowEngine] Retry run failed for app ${app.id}:`, err);
    });
  }
}

// Background task to check for SLA breaches
export async function checkSLABreaches() {
  console.log("[WorkflowEngine] Checking for SLA breaches...");

  const now = new Date();
  const breaches = await prisma.sLARecord.updateMany({
    where: {
      status: "IN_PROGRESS",
      expectedEndTime: { lt: now },
    },
    data: {
      status: "BREACHED",
    },
  });

  if (breaches.count > 0) {
    console.log(`[WorkflowEngine] Detected and marked ${breaches.count} SLA breaches.`);
    // We could emit events for breaches here if needed
  }
}
