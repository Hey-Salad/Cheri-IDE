import { Tool } from './tools';
import { CheriMLClient } from '../services/cheriml-client';
import { getApiKey } from '../services/api-keys';

// Initialize CheriML client with API key
const getCheriMLClient = async (): Promise<CheriMLClient> => {
  const apiKey = await getApiKey('heysalad');
  return new CheriMLClient(apiKey);
};

export const cheriml_generate_function: Tool = {
  name: 'cheriml_generate_function',
  description: 'Generate a function using CheriML AI-powered code generation',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Natural language description of the function to generate'
      },
      language: {
        type: 'string',
        description: 'Programming language (typescript, javascript, python, etc.)',
        default: 'typescript'
      },
      functionName: {
        type: 'string',
        description: 'Name for the generated function'
      },
      returnType: {
        type: 'string',
        description: 'Return type of the function'
      },
      parameters: {
        type: 'string',
        description: 'JSON string of function parameters'
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional constraints for code generation'
      }
    },
    required: ['description']
  },
  execute: async (args: any) => {
    const client = await getCheriMLClient();

    const request = {
      title: `Generate ${args.functionName || 'function'}`,
      description: args.description,
      language: args.language || 'typescript',
      functionName: args.functionName,
      returnType: args.returnType,
      parameters: args.parameters ? JSON.parse(args.parameters) : undefined,
      constraints: args.constraints,
      acceptanceCriteria: []
    };

    const response = await client.generateFunction(request);

    if (response.status === 'success') {
      return {
        code: response.output.code,
        summary: response.output.summary,
        validation: response.validation,
        nextSteps: response.nextSteps
      };
    } else {
      throw new Error(`CheriML generation failed: ${response.error}`);
    }
  }
};

export const cheriml_generate_component: Tool = {
  name: 'cheriml_generate_component',
  description: 'Generate a UI component using CheriML AI-powered code generation',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Natural language description of the component to generate'
      },
      componentName: {
        type: 'string',
        description: 'Name for the generated component'
      },
      framework: {
        type: 'string',
        enum: ['react', 'vue', 'angular', 'svelte'],
        description: 'UI framework to use',
        default: 'react'
      },
      language: {
        type: 'string',
        description: 'Programming language (typescript, javascript)',
        default: 'typescript'
      },
      props: {
        type: 'string',
        description: 'JSON string of component props'
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional constraints for code generation'
      }
    },
    required: ['description', 'componentName']
  },
  execute: async (args: any) => {
    const client = await getCheriMLClient();

    const request = {
      title: `Generate ${args.componentName} component`,
      description: args.description,
      language: args.language || 'typescript',
      componentName: args.componentName,
      framework: args.framework || 'react',
      props: args.props ? JSON.parse(args.props) : undefined,
      constraints: args.constraints,
      acceptanceCriteria: []
    };

    const response = await client.generateComponent(request);

    if (response.status === 'success') {
      return {
        code: response.output.code,
        summary: response.output.summary,
        validation: response.validation,
        nextSteps: response.nextSteps
      };
    } else {
      throw new Error(`CheriML generation failed: ${response.error}`);
    }
  }
};

export const cheriml_generate_test: Tool = {
  name: 'cheriml_generate_test',
  description: 'Generate tests for existing code using CheriML AI-powered generation',
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The code to generate tests for'
      },
      description: {
        type: 'string',
        description: 'Additional context or requirements for the tests'
      },
      targetFunction: {
        type: 'string',
        description: 'Specific function to test'
      },
      testFramework: {
        type: 'string',
        enum: ['vitest', 'jest', 'mocha', 'jasmine'],
        description: 'Test framework to use',
        default: 'vitest'
      },
      language: {
        type: 'string',
        description: 'Programming language',
        default: 'typescript'
      },
      coverageTarget: {
        type: 'number',
        description: 'Target code coverage percentage',
        default: 80
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional constraints for test generation'
      }
    },
    required: ['code']
  },
  execute: async (args: any) => {
    const client = await getCheriMLClient();

    const request = {
      title: `Generate tests for ${args.targetFunction || 'code'}`,
      description: args.description || 'Generate comprehensive test suite',
      language: args.language || 'typescript',
      code: args.code,
      targetFunction: args.targetFunction,
      testFramework: args.testFramework || 'vitest',
      coverageTarget: args.coverageTarget || 80,
      constraints: args.constraints,
      acceptanceCriteria: [`Achieve ${args.coverageTarget || 80}% code coverage`]
    };

    const response = await client.generateTest(request);

    if (response.status === 'success') {
      return {
        code: response.output.code,
        summary: response.output.summary,
        validation: response.validation,
        metrics: response.metrics,
        nextSteps: response.nextSteps
      };
    } else {
      throw new Error(`CheriML generation failed: ${response.error}`);
    }
  }
};

export const cheriml_generate_endpoint: Tool = {
  name: 'cheriml_generate_endpoint',
  description: 'Generate an API endpoint using CheriML AI-powered code generation',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Natural language description of the endpoint functionality'
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        description: 'HTTP method for the endpoint'
      },
      path: {
        type: 'string',
        description: 'API endpoint path (e.g., /api/users/:id)'
      },
      language: {
        type: 'string',
        description: 'Programming language',
        default: 'typescript'
      },
      authentication: {
        type: 'string',
        description: 'Authentication method (jwt, basic, api-key, etc.)'
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional constraints for code generation'
      }
    },
    required: ['description', 'method', 'path']
  },
  execute: async (args: any) => {
    const client = await getCheriMLClient();

    const request = {
      title: `Generate ${args.method} ${args.path} endpoint`,
      description: args.description,
      language: args.language || 'typescript',
      method: args.method,
      path: args.path,
      authentication: args.authentication,
      constraints: args.constraints,
      acceptanceCriteria: []
    };

    const response = await client.generateEndpoint(request);

    if (response.status === 'success') {
      return {
        code: response.output.code,
        summary: response.output.summary,
        validation: response.validation,
        nextSteps: response.nextSteps
      };
    } else {
      throw new Error(`CheriML generation failed: ${response.error}`);
    }
  }
};

// Export all CheriML tools as a collection
export const cheriMLTools = [
  cheriml_generate_function,
  cheriml_generate_component,
  cheriml_generate_test,
  cheriml_generate_endpoint
];