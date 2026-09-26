// 独立运行配置（脱离 VibeX / RunningHub 平台）。
// 仅保留 React 插件 + 路径别名；移除了平台专属的 rhSourcePlugin（视觉编辑注入）
// 与 allowedHosts 白名单（会阻止 localhost / 自定义域名），以便本机或任意域名部署。

import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8000,
    // 不强制占用：若 8000 被占用，Vite 会自行顺延端口；
    // 启动脚本 start.ps1 也会在启动前探测空闲端口并显式指定 --port。
    strictPort: false,
  },
  preview: {
    host: '0.0.0.0',
    port: 8000,
    strictPort: false,
  },
})
