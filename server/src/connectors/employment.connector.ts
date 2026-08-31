import { BaseConnector } from "./base.connector";

export class EmploymentConnector extends BaseConnector {
  constructor() {
    super({
      id: "conn-003",
      name: "EmploymentConnector",
      department: "Employment / Skill (Dept C)",
      type: "LEGACY_SIMULATED",
      baseUrl: "/mock/employment/verify",
    });
  }

  protected transformRequest(canonicalInput: any): any {
    return {
      candidate_id: canonicalInput.citizenId,
      name: canonicalInput.name,
      skill_status: "verified", // As specified in the schema example request
    };
  }

  protected transformResponse(externalOutput: any): any {
    const verified = externalOutput.skill_verification_status === "verified";
    return {
      employmentStatus: verified ? "VERIFIED" : "UNVERIFIED",
      skills: externalOutput.certified_skills ?? [],
    };
  }
}
