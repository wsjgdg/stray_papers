import { describe, it, expect } from 'vitest';
import { parseStoredColumns } from '../src/hooks/useColumnPrefs';

// D5：列显隐存档解析。存的是「可见列 key 数组」，所以解析要做到：
// 非法输入回退 null（= 全部可见）、过滤已不存在的列、空数组回退 null（至少留一列）。

const ALL = ['name', 'vendor', 'context', 'price'];

describe('parseStoredColumns', () => {
  it('无存档返回 null（视为全部可见）', () => {
    expect(parseStoredColumns(null, ALL)).toBeNull();
    expect(parseStoredColumns('', ALL)).toBeNull();
  });

  it('正常存档按原样返回', () => {
    expect(parseStoredColumns(JSON.stringify(['name', 'price']), ALL)).toEqual(['name', 'price']);
  });

  it('损坏 JSON 回退 null，不抛异常', () => {
    expect(parseStoredColumns('{not json', ALL)).toBeNull();
    expect(parseStoredColumns('"a string"', ALL)).toBeNull();
    expect(parseStoredColumns('{"a":1}', ALL)).toBeNull();
  });

  it('过滤掉已不存在的列 key（列定义调整后旧存档不炸）', () => {
    expect(parseStoredColumns(JSON.stringify(['name', 'removed', 'vendor']), ALL)).toEqual([
      'name',
      'vendor',
    ]);
  });

  it('非字符串元素被丢弃', () => {
    expect(parseStoredColumns(JSON.stringify(['name', 42, null, 'price']), ALL)).toEqual([
      'name',
      'price',
    ]);
  });

  it('空数组或全被过滤 → null（不允许零列）', () => {
    expect(parseStoredColumns(JSON.stringify([]), ALL)).toBeNull();
    expect(parseStoredColumns(JSON.stringify(['gone', 'also-gone']), ALL)).toBeNull();
  });

  it('重复 key 保留但不报错（useColumnPrefs 内部按定义顺序去重）', () => {
    expect(parseStoredColumns(JSON.stringify(['name', 'name']), ALL)).toEqual(['name', 'name']);
  });
});
