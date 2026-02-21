# CheriML IDE Integration Guide

This guide explains how to integrate CheriML into IDEs and code editors to provide AI-powered code generation directly in the development environment.

## 🎯 Overview

CheriML can be integrated into any IDE or code editor to provide:

- **Inline code generation** from comments or descriptions
- **Context-aware suggestions** based on current file
- **Quick actions** for generating functions, tests, and components
- **Refactoring assistance** with AI-powered transformations
- **Documentation generation** from existing code

## 🏗️ Architecture

### Integration Patterns

1. **Language Server Protocol (LSP)** - Best for deep IDE integration
2. **Editor Extensions** - Platform-specific plugins (VS Code, JetBrains, etc.)
3. **CLI Tool** - Command-line interface for any editor
4. **Web Service** - Browser-based integration

## 🔌 Integration Options

### Option 1: VS Code Extension (Recommended)

**Features:**
- Code actions and quick fixes
- Inline suggestions
- Command palette integration
- Sidebar panel for CheriML
- Keyboard shortcuts

**Architecture:**
```
VS Code Extension
    ↓
CheriML Client Library
    ↓
CheriML API (https://ai.heysalad.app)
    ↓
Gemini 3.1 Pro
```

### Option 2: Language Server

**Features:**
- Works with any LSP-compatible editor
- Hover information
- Code completion
- Diagnostics and validation

**Architecture:**
```
Editor (VS Code, Vim, Emacs, etc.)
    ↓
LSP Client
    ↓
CheriML Language Server
    ↓
CheriML API
```

### Option 3: CLI Tool

**Features:**
- Works with any editor
- Pipe-based integration
- Shell scripting support
- CI/CD integration

**Usage:**
```bash
# Generate function from description
cheriml generate function "fibonacci with memoization" --lang typescript

# Generate tests for current file
cheriml generate tests --file src/utils.ts --framework vitest

# Generate component
cheriml generate component "Button with variants" --framework react
```

## 🛠️ Implementation Guide

### VS Code Extension Structure

```
cheriml-vscode/
├── package.json
├── src/
│   ├── extension.ts          # Extension entry point
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
│   │   └── cherimlClient.ts  # API client
│   └── ui/
│       ├── sidebar.ts
│       └── quickPick.ts
└── README.md
```

### Key Components

#### 1. Code Action Provider

Provides quick actions when user selects code:

```typescript
import * as vscode from 'vscode';

export class CheriMLCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Generate function from comment
    if (this.isCommentSelected(document, range)) {
      const action = new vscode.CodeAction(
        'Generate function with CheriML',
        vscode.CodeActionKind.RefactorRewrite
      );
      action.command = {
        command: 'cheriml.generateFunction',
        title: 'Generate Function',
        arguments: [document, range]
      };
      actions.push(action);
    }

    // Generate tests for function
    if (this.isFunctionSelected(document, range)) {
      const action = new vscode.CodeAction(
        'Generate tests with CheriML',
        vscode.CodeActionKind.Source
      );
      action.command = {
        command: 'cheriml.generateTests',
        title: 'Generate Tests',
        arguments: [document, range]
      };
      actions.push(action);
    }

    return actions;
  }
}
```

#### 2. Command Implementation

```typescript
import * as vscode from 'vscode';
import { CheriMLClient } from './client/cherimlClient';

export async function generateFunction(
  document: vscode.TextDocument,
  range: vscode.Range
) {
  // Get selected text (comment or description)
  const description = document.getText(range);
  
  // Show progress
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Generating function with CheriML...',
    cancellable: true
  }, async (progress, token) => {
    
    // Call CheriML API
    const client = new CheriMLClient();
    const result = await client.generateFunction({
      title: 'Generate function',
      description: description,
      language: document.languageId,
      constraints: ['Include JSDoc', 'Handle errors'],
      acceptanceCriteria: ['Type-safe', 'Well-documented']
    });

    if (result.status === 'success') {
      // Insert generated code
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, range, result.output.code);
      await vscode.workspace.applyEdit(edit);
      
      vscode.window.showInformationMessage('Function generated successfully!');
    } else {
      vscode.window.showErrorMessage('Failed to generate function');
    }
  });
}
```

#### 3. CheriML Client

