// The page is one 9 600-line module with no build step, so nothing ever checks it but the browser. This is the
// smallest set of rules that would have caught the mistakes that actually cost a build: a name that does not
// exist (`ReferenceError` in `updateBell`, which the walking test never reached), a duplicated key in an object
// literal (the second one silently wins), code after a `return`, and a comparison that can never be true.
//
// Deliberately not enabled: unused variables (a bench-visible field is often kept on purpose), formatting (there
// is no formatter and no argument about it), and anything about `var` or `prefer-const`.
export default [
  // The bench runs under node, so it gets node's globals; the page does not, and giving it `process` would hide
  // a real mistake (the page reaching for something only the bench has).
  {
    files: ['*.mjs'],
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly', URL: 'readonly', console: 'readonly' } }
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // The browser's own, as the page reaches for them bare.
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
        performance: 'readonly', console: 'readonly', globalThis: 'readonly',
        innerWidth: 'readonly', innerHeight: 'readonly', devicePixelRatio: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        matchMedia: 'readonly', getComputedStyle: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
        Image: 'readonly', Audio: 'readonly', AudioContext: 'readonly', webkitAudioContext: 'readonly',
        HTMLElement: 'readonly', Element: 'readonly', Node: 'readonly', DOMPoint: 'readonly',
        ResizeObserver: 'readonly', IntersectionObserver: 'readonly', MutationObserver: 'readonly',
        PointerEvent: 'readonly', KeyboardEvent: 'readonly', WheelEvent: 'readonly', Event: 'readonly',
        WebGL2RenderingContext: 'readonly', WebGLRenderingContext: 'readonly', OffscreenCanvas: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly', TextDecoder: 'readonly', TextEncoder: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-cond-assign': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-const-assign': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-obj-calls': 'error',
      'no-sparse-arrays': 'error',
      'no-compare-neg-zero': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-async-promise-executor': 'error',
      'no-misleading-character-class': 'error',
      'require-yield': 'error',
      'no-constant-binary-expression': 'error',
      'no-sequences': 'error',
      'no-unused-private-class-members': 'error'
    }
  }
];
