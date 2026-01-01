/**
 * OpenAI-specific context compaction logic.
 * Handles segmentation, turn identification, and history reconstruction for OpenAI format.
 */

import type { OpenAIResponseItem } from '../../types/chat.js';
import type {
  CompactionConfig,
  OpenAITurn,
  OpenAICompactionResult,
  SummarizerOptions,
} from './types.js';
import {
  SUMMARY_MARKER_PREFIX,
  DEFAULT_OPENAI_COMPACTION_CONFIG,
  DEFAULT_SUMMARIZER_OPTIONS,
  isSummaryMessage,
} from './types.js';
import {
  estimateOpenAIHistoryTokens,
  estimateOpenAIItemTokens,
  estimateOpenAITurnTokens,
  estimateTokensFromString,
} from './tokenEstimation.js';

// ============================================================================
// Turn Segmentation
// ============================================================================

/**
 * Check if an item is a user message (not a tool result).
 */
function isUserMessage(item: OpenAIResponseItem): boolean {
  return item.role === 'user';
}

/**
 * Check if an item is part of assistant/tool interaction.
 */
function isAssistantOrTool(item: OpenAIResponseItem): boolean {
  const role = item.role?.toLowerCase();
  const type = item.type?.toLowerCase();
  
  return (
    role === 'assistant' ||
    type === 'message' ||
    type === 'function_call' ||
    type === 'function_call_output' ||
    type === 'reasoning'
  );
}

/**
 * Segment OpenAI history into turns.
 * A turn = one user message + all subsequent assistant/tool items until the next user message.
 */
export function segmentOpenAIIntoTurns(history: OpenAIResponseItem[]): OpenAITurn[] {
  const turns: OpenAITurn[] = [];
  let currentTurn: OpenAITurn | null = null;

  for (const item of history) {
    if (isUserMessage(item)) {
      // Start a new turn
      if (currentTurn) {
        currentTurn.estimatedTokens = estimateOpenAITurnTokens(currentTurn);
        turns.push(currentTurn);
      }
      currentTurn = {
        userMessage: item,
        assistantAndTools: [],
        estimatedTokens: 0,
      };
    } else if (currentTurn && isAssistantOrTool(item)) {
      // Add to current turn
      currentTurn.assistantAndTools.push(item);
    } else if (!currentTurn) {
      // Orphan assistant/tool item before any user message
      // Create a synthetic turn with empty user message
      currentTurn = {
        userMessage: { role: 'user', content: '[system initialization]' } as OpenAIResponseItem,
        assistantAndTools: [item],
        estimatedTokens: 0,
      };
    }
  }

  if (currentTurn) {
    currentTurn.estimatedTokens = estimateOpenAITurnTokens(currentTurn);
    turns.push(currentTurn);
  }

  return turns;
}

/**
 * Flatten turns back into a history array.
 */
export function flattenOpenAITurns(turns: OpenAITurn[]): OpenAIResponseItem[] {
  const history: OpenAIResponseItem[] = [];
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
  toSummarize: OpenAITurn[];
  /** Turns to preserve (most recent) */
  toPreserve: OpenAITurn[];
  /** Existing summary turn if present (will be merged) */
  existingSummary: OpenAITurn | null;
}

/**
 * Identify which turns to summarize vs preserve.
 */
function identifyCompactionTargets(
  turns: OpenAITurn[],
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
function extractUserMessageText(item: OpenAIResponseItem): string {
  if (typeof item.content === 'string') {
    return item.content;
  }
  if (Array.isArray(item.content)) {
    return item.content
      .filter((p: any) => p?.type === 'input_text')
      .map((p: any) => p.text || '')
      .join('\n');
  }
  return '';
}

/**
 * Safely stringify values for logging/summarization.
 * - Avoids huge allocations for data:...base64,... strings
 * - Handles circular structures
 */
const ROLLING_SUMMARY_TAG = '[Rolling Summary]';

function safeJsonParseObject(input: string, maxLen = 8000): any | null {
  const raw = String(input ?? '');
  if (!raw || raw.length > maxLen) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return v;
  } catch {
    return null;
  }
}

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

  // Provide some useful derived hints for diffs/creates without copying blobs
  if (typeof (obj as any).content === 'string') out.contentChars = (obj as any).content.length;
  if (typeof (obj as any).oldText === 'string') out.oldTextChars = (obj as any).oldText.length;
  if (typeof (obj as any).newText === 'string') out.newTextChars = (obj as any).newText.length;

  return out;
}

