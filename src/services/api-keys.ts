import keytarModule from 'keytar';

export type LlmProvider = 'openai' | 'anthropic';

const keytar = (keytarModule as unknown as { default?: typeof keytarModule } & typeof keytarModule).default ?? keytarModule;

const KEYTAR_SERVICE = 'brilliantcode-api-keys';

function normalizeKey(value: unknown): string {
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

export async function getApiKeysStatus(): Promise<{
  openai: { configured: boolean; source: 'keytar' | 'env' | null };
  anthropic: { configured: boolean; source: 'keytar' | 'env' | null };
}> {
  const [openai, anthropic] = await Promise.all([getApiKey('openai'), getApiKey('anthropic')]);
  return {
    openai: { configured: !!openai.key, source: openai.source },
    anthropic: { configured: !!anthropic.key, source: anthropic.source },
  };
}

