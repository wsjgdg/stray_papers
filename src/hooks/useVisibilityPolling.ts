import { useEffect, useRef } from 'react';

// 页面隐藏时暂停轮询；可见性恢复时立即补一次。
// fn 通过 ref 持有最新闭包，避免 setInterval 捕获过期函数。
export function useVisibilityPolling(intervalMs: number, fn: () => void, deps: unknown[] = []) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      fnRef.current();
    };
    tick();
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (!document.hidden) fnRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
