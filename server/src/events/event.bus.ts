import { EventEmitter } from "events";
import prisma from "../config/db";

class SetuGovEventBus extends EventEmitter {
  constructor() {
    super();
    this.setupListeners();
  }

  private setupListeners() {
    // Audit listener for all events
    this.on("*", async (eventType: string, payload: any) => {
      try {
        // 1. Persist the raw system event
        await prisma.systemEvent.create({
          data: {
            eventType,
            payload,
          },
        });

        // 2. Formulate audit log entries based on events
        let actor = "SYSTEM";
        let role = "SYSTEM";
        let action = eventType;
        let requestId = payload.requestId || null;
        let department = payload.department || null;
        let prevStatus = payload.prevStatus || null;
        let newStatus = payload.newStatus || null;
        let result = payload.result || "SUCCESS";
        let detail = payload.detail || "";

        if (eventType === "REQUEST_CREATED") {
          actor = payload.citizenEmail || "CITIZEN";
          role = "CITIZEN";
          detail = `Request created for service: ${payload.serviceName}`;
        } else if (eventType === "CONSENT_GRANTED") {
          actor = payload.citizenEmail || "CITIZEN";
          role = "CITIZEN";
          detail = "Citizen granted data sharing consent.";
        } else if (eventType === "DEPARTMENT_REQUESTED") {
          detail = `Initiated request to Department: ${department}`;
        } else if (eventType === "DEPARTMENT_COMPLETED") {
          detail = `Department: ${department} request completed successfully`;
        } else if (eventType === "DEPARTMENT_FAILED") {
          result = "FAILED";
          detail = `Department: ${department} request failed. Error: ${payload.error || "Unknown"}`;
        } else if (eventType === "WORKFLOW_WAITING") {
          detail = `Workflow instance entered WAITING state on department: ${department}`;
        } else if (eventType === "WORKFLOW_RETRYING") {
          detail = `Retrying department: ${department}. Retry count: ${payload.retries}`;
        } else if (eventType === "WORKFLOW_COMPLETED") {
          detail = "All integration steps completed successfully. Final benefits released.";
        } else if (eventType === "WORKFLOW_FAILED") {
          result = "FAILED";
          detail = `Workflow failed on step: ${payload.failedStep}`;
        }

        // Create the AuditLog
        await prisma.auditLog.create({
          data: {
            actor,
            role,
            action,
            requestId,
            department,
            prevStatus,
            newStatus,
            result,
            metadata: { detail, ...payload },
          },
        });

        // 3. Create Notification for Citizen if citizenId and message are provided
        if (payload.citizenProfileId) {
          let message = "";
          if (eventType === "REQUEST_CREATED") {
            message = `Your application ${requestId} has been submitted successfully.`;
          } else if (eventType === "DEPARTMENT_COMPLETED") {
            message = `Verification complete for step: ${department}.`;
          } else if (eventType === "WORKFLOW_WAITING") {
            message = `Verification pending: ${department} is temporarily unavailable. We will retry automatically.`;
          } else if (eventType === "WORKFLOW_COMPLETED") {
            message = `Your application ${requestId} has been fully processed and approved.`;
          } else if (eventType === "WORKFLOW_FAILED") {
            message = `Your application ${requestId} failed during processing. Contact an official.`;
          }

          if (message) {
            await prisma.notification.create({
              data: {
                citizenId: payload.citizenProfileId,
                message,
              },
            });
          }
        }
      } catch (error) {
        console.error("EventBus listener error:", error);
      }
    });
  }

  // Override emit to support a wildcard listener
  public emitEvent(eventType: string, payload: any): boolean {
    console.log(`[EventBus] Emitting event ${eventType}:`, payload);
    // Trigger wildcard first
    this.emit("*", eventType, payload);
    // Trigger specific event
    return this.emit(eventType, payload);
  }
}

const eventBus = new SetuGovEventBus();
export default eventBus;
