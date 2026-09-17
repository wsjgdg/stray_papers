import { describe, expect, it } from 'vitest';
import { PROVIDERS, PROVIDER_MAP } from '../server/providers.js';

describe('provider directory', () => {
  it('registers Cerebras with its OpenAI-compatible endpoints', () => {
    const provider = PROVIDER_MAP.get('cerebras');
    expect(provider).toMatchObject({
      id: 'cerebras',
      name: 'Cerebras',
      region: 'intl',
      console: 'https://cloud.cerebras.ai/',
      docs: 'https://inference-docs.cerebras.ai/resources/openai',
      apiBase: 'https://api.cerebras.ai/v1',
      modelsEndpoint: 'https://api.cerebras.ai/v1/models',
    });
    expect(provider?.kind).not.toBe('local');
    expect(PROVIDERS.filter((entry) => entry.id === 'cerebras')).toEqual([provider]);
    expect(PROVIDER_MAP.size).toBe(PROVIDERS.length);
  });
});
