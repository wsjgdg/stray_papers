import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/lib/**',
        'server/config.ts',
        'server/crypto.ts',
        'server/metrics.ts',
        'server/responseCache.ts',
        'server/match.ts',
        'server/pricing.ts',
        'server/translate.ts',
      ],
    },
  },
});
