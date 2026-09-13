import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/release',
      '**/out-*',
      'server/generated',
      '**/node_modules',
      '**/coverage',
      '**/electron/server.cjs',
      '**/electron/icon.png',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // TS already reports undefined identifiers; core no-undef produces false positives on Node/browser globals.
      'no-undef': 'off',
      ...reactHooks.configs.recommended.rules,
      // Legacy components (Proxy.tsx / FloatingStats.tsx, Phase 5 refactor targets) trip these heavily.
      'react-hooks/set-state-in-effect': 'warn',
      // F7：缺依赖会导致闭包过期/监听器错绑，升为 error（存量违规已清零）
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/purity': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-empty': 'warn',
      'prefer-const': 'warn',
      'no-console': 'warn',
    },
  },
);
