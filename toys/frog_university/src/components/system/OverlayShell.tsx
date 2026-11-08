/**
 * 系统层弹层外壳（存读档 / 设置 / 回想共用）：
 * 遮罩点击关闭 + Esc 关闭最上层 overlay + 打开期间锁背景滚动。
 */
import { useEffect, type ReactNode } from "react";
import { clsx } from "clsx";
import { RichText } from "@/components/common/RichText";

interface OverlayShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** 弹层宽度（Tailwind max-w-* 类） */
  sizeClass?: string;
}

export function OverlayShell({
  title,
  subtitle,
  onClose,
  children,
  sizeClass = "max-w-2xl",
}: OverlayShellProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label={title}
        className={clsx(
          "anim-fade-up flex max-h-[86dvh] w-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl",
          sizeClass,
        )}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-dashed border-border px-5 py-4">
          <div className="min-w-0">
            {/* 系统弹层标题与图鉴柜头同档（批次 CY-83）：一次改壳，存读档/设置/回想全跟着升级 */}
            <h3 className="text-xl font-black tracking-tight text-card-foreground">{title}</h3>
            {subtitle && <RichText className="mt-1 text-xs leading-relaxed text-muted-foreground" text={subtitle} />}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`关闭${title}`}
            className="shrink-0 rounded-full bg-muted px-3 py-1 text-sm font-bold text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
