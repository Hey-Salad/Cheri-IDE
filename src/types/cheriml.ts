// CheriML API types for code generation

export type CheriMLTaskType =
  | 'T1_GENERATE_FUNCTION'
  | 'T2_GENERATE_COMPONENT'
  | 'T3_GENERATE_TEST'
  | 'T4_GENERATE_ENDPOINT';

export interface CheriMLParameter {
  name: string;
  type: string;
  required?: boolean;
}

export interface CheriMLValidationError {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
}

export interface CheriMLValidation {
  passed: boolean;
  errors: CheriMLValidationError[];
}

export interface CheriMLMetrics {
  linesChanged?: number;
  complexity?: number;
  coverage?: number;
}

export interface CheriMLOutput {
  code: string;
  summary: string;
  details?: string;
}

export interface CheriMLResponse {
  id: string;
  taskType: CheriMLTaskType;
  status: 'success' | 'error';
  output: CheriMLOutput;
  validation: CheriMLValidation;
  metrics?: CheriMLMetrics;
  nextSteps: string[];
  error?: string;
}

// Request types for each generation endpoint

export interface GenerateFunctionRequest {
  title: string;
  description: string;
  language: string;
  functionName?: string;
  returnType?: string;
  parameters?: CheriMLParameter[];
  constraints?: string[];
  acceptanceCriteria?: string[];
}

export interface GenerateComponentRequest {
  title: string;
  description: string;
  language: string;
  componentName: string;
  framework: 'react' | 'vue' | 'angular' | 'svelte';
  props?: CheriMLParameter[];
  constraints?: string[];
  acceptanceCriteria?: string[];
}

export interface GenerateTestRequest {
  title: string;
  description: string;
  language: string;
  code: string;
  targetFunction?: string;
  testFramework: 'vitest' | 'jest' | 'mocha' | 'jasmine';
  coverageTarget?: number;
  constraints?: string[];
  acceptanceCriteria?: string[];
}

export interface GenerateEndpointRequest {
  title: string;
  description: string;
  language: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  authentication?: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
}

// Tool input types (simplified for agent use)

export interface CheriMLGenerateFunctionInput {
  description: string;
  language?: string;
  functionName?: string;
  returnType?: string;
  parameters?: string; // JSON string of parameters
  constraints?: string[]; // Array of constraint strings
}

export interface CheriMLGenerateComponentInput {
  description: string;
  componentName: string;
  language?: string;
  framework?: string;
  props?: string; // JSON string of props
  constraints?: string[];
}

export interface CheriMLGenerateTestInput {
  code: string;
  description?: string;
  language?: string;
  targetFunction?: string;
  testFramework?: string;
  coverageTarget?: number;
  constraints?: string[];
}

export interface CheriMLGenerateEndpointInput {
  description: string;
  method: string;
  path: string;
  language?: string;
  authentication?: string;
  constraints?: string[];
}
