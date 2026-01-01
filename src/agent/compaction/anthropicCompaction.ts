/**
 * Anthropic-specific context compaction logic.
 * Handles segmentation, turn identification, and history reconstruction for Anthropic format.
 */

import type { AnthropicConversationItem } from '../chatStore.js';
import type {
  CompactionConfig,
  AnthropicTurn,
  AnthropicCompactionResult,
  SummarizerOptions,
} from './types.js';
import {
  SUMMARY_MARKER_PREFIX,
  DEFAULT_ANTHROPIC_COMPACTION_CONFIG,
  DEFAULT_SUMMARIZER_OPTIONS,
  isSummaryMessage,
} from './types.js';
import {
  estimateAnthropicHistoryTokens,
  estimateAnthropicItemTokens,
  estimateAnthropicTurnTokens,
} from './tokenEstimation.js';

// ============================================================================
// Turn Segmentation
// ============================================================================

/**
 * Check if an item is a user message (not a tool result).
 */
function isUserMessage(item: AnthropicConversationItem): boolean {
  if ((item as any).role !== 'user') return false;
  
  // Check if it's a tool result (which also has role: user in Anthropic format)
  const content = (item as any).content;
  if (Array.isArray(content)) {
    // If ALL blocks are tool_result, it's not a user message
    const allToolResults = content.every((block: any) => block?.type === 'tool_result');
    if (allToolResults && content.length > 0) return false;
  }
  
  return true;
}

/**
 * Check if an item is a tool result.
 */
function isToolResult(item: AnthropicConversationItem): boolean {
  if ((item as any).role !== 'user') return false;
  
  const content = (item as any).content;
  if (Array.isArray(content)) {
    return content.some((block: any) => block?.type === 'tool_result');
  }
  
  return false;
}

/**
 * Check if an item is an assistant message.
 */
function isAssistantMessage(item: AnthropicConversationItem): boolean {
  return (item as any).role === 'assistant';
}

/**
 * Segment Anthropic history into turns.
 * A turn = one user message + all subsequent assistant/tool items until the next user message.
 */
export function segmentAnthropicIntoTurns(history: AnthropicConversationItem[]): AnthropicTurn[] {
  const turns: AnthropicTurn[] = [];
  let currentTurn: AnthropicTurn | null = null;

  // Debug counters
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let toolResultCount = 0;
  let orphanCount = 0;
  let unclassifiedCount = 0;

  for (const item of history) {
    if (isUserMessage(item)) {
      userMessageCount++;
      // Start a new turn
      if (currentTurn) {
        currentTurn.estimatedTokens = estimateAnthropicTurnTokens(currentTurn);
        turns.push(currentTurn);
      }
      currentTurn = {
        userMessage: item,
        assistantAndTools: [],
        estimatedTokens: 0,
      };
    } else if (currentTurn && isAssistantMessage(item)) {
      assistantMessageCount++;
      currentTurn.assistantAndTools.push(item);
    } else if (currentTurn && isToolResult(item)) {
      toolResultCount++;
      currentTurn.assistantAndTools.push(item);
    } else if (!currentTurn) {
      orphanCount++;
      // Orphan item before any user message - create synthetic turn
      currentTurn = {
        userMessage: { role: 'user', content: [{ type: 'text', text: '[system initialization]' }] } as AnthropicConversationItem,
        assistantAndTools: [item],
        estimatedTokens: 0,
      };
    } else {
      // Item that doesn't match any category but we have a current turn
      unclassifiedCount++;
      console.warn('[Anthropic Compaction] Unclassified item:', {
        role: (item as any).role,
        type: (item as any).type,
        contentTypes: Array.isArray((item as any).content) 
          ? (item as any).content.map((b: any) => b?.type).join(', ')
          : typeof (item as any).content
      });
    }
  }

  // Don't forget the last turn
  if (currentTurn) {
    currentTurn.estimatedTokens = estimateAnthropicTurnTokens(currentTurn);
    turns.push(currentTurn);
  }

  console.log(`[Anthropic Compaction] Turn segmentation: historyItems=${history.length} ` +
    `userMessages=${userMessageCount} assistantMessages=${assistantMessageCount} ` +
    `toolResults=${toolResultCount} orphans=${orphanCount} unclassified=${unclassifiedCount} ` +
    `turns=${turns.length}`);

  return turns;
}

/**
 * Flatten turns back into a history array.
 */
