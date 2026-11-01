# VOLTA-8 · Web Audio Groovebox

A fully client-side, playable groovebox built with React 19 + Vite 7 + Tailwind 4 and the Web Audio API. No backend, no samples — all eight voices are synthesised in real time.

## Features

- **8 synthesised voices** — KICK, SNARE, CLAP, CL HAT, OP HAT, TOM, BASS, STAB (melodic), each with editable synth parameters via knobs.
- **16-step sequencer** with per-step velocity/accent, mute, and live tweaking while the transport runs.
- **Pattern banks & chaining** — multiple banks with roles, chain them for song-length arrangements.
- **Harmony panel** — scales, degrees and octave control for the melodic voices.
- **Presets & randomizer** — built-in presets plus a dice roll for instant inspiration.
- **Export**:
  - loop → WAV
  - stems → ZIP
  - live performance → WebM recording
  - project → JSON (save / load)
- **Share links** — the full state is encoded into the URL hash (`#p=...`), so a link restores the entire pattern.
- **Autosave** — current state persists to `localStorage` (`volta8.pattern.v1`).
- Keyboard playable (Q/W/E/R/T… for drums, U… for melodic voices), undo/redo, built-in help dialog.

## Getting started

```bash
npm install
npm run dev      # dev server (Vite)
npm run build    # production build → dist/index.html (single file)
npm run preview  # preview the production build
```

Requires Node.js 20+. The production build is a **single self-contained HTML file** (`vite-plugin-singlefile`), so `dist/index.html` can be opened directly or dropped on any static host.

> **Note:** this project uses Tailwind v4 via the `@tailwindcss/vite` plugin — there is **no** `postcss.config.mjs` / `tailwind.config.ts` in this project, and it must not inherit one from a parent directory. `vite.config.ts` intentionally pins `css.postcss: {}` to block upward config-file resolution.

## Smoke test

After a build, run the headless smoke suite (jsdom + fake Web Audio, 97 checks):

```bash
npm run build
node smoke.mjs
```

## Project structure

```
src/
  audio/        Engine, synthesis voices, sequencer model, WAV/ZIP renderers
  components/   Sequencer, Harmony, Knob, Scope, ProjectModal, Shell UI
  App.tsx       Transport, state management, keyboard handling
  main.tsx      Entry point
smoke.mjs       Headless smoke test (jsdom, fake AudioContext)
```

## Tech stack

React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS 4 · Web Audio API · lucide-react