/**
 * Safely stringify values for logging/summarization.
 * - Avoids huge allocations for data:...base64,... strings
 * - Handles circular structures
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

function describeToolOutput(output: any): string {
  if (typeof output === 'string') {
    const trimmed = output.trim();
    // Keep errors prominent, but still clamp
    if (trimmed.toLowerCase().startsWith('error')) {
      return trimmed.slice(0, 800);
    }
    return trimmed.slice(0, 600);
  }

  if (Array.isArray(output)) {
    const parts = output.slice(0, 12);
    const described = parts.map((p: any) => {
      if (p?.type === 'input_image') {
        const fn = typeof p.filename === 'string' && p.filename ? `:${p.filename}` : '';
        return `[image${fn}]`;
      }
      return safeCompactStringify(p, 400);
    }).filter(Boolean);

    const suffix = output.length > parts.length ? ` …(+${output.length - parts.length} more)` : '';
    return `${described.join(' ')}${suffix}`.trim();
  }

  if (output && typeof output === 'object') {
    // Keep only a small subset when possible
    const picked = pickImportantFields(output);
    const hasPicked = Object.keys(picked).length > 0;
    return safeCompactStringify(hasPicked ? picked : output, 1200);
  }

  return String(output ?? '');
}

/**
 * Extract text content from an assistant message or tool interaction.
 */
function extractAssistantText(item: OpenAIResponseItem): string {
  const type = item.type?.toLowerCase();
  const role = item.role?.toLowerCase();

  if (role === 'assistant' || type === 'message') {
    if (typeof item.content === 'string') return item.content;
    if (Array.isArray(item.content)) {
      return item.content
        .filter((p: any) => p?.type === 'output_text' || p?.type === 'text')
        .map((p: any) => p.text || '')
        .join('\n');
    }
    if (typeof item.output === 'string') return item.output;
  }

  if (type === 'function_call') {
    let argsObj: any | null = null;
    if (typeof item.arguments === 'string') {
      argsObj = safeJsonParseObject(item.arguments, 8000);
    } else if (item.arguments && typeof item.arguments === 'object' && !Array.isArray(item.arguments)) {
      argsObj = item.arguments;
    }

    const compact = argsObj ? pickImportantFields(argsObj) : null;
    const rendered = compact && Object.keys(compact).length
      ? safeCompactStringify(compact, 800)
      : (typeof item.arguments === 'string' ? item.arguments.slice(0, 500) : safeCompactStringify(item.arguments || {}, 800));

    return `[Tool Call: ${item.name}] ${rendered}`;
  }

  if (type === 'function_call_output') {
    return `[Tool Result] ${describeToolOutput((item as any).output)}`;
  }

  if (type === 'reasoning') {
    if (Array.isArray(item.summary)) {
      return item.summary.map((s: any) => s.text || '').join('\n');
    }
  }

  return '';
}

/**
 * Format turns for summarization prompt.
 */