export function flattenAnthropicTurns(turns: AnthropicTurn[]): AnthropicConversationItem[] {
  const history: AnthropicConversationItem[] = [];
  for (const turn of turns) {
    history.push(turn.userMessage);
    history.push(...turn.assistantAndTools);
  }
  return history;
}

// ============================================================================
// Turn Selection for Compaction
// ============================================================================

interface CompactionTargets {
  /** Turns to summarize (oldest) */
  toSummarize: AnthropicTurn[];
  /** Turns to preserve (most recent) */
  toPreserve: AnthropicTurn[];
  /** Existing summary turn if present (will be merged) */
  existingSummary: AnthropicTurn | null;
}

/**
 * Identify which turns to summarize vs preserve.
 */
function identifyCompactionTargets(
  turns: AnthropicTurn[],
  config: CompactionConfig,
  _currentTokens: number
): CompactionTargets {
  const result: CompactionTargets = {
    toSummarize: [],
    toPreserve: [],
    existingSummary: null,
  };

  if (turns.length === 0) {
    return result;
  }

  let workingTurns = turns;

  // If the first turn is a legacy summary (user role with summary marker),
  // treat it as an existing summary and exclude it from further compaction.
  const firstTurn = workingTurns[0];
  const firstContent = extractUserMessageText(firstTurn.userMessage);
  if (isSummaryMessage(firstContent)) {
    result.existingSummary = firstTurn;
    workingTurns = workingTurns.slice(1);
  }

  if (workingTurns.length === 0) {
    return result;
  }

  // Always preserve the last N turns (or fewer if there aren't enough).
  const preserveCount = Math.max(
    0,
    Math.min(config.preserveLastTurns, workingTurns.length)
  );
  const splitIndex = Math.max(0, workingTurns.length - preserveCount);

  result.toSummarize = workingTurns.slice(0, splitIndex);
  result.toPreserve = workingTurns.slice(splitIndex);

  return result;
}

// ============================================================================
// Text Extraction for Summarization
// ============================================================================

/**
 * Extract text content from a user message.
 */
function extractUserMessageText(item: AnthropicConversationItem): string {
  const content = (item as any).content;
  
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => block.text || '')
      .join('\n');
  }
  
  return '';
}

const ROLLING_SUMMARY_TAG = '[Rolling Summary]';

function pickImportantFields(obj: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!obj || typeof obj !== 'object') return out;

  const keys = [
    'filePath', 'path', 'paths', 'oldPath', 'newPath',
    'pattern', 'files', 'query', 'url',
    'terminal_id', 'terminalId', 'durationMs', 'lines', 'bytes',
    'model', 'sessionId',
  ];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      out[k] = (obj as any)[k];
    }
  }
  if (typeof (obj as any).content === 'string') out.contentChars = (obj as any).content.length;
  if (typeof (obj as any).oldText === 'string') out.oldTextChars = (obj as any).oldText.length;
  if (typeof (obj as any).newText === 'string') out.newTextChars = (obj as any).newText.length;
  return out;
}

/**
 * Safely stringify values for summarization.
 */
function safeCompactStringify(value: any, maxLen = 1200): string {
  const seen = new Set<any>();
  try {
    const json = JSON.stringify(value, (_key, val) => {
      if (typeof val === 'string') {
        if (val.startsWith('data:') && val.includes('base64,')) {
          return `[data-url omitted (${val.length} chars)]`;
        }
        if (val.length > 4000) {
          return `${val.slice(0, 4000)}…(${val.length - 4000} chars omitted)`;
        }
      }
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[circular]';
        seen.add(val);
      }
      return val;
    });
    if (!json) return '';
    return json.length > maxLen ? `${json.slice(0, maxLen)}…` : json;
  } catch {
    return '[unserializable]';
  }
}

/**
 * Extract text from an assistant message or tool result.
 */
