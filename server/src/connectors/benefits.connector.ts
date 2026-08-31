import { BaseConnector } from "./base.connector";

export class BenefitsConnector extends BaseConnector {
  constructor() {
    super({
      id: "conn-004",
      name: "BenefitsConnector",
      department: "Benefits / Scheme (Dept D)",
      type: "REST_JSON",
      baseUrl: "/mock/benefits/process",
    });
  }

  protected transformRequest(canonicalInput: any): any {
    return {
      recipient_profile_id: canonicalInput.citizenId,
      requestedBenefitAmount: canonicalInput.benefitAmount || 5000,
      disbursementMode: "DBT", // Direct Benefit Transfer
    };
  }

  protected transformResponse(externalOutput: any): any {
    return {
      benefitStatus: externalOutput.disbursement_status, // "PAID" or "REJECTED"
      transactionId: externalOutput.txn?.transaction_id || null,
      amountDisbursed: externalOutput.txn?.disbursed_amount || 0,
    };
  }
}
