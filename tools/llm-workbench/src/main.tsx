import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import FloatingStats from './components/FloatingStats';
import './index.css';

const container = document.getElementById('root')!;

// 独立浮窗模式：仅渲染实时统计组件，作为可独立存在的小窗口（关闭主窗口后仍显示）
if (window.location.pathname === '/float') {
  createRoot(container).render(
    <React.StrictMode>
      <div className="min-h-screen bg-base p-3">
        <FloatingStats standalone />
      </div>
    </React.StrictMode>,
  );
} else {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
