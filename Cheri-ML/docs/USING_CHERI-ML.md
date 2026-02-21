# Using CheriML for AI-Powered Code Generation

CheriML is HeySalad AI's intelligent code generation system powered by Google Gemini 3. It helps developers write production-ready code faster by generating functions, components, tests, and API endpoints from natural language descriptions.

## 🎯 What is CheriML?

CheriML (Code Helper & Engineering Resource Intelligence ML) is an AI-powered code generation API that understands your requirements and generates:

- **Functions (T1)**: Pure functions with proper typing, error handling, and documentation
- **Components (T2)**: UI components with TypeScript, accessibility, and best practices
- **Tests (T3)**: Comprehensive test suites with edge cases and high coverage
- **API Endpoints (T4)**: RESTful endpoints with validation, auth, and error handling

## 🚀 Quick Start

### 1. Get Your API Access

CheriML is available at: `https://ai.heysalad.app/api/cheriml`

You don't need an API key to use the public endpoints (rate-limited). For production use, contact us for an API key.

### 2. Basic Usage

#### Generate a Function (T1)

```bash
curl -X POST https://ai.heysalad.app/api/cheriml/generate-function \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Generate fibonacci function",
    "description": "Create a function that calculates fibonacci numbers with memoization",
    "language": "typescript",
    "functionName": "fibonacci",
    "returnType": "number",
    "parameters": [
      {"name": "n", "type": "number"}
    ],
    "constraints": [
      "Use memoization for performance",
      "Handle negative numbers",
      "Include JSDoc comments"
    ],
    "acceptanceCriteria": [
      "Returns correct fibonacci number",
      "Efficient for large numbers"
    ]
  }'
```

**Response:**
```json
{
  "id": "t1-1234567890",
  "taskType": "T1_GENERATE_FUNCTION",
  "status": "success",
  "output": {
    "code": "/**\n * Calculates the nth Fibonacci number...\n */\nexport function fibonacci(n: number): number { ... }",
    "summary": "Generated typescript function: fibonacci"
  },
  "validation": {
    "passed": true,
    "errors": []
  },
  "nextSteps": [
    "Review generated code",
    "Run tests to verify functionality"
  ]
}
```

#### Generate a Component (T2)

```bash
curl -X POST https://ai.heysalad.app/api/cheriml/generate-component \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Generate Card component",
    "description": "Create a reusable card component for displaying content",
    "language": "typescript",
    "componentName": "Card",
    "framework": "react",
    "props": [
      {"name": "title", "type": "string", "required": false},
      {"name": "children", "type": "React.ReactNode", "required": true},
      {"name": "onClick", "type": "() => void", "required": false}
    ],
    "constraints": [
      "Use TypeScript interfaces",
      "Include accessibility attributes",
      "Support hover states"
    ],
    "acceptanceCriteria": [
      "Renders children content",
      "Fully typed with TypeScript",
      "Accessible to screen readers"
    ]
  }'
```

#### Generate Tests (T3)

```bash
curl -X POST https://ai.heysalad.app/api/cheriml/generate-test \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Generate tests for utility functions",
    "description": "Create comprehensive test suite",
    "language": "typescript",
    "code": "export function add(a: number, b: number): number { return a + b; }",
    "targetFunction": "add",
    "testFramework": "vitest",
    "coverageTarget": 90,
    "constraints": [
      "Test edge cases",
      "Use descriptive test names"
    ],
    "acceptanceCriteria": [
      "90% code coverage",
      "All edge cases covered"
    ]
  }'
```

#### Generate API Endpoint (T4)

```bash
curl -X POST https://ai.heysalad.app/api/cheriml/generate-endpoint \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Generate user profile endpoint",
    "description": "Create GET endpoint to retrieve user profile",
    "language": "typescript",
    "method": "GET",
    "path": "/api/users/:id",
    "authentication": "jwt",
    "constraints": [
      "Validate user ID",
      "Handle not found errors",
      "Return proper status codes"
    ],
    "acceptanceCriteria": [
      "Returns user data",
      "Handles errors gracefully",
      "Validates all inputs"
    ]
  }'
```

## 💻 Using CheriML in Your Code

### JavaScript/TypeScript

```typescript
async function generateFunction(requirements: any) {
  const response = await fetch('https://ai.heysalad.app/api/cheriml/generate-function', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requirements),
  });

  const result = await response.json();
  
  if (result.status === 'success') {
    console.log('Generated code:', result.output.code);
    return result.output.code;
  } else {
    throw new Error('Code generation failed');
  }
}

// Usage
const code = await generateFunction({
  title: 'Generate sorting function',
  description: 'Create a function to sort an array of objects by a property',
  language: 'typescript',
  functionName: 'sortByProperty',
  returnType: 'T[]',
  parameters: [
    { name: 'array', type: 'T[]' },
    { name: 'property', type: 'keyof T' }
  ],
  constraints: ['Generic function', 'Type-safe'],
  acceptanceCriteria: ['Sorts correctly', 'Preserves original array']
});
```

### Python

