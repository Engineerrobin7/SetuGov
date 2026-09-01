import { Response, NextFunction } from "express";
import { createClerkClient } from "@clerk/backend";
import { Request } from "express";
import prisma from "../config/db";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string; // Database User ID
    clerkId: string;
    email: string;
    role: string;
    citizenProfileId?: string;
    officialProfileId?: string;
  };
}

export async function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token is missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify the session token with Clerk
    const session = await clerkClient.verifyToken(token);

    if (!session) {
      return res.status(403).json({ error: "Invalid session" });
    }

    const clerkId = session.sub;

    // Find or create user in our local database
    let user = await prisma.user.findUnique({
      where: { clerkId },
      include: {
        citizen: true,
        official: true,
      },
    });

    if (!user) {
      // Get full user details from Clerk if not in our DB
      const clerkUser = await clerkClient.users.getUser(clerkId);
      const email = clerkUser.emailAddresses[0]?.emailAddress || "";

      user = await prisma.user.create({
        data: {
          clerkId,
          email,
          role: "CITIZEN", // Default role
        },
        include: {
          citizen: true,
          official: true,
        }
      });
    }

    req.user = {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      role: user.role,
      citizenProfileId: user.citizen?.id,
      officialProfileId: user.official?.id,
    };

    return next();
  } catch (error) {
    console.error("Auth Error:", error);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient permissions" });
    }

    return next();
  };
}
