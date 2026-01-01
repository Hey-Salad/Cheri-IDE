/**
 * Token estimation utilities for context compaction.
 * Uses character-based heuristics for fast estimation without external dependencies.
 * 
 * These are approximations - actual token counts vary by model and tokenizer.
 * We intentionally overestimate slightly to be conservative.
 */

import type { OpenAIResponseItem } from '../../types/chat.js';
import type { AnthropicConversationItem } from '../chatStore.js';
import type { ContextMetrics, OpenAITurn, AnthropicTurn } from './types.js';

// ============================================================================
// Token Estimation Constants
// ============================================================================

/**
 * Average characters per token.
 * English text averages ~4 chars/token, but code/JSON can be 3-3.5.
 * We use 3.5 to be slightly conservative.
 */
const CHARS_PER_TOKEN = 3.5;

/**
 * Overhead tokens for message structure (role, separators, etc.)
 */
const MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Overhead for tool call structure
 */
const TOOL_CALL_OVERHEAD_TOKENS = 10;

/**
 * Overhead for tool result structure
 */
const TOOL_RESULT_OVERHEAD_TOKENS = 8;

// ============================================================================
// Core Estimation Functions
// ============================================================================

/**
 * Estimate tokens from a string using character-based heuristic.
 */
export function estimateTokensFromString(text: string | null | undefined): number {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens from any value.
 *
 * IMPORTANT: Avoid `JSON.stringify(value)` on arbitrary objects because it can:
 * - allocate huge strings (e.g. base64 images embedded in tool outputs)
 * - throw on circular structures
 */
export function estimateTokensFromValue(value: unknown): number {
  const MAX_DEPTH = 4;
  const MAX_ARRAY_ITEMS = 64;
  const MAX_OBJECT_KEYS = 64;

  const seen = new Set<any>();

  const walk = (v: any, depth: number): number => {
    if (v === null || v === undefined) return 0;

    const t = typeof v;
    if (t === 'string') return estimateTokensFromString(v);
    if (t === 'number' || t === 'boolean' || t === 'bigint') return estimateTokensFromString(String(v));

    if (depth <= 0) {
      // We ran out of depth: count a small placeholder so we don't undercount to zero.
      return estimateTokensFromString('[…]');
    }

    // Treat common image payload shapes conservatively without touching base64.
    if (t === 'object' && v) {
      try {
        const type = typeof v.type === 'string' ? String(v.type).toLowerCase() : '';
        if (type === 'input_image' || type === 'image') {
          // Approx token costs used elsewhere in this module.
          return 765;
        }
        if (typeof v.image_url === 'string' && v.image_url.startsWith('data:') && v.image_url.includes('base64,')) {
          return 765;
        }
      } catch {}

      if (seen.has(v)) return estimateTokensFromString('[circular]');
      seen.add(v);

      if (Array.isArray(v)) {
        let total = 0;
        const lim = Math.min(v.length, MAX_ARRAY_ITEMS);
        for (let i = 0; i < lim; i++) {
          total += walk(v[i], depth - 1);
        }
        if (v.length > lim) {
          total += estimateTokensFromString(`[+${v.length - lim} more]`);
        }
        return total;
      }

      // Plain object
      let total = 0;
      const keys = Object.keys(v);
      const lim = Math.min(keys.length, MAX_OBJECT_KEYS);
      for (let i = 0; i < lim; i++) {
        const k = keys[i];
        total += estimateTokensFromString(k);
        try {
          total += walk((v as any)[k], depth - 1);
        } catch {
          total += estimateTokensFromString('[unreadable]');
        }
      }
      if (keys.length > lim) {
        total += estimateTokensFromString(`[+${keys.length - lim} keys]`);
      }
      return total;
    }

    return estimateTokensFromString(String(v));
  };

  return walk(value, MAX_DEPTH);
}

// ============================================================================
// OpenAI Token Estimation
// ============================================================================

/**
 * Estimate tokens for a single OpenAI history item.
 */
export function estimateOpenAIItemTokens(item: OpenAIResponseItem): number {
  if (!item || typeof item !== 'object') return 0;

  let tokens = MESSAGE_OVERHEAD_TOKENS;
  const type = String(item.type || '').toLowerCase();
  const role = String(item.role || '').toLowerCase();

  // User messages
  if (role === 'user') {
    if (typeof item.content === 'string') {
      tokens += estimateTokensFromString(item.content);
    } else if (Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === 'input_text') {
          tokens += estimateTokensFromString((part as any).text);
        } else if (part?.type === 'input_image') {
          // Images use significant tokens - estimate based on detail level
          const detail = (part as any).detail || 'auto';
          tokens += detail === 'low' ? 85 : 765; // OpenAI's approximate image token costs
        }
      }
    }
    return tokens;
  }

  // Assistant messages
  if (role === 'assistant' || type === 'message') {
    if (typeof item.content === 'string') {
      tokens += estimateTokensFromString(item.content);
    } else if (Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === 'output_text' || part?.type === 'text') {
          tokens += estimateTokensFromString((part as any).text);
        }
      }
    }
    if (typeof item.output === 'string') {
      tokens += estimateTokensFromString(item.output);
    }
    return tokens;
  }

  // Function calls
  if (type === 'function_call') {
    tokens += TOOL_CALL_OVERHEAD_TOKENS;
    tokens += estimateTokensFromString(item.name);
    tokens += estimateTokensFromValue(item.arguments);
    return tokens;
  }

  // Function call outputs
  if (type === 'function_call_output') {
    tokens += TOOL_RESULT_OVERHEAD_TOKENS;
    if (typeof item.output === 'string') {
      tokens += estimateTokensFromString(item.output);
    } else if (Array.isArray(item.output)) {
      // Image outputs
      for (const part of item.output) {
        if (part?.type === 'input_image') {
          tokens += 765; // Assume high detail for returned images
        } else {
          tokens += estimateTokensFromValue(part);
        }
      }
    } else {
      tokens += estimateTokensFromValue(item.output);
    }
    return tokens;
  }

  // Reasoning items
  if (type === 'reasoning') {
    if (Array.isArray(item.summary)) {
      for (const s of item.summary) {
        tokens += estimateTokensFromString((s as any)?.text);
      }
    }
    // Encrypted content is not counted as it's not part of visible context
    return tokens;
  }

  // Developer/system messages
  if (role === 'developer' || role === 'system') {
    tokens += estimateTokensFromValue(item.content);
    return tokens;
  }

  // Fallback: estimate from entire object
  return tokens + estimateTokensFromValue(item);
}