```typescript
export class CheriMLClient {
  private baseURL = 'https://ai.heysalad.app/api/cheriml';
  
  async generateFunction(request: FunctionRequest): Promise<CheriMLResponse> {
    const response = await fetch(`${this.baseURL}/generate-function`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });
    
    return await response.json();
  }
  
  async generateComponent(request: ComponentRequest): Promise<CheriMLResponse> {
    const response = await fetch(`${this.baseURL}/generate-component`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });
    
    return await response.json();
  }
  
  async generateTest(request: TestRequest): Promise<CheriMLResponse> {
    const response = await fetch(`${this.baseURL}/generate-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });
    
    return await response.json();
  }
  
  async generateEndpoint(request: EndpointRequest): Promise<CheriMLResponse> {
    const response = await fetch(`${this.baseURL}/generate-endpoint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });
    
    return await response.json();
  }
}
```

## 🎨 User Experience

### Workflow 1: Generate from Comment

```typescript
// User writes a comment:
// TODO: Create a function that validates email addresses using RFC 5322

// User triggers: Cmd+Shift+P → "CheriML: Generate Function"
// CheriML generates:

/**
 * Validates email addresses according to RFC 5322 standard
 * @param email - The email address to validate
 * @returns true if valid, false otherwise
 */
export function validateEmail(email: string): boolean {
  const rfc5322Regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return rfc5322Regex.test(email);
}
```

### Workflow 2: Generate Tests

```typescript
// User selects a function
export function add(a: number, b: number): number {
  return a + b;
}

// User triggers: Right-click → "Generate Tests with CheriML"
// CheriML generates in new file:

import { describe, it, expect } from 'vitest';
import { add } from './math';

describe('add', () => {
  it('should add two positive numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
  
  it('should handle negative numbers', () => {
    expect(add(-1, -2)).toBe(-3);
  });
  
  // ... more tests
});
```

### Workflow 3: Generate Component

```typescript
// User types in command palette:
// "CheriML: Generate Component"

// Dialog appears asking for:
// - Component name: "Button"
// - Framework: "React"
// - Props: "children, onClick, variant"

// CheriML generates:

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary'
}) => {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
};
```

## 🔧 Configuration

### Extension Settings

```json
{
  "cheriml.apiUrl": "https://ai.heysalad.app/api/cheriml",
  "cheriml.apiKey": "",
  "cheriml.autoGenerate": false,
  "cheriml.defaultLanguage": "typescript",
  "cheriml.defaultFramework": "react",
  "cheriml.testFramework": "vitest",
  "cheriml.includeComments": true,
  "cheriml.includeTests": false,
  "cheriml.coverageTarget": 80
}
```

## 📦 Package Structure

### package.json

```json
{
  "name": "cheriml-vscode",
  "displayName": "CheriML - AI Code Generation",
  "description": "Generate production-ready code with AI",
  "version": "1.0.0",
  "publisher": "heysalad",
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": ["Programming Languages", "Machine Learning"],
  "activationEvents": [
    "onCommand:cheriml.generateFunction",
    "onCommand:cheriml.generateComponent",
    "onCommand:cheriml.generateTest",
    "onCommand:cheriml.generateEndpoint"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "cheriml.generateFunction",
        "title": "CheriML: Generate Function"
      },
      {
        "command": "cheriml.generateComponent",
        "title": "CheriML: Generate Component"
      },
      {
        "command": "cheriml.generateTest",
        "title": "CheriML: Generate Tests"
      },
      {
        "command": "cheriml.generateEndpoint",
        "title": "CheriML: Generate API Endpoint"
      }
    ],
    "keybindings": [
      {
        "command": "cheriml.generateFunction",
        "key": "ctrl+shift+g f",
        "mac": "cmd+shift+g f"
      }
    ],
    "configuration": {
      "title": "CheriML",
      "properties": {
        "cheriml.apiUrl": {
          "type": "string",
          "default": "https://ai.heysalad.app/api/cheriml",
          "description": "CheriML API URL"
        }
      }
    }
  }
}
```

## 🚀 Deployment

### Publishing to VS Code Marketplace

```bash
# Install vsce
npm install -g @vscode/vsce

# Package extension
vsce package

# Publish
vsce publish
```

### Publishing to JetBrains Marketplace

```bash
# Build plugin
./gradlew buildPlugin

# Publish
./gradlew publishPlugin
```

## 📊 Analytics & Telemetry

Track usage to improve the extension:

```typescript
import * as vscode from 'vscode';

export class TelemetryService {
  track(event: string, properties?: any) {
    // Send to analytics service
    console.log('Event:', event, properties);
  }
}

// Usage
telemetry.track('function_generated', {
  language: 'typescript',
  linesOfCode: 25,
  duration: 3500
});
```

## 🔒 Security

1. **API Key Storage**: Use VS Code's SecretStorage API
2. **Code Validation**: Validate generated code before insertion
3. **User Consent**: Ask permission before making API calls
4. **Rate Limiting**: Implement client-side rate limiting

## 🧪 Testing

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('CheriML Extension Test Suite', () => {
  test('Generate function command exists', async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('cheriml.generateFunction'));
  });
  
  test('CheriML client makes API calls', async () => {
    const client = new CheriMLClient();
    const result = await client.generateFunction({
      title: 'Test function',
      description: 'Simple test',
      language: 'typescript'
    });
    assert.ok(result.status === 'success');
  });
});
```

## 📚 Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [CheriML API Reference](./CHERIML_API_ENDPOINTS.md)

---

**Ready to build?** See the [IDE Integration Prompt](#ide-integration-prompt) below for a complete specification to give your AI agent.
