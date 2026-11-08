import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: false,
  },
  build: {
    /* 剧本数据全量打进主 chunk 收益不大，按路由拆页已足够；这里只留体积提示线 */
    chunkSizeWarningLimit: 1200,
  },
})
