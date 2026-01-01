// Model metadata that drives both UI selection and API routing.
export type Provider = 'openai' | 'anthropic';

export type Model = {
  name: string; // Display name shown in the UI
  apiName?: string; // Provider-specific identifier when it differs from display name
  type: string; // 'reasoning' | 'chat' | 'extended_thinking' | etc.
  provider: Provider;
  streaming?: boolean;
  reasoning?: boolean;
  extendedThinking?: boolean;

  /** Optional model context window sizing used for compaction + metrics */
  contextWindowTokens?: number;
  /** Optional model-specific compaction trigger/target token threshold */
  compactionTargetTokens?: number;
};

// These keys map to deployment/model names that the renderer passes back from the
// model picker. The main process relays the chosen string directly to the SDK.
export const OPENAI_MODELS: Record<string, Model> = {
  'gpt-5.1-codex-max': {
    name: 'gpt-5.1-codex-max',
    type: 'reasoning',
    provider: 'openai',
    streaming: false,
    reasoning: true,
    contextWindowTokens: 272_000,
    compactionTargetTokens: 180_000,
  },
  'gpt-5.1': {
    name: 'gpt-5.1',
    type: 'reasoning',
    provider: 'openai',
    streaming: false,
    reasoning: true,
    contextWindowTokens: 272_000,
    compactionTargetTokens: 180_000,
  },
  'gpt-5.2': {
    name: 'gpt-5.2',
    type: 'reasoning',
    provider: 'openai',
    streaming: false,
    reasoning: true,
    contextWindowTokens: 272_000,
    compactionTargetTokens: 180_000,
  },
  'gpt-5-pro': {
    name: 'gpt-5-pro',
    type: 'reasoning',
    provider: 'openai',
    streaming: false,
    reasoning: true,
    contextWindowTokens: 272_000,
    compactionTargetTokens: 180_000,
  }
};

export const ANTHROPIC_MODELS: Record<string, Model> = {
  'claude-opus-4.5': {
    name: 'claude-opus-4.5',
    apiName: 'claude-opus-4-5-20251101',
    type: 'extended_thinking',
    provider: 'anthropic',
    streaming: false,
    reasoning: false,
    extendedThinking: true,
    contextWindowTokens: 200_000,
    compactionTargetTokens: 100_000,
  },
  'claude-sonnet-4.5': {
    name: 'claude-sonnet-4.5',
    apiName: 'claude-sonnet-4-5-20250929',
    type: 'extended_thinking',
    provider: 'anthropic',
    streaming: false,
    reasoning: false,
    extendedThinking: true,
    contextWindowTokens: 200_000,
    compactionTargetTokens: 100_000,
  },
};

export const MODELS: Record<string, Model> = {
  ...OPENAI_MODELS,
  ...ANTHROPIC_MODELS
};

export function supportsReasoning(modelName: string): boolean {
  const model = MODELS[modelName];
  const resolvedName = model?.apiName || model?.name;
  if (!model) return modelName.startsWith('gpt-5');
  if (model.reasoning === false) return false;
  if (model.reasoning === true) return true;
  if (model.extendedThinking === true) return true;
  return (resolvedName || modelName).startsWith('gpt-5');
}

export function getModelProvider(modelName: string): Provider {
  const model = MODELS[modelName];
  if (!model) {
    if (modelName.startsWith('claude-')) return 'anthropic';
    return 'openai';
  }
  return model.provider;
}

export function supportsExtendedThinking(modelName: string): boolean {
  const model = MODELS[modelName];
  return model?.extendedThinking === true;
}

export function supportsStreaming(_modelName: string): boolean {
  // Streaming disabled globally
  return false;
}

export function resolveApiModelName(modelKey: string): string {
  const model = MODELS[modelKey];
  if (model?.apiName) return model.apiName;
  if (model?.name) return model.name;
  return modelKey;
}
