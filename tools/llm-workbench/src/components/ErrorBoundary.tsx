import React from 'react';

// 轻量错误边界：任何渲染期异常都展示可读报错，而不是 silently 黑屏
// （Electron 透明窗口尤易误判为黑屏）。
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error) {
    // eslint-disable-next-line no-console
    console.error('[render-error]', err);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="fixed inset-0 z-[9999] overflow-auto bg-base p-4 text-[12px] text-up">
          <div className="mb-2 font-semibold">渲染出错（已捕获，未黑屏）</div>
          <pre className="whitespace-pre-wrap break-words">
            {String(this.state.err?.stack || this.state.err)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
