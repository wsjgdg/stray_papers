import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { normKey, matchModel, buildIndex } from '../server/match.ts';

type Model = { id: string; name: string; slug?: string };

const mk = (id: string, name: string, slug = id): Model => ({ id, name, slug });

const keyOf = (m: Model) => ({
  model: m,
  key: normKey(m.name),
  bare: normKey(m.name),
  slug: normKey(m.slug ?? m.id),
});

describe('match.normKey', () => {
  it('lowercases, strips parentheticals, keeps alphanumerics', () => {
    assert.equal(normKey('GPT-4o (max)'), 'gpt4o');
    assert.equal(normKey('Claude 3.5 Sonnet'), 'claude35sonnet');
  });
});

describe('matchModel', () => {
  const keys = [
    keyOf(mk('openai/gpt-4o', 'GPT-4o')),
    keyOf(mk('anthropic/claude-3-5-sonnet', 'Claude 3.5 Sonnet')),
  ];

  it('exact name match wins', () => {
    assert.equal(matchModel('GPT-4o', null, keys)?.id, 'openai/gpt-4o');
  });

  it('slug match works', () => {
    assert.equal(matchModel('gpt-4o', 'gpt-4o', keys)?.id, 'openai/gpt-4o');
  });

  it('returns null when nothing reaches the 0.6 threshold', () => {
    assert.equal(matchModel('SomeUnrelatedModelXYZ', null, keys), null);
  });

  it('prefers shorter id on a score tie (standard over -fast variant)', () => {
    const keys2 = [keyOf(mk('x/gpt-4o-fast', 'GPT-4o Fast')), keyOf(mk('x/gpt-4o', 'GPT-4o'))];
    assert.equal(matchModel('GPT-4o', null, keys2)?.id, 'x/gpt-4o');
  });

  it('substring containment yields a partial score', () => {
    const k = [keyOf(mk('x/claude-3-opus', 'Claude 3 Opus'))];
    assert.equal(matchModel('Claude 3', null, k)?.id, 'x/claude-3-opus');
  });
});

describe('buildIndex', () => {
  it('strips the 8-digit date suffix from canonical slug', () => {
    const idx = buildIndex([mk('or/gpt-4o', 'GPT-4o', 'openai/gpt-4o-20260827')]);
    assert.equal(idx[0].slug, normKey('gpt-4o'));
  });
});
