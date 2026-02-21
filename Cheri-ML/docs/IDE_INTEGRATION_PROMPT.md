# CheriML IDE Integration - AI Agent Prompt

Use this prompt to instruct an AI agent to build a CheriML IDE integration.

---

## 🎯 Project Brief

Build a VS Code extension that integrates CheriML AI-powered code generation directly into the IDE. The extension should allow developers to generate functions, components, tests, and API endpoints using natural language descriptions.

## 📋 Requirements

### Core Features

1. **Generate Function (T1)**
   - User writes a comment describing a function
   - User triggers command or code action
   - Extension calls CheriML API
   - Generated function is inserted at cursor position
   - Supports TypeScript, JavaScript, Python, and other languages

2. **Generate Component (T2)**
   - User describes a UI component
   - Extension prompts for component details (name, framework, props)
   - Generates React/Vue/Angular component with TypeScript
   - Includes proper typing and accessibility attributes

3. **Generate Tests (T3)**
   - User selects a function or component
   - Extension analyzes the code
   - Generates comprehensive test suite
   - Supports Vitest, Jest, Mocha, and other frameworks

4. **Generate API Endpoint (T4)**
   - User describes an API endpoint
   - Extension prompts for HTTP method, path, auth requirements
   - Generates Express/Fastify/Next.js endpoint
   - Includes validation, error handling, and documentation

### User Experience

1. **Command Palette Integration**
   - `CheriML: Generate Function`
   - `CheriML: Generate Component`
   - `CheriML: Generate Tests`
   - `CheriML: Generate API Endpoint`

2. **Code Actions (Right-click menu)**
   - "Generate function with CheriML" (when comment is selected)
   - "Generate tests with CheriML" (when function is selected)
   - "Refactor with CheriML" (when code is selected)

3. **Keyboard Shortcuts**
   - `Cmd+Shift+G F` - Generate Function
   - `Cmd+Shift+G C` - Generate Component
   - `Cmd+Shift+G T` - Generate Tests
   - `Cmd+Shift+G E` - Generate Endpoint

4. **Sidebar Panel**
   - CheriML icon in activity bar
   - History of generated code
   - Quick access to common generations
   - Settings and configuration

### Technical Specifications

#### API Integration

**Base URL**: `https://ai.heysalad.app/api/cheriml`

**Endpoints**:
- `POST /generate-function` - Generate functions
- `POST /generate-component` - Generate components
- `POST /generate-test` - Generate tests
- `POST /generate-endpoint` - Generate API endpoints

**Request Format** (Generate Function):
```json
{
  "title": "string",
  "description": "string",
  "language": "typescript" | "javascript" | "python" | etc,
  "functionName": "string",
  "returnType": "string",
  "parameters": [
    {"name": "string", "type": "string"}
  ],
  "constraints": ["string"],
  "acceptanceCriteria": ["string"]
}
```

**Response Format**:
```json
{
  "id": "string",
  "taskType": "T1_GENERATE_FUNCTION",
  "status": "success" | "error",
  "output": {
    "code": "string",
    "summary": "string",
    "details": "string"
  },
  "validation": {
    "passed": boolean,
    "errors": []
  },
  "nextSteps": ["string"]
}
```

#### Extension Structure

```
cheriml-vscode/
├── package.json                 # Extension manifest
├── tsconfig.json               # TypeScript config
├── .vscodeignore              # Files to exclude from package
├── README.md                   # Extension documentation
├── CHANGELOG.md               # Version history
├── src/
│   ├── extension.ts           # Entry point
│   ├── commands/
│   │   ├── generateFunction.ts
│   │   ├── generateComponent.ts
│   │   ├── generateTest.ts
│   │   └── generateEndpoint.ts
│   ├── providers/
│   │   ├── codeActionProvider.ts
│   │   ├── completionProvider.ts
│   │   └── hoverProvider.ts
│   ├── client/
│   │   └── cherimlClient.ts
│   ├── ui/
│   │   ├── sidebar.ts
│   │   ├── quickPick.ts
│   │   └── webview.ts
│   ├── utils/
│   │   ├── parser.ts
│   │   ├── validator.ts
│   │   └── formatter.ts
│   └── types/
│       └── index.ts
├── media/
│   ├── icon.png
│   └── logo.svg
└── test/
    └── suite/
        └── extension.test.ts
```

