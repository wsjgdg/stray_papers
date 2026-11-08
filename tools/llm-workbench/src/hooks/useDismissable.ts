import { useEffect, useRef, type RefObject } from 'react';

/** 弹层内可聚焦元素的通用选择器（排除 disabled / 负 tabindex） */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 取容器内当前可聚焦的元素（按 DOM 顺序，过滤不可见的） */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * D6：焦点陷阱。
 * - 激活时把焦点移入弹层（容器自己可聚焦则优先容器，避免抢到「关闭」按钮造成误触）
 * - Tab / Shift+Tab 在弹层内循环；焦点被程序移到弹层外也会被拉回
 * - 关闭后把焦点还给打开前的元素
 *
 * 与 useDismissable 分开，是因为有些弹层不能 Esc 关闭（如加密解锁门禁）但仍需要焦点约束。
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;

    const opener = document.activeElement as HTMLElement | null;
    const first = focusables(root)[0];
    (root.tabIndex >= 0 ? root : (first ?? root)).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables(root);
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const cur = document.activeElement as HTMLElement | null;
      if (!cur || !root.contains(cur)) {
        e.preventDefault();
        firstEl.focus();
        return;
      }
      if (e.shiftKey && cur === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && cur === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // 焦点归还；元素已卸载时退回 body，避免焦点丢在 document 上
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [active, ref]);
}

/**
 * 弹层通用关闭行为：
 * - Esc 关闭（active=false 时挂起，如解锁门禁不允许 Esc 跳过）
 * - 点击遮罩关闭由各弹层自行处理（需阻止冒泡，避免点到内容区也关闭）
 * - 传入 containerRef 时同时启用焦点陷阱（见 useFocusTrap）
 */
export function useDismissable(
  onClose: () => void,
  active = true,
  containerRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, active]);

  // hooks 不能在条件里调用，所以这里始终调用，用 active 控制生效。
  // fallback ref 必须稳定（useRef），否则每次渲染都换对象会让陷阱 effect 重跑并重置焦点。
  const fallbackRef = useRef<HTMLElement | null>(null);
  useFocusTrap(containerRef ?? fallbackRef, active && Boolean(containerRef));
}
