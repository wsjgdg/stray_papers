import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import FloatingStats from './components/FloatingStats';
import './index.css';

const container = document.getElementById('root')!;

// 独立浮窗模式：仅渲染实时统计组件，作为可独立存在的小窗口（关闭主窗口后仍显示）
// 在 Electron 内该窗口是 transparent 窗口，必须让页面背景透明，只留卡片自身底色，
// 否则不透明的 bg-base 会铺满窗口，导致「打开是黑屏」。
const electronApi = (window as unknown as { electron?: { isElectron?: boolean } }).electron;
const isElectron = !!electronApi?.isElectron;

// 轻量错误边界：任何渲染期异常都展示可读报错，而不是 silently 黑屏（Electron 透明窗口尤易误判为黑屏）。
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
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
        <div className="fixed inset-0 z-[9999] overflow-auto bg-[#1a0d0d] p-4 text-[12px] text-[#ff9b9b]">
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

if (window.location.pathname === '/float') {
  if (isElectron) {
    // 透明窗口：提前把 html/body 置透明，避免首帧深色闪烁
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }
  createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <div className={'min-h-screen p-3 ' + (isElectron ? 'bg-transparent' : 'bg-base')}>
          <FloatingStats standalone />
        </div>
      </ErrorBoundary>
    </React.StrictMode>,
  );
} else {
  createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
