import keytarModule from 'keytar';

export type LlmProvider = 'openai' | 'anthropic';

const keytar = (keytarModule as unknown as { default?: typeof keytarModule } & typeof keytarModule).default ?? keytarModule;

const KEYTAR_SERVICE = 'brilliantcode-api-keys';
const OPENAI_BASE_URL_ACCOUNT = 'openai-base-url';
const OPENAI_BASE_URL_ENV_KEYS = ['OPENAI_BASE_URL', 'OPENAI_API_BASE'];

function normalizeKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function providerToEnvKey(provider: LlmProvider): string {
  return provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
}

function providerToAccount(provider: LlmProvider): string {
  return provider;
}

export async function setApiKey(provider: LlmProvider, apiKey: string): Promise<void> {
  const normalizedProvider: LlmProvider = provider === 'anthropic' ? 'anthropic' : 'openai';
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
  const normalizedProvider: LlmProvider = provider === 'anthropic' ? 'anthropic' : 'openai';
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

export async function setOpenAIBaseUrl(baseUrl: string): Promise<void> {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, OPENAI_BASE_URL_ACCOUNT);
    } catch {}
    return;
  }

  await keytar.setPassword(KEYTAR_SERVICE, OPENAI_BASE_URL_ACCOUNT, normalized);
}

export async function getOpenAIBaseUrl(): Promise<{ url: string; source: 'keytar' | 'env' | null }> {
  try {
    const stored = normalizeBaseUrl(await keytar.getPassword(KEYTAR_SERVICE, OPENAI_BASE_URL_ACCOUNT));
    if (stored) return { url: stored, source: 'keytar' };
  } catch {}

  for (const key of OPENAI_BASE_URL_ENV_KEYS) {
    const fromEnv = normalizeBaseUrl(process.env[key]);
    if (fromEnv) return { url: fromEnv, source: 'env' };
  }

  return { url: '', source: null };
}

export async function getApiKeysStatus(): Promise<{
  openai: {
    configured: boolean;
    source: 'keytar' | 'env' | null;
    baseUrl: { configured: boolean; source: 'keytar' | 'env' | null; value?: string };
  };
  anthropic: { configured: boolean; source: 'keytar' | 'env' | null };
}> {
  const [openai, anthropic, openaiBase] = await Promise.all([
    getApiKey('openai'),
    getApiKey('anthropic'),
    getOpenAIBaseUrl(),
  ]);
  return {
    openai: {
      configured: !!openai.key,
      source: openai.source,
      baseUrl: { configured: !!openaiBase.url, source: openaiBase.source, value: openaiBase.url || undefined },
    },
    anthropic: { configured: !!anthropic.key, source: anthropic.source },
  };
}
