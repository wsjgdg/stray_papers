import { useEffect, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { useDismissable } from '../hooks/useDismissable';
import type { ColumnPrefs } from '../hooks/useColumnPrefs';

// D5：列显隐选择器（可复用）。列表页表头右侧放一个按钮，点开勾选列。
export function ColumnPicker({
  columns,
  prefs,
  label = '列',
}: {
  columns: { key: string; label: string }[];
  prefs: ColumnPrefs;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useDismissable(() => setOpen(false), open, boxRef);

  // 点外部关闭（焦点陷阱已覆盖键盘路径）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const hiddenCount = columns.length - prefs.visible.length;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className="btn btn-sm"
        aria-haspopup="true"
        aria-expanded={open}
        title="选择要显示的列（本机记住）"
        onClick={() => setOpen((v) => !v)}
      >
        <Columns3 size={12} />
        {label}
        {hiddenCount > 0 && (
          <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">
            隐藏 {hiddenCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="列显隐"
          className="absolute right-0 z-40 mt-1 w-48 rounded-lg border border-edge bg-panel p-2 shadow-xl"
        >
          <div className="mb-1 flex items-center justify-between px-1 text-[10px] uppercase tracking-wider text-muted">
            <span>显示列</span>
            <button
              type="button"
              className="text-accent hover:underline disabled:text-muted disabled:no-underline"
              disabled={prefs.isDefault}
              onClick={prefs.reset}
            >
              重置
            </button>
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto overscroll-contain">
            {columns.map((c) => {
              const checked = prefs.isVisible(c.key);
              const lastOne = checked && prefs.visible.length === 1;
              return (
                <li key={c.key}>
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-ink hover:bg-hover"
                    title={lastOne ? '至少保留一列' : undefined}
                  >
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={checked}
                      disabled={lastOne}
                      onChange={() => prefs.toggle(c.key)}
                    />
                    <span className="truncate">{c.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
