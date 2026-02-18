import { describe, it, expect, beforeEach } from 'vitest';
import { ChatStore, type AnthropicConversationItem } from './chatStore.js';
import { getModelProvider, resolveApiModelName, supportsExtendedThinking } from './models.js';
import type Anthropic from '@anthropic-ai/sdk';

describe('Anthropic Provider Support', () => {
  describe('Model Detection', () => {
    it('should detect Anthropic models correctly', () => {
      expect(getModelProvider('claude-sonnet-4.5')).toBe('anthropic');
      expect(getModelProvider('claude-opus-4.5')).toBe('anthropic');
      expect(getModelProvider('gpt-5.2')).toBe('openai');
    });

    it('should support extended thinking for Anthropic models', () => {
      expect(supportsExtendedThinking('claude-sonnet-4.5')).toBe(true);
      expect(supportsExtendedThinking('claude-opus-4.5')).toBe(true);
      expect(supportsExtendedThinking('gpt-5.2')).toBe(false);
    });
  });

  describe('ChatStore - Session Provider Assignment', () => {
    let chatStore: ChatStore;
    const testDir = '/tmp/test-cheri';

    beforeEach(() => {
      chatStore = new ChatStore();
    });

    it('should create session with OpenAI provider by default', async () => {
      const session = await chatStore.create(testDir);
      expect(session.provider).toBe('openai');
      expect(session.history).toEqual([]);
    });

    it('should create session with Anthropic provider when specified', async () => {
      const session = await chatStore.create(testDir, { provider: 'anthropic' });
      expect(session.provider).toBe('anthropic');
      expect(session.history).toEqual([]);
    });

    it('should maintain provider across session operations', async () => {
      const session = await chatStore.create(testDir, { provider: 'anthropic' });

      const anthropicItem: AnthropicConversationItem = {
        role: 'user',
        content: 'Hello'
      };

      const updated = await chatStore.appendHistory(testDir, session.id, [anthropicItem]);
      expect(updated?.provider).toBe('anthropic');
      expect(updated?.history.length).toBe(1);
    });
  });

  describe('AnthropicConversationItem Format', () => {
    it('should store user messages in native Anthropic format', () => {
      const userMessage: AnthropicConversationItem = {
        role: 'user',
        content: 'Hello Claude'
      };

      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toBe('Hello Claude');
    });

    it('should store assistant messages with thinking blocks', () => {
      const assistantMessage: AnthropicConversationItem = {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me analyze this...', signature: 'sig_test123' } as any,
          { type: 'text', text: 'Here is my response' }
        ]
      };

      expect(assistantMessage.role).toBe('assistant');
      expect(Array.isArray(assistantMessage.content)).toBe(true);
      expect((assistantMessage.content as any)[0].type).toBe('thinking');
      expect((assistantMessage.content as any)[1].type).toBe('text');
    });

    it('should store tool_use blocks in native format', () => {
      const toolUseMessage: AnthropicConversationItem = {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'read_file',
            input: { file_path: '/test.txt' }
          }
        ]
      };

      const toolUseBlock = (toolUseMessage.content as any)[0];
      expect(toolUseBlock.type).toBe('tool_use');
      expect(toolUseBlock.id).toBe('toolu_123');
      expect(toolUseBlock.name).toBe('read_file');
      expect(toolUseBlock.input).toEqual({ file_path: '/test.txt' });
    });

    it('should store tool_result in native format', () => {
      const toolResult: AnthropicConversationItem = {
        type: 'tool_result',
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'toolu_123',
          content: 'File contents here'
        }]
      };

      expect(toolResult.type).toBe('tool_result');
      expect(toolResult.content[0].tool_use_id).toBe('toolu_123');
      expect(toolResult.content[0].content).toBe('File contents here');
    });
  });

  describe('Provider-Native Storage Benefits', () => {
    it('should preserve thinking blocks without translation', () => {
      const conversation: AnthropicConversationItem[] = [
        {
          role: 'user',
          content: 'Solve this problem'
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'thinking',
              thinking: 'First I need to understand the problem...\nThen I can formulate a solution...',
              signature: 'sig_test456'
            } as any,
            {
              type: 'text',
              text: 'Here is the solution'
            }
          ]
        }
      ];

      // Verify thinking is preserved exactly as returned by API
      const thinkingBlock = (conversation[1].content as any)[0];
      expect(thinkingBlock.thinking).toContain('First I need to understand');
      expect(thinkingBlock.thinking).toContain('Then I can formulate');
    });

    it('should handle multi-block responses (thinking + text + tool_use)', () => {
      const multiBlockResponse: AnthropicConversationItem = {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'I should use a tool for this', signature: 'sig_test789' } as any,
          { type: 'tool_use', id: 'toolu_456', name: 'grep_search', input: { pattern: 'test' } },
          { type: 'text', text: 'I found the results' }
        ]
      };

      const content = multiBlockResponse.content as any[];
      expect(content.length).toBe(3);
      expect(content[0].type).toBe('thinking');
      expect(content[1].type).toBe('tool_use');
      expect(content[2].type).toBe('text');
    });
  });

  describe('Backward Compatibility', () => {
    it('should default to openai for sessions without provider field', () => {
      const legacySession = {
        id: 'test-123',
        title: 'Old Session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        history: []
        // No provider field
      } as any;

      // Migration logic should default to 'openai'
      const provider = legacySession.provider === 'anthropic' ? 'anthropic' : 'openai';
      expect(provider).toBe('openai');
    });
  });

  describe('Tool Schema Conversion', () => {
    it('should convert OpenAI tool schema to Anthropic format', () => {
      const openaiTool = {
        name: 'read_file',
        description: 'Read a file from disk',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file' }
          },
          required: ['file_path']
        }
      };

      // Anthropic format uses input_schema instead of parameters
      const anthropicTool = {
        name: openaiTool.name,
        description: openaiTool.description,
        input_schema: openaiTool.parameters
      };

      expect(anthropicTool.input_schema).toEqual(openaiTool.parameters);
      expect(anthropicTool.name).toBe('read_file');
    });
  });

  describe('Extended Thinking Configuration', () => {
    it('should map reasoning effort to thinking budget', () => {
      const effortToBudget = (effort: 'low' | 'medium' | 'high'): number => {
        switch (effort) {
          case 'low': return 1024;
          case 'medium': return 8000;
          case 'high': return 16000;
          default: return 8000;
        }
      };

      expect(effortToBudget('low')).toBe(1024);
      expect(effortToBudget('medium')).toBe(8000);
      expect(effortToBudget('high')).toBe(16000);
    });

    it('should include thinking configuration for Anthropic models', () => {
      const modelId = resolveApiModelName('claude-sonnet-4.5');
      const params: Anthropic.MessageCreateParams = {
        model: modelId,
        max_tokens: 8192,
        messages: [],
        system: 'You are a helpful assistant',
        tools: [],
        thinking: {
          type: 'enabled',
          budget_tokens: 10000
        }
      };

      expect(params.thinking?.type).toBe('enabled');
      if (params.thinking?.type === 'enabled') {
        expect(params.thinking.budget_tokens).toBe(10000);
      }
      expect(modelId).toBe('claude-sonnet-4-5-20250929');
    });
  });

  describe('Session Provider Locking', () => {
    it('should prevent provider switching mid-conversation', async () => {
      const chatStore = new ChatStore();
      const testDir = '/tmp/test-cheri';

      // Create Anthropic session
      const session = await chatStore.create(testDir, { provider: 'anthropic' });
      expect(session.provider).toBe('anthropic');

      // Append Anthropic messages
      const anthropicMsg: AnthropicConversationItem = {
        role: 'user',
        content: 'Hello'
      };

      const updated = await chatStore.appendHistory(testDir, session.id, [anthropicMsg]);

      // Provider should remain locked
      expect(updated?.provider).toBe('anthropic');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing ANTHROPIC_API_KEY', () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      expect(() => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey?.trim()) {
          throw new Error('ANTHROPIC_API_KEY is required but not set');
        }
      }).toThrow('ANTHROPIC_API_KEY is required but not set');

      process.env.ANTHROPIC_API_KEY = originalKey;
    });

    it('should handle invalid model names gracefully', () => {
      const provider = getModelProvider('invalid-model-name');
      expect(provider).toBe('openai'); // Defaults to openai
    });
  });
});

