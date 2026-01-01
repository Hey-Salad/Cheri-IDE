/**
 * LLM-based summarization for context compaction.
 * Provides separate summarizers for OpenAI and Anthropic to maintain independence.
 */

import type { OpenAITurn, AnthropicTurn, SummarizerOptions } from './types.js';
import { DEFAULT_SUMMARIZER_OPTIONS } from './types.js';
import { formatTurnsForSummary as formatOpenAITurns } from './openaiCompaction.js';
import { formatTurnsForSummary as formatAnthropicTurns } from './anthropicCompaction.js';
import { MODELS } from '../models.js';

// ============================================================================
// Summarization Prompt
// ============================================================================

const SUMMARIZATION_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to create a concise summary of a conversation between a user and an AI coding assistant.

Guidelines:
- Preserve ALL key facts, decisions, and outcomes
- Focus the summary on the assistant's responses and tool calls/results; user messages will be preserved separately in full
- Include file paths that were created, modified, or discussed
- Include tool names that were used and their purposes
- Preserve any error messages or issues encountered and their resolutions
- Keep track of the user's goals and whether they were achieved
- Summarize code changes by their purpose, not the full code
- Be concise but comprehensive - the summary will be used as context for continuing the conversation
- Use bullet points for clarity
- Do NOT include pleasantries or filler text

Format your summary as:
## Summary of Previous Conversation

### User Goals
- [List the user's objectives]

### Actions Taken
- [List key actions and their outcomes]

### Files Modified
- [List files that were created/modified with brief descriptions]

### Current State
- [Describe the current state of the work]

### Important Context
- [Any other critical information for continuing the conversation]`;

/**
 * Build the user prompt for summarization.
 */
function buildSummarizationPrompt(formattedTurns: string, existingSummary?: string): string {
  let prompt = 'Please summarize the following conversation turns:\n\n';
  
  if (existingSummary) {
    prompt += `[Previous Summary to incorporate]\n${existingSummary}\n\n[New turns to add to summary]\n`;
  }
  
  prompt += formattedTurns;
  
  return prompt;
}

// ============================================================================
// OpenAI Summarizer
// ============================================================================

export interface OpenAISummarizerConfig {
  /** The OpenAI client (or compatible) */
  client: any;
  /** Model to use for summarization */
  model: string;
  /** Summarizer options */
  options?: SummarizerOptions;
}

/**
 * Create an OpenAI-based summarizer function.
 */
export function createOpenAISummarizer(config: OpenAISummarizerConfig) {
  const options = { ...DEFAULT_SUMMARIZER_OPTIONS, ...config.options };
  
  return async function summarizeOpenAITurns(
    turns: OpenAITurn[],
    existingSummary?: string
  ): Promise<string> {
    const formattedTurns = formatOpenAITurns(turns, options);
    const userPrompt = buildSummarizationPrompt(formattedTurns, existingSummary);
    
    console.log(`[OpenAI Summarizer] Summarizing ${turns.length} turns with model ${config.model}`);
    
    try {
      // Use the responses API format (same as the main agent)
      const response = await config.client.responses.create({
        model: config.model,
        input: [
          { role: 'developer', content: SUMMARIZATION_SYSTEM_PROMPT },
          { role: 'user', content: [{ type: 'input_text', text: userPrompt }] }
        ],
        max_output_tokens: options.maxSummaryTokens || 2000,
      });
      
      // Extract text from response
      let summaryText = '';
      
      if (response.output_text) {
        summaryText = response.output_text;
      } else if (Array.isArray(response.output)) {
        for (const item of response.output) {
          if (item.type === 'message' && Array.isArray(item.content)) {
            for (const part of item.content) {
              if (part.type === 'output_text' || part.type === 'text') {
                summaryText += part.text || '';
              }
            }
          }
        }
      }
      
      if (!summaryText.trim()) {
        throw new Error('Empty summary response from model');
      }
      
      console.log(`[OpenAI Summarizer] Generated summary of ${summaryText.length} characters`);
      return summaryText.trim();
      
    } catch (error) {
      console.error('[OpenAI Summarizer] Summarization failed:', error);
      throw error;
    }
  };
}

// ============================================================================
// Anthropic Summarizer
// ============================================================================

export interface AnthropicSummarizerConfig {
  /** The Anthropic client (or compatible wrapper) */
  client: any;
  /** Model to use for summarization */
  model: string;
  /** Summarizer options */
  options?: SummarizerOptions;
}

/**
 * Create an Anthropic-based summarizer function.
 */
export function createAnthropicSummarizer(config: AnthropicSummarizerConfig) {
  const options = { ...DEFAULT_SUMMARIZER_OPTIONS, ...config.options };
  
  return async function summarizeAnthropicTurns(
    turns: AnthropicTurn[],
    existingSummary?: string
  ): Promise<string> {
    const formattedTurns = formatAnthropicTurns(turns, options);
    const userPrompt = buildSummarizationPrompt(formattedTurns, existingSummary);
    
    // Look up the correct API model name (same as main agent)
    const modelInfo = MODELS[config.model];
    const modelName = modelInfo?.apiName || modelInfo?.name || config.model;
    
    console.log(`[Anthropic Summarizer] Summarizing ${turns.length} turns with model ${modelName} (config: ${config.model})`);
    
    try {
      // Use Anthropic's messages API format
      // Note: This goes through the same client wrapper as the main agent
      const response = await config.client.responses.create({
        model: modelName,
        max_tokens: options.maxSummaryTokens || 2000,
        system: SUMMARIZATION_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: [{ type: 'text', text: userPrompt }] }
        ],
      });
      
      // Extract text from Anthropic response
      let summaryText = '';
      
      if (response.content && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block.type === 'text') {
            summaryText += block.text || '';
          }
        }
      }
      
      if (!summaryText.trim()) {
        throw new Error('Empty summary response from model');
      }
      
      console.log(`[Anthropic Summarizer] Generated summary of ${summaryText.length} characters`);
      return summaryText.trim();
      
    } catch (error) {
      console.error('[Anthropic Summarizer] Summarization failed:', error);
      throw error;
    }
  };
}

// ============================================================================
// Fallback Summarizer (No LLM)
// ============================================================================

/**
 * Create a simple non-LLM summarizer that just truncates content.
 * Used as fallback when LLM summarization fails or is disabled.
 */
export function createFallbackSummarizer() {
  return async function fallbackSummarize(
    turns: OpenAITurn[] | AnthropicTurn[],
    existingSummary?: string
  ): Promise<string> {
    const parts: string[] = [];
    
    if (existingSummary) {
      parts.push('[Previous context preserved]\n' + existingSummary.slice(0, 1000));
    }
    
    parts.push(`[Summarized ${turns.length} conversation turns]`);
    
    // Extract just user messages as brief context
    const userMessages: string[] = [];
    for (const turn of turns) {
      const userMsg = turn.userMessage as any;
      let text = '';
      
      if (typeof userMsg.content === 'string') {
        text = userMsg.content;
      } else if (Array.isArray(userMsg.content)) {
        for (const part of userMsg.content) {
          if (part?.type === 'input_text' || part?.type === 'text') {
            text += (part.text || '') + ' ';
          }
        }
      }
      
      if (text.trim()) {
        userMessages.push(`- ${text.trim().slice(0, 100)}`);
      }
    }
    
    if (userMessages.length > 0) {
      parts.push('\nUser requests in summarized turns:');
      parts.push(userMessages.slice(0, 10).join('\n'));
      if (userMessages.length > 10) {
        parts.push(`... and ${userMessages.length - 10} more requests`);
      }
    }
    
    return parts.join('\n');
  };
}
