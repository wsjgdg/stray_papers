import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  isValidRouting,
  matchRoute,
  resolveChain,
  MAX_CHAIN,
  type RoutingConfig,
} from '../server/routing.ts';
import type { ProxyConfig } from '../server/config.ts';

function prov(enabled: boolean, key = 'k') {
  return { apiKey: key, enabled } as any;
}

describe('routing: isValidRouting', () => {
  it('accepts { default: [] }', () => {
    assert.equal(isValidRouting({ default: [] }), true);
  });
  it('accepts routes + default', () => {
    assert.equal(isValidRouting({ default: ['a'], routes: { 'gpt-*': ['a', 'b'] } }), true);
  });
  it('rejects missing default', () => {
    assert.equal(isValidRouting({ routes: {} }), false);
  });
  it('rejects non-string default entries', () => {
    assert.equal(isValidRouting({ default: ['a', 1] }), false);
  });
  it('rejects null / non-object', () => {
    assert.equal(isValidRouting(null), false);
    assert.equal(isValidRouting('x'), false);
  });
});

describe('routing: matchRoute', () => {
  const r: RoutingConfig = {
    default: ['oai'],
    routes: { 'gpt-4o': ['a', 'b'], 'gpt-*': ['c', 'd'], '*-mini': ['e'], '*': ['fallback'] },
  };
  it('exact match wins over wildcard', () => {
    assert.deepEqual(matchRoute('gpt-4o', r), ['a', 'b']);
  });
  it('prefix wildcard matches', () => {
    assert.deepEqual(matchRoute('gpt-4turbo', r), ['c', 'd']);
  });
  it('suffix wildcard matches', () => {
    assert.deepEqual(matchRoute('claude-mini', r), ['e']);
  });
  it('bare * matches anything else', () => {
    assert.deepEqual(matchRoute('weird-model', r), ['fallback']);
  });
  it('no routing => null', () => {
    assert.equal(matchRoute('gpt-4o', undefined), null);
  });
});

describe('routing: resolveChain', () => {
  const cfg = {
    providers: {
      a: prov(true),
      b: prov(true),
      c: prov(true),
      d: prov(true),
      e: prov(true),
      dead: prov(false), // 未启用
      nok: prov(true, ''), // 无 key
    },
  } as unknown as ProxyConfig;

  it('exact route filters out disabled / no-key providers', () => {
    const r: RoutingConfig = { default: [], routes: { x: ['a', 'dead', 'nok', 'b'] } };
    assert.deepEqual(resolveChain('x', r, cfg), ['a', 'b']);
  });

  it('default chain used when no route match', () => {
    const r: RoutingConfig = { default: ['dead', 'a', 'b'] };
    assert.deepEqual(resolveChain('whatever', r, cfg), ['a', 'b']);
  });

  it('dedupes providers within a chain', () => {
    const r: RoutingConfig = { default: ['a', 'a', 'b'] };
    assert.deepEqual(resolveChain('z', r, cfg), ['a', 'b']);
  });

  it('truncates chain to MAX_CHAIN', () => {
    const r: RoutingConfig = { default: ['a', 'b', 'c', 'd', 'e'] };
    const chain = resolveChain('z', r, cfg);
    assert.ok(chain.length <= MAX_CHAIN);
    assert.deepEqual(chain, ['a', 'b', 'c']);
  });

  it('empty usable chain when all candidates invalid', () => {
    const r: RoutingConfig = { default: ['dead', 'nok'] };
    assert.deepEqual(resolveChain('z', r, cfg), []);
  });
});