function extractAssistantText(item: AnthropicConversationItem): string {
  const content = (item as any).content;
  const parts: string[] = [];

  if (!Array.isArray(content)) {
    return typeof content === 'string' ? content : '';
  }

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;

    switch (block.type) {
      case 'text':
        parts.push(block.text || '');
        break;

      case 'thinking':
        // Include thinking summary but truncated
        if (block.thinking) {
          parts.push(`[Thinking] ${(block.thinking as string).slice(0, 300)}`);
        }
        break;

      case 'tool_use': {
        const inputObj = block.input && typeof block.input === 'object' && !Array.isArray(block.input)
          ? (block.input as any)
          : null;
        const picked = inputObj ? pickImportantFields(inputObj) : null;
        const rendered = picked && Object.keys(picked).length
          ? safeCompactStringify(picked, 800)
          : (typeof block.input === 'string' ? block.input : safeCompactStringify(block.input || {}, 800));
        parts.push(`[Tool Call: ${block.name}] ${String(rendered).slice(0, 500)}`);
        break;
      }

      case 'tool_result': {
        const resultContent = typeof block.content === 'string'
          ? block.content
          : safeCompactStringify(block.content || '', 1200);
        const trimmed = String(resultContent || '').trim();
        parts.push(`[Tool Result] ${trimmed.slice(0, 600)}`);
        break;
      }
    }
  }

  return parts.join('\n');
}

/**
 * Format turns for summarization prompt.
 */
export function formatTurnsForSummary(
  turns: AnthropicTurn[],
  options: SummarizerOptions = DEFAULT_SUMMARIZER_OPTIONS
): string {
  const parts: string[] = [];
  const toolNames = new Set<string>();
  const filePaths = new Set<string>();

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const turnParts: string[] = [];

    // User message
    const userText = extractUserMessageText(turn.userMessage);
    if (userText && !isSummaryMessage(userText)) {
      turnParts.push(`USER: ${userText.slice(0, 500)}`);
    }

    // Assistant and tools
    for (const item of turn.assistantAndTools) {
      const text = extractAssistantText(item);
      if (text) {
        turnParts.push(text.slice(0, 800));
      }

      // Collect tool names and file paths from content blocks
      const content = (item as any).content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (options.includeToolNames && block?.type === 'tool_use' && block.name) {
            toolNames.add(block.name);
          }
          
          if (options.includeFilePaths && block?.type === 'tool_use' && block.input) {
            const input = block.input as any;
            if (input?.filePath) filePaths.add(input.filePath);
            if (input?.path) filePaths.add(input.path);
          }
        }
      }
    }

    if (turnParts.length > 0) {
      parts.push(`--- Turn ${i + 1} ---\n${turnParts.join('\n')}`);
    }
  }

  let result = parts.join('\n\n');

  // Add metadata
  if (options.includeToolNames && toolNames.size > 0) {
    result += `\n\n[Tools used: ${Array.from(toolNames).join(', ')}]`;
  }
  if (options.includeFilePaths && filePaths.size > 0) {
    result += `\n\n[Files involved: ${Array.from(filePaths).slice(0, 20).join(', ')}]`;
  }

  return result;
}

// ============================================================================
// Summary Message Construction
// ============================================================================

/**
 * Create a summary assistant message from summarized text.
 *
 * This is used as a per-turn summary that replaces the original assistant/tool
 * interactions while keeping the user message for that turn intact.
 */
function createSummaryMessage(summaryText: string, existingSummary?: string): AnthropicConversationItem {
  let content = SUMMARY_MARKER_PREFIX;
  
  // If there was an existing summary, note that we're building on it
  if (existingSummary) {
    content += '[Building on previous summary]\n\n';
  }
  
  content += summaryText;

  return {
    role: 'assistant',
    content: [{ type: 'text', text: content }],
  } as AnthropicConversationItem;
}

// ============================================================================
// Main Compaction Function
// ============================================================================

export type AnthropicSummarizer = (turns: AnthropicTurn[], existingSummary?: string) => Promise<string>;

/**
 * Compact Anthropic history by summarizing older turns.
 *
 * Behavior:
 * - System prompt is handled elsewhere (not part of history array here).
 * - User messages are always preserved verbatim.
 * - For older turns, assistant + tool items are replaced with a single
 *   assistant summary message for that turn.
 * - The last `preserveLastTurns` turns are kept fully intact.
 */
function stripLeadingRollingSummary(history: AnthropicConversationItem[]): {
  stripped: AnthropicConversationItem[];
  existingText?: string;
  existingItem?: AnthropicConversationItem;
} {
  const first = history?.[0] as any;
  if (first && first.role === 'assistant' && Array.isArray(first.content)) {
    const text = (first.content as any[])
      .filter(b => b?.type === 'text')
      .map(b => String(b.text || ''))
      .join('');
    if (text && text.startsWith(SUMMARY_MARKER_PREFIX) && text.includes(ROLLING_SUMMARY_TAG)) {
      const cleaned = text
        .replace(SUMMARY_MARKER_PREFIX, '')
        .replace(ROLLING_SUMMARY_TAG, '')
        .trim();
      return { stripped: history.slice(1), existingText: cleaned, existingItem: first };
    }
  }
  return { stripped: history };
}

