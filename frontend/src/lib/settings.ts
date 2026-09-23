import { BASE_URL } from './api';

export type LlmProvider = 'lmstudio' | 'openai';

export interface ProviderSnapshot {
  model: string;
  has_api_key: boolean;
  api_key_masked: string | null;
  base_url: string | null;
  organization: string | null;
}

export interface SettingsSnapshot {
  active_provider: LlmProvider;
  providers: Record<LlmProvider, ProviderSnapshot>;
  catalog: Record<LlmProvider, string[]>;
}

export interface SettingsPayload {
  provider?: LlmProvider;
  api_key?: string;
  model?: string;
  base_url?: string;
  organization?: string;
}

export interface TestResult {
  ok: boolean;
  provider: LlmProvider;
  reply?: string;
  error?: string;
}

export async function getSettings(): Promise<SettingsSnapshot> {
  const r = await fetch(`${BASE_URL}/settings/llm`, {
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`settings HTTP ${r.status}`);
  return (await r.json()) as SettingsSnapshot;
}

export async function saveSettings(
  payload: SettingsPayload,
): Promise<{ ok: true; settings: SettingsSnapshot }> {
  const r = await fetch(`${BASE_URL}/settings/llm`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`saveSettings HTTP ${r.status}: ${text}`);
  }
  return (await r.json()) as { ok: true; settings: SettingsSnapshot };
}

export async function testProvider(): Promise<TestResult> {
  const r = await fetch(`${BASE_URL}/settings/llm/test`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  return (await r.json()) as TestResult;
}
