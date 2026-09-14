import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

// D2：无依赖的列表窗口化（虚拟滚动）。
//
// 与「固定行高」的实现不同，这里采用「估算 + 实测」：先用 estimate 占位，渲染出来的行
// 再把真实 offsetHeight 回报进来，偏移表按实测值重算。这样可展开行这类变高场景也能用。
//
// 用法：
//   const scrollerRef = useRef<HTMLDivElement>(null);
//   const v = useVirtualList({ items, getKey: (m) => m.id, estimate: 48, scrollRef: scrollerRef });
//   <div ref={scrollerRef} className="overflow-auto">
//     {v.padTop > 0 && <div style={{ height: v.padTop }} />}
//     {v.rows.map(({ item, index }) => <Row ref={v.setSize(item.id)} … />)}
//     {v.padBottom > 0 && <div style={{ height: v.padBottom }} />}
//   </div>
//
// 注意：getKey 请用 useCallback/模块级函数保持引用稳定，否则偏移表每次渲染都会重算
// （O(n) 本身不贵，但会白白丢掉 memo 收益）。

export interface VirtualRow<T> {
  item: T;
  index: number;
}

export interface UseVirtualList<T> {
  /** 当前应渲染的行（已含 overscan） */
  rows: VirtualRow<T>[];
  /** 首行之前留白高度（px） */
  padTop: number;
  /** 末行之后留白高度（px） */
  padBottom: number;
  /** 全表高度（px） */
  totalSize: number;
  /** 滚到第 index 行（align 默认居中） */
  scrollToIndex: (index: number, align?: 'start' | 'center') => void;
  /** ref 回调工厂：挂到行元素上，回报实测高度 */
  setSize: (key: string) => (el: HTMLElement | null) => void;
  /** 直接回报某个 key 的高度（变高行需要自己算合计高度时用） */
  reportSize: (key: string, height: number) => void;
  /** 已实测高度的行数 / 总行数（调试与测试用） */
  measured: number;
}

/**
 * 由前缀和偏移表求出可视区间（纯函数，便于单测）。
 * offsets 长度为 n+1，offsets[i] 是第 i 行的起点，offsets[n] 是总高。
 * 返回 [start, end) —— 已含 overscan，并已裁剪到 [0, n]。
 */
export function findVisibleRange(
  offsets: number[],
  top: number,
  height: number,
  overscan = 6,
): { start: number; end: number } {
  const n = Math.max(0, offsets.length - 1);
  if (n === 0) return { start: 0, end: 0 };
  const h = height > 0 ? height : 600;
  const t = Math.max(0, top);
  // 二分：找第一个「底边 > t」的行
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= t) lo = mid + 1;
    else hi = mid;
  }
  const start = Math.max(0, lo - overscan);
  let end = start;
  while (end < n && offsets[end] < t + h) end++;
  return { start, end: Math.min(n, end + overscan) };
}

export function useVirtualList<T>({
  items,
  getKey,
  estimate = 48,
  overscan = 6,
  scrollRef,
}: {
  items: T[];
  getKey: (item: T, index: number) => string;
  estimate?: number;
  overscan?: number;
  scrollRef: RefObject<HTMLElement | null>;
}): UseVirtualList<T> {
  const sizes = useRef(new Map<string, number>());
  /** 实测尺寸变化时自增，驱动偏移表重算（rAF 合并，避免逐行 setState） */
  const [version, setVersion] = useState(0);
  const [viewport, setViewport] = useState<{ top: number; height: number }>({
    top: 0,
    height: 0,
  });

  const rafRef = useRef(0);
  const scheduleFlush = useCallback(() => {
    if (rafRef.current) return;
    const run = () => {
      rafRef.current = 0;
      setVersion((v) => v + 1);
    };
    if (typeof requestAnimationFrame === 'function') rafRef.current = requestAnimationFrame(run);
    else run();
  }, []);

  const reportSize = useCallback(
    (key: string, height: number) => {
      if (height > 0 && sizes.current.get(key) !== height) {
        sizes.current.set(key, height);
        scheduleFlush();
      }
    },
    [scheduleFlush],
  );

  const setSize = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (!el) return;
      reportSize(key, el.offsetHeight);
    },
    [reportSize],
  );

  // 监听滚动与容器尺寸
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      setViewport((prev) => {
        const next = { top: el.scrollTop, height: el.clientHeight };
        return prev.top === next.top && prev.height === next.height ? prev : next;
      });
    };
    const onScroll = () => {
      if (!raf) raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(read) : 0;
      if (!raf) read();
    };
    read();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    window.addEventListener('resize', read);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      window.removeEventListener('resize', read);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRef]);

  // 前缀和偏移表（读取实测尺寸，故依赖 version）
  const offsets = useMemo(() => {
    const out = new Array<number>(items.length + 1);
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      out[i] = acc;
      acc += sizes.current.get(getKey(items[i], i)) ?? estimate;
    }
    out[items.length] = acc;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, getKey, estimate, version]);

  const totalSize = offsets[items.length] ?? 0;

  const { start, end } = useMemo(
    () => findVisibleRange(offsets, viewport.top, viewport.height, overscan),
    [offsets, viewport.top, viewport.height, overscan],
  );

  const rows = useMemo<VirtualRow<T>[]>(() => {
    const out: VirtualRow<T>[] = [];
    for (let i = start; i < end; i++) out.push({ item: items[i], index: i });
    return out;
  }, [items, start, end]);

  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' = 'center') => {
      const el = scrollRef.current;
      if (!el || index < 0 || index >= items.length) return;
      const top = offsets[index] ?? 0;
      const size = sizes.current.get(getKey(items[index], index)) ?? estimate;
      const target = align === 'start' ? top : Math.max(0, top - (el.clientHeight - size) / 2);
      el.scrollTop = target;
      setViewport((prev) => (prev.top === target ? prev : { ...prev, top: target }));
    },
    [scrollRef, offsets, items, getKey, estimate],
  );

  return {
    rows,
    padTop: offsets[start] ?? 0,
    padBottom: Math.max(0, totalSize - (offsets[end] ?? 0)),
    totalSize,
    scrollToIndex,
    setSize,
    reportSize,
    measured: sizes.current.size,
  };
}
