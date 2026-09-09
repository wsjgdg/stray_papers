import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'vitest';
import {
  updateModelPrices,
  priceFor,
  estimateCost,
  PROVIDER_PRICING,
} from '../server/pricing.ts';

describe('pricing', () => {
  beforeEach(() => updateModelPrices([]));

  it('updateModelPrices indexes by id and by tail (after vendor prefix)', () => {
    updateModelPrices([
      { id: 'openai/gpt-4o', promptPrice: 2, completionPrice: 8, cacheReadPrice: 0.5 } as any,
    ]);
    assert.equal(priceFor('openai', 'openai/gpt-4o').input, 2);
    assert.equal(priceFor('openai', 'gpt-4o').input, 2);
  });

  it('priceFor falls back to provider pricing', () => {
    assert.equal(priceFor('anthropic', 'claude-x').input, PROVIDER_PRICING.anthropic.input);
  });

  it('priceFor falls back to DEFAULT for unknown provider', () => {
    const p = priceFor('unknown-vendor', 'm');
    assert.equal(p.input, 1); // DEFAULT.input
  });

  it('estimateCost deducts cache-read from billable input', () => {
    updateModelPrices([
      { id: 'openai/gpt-4o', promptPrice: 2.5, completionPrice: 10, cacheReadPrice: 1.25 } as any,
    ]);
    const c = estimateCost('openai', 'openai/gpt-4o', 1_000_000, 500_000, 200_000);
    assert.equal(c.input, 2); // (1e6 - 200e3) * 2.5 / 1e6
    assert.equal(c.output, 5); // 500e3 * 10 / 1e6
    assert.equal(c.cache, 0.25); // 200e3 * 1.25 / 1e6
    assert.equal(c.total, 7.25);
  });

  it('estimateCost handles null tokens', () => {
    const c = estimateCost('openai', 'gpt-4o', null, null, null);
    assert.equal(c.total, 0);
  });
});