/**
 * Estimate total tokens for OpenAI history.
 */
export function estimateOpenAIHistoryTokens(history: OpenAIResponseItem[]): ContextMetrics {
  const metrics: ContextMetrics = {
    totalTokens: 0,
    userMessageTokens: 0,
    assistantTokens: 0,
    toolCallTokens: 0,
    toolResultTokens: 0,
    reasoningTokens: 0,
  };

  for (const item of history) {
    const tokens = estimateOpenAIItemTokens(item);
    metrics.totalTokens += tokens;

    const type = String((item as any).type || '').toLowerCase();
    const role = String((item as any).role || '').toLowerCase();

    if (role === 'user') {
      metrics.userMessageTokens += tokens;
    } else if (role === 'assistant' || type === 'message') {
      metrics.assistantTokens += tokens;
    } else if (type === 'function_call') {
      metrics.toolCallTokens += tokens;
    } else if (type === 'function_call_output') {
      metrics.toolResultTokens += tokens;
    } else if (type === 'reasoning') {
      metrics.reasoningTokens += tokens;
    }
  }

  return metrics;
}

/**
 * Estimate tokens for an OpenAI turn.
 */
export function estimateOpenAITurnTokens(turn: OpenAITurn): number {
  let tokens = estimateOpenAIItemTokens(turn.userMessage);
  for (const item of turn.assistantAndTools) {
    tokens += estimateOpenAIItemTokens(item);
  }
  return tokens;
}

