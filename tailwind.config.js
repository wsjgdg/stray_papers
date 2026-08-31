/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0b1220',
        panel: '#111a2b',
        panel2: '#16203300',
        edge: '#1f2d44',
        ink: '#e6edf3',
        muted: '#9aa7bd',
        accent: '#4da3ff',
        up: '#ef4444',
        down: '#22c55e',
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
