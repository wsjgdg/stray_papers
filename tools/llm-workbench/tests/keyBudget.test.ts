import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'vitest';
import {
  addKeySpend,
  keySpendToday,
  isKeyOverBudget,
  resetKeyBudget,
} from '../server/keyBudget.js';

describe('keyBudget: 单 Key 日成本上限 (B3)', () => {
  beforeEach(() => resetKeyBudget());

  it('累加与读取', () => {
    addKeySpend('openai', '****abcd', 0.3);
    addKeySpend('openai', '****abcd', 0.2);
    assert.ok(Math.abs(keySpendToday('openai', '****abcd') - 0.5) < 1e-9);
    assert.equal(keySpendToday('openai', '****zzzz'), 0);
    assert.equal(keySpendToday('other', '****abcd'), 0);
  });

  it('isKeyOverBudget：达到上限即超限；cap<=0 恒否', () => {
    addKeySpend('p', 'k', 1.0);
    assert.equal(isKeyOverBudget('p', 'k', 1.0), true);
    assert.equal(isKeyOverBudget('p', 'k', 2.0), false);
    assert.equal(isKeyOverBudget('p', 'k', 0), false);
    assert.equal(isKeyOverBudget('p', 'k', undefined), false);
  });

  it('厂商隔离', () => {
    addKeySpend('p1', 'k', 5);
    assert.equal(isKeyOverBudget('p2', 'k', 1), false);
  });

  it('忽略非正 / 非法成本与空标识', () => {
    addKeySpend('p', 'k', 0);
    addKeySpend('p', 'k', -1);
    addKeySpend('p', 'k', Number.NaN);
    addKeySpend('p', '', 5);
    addKeySpend('', 'k', 5);
    assert.equal(keySpendToday('p', 'k'), 0);
  });
});
