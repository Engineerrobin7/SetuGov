import { Response } from "express";
import prisma from "../config/db";
import { AuthenticatedRequest } from "./auth.middleware";

export async function getMe(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        citizen: true,
        official: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      role: user.role,
      profile: user.role === "CITIZEN" ? user.citizen : user.role === "OFFICIAL" ? user.official : null,
    });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Updates a user's role or profile information
 * This can be used for administrative purposes or self-service profile updates
 */
export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const { name, citizenId, dob, address, contact } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        citizen: {
          upsert: {
            create: {
              name,
              citizenId,
              dob: new Date(dob),
              address,
              contact,
            },
            update: {
              name,
              citizenId,
              dob: new Date(dob),
              address,
              contact,
            }
          }
        }
      },
      include: { citizen: true }
    });

    return res.json(updatedUser);
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
