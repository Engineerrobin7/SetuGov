import { BaseConnector } from "./base.connector";
import { IdentityConnector } from "./identity.connector";
import { EligibilityConnector } from "./eligibility.connector";
import { EmploymentConnector } from "./employment.connector";
import { BenefitsConnector } from "./benefits.connector";

const registry: Record<string, BaseConnector> = {
  IDENTITY_VERIFICATION: new IdentityConnector(),
  ELIGIBILITY_VERIFICATION: new EligibilityConnector(),
  EMPLOYMENT_VERIFICATION: new EmploymentConnector(),
  SERVICE_PROCESSING: new BenefitsConnector(),
};

export function getConnectorForStep(stepName: string): BaseConnector | undefined {
  return registry[stepName];
}

export function getAllConnectors(): BaseConnector[] {
  return Object.values(registry);
}