```python
import requests
import json

def generate_function(requirements):
    response = requests.post(
        'https://ai.heysalad.app/api/cheriml/generate-function',
        headers={'Content-Type': 'application/json'},
        json=requirements
    )
    
    result = response.json()
    
    if result['status'] == 'success':
        return result['output']['code']
    else:
        raise Exception('Code generation failed')

# Usage
code = generate_function({
    'title': 'Generate data validator',
    'description': 'Create a function to validate email addresses',
    'language': 'python',
    'functionName': 'validate_email',
    'returnType': 'bool',
    'parameters': [
        {'name': 'email', 'type': 'str'}
    ],
    'constraints': ['Use regex', 'Handle edge cases'],
    'acceptanceCriteria': ['Validates correctly', 'Returns boolean']
})

print(code)
```

## 🎨 Best Practices

### 1. Be Specific in Descriptions

**Good:**
```json
{
  "description": "Create a function that validates email addresses using RFC 5322 standard, handles international domains, and returns detailed error messages"
}
```

**Bad:**
```json
{
  "description": "Make email validator"
}
```

### 2. Define Clear Constraints

```json
{
  "constraints": [
    "Must be a pure function with no side effects",
    "Handle all edge cases including null and undefined",
    "Include comprehensive JSDoc comments",
    "Use TypeScript strict mode",
    "Follow functional programming principles"
  ]
}
```

### 3. Set Measurable Acceptance Criteria

```json
{
  "acceptanceCriteria": [
    "Returns correct results for 100% of test cases",
    "Handles errors gracefully without throwing",
    "Performance: O(n) time complexity",
    "Memory: O(1) space complexity",
    "Code coverage: minimum 90%"
  ]
}
```

### 4. Specify Language-Specific Requirements

For TypeScript:
```json
{
  "language": "typescript",
  "constraints": [
    "Use strict TypeScript types",
    "Export all interfaces",
    "Include type guards where appropriate"
  ]
}
```

For React:
```json
{
  "framework": "react",
  "constraints": [
    "Use functional components with hooks",
    "Include proper TypeScript prop types",
    "Add accessibility attributes (ARIA)",
    "Support ref forwarding"
  ]
}
```

## 🔧 Advanced Usage

### Iterative Refinement

CheriML generates code that you can refine iteratively:

```typescript
// 1. Generate initial version
const v1 = await generateFunction({
  title: 'Generate data processor',
  description: 'Process user data',
  // ... basic requirements
});

// 2. Review and refine
const v2 = await generateFunction({
  title: 'Generate data processor',
  description: 'Process user data with validation and transformation',
  constraints: [
    'Add input validation',
    'Transform data to camelCase',
    'Handle missing fields gracefully'
  ],
  // ... refined requirements
});
```

### Combining Multiple Generations

```typescript
// Generate function
const functionCode = await generateFunction({ /* ... */ });

// Generate tests for that function
const testCode = await generateTest({
  code: functionCode,
  targetFunction: 'myFunction',
  testFramework: 'vitest',
  coverageTarget: 95
});

// Generate API endpoint that uses the function
const endpointCode = await generateEndpoint({
  description: 'API endpoint that uses myFunction',
  // ... endpoint requirements
});
```

## 📊 Response Format

All CheriML endpoints return a consistent response format:

```typescript
interface CheriMLResponse {
  id: string;                    // Unique task ID
  taskType: string;              // T1, T2, T3, or T4
  status: 'success' | 'error';   // Generation status
  output: {
    code: string;                // Generated code
    summary: string;             // Brief description
    details?: string;            // Full response with markdown
  };
  validation: {
    passed: boolean;             // Validation status
    errors: Array<{              // Any validation issues
      severity: string;
      message: string;
    }>;
  };
  metrics?: {
    linesChanged?: number;       // Lines of code generated
    complexity?: number;         // Code complexity score
    coverage?: number;           // Test coverage percentage
  };
  nextSteps: string[];           // Recommended next actions
}
```

## ⚡ Performance Tips

1. **Batch Requests**: Generate multiple related items in sequence
2. **Cache Results**: Store generated code to avoid regeneration
3. **Use Specific Models**: Specify language and framework for better results
4. **Provide Context**: Include existing code when generating related items

## 🚨 Error Handling

```typescript
try {
  const result = await generateFunction(requirements);
  
  if (result.status === 'success') {
    // Use generated code
    console.log(result.output.code);
  } else {
    // Handle generation failure
    console.error('Generation failed:', result.validation.errors);
  }
} catch (error) {
  // Handle network or API errors
  console.error('API error:', error);
}
```

## 🔒 Security Considerations

1. **Never expose API keys** in client-side code
2. **Validate generated code** before using in production
3. **Review security implications** of generated code
4. **Use rate limiting** to prevent abuse
5. **Sanitize inputs** before sending to CheriML

## 📈 Rate Limits

Public API (no key):
- 10 requests per minute
- 100 requests per day

With API key:
- 60 requests per minute
- 10,000 requests per day

## 🆘 Support

- **Documentation**: [CheriML API Reference](./CHERIML_API_ENDPOINTS.md)
- **Examples**: [Test Reports](./CHERIML_TEST_REPORT.md)
- **Issues**: GitHub Issues
- **Community**: Discord Server

## 🎓 Examples

See our [examples directory](../../examples/) for complete working examples:

- `generate-function-example.ts` - Function generation
- `generate-component-example.ts` - React component generation
- `generate-test-example.ts` - Test suite generation
- `generate-endpoint-example.ts` - API endpoint generation

---

**Powered by Google Gemini 3.1 Pro**  
**Last Updated**: February 20, 2026