function createRollingSummaryMessage(summaryText: string, existingSummary?: string): AnthropicConversationItem {
  let content = SUMMARY_MARKER_PREFIX + ROLLING_SUMMARY_TAG + '\n\n';
  if (existingSummary) {
    content += '[Building on previous rolling summary]\n\n';
  }
  content += summaryText;
  return {
    role: 'assistant',
    content: [{ type: 'text', text: content }],
  } as AnthropicConversationItem;
}

async function compactAnthropicHistoryOnce(
  history: AnthropicConversationItem[],
  config: CompactionConfig,
  summarizer: AnthropicSummarizer
): Promise<AnthropicCompactionResult> {
  if (config.strategy === 'rolling_summary') {
    const metrics = estimateAnthropicHistoryTokens(history);
    const originalTokens = metrics.totalTokens;

    if (!config.enabled || originalTokens <= config.targetContextTokens) {
      return { history, compacted: false, turnsSummarized: 0, originalTokens, newTokens: originalTokens };
    }

    const { stripped, existingText } = stripLeadingRollingSummary(history);
    const turns = segmentAnthropicIntoTurns(stripped);

    const MIN_TURNS_FOR_COMPACTION = 2;
    const MIN_TURNS_TO_PRESERVE = 1;
    if (turns.length < MIN_TURNS_FOR_COMPACTION) {
      return { history, compacted: false, turnsSummarized: 0, originalTokens, newTokens: originalTokens };
    }

    const effectivePreserveCount = Math.max(
      MIN_TURNS_TO_PRESERVE,
      Math.min(config.preserveLastTurns, turns.length - 1)
    );

    const splitIndex = Math.max(0, turns.length - effectivePreserveCount);
    const toSummarize = turns.slice(0, splitIndex);
    const toPreserve = turns.slice(splitIndex);

    if (toSummarize.length === 0) {
      return { history, compacted: false, turnsSummarized: 0, originalTokens, newTokens: originalTokens };
    }

    const hasAnyAssistantOrTools = toSummarize.some(t => t.assistantAndTools && t.assistantAndTools.length > 0);
    if (!hasAnyAssistantOrTools) {
      return { history, compacted: false, turnsSummarized: 0, originalTokens, newTokens: originalTokens };
    }

    let summaryText: string;
    try {
      summaryText = await summarizer(toSummarize, existingText);
    } catch (error) {
      console.error('[Anthropic Compaction] Rolling summary failed, keeping original history:', error);
      return { history, compacted: false, turnsSummarized: 0, originalTokens, newTokens: originalTokens };
    }

    const rollingSummary = createRollingSummaryMessage(summaryText, existingText);

    const newHistory: AnthropicConversationItem[] = [];
    newHistory.push(rollingSummary);

    // Keep only the user messages from summarized turns.
    for (const t of toSummarize) {
      newHistory.push(t.userMessage);
    }

    // Keep the most recent turns intact.
    for (const t of toPreserve) {
      newHistory.push(t.userMessage);
      newHistory.push(...t.assistantAndTools);
    }

    const newTokens = estimateAnthropicHistoryTokens(newHistory).totalTokens;
    const compacted = newTokens < originalTokens;

    return {
      history: compacted ? newHistory : history,
      compacted,
      turnsSummarized: compacted ? toSummarize.length : 0,
      originalTokens,
      newTokens: compacted ? newTokens : originalTokens,
      summaryText: compacted ? summaryText : undefined,
    };
  }

  return await compactAnthropicHistoryPerTurnOnce(history, config, summarizer);
}

