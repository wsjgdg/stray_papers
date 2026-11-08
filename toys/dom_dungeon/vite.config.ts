import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 独立构建配置（脱离 VibeX / RunningHub 环境）。
// 原 rhSourcePlugin（RunningHub 可视化编辑运行时）与 allowedHosts 的域名白名单
// 已移除，现在可在 localhost、内网 IP、任意静态托管或反向代理后正常访问。

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8000,
    strictPort: true,
    // 允许任意 Host 头，避免部署到不同域名 / 代理后报 403。
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 8000,
    allowedHosts: true,
  },
})
