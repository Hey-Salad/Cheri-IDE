/**
 * Types for context compaction system.
 * Keeps OpenAI and Anthropic paths independent with provider-specific types.
 */

import type { OpenAIResponseItem } from '../../types/chat.js';
import type { AnthropicConversationItem } from '../chatStore.js';

// ============================================================================
// Shared Configuration Types
// ============================================================================

export type CompactionStrategy = 'per_turn' | 'rolling_summary' | 'adaptive';

export interface CompactionConfig {
  maxContextTokens: number;
  targetContextTokens: number;
  preserveLastTurns: number;
  summaryModel: string;
  enabled: boolean;

  strategy: CompactionStrategy;
  maxIterations: number;
}

export const DEFAULT_OPENAI_COMPACTION_CONFIG: CompactionConfig = {
  maxContextTokens: 272_000,
  targetContextTokens: 180_000,
  preserveLastTurns: 20,
  summaryModel: 'gpt-5-mini',
  enabled: true,
  strategy: 'adaptive',
  maxIterations: 2,
};

export const DEFAULT_ANTHROPIC_COMPACTION_CONFIG: CompactionConfig = {
  maxContextTokens: 200_000,
  targetContextTokens: 100_000,
  preserveLastTurns: 20,
  summaryModel: 'claude-sonnet-4.5',
  enabled: true,
  strategy: 'adaptive',
  maxIterations: 2,
};

// ============================================================================
// Context Metrics
// ============================================================================

export interface ContextMetrics {
  totalTokens: number;
  userMessageTokens: number;
  assistantTokens: number;
  toolCallTokens: number;
  toolResultTokens: number;
  reasoningTokens: number;
}

// ============================================================================
// OpenAI-Specific Types
// ============================================================================

/**
 * A turn in OpenAI format: one user message followed by all assistant/tool interactions
 * until the next user message.
 */
export interface OpenAITurn {
  userMessage: OpenAIResponseItem;
  assistantAndTools: OpenAIResponseItem[];
  estimatedTokens: number;
}

export interface OpenAICompactionResult {
  history: OpenAIResponseItem[];
  compacted: boolean;
  turnsSummarized: number;
  originalTokens: number;
  newTokens: number;
  summaryText?: string;
}

// ============================================================================
// Anthropic-Specific Types
// ============================================================================

/**
 * A turn in Anthropic format: one user message followed by all assistant/tool interactions
 * until the next user message.
 */
export interface AnthropicTurn {
  userMessage: AnthropicConversationItem;
  assistantAndTools: AnthropicConversationItem[];
  estimatedTokens: number;
}

export interface AnthropicCompactionResult {
  history: AnthropicConversationItem[];
  compacted: boolean;
  turnsSummarized: number;
  originalTokens: number;
  newTokens: number;
  summaryText?: string;
}

// ============================================================================
// Summarizer Types
// ============================================================================

export interface SummarizerOptions {
  maxSummaryTokens?: number;
  includeToolNames?: boolean;
  includeFilePaths?: boolean;
}

export const DEFAULT_SUMMARIZER_OPTIONS: SummarizerOptions = {
  maxSummaryTokens: 2000,
  includeToolNames: true,
  includeFilePaths: true,
};

// ============================================================================
// Summary Message Markers
// ============================================================================

export const SUMMARY_MARKER_PREFIX = '[CONVERSATION SUMMARY - Previous context has been summarized to save space]\n\n';

export function isSummaryMessage(content: string | undefined | null): boolean {
  if (!content || typeof content !== 'string') return false;
  return content.startsWith(SUMMARY_MARKER_PREFIX) || content.includes('[CONVERSATION SUMMARY');
}
