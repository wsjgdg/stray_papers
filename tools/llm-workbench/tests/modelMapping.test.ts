import { describe, expect, it } from 'vitest';
import { applyModelMapping } from '../server/forwarding.js';
import { isValidModelMapping } from '../server/config.js';

describe('applyModelMapping', () => {
  it('undefined / 空 mapping 原样透传', () => {
    expect(applyModelMapping('gpt-4o', undefined)).toBe('gpt-4o');
    expect(applyModelMapping('gpt-4o', {})).toBe('gpt-4o');
  });

  it('命中映射返回上游模型名', () => {
    expect(applyModelMapping('gpt-4o', { 'gpt-4o': 'oai-gpt-4o' })).toBe('oai-gpt-4o');
  });

  it('未命中的模型原样返回', () => {
    expect(applyModelMapping('gpt-5', { 'gpt-4o': 'oai-gpt-4o' })).toBe('gpt-5');
  });

  it('value 为空串/纯空白视为未命中', () => {
    expect(applyModelMapping('gpt-4o', { 'gpt-4o': '' })).toBe('gpt-4o');
    expect(applyModelMapping('gpt-4o', { 'gpt-4o': '   ' })).toBe('gpt-4o');
  });

  it('空 model 原样返回（不查表）', () => {
    expect(applyModelMapping('', { '': 'x' })).toBe('');
  });
});

describe('isValidModelMapping', () => {
  it('接受合法映射', () => {
    expect(isValidModelMapping({ 'gpt-4o': 'oai/gpt-4o' })).toBe(true);
    expect(isValidModelMapping({})).toBe(true);
  });

  it('拒绝空键 / 空值 / 非字符串值 / 数组 / null', () => {
    expect(isValidModelMapping({ '': 'x' })).toBe(false);
    expect(isValidModelMapping({ a: '' })).toBe(false);
    expect(isValidModelMapping({ a: '   ' })).toBe(false);
    expect(isValidModelMapping({ a: 1 })).toBe(false);
    expect(isValidModelMapping([{ a: 'b' }])).toBe(false);
    expect(isValidModelMapping(null)).toBe(false);
    expect(isValidModelMapping('x')).toBe(false);
  });
});
