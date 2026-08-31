import { Router, Response } from "express";
import prisma from "../config/db";
import { authenticateJWT, AuthenticatedRequest } from "../auth/auth.middleware";

const router = Router();

// Allow public or authenticated retrieval
router.use(authenticateJWT);

// GET /api/services
router.get("/", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const services = await prisma.service.findMany({
      orderBy: { name: "asc" },
    });
    return res.json(services);
  } catch (error) {
    console.error("Fetch services error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/services/:id
router.get("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
    });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }
    return res.json(service);
  } catch (error) {
    console.error("Fetch service error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
