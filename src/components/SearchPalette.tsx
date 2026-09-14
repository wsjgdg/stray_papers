import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useDismissable } from '../hooks/useDismissable';

// 全局命令面板（Cmd/Ctrl+K）：在全部模型中模糊检索，选中后跳转到「模型库」并聚焦对应行。
export function SearchPalette({
  models,
  onClose,
  onPick,
}: {
  models: { id: string; name: string; vendorLabel: string }[];
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  // D6：焦点陷阱。命令面板是「输入框即入口」，所以容器本身不可聚焦，由 input 先拿到焦点
  const panelRef = useRef<HTMLDivElement>(null);

  useDismissable(onClose, true, panelRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const term = q.trim().toLowerCase();
  const matches = term
    ? models
        .filter((m) => m.name.toLowerCase().includes(term) || m.id.toLowerCase().includes(term))
        .slice(0, 8)
    : models.slice(0, 8);

  // 检索词变化后重置高亮项；高亮项变更时滚动到可视区域
  useEffect(() => {
    setActive(0);
  }, [term]);
  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const move = (delta: number) => {
    if (matches.length === 0) return;
    setActive((cur) => {
      const next = cur + delta;
      if (next < 0) return matches.length - 1;
      if (next >= matches.length) return 0;
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="搜索模型"
    >
      <div
        ref={panelRef}
        className="w-[420px] overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-edge px-3 py-2.5">
          <Search size={15} className="text-muted" />
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            placeholder="搜索模型名 / ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                move(1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                move(-1);
              } else if (e.key === 'Enter') {
                const hit = matches[active];
                if (hit) onPick(hit.id);
              }
            }}
          />
          <span className="rounded bg-sunken px-1.5 py-0.5 text-[10px] text-muted">ESC</span>
        </div>
        <ul className="max-h-[50vh] overflow-auto overscroll-contain py-1">
          {matches.length === 0 && <li className="px-4 py-3 text-xs text-muted">无匹配模型</li>}
          {matches.map((m, i) => (
            <li
              key={m.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
            >
              <button
                className={
                  'flex w-full items-center justify-between gap-2 px-4 py-2 text-left ' +
                  (i === active ? 'bg-accent/15' : 'hover:bg-hover')
                }
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(m.id)}
              >
                <span className="min-w-0 truncate text-xs text-ink">{m.name}</span>
                <span className="shrink-0 truncate text-[11px] text-muted">{m.vendorLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
