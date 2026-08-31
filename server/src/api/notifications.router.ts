import { Router, Response } from "express";
import prisma from "../config/db";
import { authenticateJWT, AuthenticatedRequest } from "../auth/auth.middleware";

const router = Router();

router.use(authenticateJWT);

// GET /api/notifications
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const citizen = await prisma.citizen.findUnique({
      where: { userId: req.user?.id },
    });

    if (!citizen) {
      return res.status(404).json({ error: "Citizen profile not found" });
    }

    const notifications = await prisma.notification.findMany({
      where: { citizenId: citizen.id },
      orderBy: { timestamp: "desc" },
      take: 20,
    });

    return res.json(notifications);
  } catch (error) {
    console.error("Fetch notifications error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/notifications/:id/read
router.post("/:id/read", async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
