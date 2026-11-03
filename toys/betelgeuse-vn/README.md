# Betelgeuse Still Shines / 参宿四还亮着

An original Chinese-language visual novel built on a custom zero-dependency
web VN engine. Sci-fi suspense: a late-night observatory, an email scheduled
three years ago by a missing friend, and an AI's question about whether a
memory backup is still the same person.

**Play now**: open `betelgeuse-vn.html` in any browser — fully
self-contained, ~72 KB, no server or network needed.

## Story

- 20 scenes, ~190 dialogue lines, 10–15 minute playthrough
- 3 endings (good / bad / true) driven by two choice points and flags
- The true ending requires connecting two separate clues — an early email
  detail pays off in the finale
- 100% completion reward: with all endings collected the title screen
  runs the finale_star scene and thanks the player
- Credits roll after each ending (18s, click/space skips), landing on a
  「参宿四还亮着」 signature before returning to the title
- 4 characters, 7 pure-CSS backgrounds (observatory night, server room,
  rainy street, inbox, memory flashback...)

## Engine features

- Typewriter text with 3 speed settings, auto mode (with a decorative
  progress line along the dialog's bottom edge, `aria-hidden`)
- Settings panel: master volume + auto-advance delay sliders, persisted
- Branching scenes with flags, choices, conditional gates
- SVG bust portraits per character × expression (focus/dim states)
- Animated background dioramas: parallax star field with shooting stars,
  dual-layer rain + neon pulse, blinking server racks, memory light leaks;
  adaptive canvas quality (sustained slow frames drop render DPR to 1)
- Line-level cinematography fx: `fx:"glitch"`, `fx:"shake"`, `fx:"dolly"`
  (camera push-in + synthesized swell), `fx:"grade"` (scene color grade)
- Cinematic layers: vignette, film grain, dip-to-black scene transitions,
  glitch text FX, screen shake, dolly zoom (`fx: "dolly"` — bg push-in +
  focus sprite lean + one-step soften, paired with a synthesized sub-drop
  swell cue), breathing sprites
- Directional sprite staging: characters slide in from (and exit toward)
  their own side of the screen
- Fully synthesized audio (no audio files): ambient bed per scene (rain,
  wind + crickets, server hum, pads, birdsong), typewriter ticks, UI
  sounds; toggle in the top bar, preference persisted. One-shot events are
  scheduled with a Web Audio-clock lookahead scheduler (25ms timer, 0.1s
  ahead of `ctx.currentTime`) for jitter-free timing.
- 3 save slots (localStorage) + full backlog history
- Skip mode: topbar toggle or hold `S` — steps lines at ~12/s, stops
  itself at choices and endings, mutually exclusive with auto mode
- Keyboard: Space/Enter advance, `S` hold-to-skip, Esc closes overlays
- Honors `prefers-reduced-motion` (all animation goes static)

## Files

| File | Role |
|---|---|
| `engine.js` | VN runtime (vanilla JS, exposes `VN.start(scenario)`) |
| `scenario.js` | The story as pure data (`window.SCENARIO`), incl. animated CSS diorama scenes |
| `art.js` | `window.CHAR_ART`: 20 SVG bust portraits (4 characters × 5 expressions) |
| `scenes_a.js` / `scenes_b.js` | `window.VN_SCENES`: 7 Canvas particle-scene renderers |
| `audio.js` | `window.VN_AUDIO`: zero-asset Web Audio synth — per-scene ambient beds, typewriter ticks, UI sounds; toggle persisted |
| `style.css` | Cinematic dark theme: vignette, film grain, glitch/shake FX, glass UI |
| `index.html` | Dev shell (loads the files above) |
| `build.py` | Inlines everything into `betelgeuse-vn.html` |
| `betelgeuse-vn.html` | Built standalone artifact (~124 KB) — the playable game |

## Rebuild

```bash
python build.py    # after editing scenario.js / engine.js / style.css
```

## Write your own story

Copy `scenario.js` and edit the `SCENARIO` data structure — scenes, lines,
choices, flags. No engine changes needed. Scene format:

```js
sceneId: {
  bg: "bgId",                                  // optional, persists
  enter: ["flag"],                             // optional flags on entry
  branch: [{ when: "flag", goto: "sceneId" }], // optional gate before lines
  lines: [
    { who: "charId", text: "...", feel: "happy" },
    { narr: "..." }
  ],
  choices: [{ text: "...", goto: "sceneId", set: ["flag"] }],
  next: "sceneId"                              // omit for an ending
}
```