// ============================================================================
// Anthropic Token Estimation
// ============================================================================

/**
 * Estimate tokens for a single Anthropic content block.
 */
function estimateAnthropicBlockTokens(block: any): number {
  if (!block || typeof block !== 'object') return 0;

  const type = String(block.type || '').toLowerCase();

  switch (type) {
    case 'text':
      return estimateTokensFromString(block.text);
    
    case 'thinking':
      return estimateTokensFromString(block.thinking);
    
    case 'tool_use':
      return TOOL_CALL_OVERHEAD_TOKENS + 
        estimateTokensFromString(block.name) +
        estimateTokensFromValue(block.input);
    
    case 'tool_result':
      return TOOL_RESULT_OVERHEAD_TOKENS +
        estimateTokensFromValue(block.content);
    
    case 'image':
      // Anthropic image tokens depend on size
      return 1000; // Conservative estimate
    
    default:
      return estimateTokensFromValue(block);
  }
}

/**
 * Estimate tokens for a single Anthropic conversation item.
 */
export function estimateAnthropicItemTokens(item: AnthropicConversationItem): number {
  if (!item || typeof item !== 'object') return 0;

  let tokens = MESSAGE_OVERHEAD_TOKENS;

  // Handle content array
  if ('content' in item && Array.isArray(item.content)) {
    for (const block of item.content) {
      tokens += estimateAnthropicBlockTokens(block);
    }
  } else if ('content' in item && typeof item.content === 'string') {
    tokens += estimateTokensFromString(item.content);
  }

  return tokens;
}

/**
 * Estimate total tokens for Anthropic history.
 */
export function estimateAnthropicHistoryTokens(history: AnthropicConversationItem[]): ContextMetrics {
  const metrics: ContextMetrics = {
    totalTokens: 0,
    userMessageTokens: 0,
    assistantTokens: 0,
    toolCallTokens: 0,
    toolResultTokens: 0,
    reasoningTokens: 0,
  };

  for (const item of history) {
    const tokens = estimateAnthropicItemTokens(item);
    metrics.totalTokens += tokens;

    const role = (item as any).role;

    if (role === 'user') {
      // Check if it's a tool result
      const content = (item as any).content;
      if (Array.isArray(content) && content.some((b: any) => b?.type === 'tool_result')) {
        metrics.toolResultTokens += tokens;
      } else {
        metrics.userMessageTokens += tokens;
      }
    } else if (role === 'assistant') {
      const content = (item as any).content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'thinking') {
            metrics.reasoningTokens += estimateAnthropicBlockTokens(block);
          } else if (block?.type === 'tool_use') {
            metrics.toolCallTokens += estimateAnthropicBlockTokens(block);
          } else {
            metrics.assistantTokens += estimateAnthropicBlockTokens(block);
          }
        }
      } else {
        metrics.assistantTokens += tokens;
      }
    }
  }

  return metrics;
}

/**
 * Estimate tokens for an Anthropic turn.
 */
export function estimateAnthropicTurnTokens(turn: AnthropicTurn): number {
  let tokens = estimateAnthropicItemTokens(turn.userMessage);
  for (const item of turn.assistantAndTools) {
    tokens += estimateAnthropicItemTokens(item);
  }
  return tokens;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if token count exceeds threshold.
 */
export function exceedsTokenThreshold(tokens: number, threshold: number): boolean {
  return tokens > threshold;
}

/**
 * Calculate how many tokens need to be removed to reach target.
 */
export function tokensToRemove(currentTokens: number, targetTokens: number): number {
  return Math.max(0, currentTokens - targetTokens);
}