### Implementation Details

#### 1. Extension Activation

```typescript
import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { CheriMLCodeActionProvider } from './providers/codeActionProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('CheriML extension is now active');

  // Register commands
  registerCommands(context);

  // Register code action provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file', language: '*' },
      new CheriMLCodeActionProvider(),
      {
        providedCodeActionKinds: [
          vscode.CodeActionKind.RefactorRewrite,
          vscode.CodeActionKind.Source
        ]
      }
    )
  );

  // Register sidebar
  const sidebarProvider = new CheriMLSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'cheriml-sidebar',
      sidebarProvider
    )
  );
}

export function deactivate() {}
```

#### 2. Generate Function Command

```typescript
import * as vscode from 'vscode';
import { CheriMLClient } from '../client/cherimlClient';

export async function generateFunction() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }

  // Get selected text or prompt user
  const selection = editor.selection;
  let description = editor.document.getText(selection);
  
  if (!description) {
    description = await vscode.window.showInputBox({
      prompt: 'Describe the function you want to generate',
      placeHolder: 'e.g., "Calculate fibonacci numbers with memoization"'
    });
    
    if (!description) return;
  }

  // Show progress
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Generating function with CheriML...',
    cancellable: true
  }, async (progress, token) => {
    
    // Get additional details
    const functionName = await vscode.window.showInputBox({
      prompt: 'Function name (optional)',
      placeHolder: 'e.g., fibonacci'
    });

    // Call CheriML API
    const client = new CheriMLClient();
    const result = await client.generateFunction({
      title: 'Generate function',
      description: description,
      language: editor.document.languageId,
      functionName: functionName || undefined,
      constraints: [
        'Include JSDoc comments',
        'Handle edge cases',
        'Use TypeScript strict mode'
      ],
      acceptanceCriteria: [
        'Type-safe',
        'Well-documented',
        'Error handling'
      ]
    });

    if (token.isCancellationRequested) return;

    if (result.status === 'success') {
      // Insert generated code
      const edit = new vscode.WorkspaceEdit();
      const position = selection.isEmpty ? editor.selection.active : selection.start;
      edit.insert(editor.document.uri, position, '\n' + result.output.code + '\n');
      await vscode.workspace.applyEdit(edit);
      
      // Format document
      await vscode.commands.executeCommand('editor.action.formatDocument');
      
      vscode.window.showInformationMessage('✅ Function generated successfully!');
    } else {
      vscode.window.showErrorMessage('❌ Failed to generate function');
    }
  });
}
```

#### 3. CheriML API Client

```typescript
export class CheriMLClient {
  private baseURL: string;
  private apiKey?: string;

  constructor() {
    const config = vscode.workspace.getConfiguration('cheriml');
    this.baseURL = config.get('apiUrl') || 'https://ai.heysalad.app/api/cheriml';
    this.apiKey = config.get('apiKey');
  }

  async generateFunction(request: FunctionRequest): Promise<CheriMLResponse> {
    return this.makeRequest('/generate-function', request);
  }

  async generateComponent(request: ComponentRequest): Promise<CheriMLResponse> {
    return this.makeRequest('/generate-component', request);
  }

  async generateTest(request: TestRequest): Promise<CheriMLResponse> {
    return this.makeRequest('/generate-test', request);
  }

  async generateEndpoint(request: EndpointRequest): Promise<CheriMLResponse> {
    return this.makeRequest('/generate-endpoint', request);
  }

  private async makeRequest(endpoint: string, body: any): Promise<CheriMLResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return await response.json();
  }
}
```

#### 4. Code Action Provider

