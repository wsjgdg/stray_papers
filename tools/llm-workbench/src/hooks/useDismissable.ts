import { useEffect } from 'react';

/**
 * 弹层通用关闭行为：Esc 关闭（active=false 时挂起，如解锁门禁不允许 Esc 跳过）。
 * 点击遮罩关闭由各弹层自行处理（需阻止冒泡，避免点到内容区也关闭）。
 */
export function useDismissable(onClose: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, active]);
}
