import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// B12：数据目录统一。验证 configDir() 解析与迁移幂等，不触碰真实 home。
describe('config data dir (B12)', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-cfg-'));
  beforeAll(() => {
    vi.resetModules();
    process.env.LLM_WORKBENCH_HOME = target;
  });
  afterAll(() => {
    delete process.env.LLM_WORKBENCH_HOME;
    fs.rmSync(target, { recursive: true, force: true });
    vi.resetModules();
  });

  it('configDir() resolves LLM_WORKBENCH_HOME when set', async () => {
    const cfg = await import('../server/config.ts');
    expect(cfg.configDir()).toBe(path.resolve(target));
  });

  it('migration is idempotent (second call is a no-op, marker recorded)', async () => {
    const cfg = await import('../server/config.ts');
    const r1 = cfg.migrateLegacyDataDir();
    const r2 = cfg.migrateLegacyDataDir();
    expect(r2.migrated).toBe(false); // 标记已存在 → 幂等
    expect(fs.existsSync(path.join(target, '.migrated-from-legacy'))).toBe(true);
    expect(typeof r1.to).toBe('string');
  });
});
