export interface ConnectorConfig {
  id: string;
  name: string;
  department: string;
  type: "REST_JSON" | "REST_DIFFERENT_SCHEMA" | "LEGACY_SIMULATED" | "WEBHOOK";
  baseUrl: string;
}

export abstract class BaseConnector {
  public id: string;
  public name: string;
  public department: string;
  public type: string;
  public baseUrl: string;

  constructor(config: ConnectorConfig) {
    this.id = config.id;
    this.name = config.name;
    this.department = config.department;
    this.type = config.type;
    this.baseUrl = config.baseUrl;
  }

  // Get full HTTP URL for execution
  protected getFullUrl(): string {
    const port = process.env.PORT || 5001;
    // For local monorepo demonstration, point to the self-hosted mock endpoints
    return `http://localhost:${port}${this.baseUrl}`;
  }

  // Hook to transform canonical internal input to external API schema
  protected abstract transformRequest(canonicalInput: any): any;

  // Hook to transform external API response back to canonical internal structure
  protected abstract transformResponse(externalOutput: any): any;

  // Execute the connector flow
  public async execute(canonicalInput: any): Promise<any> {
    const externalPayload = this.transformRequest(canonicalInput);
    const url = this.getFullUrl();

    console.log(`[Connector ${this.name}] Executing request on ${url} with payload:`, externalPayload);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SetuGov-Connector-ID": this.id,
        },
        body: JSON.stringify(externalPayload),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      const rawResponse = await response.json();
      console.log(`[Connector ${this.name}] Received response:`, rawResponse);

      return this.transformResponse(rawResponse);
    } catch (error: any) {
      console.error(`[Connector ${this.name}] Execution failed:`, error.message);
      throw error;
    }
  }

  // Basic healthcheck
  public async healthCheck(): Promise<boolean> {
    try {
      const port = process.env.PORT || 5001;
      const url = `http://localhost:${port}/health`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }
}
