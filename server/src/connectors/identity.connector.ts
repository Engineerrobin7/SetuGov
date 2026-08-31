import { BaseConnector } from "./base.connector";

export class IdentityConnector extends BaseConnector {
  constructor() {
    super({
      id: "conn-001",
      name: "IdentityConnector",
      department: "Identity Service (Dept A)",
      type: "REST_JSON",
      baseUrl: "/mock/identity/verify",
    });
  }

  protected transformRequest(canonicalInput: any): any {
    return {
      citizen_id: canonicalInput.citizenId,
      full_name: canonicalInput.name,
      dob: canonicalInput.dob, // Format: YYYY-MM-DD
    };
  }

  protected transformResponse(externalOutput: any): any {
    return {
      verificationStatus: externalOutput.verification_status, // "VERIFIED" or "UNVERIFIED"
      verificationDetails: {
        idMatch: externalOutput.match_report?.id_match ?? false,
        nameMatch: externalOutput.match_report?.name_match ?? false,
        dobMatch: externalOutput.match_report?.dob_match ?? false,
      },
    };
  }
}
