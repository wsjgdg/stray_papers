import { Component, type ErrorInfo, type ReactNode } from "react";

// 全局错误兜底：任何一个界面组件抛异常时不再白屏，给出中文提示 + 一键刷新恢复。
// 刷新即恢复的原因：本应用的画布/存档/设置全部有本地持久，重载不丢用户内容。
type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 生产环境无平台调试层时，把错误留在控制台方便用户截图反馈
    console.error("[滚动乐团] 界面异常：", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center font-mono text-foreground">
        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        <h1 className="text-xl font-bold">演出中断了一下</h1>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          界面遇到了意外问题。你的画布、存档、谱架和设置都保存在本地，刷新一下就能继续演奏。
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="border border-primary bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
        >
          刷新继续
        </button>
        <p className="max-w-sm truncate text-[10px] text-muted-foreground" title={String(error?.message ?? error)}>
          {String(error?.message ?? error)}
        </p>
      </div>
    );
  }
}
