// 验证模型列表合并逻辑（src/lib/modelMerge.ts）：
// 1. 自动获取时保留用户手动添加的模型，不覆盖清空；
// 2. 去重、保持手动项在前；
// 3. 启用集计算：无历史全启用；有历史只保留已启用项。
import assert from 'node:assert/strict';
import { mergeModels, computeEnabledModels } from '../src/lib/modelMerge.ts';

let pass = 0;
const ok = (name) => {
  pass++;
  console.log(`  ✓ ${name}`);
};

// 1) 合并保留手动项（核心回归：重新拉取不清空手动模型）
{
  const existing = ['my-custom-model', 'gpt-4o'];
  const fetched = ['gpt-4o', 'gpt-5.2']; // gpt-4o 重复，应去重
  const merged = mergeModels(existing, fetched);
  assert.deepEqual(merged, ['my-custom-model', 'gpt-4o', 'gpt-5.2']);
  ok('merge keeps manually-added models and dedups');
}

// 2) 空 fetched（bankofai /models 返回空）不改变现有清单
{
  const merged = mergeModels(['manual-1', 'manual-2'], []);
  assert.deepEqual(merged, ['manual-1', 'manual-2']);
  ok('empty auto-fetch preserves existing manual models');
}

// 3) existing 为 undefined/null 安全
{
  assert.deepEqual(mergeModels(undefined, ['a', 'b']), ['a', 'b']);
  assert.deepEqual(mergeModels(null, ['a']), ['a']);
  ok('undefined/null existing handled safely');
}

// 4) 启用集：无历史 → 全部启用
{
  const merged = ['a', 'b', 'c'];
  assert.deepEqual(computeEnabledModels(merged, undefined), ['a', 'b', 'c']);
  assert.deepEqual(computeEnabledModels(merged, []), ['a', 'b', 'c']);
  ok('no prior enabled set → all enabled');
}

// 5) 启用集：有历史 → 只保留已启用项（且不引入未出现的项）
{
  const merged = ['a', 'b', 'c', 'manual-1'];
  const prev = ['a', 'manual-1']; // b、c 被用户关掉过
  assert.deepEqual(computeEnabledModels(merged, prev), ['a', 'manual-1']);
  ok('prior enabled set respected (closed models stay closed)');
}

// 6) 端到端模拟「手动添加模型 → 自动拉取刷新」的真实流程（bankofai 兜底场景）
{
  // 用户先手动添加自定义模型（真实 handler 同时写入 models + enabledModels）
  let models = ['my-custom'];
  let enabled = ['my-custom'];
  assert.deepEqual(models, ['my-custom']);
  assert.deepEqual(enabled, ['my-custom']);

  // 用户点「自动获取」刷新：上游（如 bankofai）返回 gpt-4o / gpt-5.2
  const fetched = ['gpt-4o', 'gpt-5.2'];
  models = mergeModels(models, fetched);
  enabled = computeEnabledModels(models, enabled);
  // 核心回归：手动添加的 my-custom 必须保留，不能被覆盖清空
  assert.deepEqual(models, ['my-custom', 'gpt-4o', 'gpt-5.2']);
  // 设计意图：新拉取的模型默认不自动启用（保留用户此前启用的子集）
  assert.deepEqual(enabled, ['my-custom']);
  ok('end-to-end: manual model survives re-fetch, new fetched models stay disabled');
}

console.log(`\nALL ${pass} model-merge assertions PASSED`);