async function compactAnthropicHistoryPerTurnOnce(
  history: AnthropicConversationItem[],
  config: CompactionConfig,
  summarizer: AnthropicSummarizer
): Promise<AnthropicCompactionResult> {
  // Check if compaction is needed
  const metrics = estimateAnthropicHistoryTokens(history);
  const originalTokens = metrics.totalTokens;

  if (!config.enabled || originalTokens <= config.targetContextTokens) {
    return {
      history,
      compacted: false,
      turnsSummarized: 0,
      originalTokens,
      newTokens: originalTokens,
    };
  }

  console.log(`[Anthropic Compaction] Starting compaction. Current tokens: ${originalTokens}, target: ${config.targetContextTokens}`);

  // Segment into turns
  const turns = segmentAnthropicIntoTurns(history);

  // Minimum turns required to attempt compaction (need at least 1 to summarize + 1 to keep)
  const MIN_TURNS_FOR_COMPACTION = 2;
  // Minimum turns to always keep (even if preserveLastTurns is higher)
  const MIN_TURNS_TO_PRESERVE = 1;

  if (turns.length < MIN_TURNS_FOR_COMPACTION) {
    console.log(`[Anthropic Compaction] Not enough turns to compact (${turns.length} < ${MIN_TURNS_FOR_COMPACTION})`);
    return {
      history,
      compacted: false,
      turnsSummarized: 0,
      originalTokens,
      newTokens: originalTokens,
    };
  }

  // Dynamically adjust preserveLastTurns if we have fewer turns than configured.
  // We need at least 1 turn to summarize, so preserve at most (turns - 1).
  const effectivePreserveCount = Math.max(
    MIN_TURNS_TO_PRESERVE,
    Math.min(config.preserveLastTurns, turns.length - 1)
  );

  console.log(`[Anthropic Compaction] Adjusting preserve count: configured=${config.preserveLastTurns}, ` +
    `effective=${effectivePreserveCount}, totalTurns=${turns.length}`);

  // Log turn sizes to help debug
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    console.log(`[Anthropic Compaction] Turn ${i + 1}: ${turn.estimatedTokens} tokens, ` +
      `${turn.assistantAndTools.length} assistant/tool items`);
  }

  const effectiveConfig = { ...config, preserveLastTurns: effectivePreserveCount };
  const targets = identifyCompactionTargets(turns, effectiveConfig, originalTokens);

  if (targets.toSummarize.length === 0) {
    console.log('[Anthropic Compaction] No turns to summarize');
    return {
      history,
      compacted: false,
      turnsSummarized: 0,
      originalTokens,
      newTokens: originalTokens,
    };
  }

  console.log(`[Anthropic Compaction] Summarizing ${targets.toSummarize.length} turns, preserving ${targets.toPreserve.length} turns`);

  const newTurns: AnthropicTurn[] = [];

  // Preserve any legacy top-level summary turn (user role with marker) at the front.
  if (targets.existingSummary) {
    newTurns.push(targets.existingSummary);
  }

  let turnsSummarized = 0;

  // Summarize each older turn individually while preserving its user message.
  for (const turn of targets.toSummarize) {
    if (!turn.assistantAndTools.length) {
      newTurns.push(turn);
      continue;
    }

    // Separate any existing per-turn assistant summary from the rest of the content.
    let existingSummaryText: string | undefined;
    const assistantWithoutSummary: AnthropicConversationItem[] = [];

    for (const item of turn.assistantAndTools) {
      const assistantText = extractAssistantText(item);
      if (!existingSummaryText && assistantText && isSummaryMessage(assistantText)) {
        // Strip the marker prefix before passing into the summarizer.
        existingSummaryText = assistantText.replace(SUMMARY_MARKER_PREFIX, '').trim();
        continue;
      }
      assistantWithoutSummary.push(item);
    }

    if (!assistantWithoutSummary.length) {
      // Nothing new to summarize for this turn; keep it as-is.
      newTurns.push(turn);
      continue;
    }

    const turnForSummary: AnthropicTurn = {
      userMessage: turn.userMessage,
      assistantAndTools: assistantWithoutSummary,
      estimatedTokens: turn.estimatedTokens,
    };

    let summaryText: string;
    try {
      summaryText = await summarizer([turnForSummary], existingSummaryText);
    } catch (error) {
      console.error('[Anthropic Compaction] Summarization failed for turn, keeping original turn:', error);
      newTurns.push(turn);
      continue;
    }

    const summaryMessage = createSummaryMessage(summaryText, existingSummaryText);

    const summarizedTurn: AnthropicTurn = {
      userMessage: turn.userMessage,
      assistantAndTools: [summaryMessage],
      estimatedTokens: 0,
    };
    summarizedTurn.estimatedTokens = estimateAnthropicTurnTokens(summarizedTurn);

    newTurns.push(summarizedTurn);
    turnsSummarized++;
  }

  // Append preserved recent turns unchanged.
  for (const turn of targets.toPreserve) {
    newTurns.push(turn);
  }

  // If we didn't actually summarize anything, avoid rewriting history/persisting no-ops.
  if (turnsSummarized === 0) {
    return {
      history,
      compacted: false,
      turnsSummarized: 0,
      originalTokens,
      newTokens: originalTokens,
      summaryText: undefined,
    };
  }

  const newHistory = flattenAnthropicTurns(newTurns);
  const newMetrics = estimateAnthropicHistoryTokens(newHistory);
  const newTokens = newMetrics.totalTokens;

  console.log(`[Anthropic Compaction] Compaction complete. New tokens: ${newTokens} (saved ${originalTokens - newTokens})`);

  return {
    history: newHistory,
    compacted: turnsSummarized > 0,
    turnsSummarized,
    originalTokens,
    newTokens,
    // Per-turn summaries are created; there is no single global summary string.
    summaryText: undefined,
  };
}

