import assert from 'node:assert/strict';
import { describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// B5：结构化日志 + 请求 ID。验证：
//  1) recordCall 接收并回传 requestId / keyMask；
//  2) LOG_PERSIST=1 时脱敏结构化日志追加到 ~/.llm-workbench/logs.ndjson；
//  3) loadPersistedLogs 倒序 + 过滤；persistedLogsAvailable 反映文件存在；
//  4) LOG_PERSIST 关闭时不落盘。
// 全程隔离 HOME，避免污染真实 ~/.llm-workbench。

describe('B5 structured log + request id', () => {
  let tmpHome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let metrics: typeof import('../server/metrics.ts');

  beforeAll(async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-b5-'));
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;
    process.env.LOG_PERSIST = '1';
    // 动态 import，确保 LOG_FILE 用隔离 HOME 计算
    metrics = await import('../server/metrics.ts');
  });

  afterAll(async () => {
    try {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    delete process.env.LOG_PERSIST;
  });

  afterEach(() => {
    metrics.resetMetrics();
    const f = path.join(tmpHome, '.llm-workbench', 'logs.ndjson');
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  });

  function rec(over: Record<string, unknown> = {}) {
    return metrics.recordCall({
      ts: Date.now(),
      provider: 'openai',
      model: 'gpt-4o',
      method: 'POST',
      path: '/chat/completions',
      status: 200,
      latencyMs: 12,
      ttftMs: 6,
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: null,
      cacheHitRate: null,
      error: null,
      requestBytes: 50,
      responseBytes: 100,
      ...over,
    });
  }

  it('recordCall assigns requestId + keyMask and echoes in getLogs', () => {
    const entry = rec({ requestId: 'req-abc', keyMask: '****wxyz' });
    assert.equal(entry.requestId, 'req-abc');
    assert.equal(entry.keyMask, '****wxyz');
    const live = metrics.getLogs().find((l) => l.id === entry.id)!;
    assert.equal(live.requestId, 'req-abc');
    assert.equal(live.keyMask, '****wxyz');
  });

  it('LOG_PERSIST=1 persists masked ndjson line', () => {
    rec({ requestId: 'req-1', keyMask: '****abcd' });
    const f = path.join(tmpHome, '.llm-workbench', 'logs.ndjson');
    assert.ok(fs.existsSync(f), 'logs.ndjson 应被创建');
    const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.requestId, 'req-1');
    assert.equal(parsed.keyMask, '****abcd');
    assert.equal(parsed.provider, 'openai');
    assert.ok('costUsd' in parsed);
    // 脱敏：结构化行不应含明文 key（此处未传真实 key，仅确认字段完整且为掩码形态）
    assert.ok(typeof parsed.keyMask === 'string');
  });

  it('LOG_PERSIST off => 不落盘', () => {
    const f = path.join(tmpHome, '.llm-workbench', 'logs.ndjson');
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
    const prev = process.env.LOG_PERSIST;
    process.env.LOG_PERSIST = '0';
    rec({ requestId: 'req-x' });
    process.env.LOG_PERSIST = prev;
    assert.ok(!fs.existsSync(f), 'LOG_PERSIST=0 时不应落盘');
  });

  it('loadPersistedLogs returns newest-first and applies filters', () => {
    rec({ provider: 'a', requestId: 'r1' });
    rec({ provider: 'b', requestId: 'r2', status: 500, error: 'boom' });
    const all = metrics.loadPersistedLogs();
    assert.equal(all.length, 2);
    assert.equal(all[0].requestId, 'r2', '最新在前');
    assert.equal(metrics.loadPersistedLogs({ status: 'error' }).length, 1);
    assert.equal(metrics.loadPersistedLogs({ provider: 'a' }).length, 1);
  });

  it('persistedLogsAvailable reflects file existence', () => {
    assert.equal(metrics.persistedLogsAvailable(), false); // afterEach 已清文件
    rec({ requestId: 'r-avail' });
    assert.equal(metrics.persistedLogsAvailable(), true);
  });

  it('maskKey masks all but last 4 chars', () => {
    assert.equal(metrics.maskKey('sk-1234567890abcd'), '****abcd');
    assert.equal(metrics.maskKey(''), null);
    assert.equal(metrics.maskKey(null), null);
    assert.equal(metrics.maskKey('abc'), '****');
  });
});