export function formatTurnsForSummary(
  turns: OpenAITurn[],
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

      // Collect tool names
      if (options.includeToolNames && item.type === 'function_call' && item.name) {
        toolNames.add(item.name);
      }

      // Collect file paths from tool arguments (avoid parsing huge blobs)
      if (options.includeFilePaths && item.type === 'function_call') {
        try {
          let args: any = null;
          if (typeof item.arguments === 'string') {
            args = safeJsonParseObject(item.arguments, 8000);
          } else {
            args = item.arguments;
          }
          if (args?.filePath) filePaths.add(args.filePath);
          if (args?.path) filePaths.add(args.path);
        } catch {}
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
function createSummaryMessage(summaryText: string, existingSummary?: string): OpenAIResponseItem {
  let content = SUMMARY_MARKER_PREFIX;
  
  // If there was an existing summary, note that we're building on it
  if (existingSummary) {
    content += '[Building on previous summary]\n\n';
  }
  
  content += summaryText;

  return {
    role: 'assistant',
    type: 'message',
    content: [{ type: 'output_text', text: content }],
  } as OpenAIResponseItem;
}

// ============================================================================
// Main Compaction Function
// ============================================================================

export type OpenAISummarizer = (turns: OpenAITurn[], existingSummary?: string) => Promise<string>;

/**
 * Compact OpenAI history by summarizing older turns.
 *
 * Behavior:
 * - System prompt is handled elsewhere (not part of history array here).
 * - User messages are always preserved verbatim.
 * - For older turns, assistant + tool items are replaced with a single
 *   assistant summary message for that turn.
 * - The last `preserveLastTurns` turns are kept fully intact.
 */
function stripLeadingRollingSummary(history: OpenAIResponseItem[]): {
  stripped: OpenAIResponseItem[];
  existingText?: string;
  existingItem?: OpenAIResponseItem;
} {
  const first = history?.[0] as any;
  if (first && first.role === 'assistant' && String(first.type || '').toLowerCase() === 'message') {
    const content = Array.isArray(first.content) ? first.content : [];
    const text = content
      .filter((b: any) => b?.type === 'output_text')
      .map((b: any) => String(b.text || ''))
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

function createRollingSummaryMessage(summaryText: string, existingSummary?: string): OpenAIResponseItem {
  let content = SUMMARY_MARKER_PREFIX + ROLLING_SUMMARY_TAG + '\n\n';
  if (existingSummary) {
    content += '[Building on previous rolling summary]\n\n';
  }
  content += summaryText;
  return {
    role: 'assistant',
    type: 'message',
    content: [{ type: 'output_text', text: content }],
  } as OpenAIResponseItem;
}

async function compactOpenAIHistoryOnce(
  history: OpenAIResponseItem[],
  config: CompactionConfig,
  summarizer: OpenAISummarizer
): Promise<OpenAICompactionResult> {
  if (config.strategy === 'rolling_summary') {
    const metrics = estimateOpenAIHistoryTokens(history);
    const originalTokens = metrics.totalTokens;

    if (!config.enabled || originalTokens <= config.targetContextTokens) {
      return { history, compacted: false, turnsSummarized: 0, originalTokens, newTokens: originalTokens };
    }

    const { stripped, existingText } = stripLeadingRollingSummary(history);
    const turns = segmentOpenAIIntoTurns(stripped);

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

    // Build one rolling summary from all older turns.
    // (We preserve user messages separately in the compacted history.)
    const hasAnyAssistantOrTools = toSummarize.some(t => t.assistantAndTools && t.assistantAndTools.length > 0);
    if (!hasAnyAssistantOrTools) {
      return { history, compacted: false, turnsSummarized: 0, originalTokens, newTokens: originalTokens };
    }

    let summaryText: string;
    try {
      summaryText = await summarizer(toSummarize, existingText);
    } catch (error) {
      console.error('[OpenAI Compaction] Rolling summary failed, keeping original history:', error);
      return { history, compacted: false, turnsSummarized: 0, originalTokens, newTokens: originalTokens };
    }

    const rollingSummary = createRollingSummaryMessage(summaryText, existingText);

    const newHistory: OpenAIResponseItem[] = [];
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

    const newTokens = estimateOpenAIHistoryTokens(newHistory).totalTokens;
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

  // Default: per-turn compaction (single pass)
  return await compactOpenAIHistoryPerTurnOnce(history, config, summarizer);
}

async function compactOpenAIHistoryPerTurnOnce(
  history: OpenAIResponseItem[],
  config: CompactionConfig,
  summarizer: OpenAISummarizer
): Promise<OpenAICompactionResult> {
  // Check if compaction is needed
  const metrics = estimateOpenAIHistoryTokens(history);
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

  console.log(`[OpenAI Compaction] Starting compaction. Current tokens: ${originalTokens}, target: ${config.targetContextTokens}`);

  // Segment into turns
  const turns = segmentOpenAIIntoTurns(history);

  // Minimum turns required to attempt compaction (need at least 1 to summarize + 1 to keep)
  const MIN_TURNS_FOR_COMPACTION = 2;
  // Minimum turns to always keep (even if preserveLastTurns is higher)
  const MIN_TURNS_TO_PRESERVE = 1;

  if (turns.length < MIN_TURNS_FOR_COMPACTION) {
    console.log(`[OpenAI Compaction] Not enough turns to compact (${turns.length} < ${MIN_TURNS_FOR_COMPACTION})`);
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

  console.log(`[OpenAI Compaction] Adjusting preserve count: configured=${config.preserveLastTurns}, ` +
    `effective=${effectivePreserveCount}, totalTurns=${turns.length}`);

  const effectiveConfig = { ...config, preserveLastTurns: effectivePreserveCount };
  const targets = identifyCompactionTargets(turns, effectiveConfig, originalTokens);

  if (targets.toSummarize.length === 0) {
    console.log('[OpenAI Compaction] No turns to summarize');
    return {
      history,
      compacted: false,
      turnsSummarized: 0,
      originalTokens,
      newTokens: originalTokens,
    };
  }

  console.log(`[OpenAI Compaction] Summarizing ${targets.toSummarize.length} turns, preserving ${targets.toPreserve.length} turns`);

  const newTurns: OpenAITurn[] = [];

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
    const assistantWithoutSummary: OpenAIResponseItem[] = [];

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

    const turnForSummary: OpenAITurn = {
      userMessage: turn.userMessage,
      assistantAndTools: assistantWithoutSummary,
      estimatedTokens: turn.estimatedTokens,
    };

    let summaryText: string;
    try {
      summaryText = await summarizer([turnForSummary], existingSummaryText);
    } catch (error) {
      console.error('[OpenAI Compaction] Summarization failed for turn, keeping original turn:', error);
      newTurns.push(turn);
      continue;
    }

    const summaryMessage = createSummaryMessage(summaryText, existingSummaryText);

    const summarizedTurn: OpenAITurn = {
      userMessage: turn.userMessage,
      assistantAndTools: [summaryMessage],
      estimatedTokens: 0,
    };
    summarizedTurn.estimatedTokens = estimateOpenAITurnTokens(summarizedTurn);

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

  const newHistory = flattenOpenAITurns(newTurns);
  const newMetrics = estimateOpenAIHistoryTokens(newHistory);
  const newTokens = newMetrics.totalTokens;

  console.log(`[OpenAI Compaction] Compaction complete. New tokens: ${newTokens} (saved ${originalTokens - newTokens})`);

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
 * Compact OpenAI history with bounded iterative passes until we reach the
 * target token threshold or can no longer make progress.
 */
export async function compactOpenAIHistory(
  history: OpenAIResponseItem[],
  config: CompactionConfig = DEFAULT_OPENAI_COMPACTION_CONFIG,
  summarizer: OpenAISummarizer
): Promise<OpenAICompactionResult> {
  const initialMetrics = estimateOpenAIHistoryTokens(history);
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

  const runIterative = async (startHistory: OpenAIResponseItem[], cfg: CompactionConfig) => {
    let currentHistory = startHistory;
    let currentTokens = estimateOpenAIHistoryTokens(currentHistory).totalTokens;
    let totalTurnsSummarized = 0;
    let lastSummaryText: string | undefined;

    for (let i = 0; i < maxIters && currentTokens > cfg.targetContextTokens; i++) {
      const pass = await compactOpenAIHistoryOnce(currentHistory, cfg, summarizer);
      if (!pass.compacted) break;
      if (pass.newTokens >= currentTokens) break;
      currentHistory = pass.history;
      currentTokens = pass.newTokens;
      totalTurnsSummarized += pass.turnsSummarized;
      if (pass.summaryText) lastSummaryText = pass.summaryText;
    }

    return { history: currentHistory, tokens: currentTokens, turnsSummarized: totalTurnsSummarized, summaryText: lastSummaryText };
  };

  // Adaptive: try per-turn first, then fall back to rolling summary once if still above target.
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

    // If per-turn didn't get us under target, attempt a rolling-summary pass (bounded).
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

  // Non-adaptive: run iterative passes using the requested strategy.
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
 * Check if OpenAI history needs compaction.
 */
export function needsOpenAICompaction(
  history: OpenAIResponseItem[],
  config: CompactionConfig = DEFAULT_OPENAI_COMPACTION_CONFIG
): boolean {
  if (!config.enabled) return false;
  const metrics = estimateOpenAIHistoryTokens(history);
  return metrics.totalTokens > config.targetContextTokens;
}

/**
 * Get token metrics for OpenAI history.
 */
export function getOpenAIMetrics(history: OpenAIResponseItem[]) {
  return estimateOpenAIHistoryTokens(history);
}
