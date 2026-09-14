import { describe, it, expect } from 'vitest';
import { SOURCE_REGISTRY } from '../server/sources/registry.js';

describe('SOURCE_REGISTRY', () => {
  it('keeps stable ids and fetch fns for the two shipped sources', () => {
    expect(SOURCE_REGISTRY.map((s) => s.id)).toEqual(['openrouter', 'artificial-analysis']);
    for (const s of SOURCE_REGISTRY) {
      expect(typeof s.fetch).toBe('function');
      expect(typeof s.url).toBe('string');
      expect(s.url.length).toBeGreaterThan(0);
    }
  });
});
