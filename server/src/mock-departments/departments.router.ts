import { Router, Request, Response } from "express";
import { mockState } from "./state";
import prisma from "../config/db";

const router = Router();

// Label for demonstration environment
const DEMO_LABEL = "Mock Department Systems / Demonstration Environment";

// 1. Department A: Citizen / Identity Service
router.post("/identity/verify", async (req: Request, res: Response) => {
  console.log(`[Mock Dept A] Dynamic Identity Check:`, req.body);
  const { citizen_id, full_name } = req.body;

  if (!citizen_id) return res.status(400).json({ error: "citizen_id required" });

  // Query actual external identity registry
  const record = await prisma.externalIdentityRegistry.findUnique({
    where: { citizenId: citizen_id }
  });

  if (!record) {
    return res.json({
      verification_status: "UNVERIFIED",
      match_report: { id_match: false, name_match: false },
    });
  }

  const nameMatch = record.fullName.toLowerCase() === full_name.toLowerCase();

  return res.json({
    environment: DEMO_LABEL,
    verification_status: nameMatch ? "VERIFIED" : "UNVERIFIED",
    match_report: {
      id_match: true,
      name_match: nameMatch,
      dob_match: true,
    },
    system_signature: "DEPT_A_IDENTITY_SECURE_AUTH",
  });
});

// 2. Department B: Income / Eligibility Verification
router.post("/eligibility/check", async (req: Request, res: Response) => {
  if (mockState.isDepartmentBFailed) {
    return res.status(503).json({ error: "Service Unavailable" });
  }

  const { beneficiaryId } = req.body;
  if (!beneficiaryId) return res.status(400).json({ error: "beneficiaryId required" });

  const record = await prisma.externalRevenueRecords.findUnique({
    where: { citizenId: beneficiaryId }
  });

  if (!record) {
    return res.json({ approved: false, result: { status: "INELIGIBLE" } });
  }

  return res.json({
    environment: DEMO_LABEL,
    eligibilityChecked: true,
    result: {
      status: record.annualIncome < 500000 ? "ELIGIBLE" : "INELIGIBLE",
      criteria_code: "INC-2026-AUTO",
      calculated_annual_income: record.annualIncome,
    },
    approved: record.annualIncome < 500000,
  });
});

// 3. Department C: Employment / Skill Service
router.post("/employment/verify", async (req: Request, res: Response) => {
  const { candidate_id } = req.body;
  if (!candidate_id) return res.status(400).json({ error: "candidate_id required" });

  const record = await prisma.externalSkillRegistry.findUnique({
    where: { citizenId: candidate_id }
  });

  if (!record) {
    return res.json({ candidate_id, skill_verification_status: "not_found" });
  }

  return res.json({
    environment: DEMO_LABEL,
    candidate_id,
    skill_verification_status: "verified",
    certified_skills: record.certifiedSkills,
    accreditation_body: "Skill Registry HQ",
  });
});

// 4. Department D: Benefits / Scheme Service
// POST /mock/benefits/process
// Custom schema: { recipient_profile_id, requestedBenefitAmount, disbursementMode }
router.post("/benefits/process", (req: Request, res: Response) => {
  console.log(`[Mock Dept D] Received benefits processing request:`, req.body);
  const { recipient_profile_id, requestedBenefitAmount, disbursementMode } = req.body;

  if (!recipient_profile_id || !requestedBenefitAmount || !disbursementMode) {
    return res.status(400).json({
      error: "Missing required fields in Benefits System schema",
      environment: DEMO_LABEL,
    });
  }

  const payoutSuccess = recipient_profile_id === "MH12345";

  return res.json({
    environment: DEMO_LABEL,
    disbursement_status: payoutSuccess ? "PAID" : "REJECTED",
    txn: {
      transaction_id: payoutSuccess ? "TXN-SG-99887766" : null,
      disbursed_amount: payoutSuccess ? requestedBenefitAmount : 0,
      mode: disbursementMode,
      processed_at: new Date().toISOString(),
    },
  });
});

export default router;
