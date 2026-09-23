import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The project's postcss.config.mjs uses a Tailwind v4 string plugin that Vite's
  // PostCSS loader cannot parse; math tests need no CSS, so override with empty plugins.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
