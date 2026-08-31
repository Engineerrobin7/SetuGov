import { Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../config/db";
import { AuthenticatedRequest } from "./auth.middleware";

const JWT_SECRET = process.env.JWT_SECRET || "setugov-super-secret-key-sih-2026-mvp";

// Register validation schema
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  citizenId: z.string().min(3),
  name: z.string().min(2),
  dob: z.string(), // ISO string
  address: z.string().min(5),
  contact: z.string().min(10),
});

// Login validation schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function registerCitizen(req: AuthenticatedRequest, res: Response) {
  try {
    const data = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      return res.status(400).json({ error: "Email is already registered" });
    }

    // Check if citizenId is unique
    const existingCitizen = await prisma.citizen.findUnique({
      where: { citizenId: data.citizenId },
    });
    if (existingCitizen) {
      return res.status(400).json({ error: "Citizen ID is already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user and profile in transaction
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        role: "CITIZEN",
        citizen: {
          create: {
            citizenId: data.citizenId,
            name: data.name,
            dob: new Date(data.dob),
            address: data.address,
            contact: data.contact,
          },
        },
      },
      include: {
        citizen: true,
      },
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        citizenProfileId: user.citizen?.id,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.citizen,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function login(req: AuthenticatedRequest, res: Response) {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        citizen: true,
        official: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const profileId = user.role === "CITIZEN" ? user.citizen?.id : user.role === "OFFICIAL" ? user.official?.id : undefined;

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        ...(user.role === "CITIZEN" ? { citizenProfileId: profileId } : {}),
        ...(user.role === "OFFICIAL" ? { officialProfileId: profileId } : {}),
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.role === "CITIZEN" ? user.citizen : user.role === "OFFICIAL" ? user.official : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

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
      email: user.email,
      role: user.role,
      profile: user.role === "CITIZEN" ? user.citizen : user.role === "OFFICIAL" ? user.official : null,
    });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
