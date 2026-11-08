// 阶段迁跃确认框：飞行阶段链 / 表面作业链节点点击后弹出——
// 默认「是否迁跃至「{label}」阶段？」; 事件触发/结算/重新部署等非迁跃场景用 question+confirmText 覆盖文案。
// 确认后执行跳转 / 触发, ESC 或点遮罩取消。颜色全部 token 类。
import { useEffect } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JumpConfirmDialogProps {
  /** 目标阶段中文名（渲染进默认问句「是否迁跃至「{label}」阶段？」） */
  label: string;
  /** 自定义主问句（覆盖默认迁跃问句） */
  question?: string;
  /** 确认按钮文案（默认「确认迁跃」） */
  confirmText?: string;
  /** 补充说明（主问句下方小字） */
  hint?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function JumpConfirmDialog({ label, question, confirmText, hint, onConfirm, onCancel }: JumpConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-lg border-2 border-primary/50 bg-card p-5 shadow-xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="阶段迁跃确认"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary">
            <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-bold text-card-foreground">
              {question ?? (
                <>
                  是否迁跃至「<span className="text-primary">{label}</span>」阶段？
                </>
              )}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {hint ?? "时间轴将直接跳转至该阶段, 可向前也可向后"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} className="border-border font-mono focus-visible:shadow-focus">
            取消 ESC
          </Button>
          <Button size="sm" onClick={onConfirm} className="bg-primary font-mono text-primary-foreground focus-visible:shadow-focus">
            {confirmText ?? "确认迁跃"}
          </Button>
        </div>
      </div>
    </div>
  );
}
