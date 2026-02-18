import keytarModule from 'keytar';

export type LlmProvider = 'openai' | 'openai_compat' | 'anthropic' | 'bedrock' | 'heysalad';

const keytar = (keytarModule as unknown as { default?: typeof keytarModule } & typeof keytarModule).default ?? keytarModule;

const KEYTAR_SERVICE = 'cheri-api-keys';
const LEGACY_OPENAI_BASE_URL_ACCOUNT = 'openai-base-url';
const OPENAI_COMPAT_BASE_URL_ACCOUNT = 'openai-compat-base-url';
const BEDROCK_REGION_ACCOUNT = 'bedrock-region';
const OPENAI_COMPAT_BASE_URL_ENV_KEYS = ['OPENAI_COMPAT_BASE_URL', 'OPENAI_BASE_URL', 'OPENAI_API_BASE'];

function normalizeKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function providerToEnvKey(provider: LlmProvider): string {
  if (provider === 'anthropic') return 'ANTHROPIC_API_KEY';
  if (provider === 'openai_compat') return 'OPENAI_COMPAT_API_KEY';
  if (provider === 'bedrock') return 'AWS_BEARER_TOKEN_BEDROCK';
  if (provider === 'heysalad') return 'HEYSALAD_API_KEY';
  return 'OPENAI_API_KEY';
}

function providerToAccount(provider: LlmProvider): string {
  return provider;
}

export async function setApiKey(provider: LlmProvider, apiKey: string): Promise<void> {
  const normalizedProvider: LlmProvider =
    provider === 'anthropic'
      ? 'anthropic'
      : provider === 'openai_compat'
        ? 'openai_compat'
        : provider === 'bedrock'
          ? 'bedrock'
          : provider === 'heysalad'
            ? 'heysalad'
            : 'openai';
  const normalizedKey = normalizeKey(apiKey);
  const account = providerToAccount(normalizedProvider);

  if (!normalizedKey) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, account);
    } catch {}
    return;
  }

  await keytar.setPassword(KEYTAR_SERVICE, account, normalizedKey);
}

export async function getApiKey(provider: LlmProvider): Promise<{ key: string; source: 'keytar' | 'env' | null }> {
  const normalizedProvider: LlmProvider =
    provider === 'anthropic'
      ? 'anthropic'
      : provider === 'openai_compat'
        ? 'openai_compat'
        : provider === 'bedrock'
          ? 'bedrock'
          : provider === 'heysalad'
            ? 'heysalad'
            : 'openai';
  const account = providerToAccount(normalizedProvider);

  try {
    const stored = normalizeKey(await keytar.getPassword(KEYTAR_SERVICE, account));
    if (stored) return { key: stored, source: 'keytar' };
  } catch {}

  const envKey = providerToEnvKey(normalizedProvider);
  const fromEnv = normalizeKey(process.env[envKey]);
  if (fromEnv) return { key: fromEnv, source: 'env' };

  return { key: '', source: null };
}

export async function hasApiKey(provider: LlmProvider): Promise<boolean> {
  const res = await getApiKey(provider);
  return !!res.key;
}

export async function setOpenAICompatBaseUrl(baseUrl: string): Promise<void> {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, OPENAI_COMPAT_BASE_URL_ACCOUNT);
    } catch {}
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, LEGACY_OPENAI_BASE_URL_ACCOUNT);
    } catch {}
    return;
  }

  await keytar.setPassword(KEYTAR_SERVICE, OPENAI_COMPAT_BASE_URL_ACCOUNT, normalized);
}

export async function getOpenAICompatBaseUrl(): Promise<{ url: string; source: 'keytar' | 'env' | null }> {
  try {
    const stored = normalizeBaseUrl(await keytar.getPassword(KEYTAR_SERVICE, OPENAI_COMPAT_BASE_URL_ACCOUNT));
    if (stored) return { url: stored, source: 'keytar' };
  } catch {}

  try {
    const legacy = normalizeBaseUrl(await keytar.getPassword(KEYTAR_SERVICE, LEGACY_OPENAI_BASE_URL_ACCOUNT));
    if (legacy) return { url: legacy, source: 'keytar' };
  } catch {}

  for (const key of OPENAI_COMPAT_BASE_URL_ENV_KEYS) {
    const fromEnv = normalizeBaseUrl(process.env[key]);
    if (fromEnv) return { url: fromEnv, source: 'env' };
  }

  return { url: '', source: null };
}

export async function setBedrockRegion(region: string): Promise<void> {
  const normalized = region.trim();
  if (!normalized) {
    try { await keytar.deletePassword(KEYTAR_SERVICE, BEDROCK_REGION_ACCOUNT); } catch {}
    return;
  }
  await keytar.setPassword(KEYTAR_SERVICE, BEDROCK_REGION_ACCOUNT, normalized);
}

export async function getBedrockRegion(): Promise<string> {
  try {
    const stored = await keytar.getPassword(KEYTAR_SERVICE, BEDROCK_REGION_ACCOUNT);
    if (stored) return stored;
  } catch {}
  return process.env['AWS_REGION'] || 'us-east-1';
}

// Backwards-compatible aliases (OPENAI_BASE_URL now treated as OpenAI-compatible).
export async function setOpenAIBaseUrl(baseUrl: string): Promise<void> {
  return setOpenAICompatBaseUrl(baseUrl);
}

export async function getOpenAIBaseUrl(): Promise<{ url: string; source: 'keytar' | 'env' | null }> {
  return getOpenAICompatBaseUrl();
}

export async function getApiKeysStatus(): Promise<{
  openai: { configured: boolean; source: 'keytar' | 'env' | null };
  openaiCompat: {
    configured: boolean;
    source: 'keytar' | 'env' | null;
    baseUrl: { configured: boolean; source: 'keytar' | 'env' | null; value?: string };
  };
  anthropic: { configured: boolean; source: 'keytar' | 'env' | null };
  bedrock: { configured: boolean; source: 'keytar' | 'env' | null; region: string };
  heysalad: { configured: boolean; source: 'keytar' | 'env' | null };
}> {
  const [openai, openaiCompat, openaiCompatBase, anthropic, bedrock, heysalad, bedrockRegion] = await Promise.all([
    getApiKey('openai'),
    getApiKey('openai_compat'),
    getOpenAICompatBaseUrl(),
    getApiKey('anthropic'),
    getApiKey('bedrock'),
    getApiKey('heysalad'),
    getBedrockRegion(),
  ]);
  return {
    openai: { configured: !!openai.key, source: openai.source },
    openaiCompat: {
      configured: !!openaiCompat.key,
      source: openaiCompat.source,
      baseUrl: {
        configured: !!openaiCompatBase.url,
        source: openaiCompatBase.source,
        value: openaiCompatBase.url || undefined,
      },
    },
    anthropic: { configured: !!anthropic.key, source: anthropic.source },
    bedrock: { configured: !!bedrock.key, source: bedrock.source, region: bedrockRegion },
    heysalad: { configured: !!heysalad.key, source: heysalad.source },
  };
}
