import { BaseConnector } from "./base.connector";

export class EligibilityConnector extends BaseConnector {
  constructor() {
    super({
      id: "conn-002",
      name: "EligibilityConnector",
      department: "Income / Eligibility (Dept B)",
      type: "REST_DIFFERENT_SCHEMA",
      baseUrl: "/mock/eligibility/check",
    });
  }

  protected transformRequest(canonicalInput: any): any {
    return {
      beneficiaryId: canonicalInput.citizenId,
      applicantName: canonicalInput.name,
      eligible: true, // As specified in the schema example request
    };
  }

  protected transformResponse(externalOutput: any): any {
    return {
      eligibilityStatus: externalOutput.result?.status ?? "INELIGIBLE", // "ELIGIBLE" or "INELIGIBLE"
      approved: externalOutput.approved ?? false,
      annualIncome: externalOutput.result?.calculated_annual_income ?? 0,
    };
  }
}
