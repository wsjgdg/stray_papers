/** 标题画面底部：产品一句话 + 彩蛋小字 + 批次 E 工程包导出入口（点击才动态加载导出器，不进首屏包） */
import { useState } from "react";
import { formatBytes } from "@/lib/backup";

export function HomeFooter() {
  /* 批次 E · 可迁移工程包：导出状态机 idle → busy → done/error */
  const [exportState, setExportState] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "done"; text: string } | { kind: "error"; text: string }>({ kind: "idle" });

  const handleExport = async () => {
    if (exportState.kind === "busy") return;
    setExportState({ kind: "busy" });
    try {
      const { exportRenpyProject } = await import("@/lib/renpyExport");
      const result = await exportRenpyProject();
      setExportState({ kind: "done", text: `已签发「${result.fileName}」（${formatBytes(result.bytes)}，${result.fileCount} 份文件），去下载里查收。` });
    } catch {
      setExportState({ kind: "error", text: "工程包签发失败——请重试。" });
    }
  };

  return (
    <footer className="border-t border-border bg-card/50 py-8 text-center">
      <p className="text-sm font-medium text-muted-foreground">奶蛙大学 · 一款笑着笑着突然沉默的校园游戏</p>
      <p className="mt-2 text-xs text-muted-foreground/70">本游戏不含任何真实绩点，请放心游玩</p>
      <div className="mt-3 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exportState.kind === "busy"}
          className="text-xs text-muted-foreground/70 underline decoration-dotted underline-offset-4 transition-colors duration-200 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
        >
          {exportState.kind === "busy" ? "正在整理剧本与数值……" : "导出 Ren'Py 工程包（带走剧本去自己电脑继续做）"}
        </button>
        {exportState.kind === "done" && <p className="text-xs font-bold text-primary">{exportState.text}</p>}
        {exportState.kind === "error" && <p className="text-xs font-bold text-destructive">{exportState.text}</p>}
      </div>
    </footer>
  );
}
