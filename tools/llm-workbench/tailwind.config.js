/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // D3：语义色全部指向 index.css 里的 CSS 变量，深/浅主题由 :root / [data-theme='light'] 提供。
      // 这样既有工具类（bg-panel / text-ink / border-edge …）无需逐个改组件即自动跟随主题。
      colors: {
        base: 'rgb(var(--c-base-rgb) / <alpha-value>)',
        panel: 'rgb(var(--c-panel-rgb) / <alpha-value>)',
        raised: 'rgb(var(--c-raised-rgb) / <alpha-value>)',
        sunken: 'rgb(var(--c-sunken-rgb) / <alpha-value>)',
        btn: 'rgb(var(--c-btn-rgb) / <alpha-value>)',
        hover: 'rgb(var(--c-hover-rgb) / <alpha-value>)',
        edge: 'rgb(var(--c-edge-rgb) / <alpha-value>)',
        line: 'rgb(var(--c-line-rgb) / <alpha-value>)',
        ink: 'rgb(var(--c-ink-rgb) / <alpha-value>)',
        muted: 'rgb(var(--c-muted-rgb) / <alpha-value>)',
        accent: 'rgb(var(--c-accent-rgb) / <alpha-value>)',
        up: 'rgb(var(--c-up-rgb) / <alpha-value>)',
        down: 'rgb(var(--c-down-rgb) / <alpha-value>)',
        warn: 'rgb(var(--c-warn-rgb) / <alpha-value>)',
        grid: 'rgb(var(--c-grid-rgb) / <alpha-value>)',
        axis: 'rgb(var(--c-axis-rgb) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'Menlo', 'monospace'],
      },
      keyframes: {
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
      },
      animation: { pulseDot: 'pulseDot 1.4s ease-in-out infinite' },
    },
  },
  plugins: [],
};
