import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { mergeModels, computeEnabledModels } from '../src/lib/modelMerge.ts';

describe('modelMerge', () => {
  it('merge keeps manually-added models and dedups', () => {
    const merged = mergeModels(['my-custom-model', 'gpt-4o'], ['gpt-4o', 'gpt-5.2']);
    assert.deepEqual(merged, ['my-custom-model', 'gpt-4o', 'gpt-5.2']);
  });

  it('empty auto-fetch preserves existing manual models', () => {
    assert.deepEqual(mergeModels(['manual-1', 'manual-2'], []), ['manual-1', 'manual-2']);
  });

  it('undefined/null existing handled safely', () => {
    assert.deepEqual(mergeModels(undefined, ['a', 'b']), ['a', 'b']);
    assert.deepEqual(mergeModels(null, ['a']), ['a']);
  });

  it('no prior enabled set -> all enabled', () => {
    const merged = ['a', 'b', 'c'];
    assert.deepEqual(computeEnabledModels(merged, undefined), ['a', 'b', 'c']);
    assert.deepEqual(computeEnabledModels(merged, []), ['a', 'b', 'c']);
  });

  it('prior enabled set respected (closed models stay closed)', () => {
    const merged = ['a', 'b', 'c', 'manual-1'];
    const prev = ['a', 'manual-1'];
    assert.deepEqual(computeEnabledModels(merged, prev), ['a', 'manual-1']);
  });

  it('end-to-end: manual model survives re-fetch, new fetched models stay disabled', () => {
    let models = ['my-custom'];
    let enabled = ['my-custom'];
    const fetched = ['gpt-4o', 'gpt-5.2'];
    models = mergeModels(models, fetched);
    enabled = computeEnabledModels(models, enabled);
    assert.deepEqual(models, ['my-custom', 'gpt-4o', 'gpt-5.2']);
    assert.deepEqual(enabled, ['my-custom']);
  });
});
