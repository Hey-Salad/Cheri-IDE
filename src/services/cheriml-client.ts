import {
  CheriMLResponse,
  GenerateFunctionRequest,
  GenerateComponentRequest,
  GenerateTestRequest,
  GenerateEndpointRequest
} from '../types/cheriml';

export class CheriMLClient {
  private baseURL = 'https://ai.heysalad.app/api/cheriml';
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  private async makeRequest<T>(
    endpoint: string,
    request: any
  ): Promise<CheriMLResponse> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseURL}/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`CheriML API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async generateFunction(request: GenerateFunctionRequest): Promise<CheriMLResponse> {
    return this.makeRequest('generate-function', request);
  }

  async generateComponent(request: GenerateComponentRequest): Promise<CheriMLResponse> {
    return this.makeRequest('generate-component', request);
  }

  async generateTest(request: GenerateTestRequest): Promise<CheriMLResponse> {
    return this.makeRequest('generate-test', request);
  }

  async generateEndpoint(request: GenerateEndpointRequest): Promise<CheriMLResponse> {
    return this.makeRequest('generate-endpoint', request);
  }
}