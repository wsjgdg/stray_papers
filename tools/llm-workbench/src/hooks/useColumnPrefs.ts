import { useCallback, useMemo, useState } from 'react';

// D5：表格列显隐配置持久化到 localStorage，与既有的排序持久化（modeltable.sort）互不干扰。
//
// 存的是「可见列 key 数组」而不是「隐藏列」：这样以后新增列默认可见（不会因为旧存档里
// 没有它而被误判为隐藏），更符合预期。
//
// 约束：至少保留 1 列可见——全隐藏的表格没有意义，toggle 时直接拒绝最后一个。

export interface ColumnPrefs {
  /** 可见列 key（按定义顺序返回，不是存档顺序） */
  visible: string[];
  /** 某列当前是否可见 */
  isVisible: (key: string) => boolean;
  /** 切换某列；若会导致一列都不剩则忽略 */
  toggle: (key: string) => void;
  /** 恢复为全部列可见（并清掉存档） */
  reset: () => void;
  /** 是否处于默认状态（全部可见） */
  isDefault: boolean;
}

/** 解析存档：只接受字符串数组，且过滤掉已不存在的列 key */
export function parseStoredColumns(
  raw: string | null,
  allKeys: readonly string[],
): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return null;
    const kept = v.filter((x): x is string => typeof x === 'string' && allKeys.includes(x));
    return kept.length > 0 ? kept : null;
  } catch {
    return null;
  }
}

export function useColumnPrefs(storageKey: string, allKeys: readonly string[]): ColumnPrefs {
  const [hidden, setHidden] = useState<string[]>(() => {
    if (typeof localStorage === 'undefined') return [];
    const kept = parseStoredColumns(localStorage.getItem(storageKey), allKeys);
    if (!kept) return [];
    return allKeys.filter((k) => !kept.includes(k));
  });

  const visible = useMemo(() => allKeys.filter((k) => !hidden.includes(k)), [allKeys, hidden]);

  const persist = useCallback(
    (nextHidden: string[]) => {
      try {
        if (nextHidden.length === 0) localStorage.removeItem(storageKey);
        else
          localStorage.setItem(
            storageKey,
            JSON.stringify(allKeys.filter((k) => !nextHidden.includes(k))),
          );
      } catch {
        /* 持久化失败不影响交互 */
      }
    },
    [storageKey, allKeys],
  );

  const toggle = useCallback(
    (key: string) => {
      setHidden((prev) => {
        const isHidden = prev.includes(key);
        // 拒绝隐藏最后一列
        if (!isHidden && prev.length >= allKeys.length - 1) return prev;
        const next = isHidden ? prev.filter((k) => k !== key) : [...prev, key];
        persist(next);
        return next;
      });
    },
    [allKeys, persist],
  );

  const reset = useCallback(() => {
    setHidden([]);
    persist([]);
  }, [persist]);

  return {
    visible,
    isVisible: (key: string) => !hidden.includes(key),
    toggle,
    reset,
    isDefault: hidden.length === 0,
  };
}
