import { Router, Request, Response } from "express";
import { mockState } from "./state";

const router = Router();

// Label for demonstration environment
const DEMO_LABEL = "Mock Department Systems / Demonstration Environment";

// 1. Department A: Citizen / Identity Service
// POST /mock/identity/verify
// Schema: { citizen_id, full_name, dob }
router.post("/identity/verify", (req: Request, res: Response) => {
  console.log(`[Mock Dept A] Received identity verification request:`, req.body);
  const { citizen_id, full_name, dob } = req.body;

  if (!citizen_id || !full_name || !dob) {
    return res.status(400).json({
      error: "Missing required fields in Identity System schema",
      environment: DEMO_LABEL,
    });
  }

  // Fictional verification check
  const idMatch = citizen_id === "MH12345";
  const nameMatch = full_name.toLowerCase() === "rahul sharma";

  return res.json({
    environment: DEMO_LABEL,
    verification_status: idMatch && nameMatch ? "VERIFIED" : "UNVERIFIED",
    match_report: {
      id_match: idMatch,
      name_match: nameMatch,
      dob_match: true,
    },
    system_signature: "DEPT_A_IDENTITY_SECURE_AUTH",
  });
});

// 2. Department B: Income / Eligibility Verification
// POST /mock/eligibility/check
// Schema: { beneficiaryId, applicantName, eligible }
router.post("/eligibility/check", (req: Request, res: Response) => {
  console.log(`[Mock Dept B] Received eligibility request. Failed state = ${mockState.isDepartmentBFailed}`, req.body);
  
  if (mockState.isDepartmentBFailed) {
    console.log("[Mock Dept B] Simulating 503 Service Unavailable");
    return res.status(503).json({
      error: "Department system database socket timeout (Simulated Failure)",
      environment: DEMO_LABEL,
    });
  }

  const { beneficiaryId, applicantName } = req.body;

  if (!beneficiaryId || !applicantName) {
    return res.status(400).json({
      error: "Missing required fields in Eligibility System schema",
      environment: DEMO_LABEL,
    });
  }

  const isEligible = beneficiaryId === "MH12345" && applicantName.toLowerCase() === "rahul sharma";

  return res.json({
    environment: DEMO_LABEL,
    eligibilityChecked: true,
    result: {
      status: isEligible ? "ELIGIBLE" : "INELIGIBLE",
      criteria_code: "INC-2026-LOW",
      calculated_annual_income: 120000,
    },
    approved: isEligible,
  });
});

// 3. Department C: Employment / Skill Service
// POST /mock/employment/verify
// Schema: { candidate_id, name, skill_status }
router.post("/employment/verify", (req: Request, res: Response) => {
  console.log(`[Mock Dept C] Received employment verification request:`, req.body);
  const { candidate_id, name } = req.body;

  if (!candidate_id || !name) {
    return res.status(400).json({
      error: "Missing required fields in Employment System schema",
      environment: DEMO_LABEL,
    });
  }

  const verified = candidate_id === "MH12345" && name.toLowerCase() === "rahul sharma";

  return res.json({
    environment: DEMO_LABEL,
    candidate_id,
    skill_verification_status: verified ? "verified" : "not_found",
    certified_skills: ["Computer Literacy", "Customer Support Level 2"],
    accreditation_body: "Maharashtra Skill Development Board",
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
