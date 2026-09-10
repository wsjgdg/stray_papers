import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.API_PORT || 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 路由级代码分割：react/react-dom 与 recharts 抽成稳定 vendor/charts chunk，
        // 配合 App.tsx 的 React.lazy，首屏只需加载入口 + 概览页，其余 tab 按需加载。
        // 用函数形式精确匹配包路径（对象形式无法命中 react-dom/client 等子路径）。
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              /[\\/]node_modules[\\/](recharts|d3-|victory|internmap|decimal\.js|uid)[\\/]/.test(id)
            )
              return 'charts';
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
