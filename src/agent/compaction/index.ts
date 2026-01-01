/**
 * Context compaction module - re-exports all public APIs.
 * 
 * This module provides automatic context compaction to prevent running out of
 * context window space during long conversations. It works by:
 * 
 * 1. Monitoring token usage in conversation history
 * 2. When threshold is exceeded, segmenting history into "turns" (user message + responses)
 * 3. Preserving the last N turns intact
 * 4. Summarizing older turns using an LLM
 * 5. Replacing summarized turns with a compact summary message
 * 
 * Key design principles:
 * - User messages are ALWAYS preserved (either intact or summarized)
 * - System prompt is handled separately (not part of history)
 * - OpenAI and Anthropic implementations are fully independent
 * - Compaction is incremental (can build on previous summaries)
 */

// Types
export type {
  CompactionConfig,
  CompactionStrategy,
  ContextMetrics,
  OpenAITurn,
  OpenAICompactionResult,
  AnthropicTurn,
  AnthropicCompactionResult,
  SummarizerOptions,
} from './types.js';

export {
  DEFAULT_OPENAI_COMPACTION_CONFIG,
  DEFAULT_ANTHROPIC_COMPACTION_CONFIG,
  DEFAULT_SUMMARIZER_OPTIONS,
  SUMMARY_MARKER_PREFIX,
  isSummaryMessage,
} from './types.js';

// Token estimation
export {
  estimateTokensFromString,
  estimateTokensFromValue,
  estimateOpenAIItemTokens,
  estimateOpenAIHistoryTokens,
  estimateOpenAITurnTokens,
  estimateAnthropicItemTokens,
  estimateAnthropicHistoryTokens,
  estimateAnthropicTurnTokens,
  exceedsTokenThreshold,
  tokensToRemove,
} from './tokenEstimation.js';

// OpenAI compaction
export {
  segmentOpenAIIntoTurns,
  flattenOpenAITurns,
  formatTurnsForSummary as formatOpenAITurnsForSummary,
  compactOpenAIHistory,
  needsOpenAICompaction,
  getOpenAIMetrics,
} from './openaiCompaction.js';

export type { OpenAISummarizer } from './openaiCompaction.js';

// Anthropic compaction
export {
  segmentAnthropicIntoTurns,
  flattenAnthropicTurns,
  formatTurnsForSummary as formatAnthropicTurnsForSummary,
  compactAnthropicHistory,
  needsAnthropicCompaction,
  getAnthropicMetrics,
} from './anthropicCompaction.js';

export type { AnthropicSummarizer } from './anthropicCompaction.js';

// Summarizers
export {
  createOpenAISummarizer,
  createAnthropicSummarizer,
  createFallbackSummarizer,
} from './summarizer.js';

export type {
  OpenAISummarizerConfig,
  AnthropicSummarizerConfig,
} from './summarizer.js';
