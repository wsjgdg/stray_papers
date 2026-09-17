import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-budget-persistence-'));
  vi.stubEnv('LLM_WORKBENCH_HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('HOME', home);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

const budget = { dailyUsd: 12, monthlyUsd: 240, blockOnExceed: true };

describe('budget persistence', () => {
  it('restores budget from plaintext config after module reload', async () => {
    let config = await import('../server/config.js');
    config.initConfigStore();
    config.setBudget(budget);
    vi.resetModules();
    config = await import('../server/config.js');
    config.initConfigStore();
    expect(config.getBudget()).toEqual(budget);
  });

  it('restores budget after encrypted config reload and unlock', async () => {
    let config = await import('../server/config.js');
    config.initConfigStore();
    config.setBudget(budget);
    expect(config.enableEncryption('test-budget-passphrase')).toBe(true);
    vi.resetModules();
    config = await import('../server/config.js');
    config.initConfigStore();
    expect(config.getBudget().dailyUsd).toBeNull();
    expect(config.unlock('test-budget-passphrase')).toBe(true);
    expect(config.getBudget()).toEqual(budget);
  });
});
