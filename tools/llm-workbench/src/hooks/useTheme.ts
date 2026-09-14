import { useCallback, useEffect, useState } from 'react';

// D3：亮/暗主题。
// 优先级：用户显式选择（localStorage）> Electron nativeTheme（getTheme + onThemeChange）> 系统 prefers-color-scheme。
// 生效方式：把 resolved 写到 <html data-theme>，CSS 变量随之切换（见 src/index.css）。
export type ThemeMode = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'wb-theme';

function systemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Electron 主进程的主题（同步 IPC 拿一次，之后靠 onThemeChange 推送）；非 Electron 返回 null */
function electronTheme(): 'dark' | 'light' | null {
  try {
    const t = window.electron?.getTheme?.();
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch {
    /* 隐私模式等 */
  }
  return 'system';
}

export function useTheme(): {
  mode: ThemeMode;
  resolved: 'dark' | 'light';
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
} {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  // 系统兜底值要跟随 onThemeChange / matchMedia 更新
  const [fallback, setFallback] = useState<'dark' | 'light'>(
    () => electronTheme() ?? systemTheme(),
  );

  // Electron 主题变化（窗口在主进程侧，无法用 matchMedia 感知用户改系统设置）
  useEffect(() => {
    const off = window.electron?.onThemeChange?.((t) => {
      if (t === 'light' || t === 'dark') setFallback(t);
    });
    return () => {
      if (typeof off === 'function') (off as () => void)();
    };
  }, []);

  // 浏览器 / dev 环境：系统主题变化
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => setFallback(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolved: 'dark' | 'light' = mode === 'system' ? fallback : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* 忽略写入失败（仅影响持久化） */
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  return { mode, resolved, setMode, toggle };
}
