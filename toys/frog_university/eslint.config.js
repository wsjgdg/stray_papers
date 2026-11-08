import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // _vibex-export-backup 是改造前 VibeX 平台文件的存档，docs/renpy 是 Ren'Py 生成物——都不是本项目源码
  globalIgnores(['dist', '_vibex-export-backup', 'docs/renpy']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // 正文是中文，文案里大量用全角空格 U+3000 做排版留白（如「……　下一句」），是刻意用法而非笔误。
      // skipJSXText 覆盖 JSX 文本节点里的留白，skipStrings/Templates/RegExps/Comments 覆盖脚本侧。
      'no-irregular-whitespace': [
        'error',
        {
          skipStrings: true,
          skipTemplates: true,
          skipRegExps: true,
          skipComments: true,
          skipJSXText: true,
        },
      ],

      /* ── 以下规则为存量降级，不是「这些代码有 bug」 ──
       *
       * 2026-10 脱 VibeX 平台化时，eslint-plugin-react-hooks 升到 v7，带来了一整批
       * React Compiler 系规则（set-state-in-effect / purity / refs / immutability /
       * static-components / preserve-manual-memoization）。本项目的 280 个源文件写在
       * 这些规则出现之前，全部按 React 18 时代的写法组织——它们能正常工作、tsc 与
       * 浏览器冒烟都通过，但新规则会逐条报警。
       *
       * 逐个改成 Compiler 推荐写法是一次覆盖 2000+ 行的行为重构，风险远大于本次
       * 脱平台化的目标，且与本次改动无关。故统一降为 warn：`pnpm lint` 保持可用、
       * 输出保留作为重构清单，但不阻塞构建与发布。
       * 真要清理时按文件逐个来，不要一次性批量改——usePlay.ts 一处就有 25 条。
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // 同理：Logic/View 分层的页面 hook 常把纯函数与 hook 放同一文件导出，
      // react-refresh 的这条规则是给「只导出组件」的文件写的，与本项目分层约定冲突。
      'react-refresh/only-export-components': 'warn',
    },
  },
])