/**
 * Compact Anthropic history with bounded iterative passes until we reach the
 * target token threshold or can no longer make progress.
 */
export async function compactAnthropicHistory(
  history: AnthropicConversationItem[],
  config: CompactionConfig = DEFAULT_ANTHROPIC_COMPACTION_CONFIG,
  summarizer: AnthropicSummarizer
): Promise<AnthropicCompactionResult> {
  const initialMetrics = estimateAnthropicHistoryTokens(history);
  const originalTokens = initialMetrics.totalTokens;

  if (!config.enabled || originalTokens <= config.targetContextTokens) {
    return {
      history,
      compacted: false,
      turnsSummarized: 0,
      originalTokens,
      newTokens: originalTokens,
    };
  }

  const maxIters = Math.max(1, Math.floor(config.maxIterations || 1));

  const runIterative = async (startHistory: AnthropicConversationItem[], cfg: CompactionConfig) => {
    let currentHistory = startHistory;
    let currentTokens = estimateAnthropicHistoryTokens(currentHistory).totalTokens;
    let totalTurnsSummarized = 0;
    let lastSummaryText: string | undefined;

    for (let i = 0; i < maxIters && currentTokens > cfg.targetContextTokens; i++) {
      const pass = await compactAnthropicHistoryOnce(currentHistory, cfg, summarizer);
      if (!pass.compacted) break;
      if (pass.newTokens >= currentTokens) break;
      currentHistory = pass.history;
      currentTokens = pass.newTokens;
      totalTurnsSummarized += pass.turnsSummarized;
      if (pass.summaryText) lastSummaryText = pass.summaryText;
    }

    return { history: currentHistory, tokens: currentTokens, turnsSummarized: totalTurnsSummarized, summaryText: lastSummaryText };
  };

  if (config.strategy === 'adaptive') {
    const perTurn = await runIterative(history, { ...config, strategy: 'per_turn' });

    if (perTurn.tokens <= config.targetContextTokens) {
      return {
        history: perTurn.history,
        compacted: perTurn.history !== history,
        turnsSummarized: perTurn.turnsSummarized,
        originalTokens,
        newTokens: perTurn.tokens,
        summaryText: perTurn.summaryText,
      };
    }

    const rollingCfg: CompactionConfig = { ...config, strategy: 'rolling_summary', maxIterations: 1 };
    const rolling = await runIterative(perTurn.history, rollingCfg);

    const bestHistory = rolling.tokens < perTurn.tokens ? rolling : perTurn;

    return {
      history: bestHistory.history,
      compacted: bestHistory.history !== history,
      turnsSummarized: perTurn.turnsSummarized + (bestHistory === rolling ? rolling.turnsSummarized : 0),
      originalTokens,
      newTokens: bestHistory.tokens,
      summaryText: bestHistory.summaryText ?? perTurn.summaryText,
    };
  }

  const out = await runIterative(history, config);

  return {
    history: out.history,
    compacted: out.history !== history,
    turnsSummarized: out.turnsSummarized,
    originalTokens,
    newTokens: out.tokens,
    summaryText: out.summaryText,
  };
}

/**
 * Check if Anthropic history needs compaction.
 */
export function needsAnthropicCompaction(
  history: AnthropicConversationItem[],
  config: CompactionConfig = DEFAULT_ANTHROPIC_COMPACTION_CONFIG
): boolean {
  if (!config.enabled) return false;
  const metrics = estimateAnthropicHistoryTokens(history);
  return metrics.totalTokens > config.targetContextTokens;
}

/**
 * Get token metrics for Anthropic history.
 */
export function getAnthropicMetrics(history: AnthropicConversationItem[]) {
  return estimateAnthropicHistoryTokens(history);
}
