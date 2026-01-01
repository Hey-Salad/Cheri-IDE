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
  /** Maximum context tokens before compaction is required */
  maxContextTokens: number;
  /** Target token count to compact down to (trigger threshold) */
  targetContextTokens: number;
  /** Number of recent turns to always preserve intact */
  preserveLastTurns: number;
  /** Model to use for summarization (should be fast/cheap) */
  summaryModel: string;
  /** Whether compaction is enabled */
  enabled: boolean;

  /** Compaction strategy (default: per_turn) */
  strategy: CompactionStrategy;
  /** Maximum number of compaction passes per invocation (default: 2) */
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
  /** The user message that started this turn */
  userMessage: OpenAIResponseItem;
  /** All assistant responses, tool calls, and tool results in this turn */
  assistantAndTools: OpenAIResponseItem[];
  /** Estimated token count for this turn */
  estimatedTokens: number;
}

export interface OpenAICompactionResult {
  /** The compacted history */
  history: OpenAIResponseItem[];
  /** Whether compaction was performed */
  compacted: boolean;
  /** Number of turns that were summarized */
  turnsSummarized: number;
  /** Original token estimate */
  originalTokens: number;
  /** New token estimate after compaction */
  newTokens: number;
  /** The summary text that was generated */
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
  /** The user message that started this turn */
  userMessage: AnthropicConversationItem;
  /** All assistant responses and tool results in this turn */
  assistantAndTools: AnthropicConversationItem[];
  /** Estimated token count for this turn */
  estimatedTokens: number;
}

export interface AnthropicCompactionResult {
  /** The compacted history */
  history: AnthropicConversationItem[];
  /** Whether compaction was performed */
  compacted: boolean;
  /** Number of turns that were summarized */
  turnsSummarized: number;
  /** Original token estimate */
  originalTokens: number;
  /** New token estimate after compaction */
  newTokens: number;
  /** The summary text that was generated */
  summaryText?: string;
}

// ============================================================================
// Summarizer Types
// ============================================================================

export interface SummarizerOptions {
  /** Maximum tokens for the summary output */
  maxSummaryTokens?: number;
  /** Whether to include tool names in summary */
  includeToolNames?: boolean;
  /** Whether to include file paths mentioned */
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

/** Marker prefix for compacted summary messages */
export const SUMMARY_MARKER_PREFIX = '[CONVERSATION SUMMARY - Previous context has been summarized to save space]\n\n';

/** Check if a message is a compaction summary */
export function isSummaryMessage(content: string | undefined | null): boolean {
  if (!content || typeof content !== 'string') return false;
  return content.startsWith(SUMMARY_MARKER_PREFIX) || content.includes('[CONVERSATION SUMMARY');
}