```typescript
export class CheriMLCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const selectedText = document.getText(range);

    // Generate function from comment
    if (this.isComment(selectedText)) {
      const action = new vscode.CodeAction(
        '✨ Generate function with CheriML',
        vscode.CodeActionKind.RefactorRewrite
      );
      action.command = {
        command: 'cheriml.generateFunction',
        title: 'Generate Function'
      };
      actions.push(action);
    }

    // Generate tests for function
    if (this.isFunction(selectedText)) {
      const action = new vscode.CodeAction(
        '🧪 Generate tests with CheriML',
        vscode.CodeActionKind.Source
      );
      action.command = {
        command: 'cheriml.generateTest',
        title: 'Generate Tests'
      };
      actions.push(action);
    }

    return actions;
  }

  private isComment(text: string): boolean {
    return text.trim().startsWith('//') || text.trim().startsWith('/*');
  }

  private isFunction(text: string): boolean {
    return /function\s+\w+|const\s+\w+\s*=\s*\(/.test(text);
  }
}
```

### Configuration

#### Extension Settings (package.json)

```json
{
  "contributes": {
    "configuration": {
      "title": "CheriML",
      "properties": {
        "cheriml.apiUrl": {
          "type": "string",
          "default": "https://ai.heysalad.app/api/cheriml",
          "description": "CheriML API base URL"
        },
        "cheriml.apiKey": {
          "type": "string",
          "default": "",
          "description": "CheriML API key (optional, for higher rate limits)"
        },
        "cheriml.defaultLanguage": {
          "type": "string",
          "default": "typescript",
          "enum": ["typescript", "javascript", "python", "java", "go"],
          "description": "Default programming language"
        },
        "cheriml.defaultFramework": {
          "type": "string",
          "default": "react",
          "enum": ["react", "vue", "angular", "svelte"],
          "description": "Default UI framework"
        },
        "cheriml.testFramework": {
          "type": "string",
          "default": "vitest",
          "enum": ["vitest", "jest", "mocha", "jasmine"],
          "description": "Default test framework"
        },
        "cheriml.includeComments": {
          "type": "boolean",
          "default": true,
          "description": "Include JSDoc/comments in generated code"
        },
        "cheriml.autoFormat": {
          "type": "boolean",
          "default": true,
          "description": "Automatically format generated code"
        }
      }
    }
  }
}
```

### Testing

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { CheriMLClient } from '../client/cherimlClient';

suite('CheriML Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('heysalad.cheriml-vscode'));
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('cheriml.generateFunction'));
    assert.ok(commands.includes('cheriml.generateComponent'));
    assert.ok(commands.includes('cheriml.generateTest'));
    assert.ok(commands.includes('cheriml.generateEndpoint'));
  });

  test('CheriML client should make API calls', async () => {
    const client = new CheriMLClient();
    const result = await client.generateFunction({
      title: 'Test function',
      description: 'Simple add function',
      language: 'typescript',
      functionName: 'add',
      returnType: 'number',
      parameters: [
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' }
      ],
      constraints: [],
      acceptanceCriteria: []
    });
    
    assert.strictEqual(result.status, 'success');
    assert.ok(result.output.code.length > 0);
  });
});
```

### Documentation

Create comprehensive documentation:

1. **README.md** - Installation, features, usage
2. **CHANGELOG.md** - Version history
3. **CONTRIBUTING.md** - How to contribute
4. **docs/examples.md** - Usage examples
5. **docs/api.md** - API reference

### Deployment

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run tests
npm test

# Package extension
vsce package

# Publish to marketplace
vsce publish
```

## 🎯 Success Criteria

1. ✅ Extension installs without errors
2. ✅ All commands work correctly
3. ✅ Code actions appear in context menu
4. ✅ Generated code is properly formatted
5. ✅ API calls succeed with proper error handling
6. ✅ Settings are configurable
7. ✅ Tests pass with >80% coverage
8. ✅ Documentation is complete
9. ✅ Extension is published to marketplace

## 📚 Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [CheriML API Documentation](./CHERIML_API_ENDPOINTS.md)
- [CheriML Usage Guide](./USING_CHERIML.md)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🚀 Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Open in VS Code
4. Press F5 to launch Extension Development Host
5. Test the extension
6. Make improvements
7. Package and publish

---

**Ready to build?** Copy this entire prompt and give it to your AI coding agent to start building the CheriML VS Code extension!

**Estimated Development Time**: 2-3 days for MVP, 1-2 weeks for full-featured extension

**Tech Stack**: TypeScript, VS Code Extension API, Node.js, Fetch API

**Difficulty**: Intermediate to Advanced