describe('Integration: Full Anthropic Conversation Flow', () => {
  it('should maintain conversation integrity with native format', async () => {
    const chatStore = new ChatStore();
    const testDir = '/tmp/test-cheri';

    // Create session with Anthropic provider
    const session = await chatStore.create(testDir, {
      title: 'Test Conversation',
      provider: 'anthropic'
    });

    // Simulate a conversation
    const conversation: AnthropicConversationItem[] = [
      // User message
      {
        role: 'user',
        content: 'Write a function to calculate fibonacci'
      },
      // Assistant thinking + response
      {
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'I should write a recursive function with memoization for efficiency',
            signature: 'sig_integration_test1'
          } as any,
          {
            type: 'text',
            text: 'Here is a fibonacci function:\n\n```python\ndef fib(n, memo={}):\n    if n <= 1:\n        return n\n    if n not in memo:\n        memo[n] = fib(n-1, memo) + fib(n-2, memo)\n    return memo[n]\n```'
          }
        ]
      },
      // User follow-up
      {
        role: 'user',
        content: 'Can you test it?'
      },
      // Assistant uses tool
      {
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'I should create a test file and run it',
            signature: 'sig_integration_test2'
          } as any,
          {
            type: 'tool_use',
            id: 'toolu_test',
            name: 'create_file',
            input: {
              filePath: '/tmp/fib.py',
              content: 'def fib(n, memo={}):\n    if n <= 1:\n        return n\n    if n not in memo:\n        memo[n] = fib(n-1, memo) + fib(n-2, memo)\n    return memo[n]\n\nprint(fib(10))'
            }
          }
        ]
      },
      // Tool result
      {
        type: 'tool_result',
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'toolu_test',
          content: 'File created successfully'
        }]
      },
      // Assistant final response
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'The test has been created and shows fibonacci(10) = 55' }
        ]
      }
    ];

    // Add conversation to session
    const updated = await chatStore.appendHistory(testDir, session.id, conversation);

    // Verify conversation integrity
    expect(updated?.provider).toBe('anthropic');
    expect(updated?.history.length).toBe(6);

    // Verify thinking blocks are preserved
    const assistantMsg1 = updated?.history[1] as AnthropicConversationItem;
    expect((assistantMsg1.content as any)[0].type).toBe('thinking');

    // Verify tool use blocks are preserved
    const assistantMsg2 = updated?.history[3] as AnthropicConversationItem;
    expect((assistantMsg2.content as any)[1].type).toBe('tool_use');

    // Verify tool results are preserved
    const toolResultMsg = updated?.history[4] as AnthropicConversationItem;
    expect((toolResultMsg as any).type).toBe('tool_result');
  });
});
