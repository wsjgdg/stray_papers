import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone ScrollOrchestra (formerly a VibeX/RunningHub app).
// All platform-specific build plugins (rh-visual-edit source tagging, RunningHub
// allowedHosts) have been removed — this now runs as a plain Vite + React app.
export default defineConfig({
  plugins: [react()],
  // Expose AI_* env vars to client code. No VITE_ prefix by design (standalone app).
  envPrefix: ['AI_'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 8000,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 8000,
  },
})
