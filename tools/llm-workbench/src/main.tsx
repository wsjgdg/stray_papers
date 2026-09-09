import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import FloatingStats from './components/floating/FloatingStats';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const container = document.getElementById('root')!;

// 独立浮窗模式：仅渲染实时统计组件，作为可独立存在的小窗口（关闭主窗口后仍显示）
// 在 Electron 内该窗口是 transparent 窗口，必须让页面背景透明，只留卡片自身底色，
// 否则不透明的 bg-base 会铺满窗口，导致「打开是黑屏」。
const electronApi = window.electron;
const isElectron = !!electronApi?.isElectron;

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
