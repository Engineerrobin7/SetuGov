import dotenv from "dotenv";
// Load environment variables before importing other modules
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

// Import Routers
import mockDepartmentsRouter from "./mock-departments/departments.router";
import { registerCitizen, login, getMe } from "./auth/auth.controller";
import applicationsRouter from "./api/applications.router";
import servicesRouter from "./api/services.router";
import officialRouter from "./api/official.router";
import adminRouter from "./api/admin.router";
import internalRouter from "./api/internal.router";
import notificationsRouter from "./api/notifications.router";
import { checkSLABreaches, retryAllWaitingWorkflows } from "./workflow/workflow.engine";

const app = express();
const PORT = process.env.PORT || 5001;

// 1. Basic Security & Utility Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
}));
app.use(morgan("dev"));
app.use(express.json());

// Set up background maintenance tasks
setInterval(() => {
  checkSLABreaches();
  retryAllWaitingWorkflows();
}, 60000); // Run every minute

// 2. Mock Government Department Routes (Demonstration Environment)
app.use("/mock", mockDepartmentsRouter);

// 3. Core SetuGov API Routes
// Public Auth Endpoints
app.post("/api/auth/register", registerCitizen);
app.post("/api/auth/login", login);
app.get("/api/auth/me", getMe);

// Protected Core Modules
app.use("/api/services", servicesRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/official", officialRouter);
app.use("/api/admin", adminRouter);
app.use("/api/internal", internalRouter);
app.use("/api/notifications", notificationsRouter);

// 4. Global Root Health Checks
app.get("/health", (_req: Request, res: Response) => {
  return res.json({
    status: "UP",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: "demonstration",
    system: "SetuGov Core Interoperability Engine",
  });
});

// Start Server
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`============================================================`);
    console.log(`    SetuGov Core & Mock Departments Server is running!`);
    console.log(`    Port: ${PORT}`);
    console.log(`    Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`============================================================`);
  });
}

export default app;
