// 右列折叠分组（从 RoverControl 拆出）：标题行点击收起/展开, 收起后只留一行细头, 长列不再滚不到底。
// 折叠状态按组经 localStorage 记忆（键 rover-group-open:<en>; 隐私模式静默降级为仅本次会话）。
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

const GROUP_MEM_PREFIX = "rover-group-open:";

function readGroupOpen(en: string): boolean {
  try {
    return window.localStorage.getItem(GROUP_MEM_PREFIX + en) !== "0";
  } catch {
    return true;
  }
}

function writeGroupOpen(en: string, open: boolean) {
  try {
    window.localStorage.setItem(GROUP_MEM_PREFIX + en, open ? "1" : "0");
  } catch {
    // 存储不可用时仅本次会话生效
  }
}

export function ColumnGroup({ title, en, badge, badgeWarn, badgeTitle, children }: { title: string; en: string; badge?: string; badgeWarn?: boolean; badgeTitle?: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => readGroupOpen(en));
  const toggleGroup = () => {
    const next = !open;
    writeGroupOpen(en, next);
    setOpen(next);
  };
  return (
    <div>
      <button
        type="button"
        onClick={toggleGroup}
        aria-expanded={open}
        aria-label={`${open ? "收起" : "展开"}${title}面板组`}
        title={open ? `收起${title}面板` : `展开${title}面板`}
        className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-1.5 shadow-sm transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
      >
        <span className="font-mono text-[10px] font-bold tracking-widest text-primary">
          {title} <span className="ml-1 font-normal text-muted-foreground">{en}</span>
          {badge && (
            <span
              title={badgeTitle}
              className={`ml-2 rounded-full border px-1.5 py-px font-normal tabular-nums ${
                badgeWarn
                  ? "border-destructive/60 bg-destructive/10 text-destructive"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              {badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${open ? "" : "-rotate-90"}`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="mt-2 flex flex-col gap-3">{children}</div>}
    </div>
  );
}
