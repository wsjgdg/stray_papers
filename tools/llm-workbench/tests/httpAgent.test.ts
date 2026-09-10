import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { getDispatcher } from '../server/httpAgent.ts';

describe('B6 httpAgent getDispatcher', () => {
  it('returns the same Agent instance for the same provider (connection pool reuse)', () => {
    const a = getDispatcher('openai');
    const b = getDispatcher('openai');
    assert.equal(a, b, 'same provider must reuse the same Agent');
  });

  it('returns distinct Agent instances per provider', () => {
    const a = getDispatcher('openai');
    const b = getDispatcher('anthropic');
    assert.notEqual(a, b, 'different providers must have separate pools');
  });

  it('returned dispatcher is a usable undici Agent (has close/dispatch)', () => {
    const a = getDispatcher('google');
    assert.equal(typeof a.close, 'function');
    assert.equal(typeof a.dispatch, 'function');
  });
});
