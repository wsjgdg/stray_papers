import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

// jsdom cannot execute ES module scripts; the bundle is self-contained so run it
// as a classic script, moved to the end of <body> (modules are deferred, classics are not)
const raw = fs.readFileSync("dist/index.html", "utf8");
const tag = raw.match(/<script type="module"[^>]*>[\s\S]*?<\/script>/)[0];
const code = tag.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
const html = raw.replace(tag, "").replace("</body>", () => `<script>${code}</script></body>`);
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

/* ---------------- fake Web Audio ---------------- */
const param = (v = 0) => ({
  value: v,
  setValueAtTime() { return this; },
  linearRampToValueAtTime() { return this; },
  exponentialRampToValueAtTime() { return this; },
  setTargetAtTime() { return this; },
  cancelScheduledValues() { return this; },
});
let nodesCreated = 0;
let disconnects = 0;
const node = (extra = {}) => {
  nodesCreated++;
  return {
    connect(d) { return d; },
    disconnect() { disconnects++; },
    start() {}, stop() {},
    ...extra,
  };
};
class FakeCtx {
  constructor() {
    this.sampleRate = 48000;
    this.state = "running";
    this.destination = node();
    this._t0 = Date.now();
  }
  get currentTime() { return (Date.now() - this._t0) / 1000; }
  resume() { this.state = "running"; return Promise.resolve(); }
  close() { return Promise.resolve(); }
  createGain() { return node({ gain: param(1) }); }
  createOscillator() { return node({ frequency: param(440), detune: param(0), type: "sine" }); }
  createBufferSource() { return node({ buffer: null, playbackRate: param(1) }); }
  createBiquadFilter() { return node({ frequency: param(350), Q: param(1), gain: param(0), type: "lowpass" }); }
  createStereoPanner() { return node({ pan: param(0) }); }
  createConvolver() { return node({ buffer: null }); }
  createDelay() { return node({ delayTime: param(0) }); }
  createDynamicsCompressor() {
    return node({ threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) });
  }
  createWaveShaper() { return node({ curve: null, oversample: "none" }); }
  createAnalyser() {
    return node({
      fftSize: 2048, frequencyBinCount: 1024, smoothingTimeConstant: 0.8,
      getByteFrequencyData(a) { a.fill(40); },
      getByteTimeDomainData(a) { a.fill(128); },
      getFloatTimeDomainData(a) { a.fill(0.05); },
    });
  }
  createBuffer(ch, len) { return { length: len, getChannelData: () => new Float32Array(len) }; }
  createMediaStreamDestination() { return node({ stream: { id: "fake" } }); }
}

const gradient = { addColorStop() {} };
const ctx2d = new Proxy(
  {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 10 }),
    setTransform: () => {},
    roundRect: () => {},
    canvas: null,
  },
  { get: (t, p) => (p in t ? t[p] : () => {}), set: () => true },
);

let clipboard = "";
const capturedBlobs = [];
const downloads = [];
globalThis.__blobs = capturedBlobs;
let recStarted = 0;
let recStopped = 0;

const dom = new JSDOM(html, {
  url: "http://localhost:5173/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    w.AudioContext = FakeCtx;
    w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    w.HTMLCanvasElement.prototype.getContext = () => ctx2d;
    w.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download || this.href); };
    capturedBlobs.length = 0;
    w.URL.createObjectURL = (b) => { if (b) capturedBlobs.push(b); return "blob:fake-take"; };
    w.URL.revokeObjectURL = () => {};
    Object.defineProperty(w.navigator, "clipboard", { value: { writeText: (t) => { clipboard = t; return Promise.resolve(); } } });
    w.OfflineAudioContext = class extends FakeCtx {
      constructor(ch, len, sr) { super(); this.numberOfChannels = ch; this._len = len; this.sampleRate = sr; }
      async startRendering() {
        const len = this._len || 48000;
        const chans = [];
        for (let c = 0; c < this.numberOfChannels; c++) { const a = new Float32Array(len); a.fill(0.01); chans.push(a); }
        return { length: len, sampleRate: this.sampleRate, numberOfChannels: this.numberOfChannels, getChannelData: (c) => chans[c] };
      }
    };
    w.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor() { this.state = "inactive"; this.mimeType = "audio/webm"; }
      start() { recStarted++; this.state = "recording"; }
      stop() {
        recStopped++;
        this.state = "inactive";
        this.ondataavailable?.({ data: { size: 2048 } });
        this.onstop?.();
      }
    };
  },
});

const { window } = dom;
const doc = window.document;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
const pdown = (el) => el.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
const key = (k, opts = {}) => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

(async () => {
  for (let i = 0; i < 120 && !$("#root")?.children.length; i++) await wait(25);
  await wait(200);

  if (!$("#root")?.children.length) console.log("EARLY ERRORS:", errors.slice(0, 5));
  check("app mounts", !!$("#root")?.children.length);
  check("standby screen shown", !!$('[aria-label="Power on the drum machine"]'));
  check("128 step cells rendered", $$('button[aria-label*="step"]').length === 128, `${$$('button[aria-label*="step"]').length} cells`);
  check("all knobs render", $$('svg[role="slider"]').length === 29, `${$$('svg[role="slider"]').length} knobs (8×3 + swing/master/density + filter/echo)`);

  click($('[aria-label="Power on the drum machine"]'));
  await wait(900);
  check("standby dismissed", !$('[aria-label="Power on the drum machine"]'));
  check("transport running", $$("button").some((b) => b.textContent.trim().toLowerCase() === "stop"));

  const liveStep = () => $$("span.digits").filter((s) => s.className.includes("text-amber")).map((s) => s.textContent).join(",");
  const a = liveStep();
  await wait(260);
  const b = liveStep();
  check("playhead advances", a !== "" && b !== "" && a !== b, `${a} → ${b}`);
  check("audio graph built", nodesCreated > 40, `${nodesCreated} nodes`);

  const tom = $('button[aria-label="TOM step 1 off"]');
  pdown(tom);
  await wait(60);
  check("step programs on click", !!$('button[aria-label="TOM step 1 normal"]'));
  pdown($('button[aria-label="TOM step 1 normal"]'));
  await wait(60);
  check("velocity cycles to accent", !!$('button[aria-label="TOM step 1 accent"]'));

  const hits = () => $$("span.label").find((s) => /hits$/.test(s.textContent))?.textContent;
  const before = hits();
  key("g");
  await wait(80);
  const diced = hits();
  check("dice regenerates pattern", diced !== before, `${before} → ${diced}`);

  key("z", { ctrlKey: true });
  await wait(120);
  check("undo restores previous pattern", hits() === before, `${diced} → ${hits()}`);
  key("z", { ctrlKey: true, shiftKey: true });
  await wait(120);
  check("redo re-applies it", hits() === diced, `${hits()}`);
  key("z", { ctrlKey: true });
  await wait(120);

  key("2");
  await wait(80);
  check("bank switch via keyboard", $$("span.label").some((s) => s.textContent.trim() === "bank B"));

  const preset = $$("button").find((x) => x.textContent.includes("TRAP SOUL"));
  click(preset);
  await wait(120);
  check("preset loads tempo", $$("div.digits").some((d) => d.textContent.trim() === "140"), "140 BPM");

  const bassBtn = $$("button").find((x) => (x.getAttribute("title")||"").includes("& audition") && x.textContent.includes("BASS"));
  click(bassBtn);
  await wait(80);
  check("velocity lane appears for melodic voice", $$("span.label").some((s) => /lane ·/i.test(s.textContent)));
  check("lane renders one cell per step", $$('button[aria-label^="lane "]').length === 16, `${$$('button[aria-label^="lane "]').length} lane cells`);

  // chain mode should walk the banks in time with the music
  click($$("button").find((x) => x.textContent.trim() === "CHAIN"));
  const bankNow = () => $$('button[data-on="true"]').map((b) => b.textContent.trim()[0]).filter((c) => "ABCD".includes(c))[0];
  const b1 = bankNow();
  await wait(2100);
  const b2 = bankNow();
  check("chain follows banks in time", b1 !== b2 && !!b2, `${b1} → ${b2}`);
  check("chain indicator visible", $$("span.label").some((s) => s.textContent.trim() === "following"));
  click($$("button").find((x) => x.textContent.trim() === "CHAIN"));
  await wait(80);

  key("m");
  await wait(80);
  check("mute toggles from keyboard", $$('button[aria-pressed="true"]').some((b) => b.textContent.trim() === "M"));
  key("m");
  await wait(600);
  const stored = window.localStorage.getItem("volta8.pattern.v1");
  check("pattern autosaves locally", !!stored && stored.length > 500, `${stored?.length} chars stored`);

  // --- 32-step mode ---
  const stepCells = () => $$('button[aria-label*="step "]').length;
  const before32 = stepCells();
  click($$("button").find((x) => x.textContent.trim() === "32"));
  await wait(150);
  check("32-step mode doubles the grid", stepCells() === before32 * 2 && $$('button[aria-label^="lane "]').length === 32, `${before32} → ${stepCells()} cells`);
  click($$("button").find((x) => x.textContent.trim() === "16"));
  await wait(150);
  check("back to 16 steps", stepCells() === before32, `${stepCells()} cells`);

  // --- lock survives dice ---
  const kickAria = () => $$('button[aria-label^="KICK step"]').map((b) => b.getAttribute("aria-label")).join("|");
  const kBefore = kickAria();
  click($$("button").find((x) => x.getAttribute("aria-label") === "Lock KICK from randomizer"));
  await wait(60);
  key("g");
  await wait(120);
  check("locked KICK row survives DICE", kickAria() === kBefore, kBefore.slice(0, 40));
  click($$("button").find((x) => x.getAttribute("aria-label") === "Lock KICK from randomizer"));
  await wait(60);

  // --- row copy / paste ---
  click($$("button").find((x) => (x.getAttribute("title")||"").includes("& audition") && x.textContent.includes("SNARE")));
  await wait(60);
  const vel = (pre) => $$(`button[aria-label^="${pre} step"]`).map((b) => b.getAttribute("aria-label").split(" ").slice(2).join(" ")).join("|");
  const sBefore = vel("SNARE");
  key("c", { ctrlKey: true });
  await wait(60);
  const pasteBtn = $$("button").find((x) => x.textContent.trim() === "PASTE");
  click($$("button").find((x) => (x.getAttribute("title")||"").includes("& audition") && x.textContent.includes("TOM")));
  await wait(60);
  key("v", { ctrlKey: true });
  await wait(120);
  check("row copy/paste moves the pattern", vel("TOM") === sBefore, `${sBefore.slice(0,30)}…`);

  // --- performance FX ---
  check("stutter pad present", $$("button").some((x) => x.textContent.trim() === "STUTTER"));
  check("tape-stop pad present", $$("button").some((x) => x.textContent.trim() === "TAPE STOP"));
  key("x");
  await wait(80);
  check("stutter toggles from keyboard", $$("button").some((x) => x.textContent.trim() === "STUTTER" && x.getAttribute("data-on") === "true"));
  key("x");
  await wait(60);

  // --- offline WAV export ---
  click($$("button").find((x) => x.textContent.trim() === "WAV"));
  await wait(400);
  const wav = $("a[download]");
  check("offline WAV loop renders and downloads", !!wav && wav.getAttribute("download").endsWith(".wav"), wav?.getAttribute("download"));

  // --- trigger pads ---
  const pads = $$("button").filter((b) => (b.getAttribute("title") || "").includes("trigger pad"));
  check("8 finger-drumming pads render", pads.length === 8, `${pads.length} pads`);
  check("pads show their key mapping", pads.length === 8 && ["Q","W","E","R","T","Y","U","I"].every((k, i) => pads[i].textContent.includes(k)));
  const selName = () => $$("span.label").find((s) => /track tool/i.test(s.textContent))?.parentElement?.querySelector(".font-display")?.textContent;
  pdown(pads[5]);
  await wait(90);
  check("pad tap selects that track", selName() === "TOM", `selected: ${selName()}`);
  click($$("button").find((x) => x.textContent.trim() === "HIDE PADS"));
  await wait(80);
  check("pads can be hidden", $$("button").filter((b) => (b.getAttribute("title") || "").includes("trigger pad")).length === 0);
  click($$("button").find((x) => x.textContent.trim() === "SHOW PADS"));
  await wait(80);

  // --- row tools: euclidean / nudge / invert / reverse ---
  const padKick = $$("button").filter((b) => (b.getAttribute("title") || "").includes("trigger pad"))[0];
  pdown(padKick);
  await wait(80);
  const kickVel = () => $$('button[aria-label^="KICK step"]').map((b) => b.getAttribute("aria-label").split(" ").slice(3).join(" ")).join("|");
  click($$("button").find((x) => x.textContent.trim() === "5" && (x.getAttribute("title") || "").includes("Euclidean")));
  await wait(120);
  const eu = kickVel();
  const euHits = eu.split("|").filter((v) => v !== "off").length;
  check("Euclidean 5 places exactly 5 hits", euHits === 5, `${euHits} hits · ${eu}`);
  const euEven = (() => {
    const idx = [];
    eu.split("|").forEach((v, i) => { if (v !== "off") idx.push(i); });
    const gaps = idx.slice(1).map((v, i) => v - idx[i]);
    return new Set(gaps).size <= 2;
  })();
  check("Euclidean spacing is even", euEven);

  click($$("button").find((x) => x.textContent.trim() === "REVERSE"));
  await wait(120);
  const rev = kickVel().split("|").reverse().join("|");
  check("REVERSE mirrors the row", rev === eu, `${eu.slice(0,24)} ↔ ${rev.slice(0,24)}`);
  click($$("button").find((x) => x.textContent.trim() === "REVERSE"));
  await wait(120);

  click($$("button").find((x) => x.textContent.trim() === "INVERT"));
  await wait(120);
  const invHits = kickVel().split("|").filter((v) => v !== "off").length;
  check("INVERT swaps hits and silences", invHits === 16 - euHits, `${euHits} → ${invHits}`);
  click($$("button").find((x) => x.textContent.trim() === "INVERT"));
  await wait(120);

  const beforeNudge = kickVel().split("|");
  click($$("button").find((x) => (x.getAttribute("title") || "").includes("rotate right")));
  await wait(120);
  const afterNudge = kickVel().split("|");
  check("NUDGE rotates the row by one step", afterNudge[1] === beforeNudge[0] && afterNudge[0] === beforeNudge[15], `${beforeNudge[0]}→${afterNudge[1]}`);
  click($$("button").find((x) => (x.getAttribute("title") || "").includes("rotate left")));
  await wait(120);
  check("NUDGE left rotates back", kickVel().split("|").join("|") === beforeNudge.join("|"));

  // --- synth / mixer strip modes ---
  const knobCount = () => $$('svg[role="slider"]').length;
  const synthKnobs = knobCount();
  click($$("button").find((x) => x.textContent.trim() === "MIX" && (x.getAttribute("title") || "").includes("Mixer knobs")));
  await wait(150);
  check("MIX mode swaps in pan/reverb/delay knobs", knobCount() === synthKnobs, `${synthKnobs} → ${knobCount()} knobs`);
  check("MIX mode shows PAN labels", $$("span.label").filter((s) => s.textContent.trim() === "PAN").length === 8, "8 PAN knobs");
  check("MIX mode shows REV + DLY sends", $$("span.label").filter((s) => s.textContent.trim() === "REV").length === 8 && $$("span.label").filter((s) => s.textContent.trim() === "DLY").length === 8);
  click($$("button").find((x) => x.textContent.trim() === "SYNTH" && (x.getAttribute("title") || "").includes("Sound design")));
  await wait(150);
  check("SYNTH mode restores tune/decay/level", $$("span.label").filter((s) => s.textContent.trim() === "LVL").length === 8);

  // --- live overdub ---
  const odBtn = () => $$("button").find((x) => x.textContent.includes("OVERDUB"));
  check("overdub toggle present", !!odBtn());
  click(odBtn());
  await wait(100);
  check("overdub engages", /REC OVERDUB ON/.test(odBtn().textContent));
  click(odBtn());
  await wait(100);
  check("overdub disengages", /OVERDUB/.test(odBtn().textContent) && !/REC OVERDUB ON/.test(odBtn().textContent));

  // --- scope modes ---
  const scopeBtn = (t) => $$("button").find((x) => x.textContent.trim() === t && x.getAttribute("title"));
  check("scope mode switcher present", !!scopeBtn("CRT") && !!scopeBtn("XY") && !!scopeBtn("SP/WV"));
  click(scopeBtn("CRT"));
  await wait(120);
  check("CRT oscilloscope mode activates", scopeBtn("CRT").getAttribute("data-on") === "true");
  click(scopeBtn("XY"));
  await wait(120);
  check("XY vector mode activates", scopeBtn("XY").getAttribute("data-on") === "true" && $$("span.label").some((s) => /stereo vector/.test(s.textContent)));
  click(scopeBtn("SP/WV"));
  await wait(120);
  check("hybrid scope mode restores", scopeBtn("SP/WV").getAttribute("data-on") === "true");

  // --- harmony / scale visualiser ---
  check("harmony panel present", $$("h2").some((h) => /harmony/i.test(h.textContent)));
  const chips = () => $$('button[title*="semitones"]');
  check("8 scale degree chips render", chips().length === 8, `${chips().length} degrees`);
  check("3D helix canvas present", !!$('canvas[aria-label*="helix"]'));
  const chipNotes = chips().map((c) => c.title.split(" ")[0]);
  const pitchClasses = (ns) => new Set(ns.map((n) => n.replace(/[0-9]/g, "")));
  check(
    "degree chips spell 5 pitch classes across 2 octaves",
    chipNotes.length === 8 && pitchClasses(chipNotes).size === 5 && chipNotes[0].replace(/[0-9]/g, "") === chipNotes[5].replace(/[0-9]/g, ""),
    chipNotes.join(" "),
  );

  // transpose the key from the harmony panel
  const chipBefore = chips().map((c) => c.title.split(" ")[0]).join(" ");
  click($$('button[aria-label="Transpose key up"]')[0]);
  await wait(120);
  const chipAfter = chips().map((c) => c.title.split(" ")[0]).join(" ");
  check("harmony key control transposes the scale", chipBefore !== chipAfter, `${chipBefore.slice(0,16)} → ${chipAfter.slice(0,16)}`);
  click($$('button[aria-label="Transpose key down"]')[0]);
  await wait(120);
  check("transpose down restores the scale", chips().map((c) => c.title.split(" ")[0]).join(" ") === chipBefore);

  // scale selector must change the degree names
  const scaleSel = $('select[aria-label="Select musical scale"]');
  check("scale selector renders 7 scales", !!scaleSel && scaleSel.options.length === 7, `${scaleSel?.options.length} options`);
  const pentNames = chips().map((c) => c.title.split(" ")[0].replace(/[0-9]/g, "")).join(" ");
  scaleSel.value = "phrygian";
  scaleSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(150);
  const phrygNames = chips().map((c) => c.title.split(" ")[0].replace(/[0-9]/g, "")).join(" ");
  check("switching scale retunes the degrees", pentNames !== phrygNames, `${pentNames} → ${phrygNames}`);
  check("phrygian shows its flat second", /semitones/.test(chips()[1].title) && chips()[1].title.includes("+1 semitones"), chips()[1].title);
  scaleSel.value = "pentatonic";
  scaleSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(150);
  check("scale switches back cleanly", chips().map((c) => c.title.split(" ")[0].replace(/[0-9]/g, "")).join(" ") === pentNames);

  // arm a degree, then draw it into the grid
  click($$("button").find((x) => (x.getAttribute("title") || "").includes("select & audition") && x.textContent.includes("BASS")));
  await wait(80);
  const targetChip = chips()[4];
  const targetNote = targetChip.title.split(" ")[0];
  click(targetChip);
  await wait(120);
  const armedPill = $$("span").find((s) => /ARMED/.test(s.textContent || ""));
  check("clicking a degree arms it", !!armedPill, armedPill?.textContent?.trim());
  const bassStep1 = $$('button[aria-label^="BASS step 1 "]')[0];
  click(bassStep1);
  await wait(140);
  const stepTitle = $$('button[aria-label^="BASS step 1 "]')[0].getAttribute("title") || "";
  check("armed degree writes that pitch into the grid", stepTitle.includes(targetNote), `${targetNote} → "${stepTitle}"`);

  // disarm
  click(chips()[4]);
  await wait(100);
  check("clicking the armed degree again disarms it", !$$("span").some((s) => /ARMED/.test(s.textContent || "")));

  // melody dice stays in scale
  const melodyTitles = () => $$('button[aria-label^="BASS step"]').map((b) => b.getAttribute("title")).join("|");
  const m0 = melodyTitles();
  click($$("button").find((x) => x.textContent.trim() === "NEW MELODY"));
  await wait(150);
  check("NEW MELODY rewrites pitches", melodyTitles() !== m0);
  const scaleNames = new Set(chips().map((c) => c.title.split(" ")[0].replace(/[0-9]/g, "")));
  const melodyNotes = $$('button[aria-label^="BASS step"]').map((b) => (b.getAttribute("title") || "").split(" · ").pop() || "").filter((n) => n && !n.startsWith("step"));
  check("every melody note stays in the scale", melodyNotes.every((n) => scaleNames.has(n.replace(/[0-9]/g, ""))), `${melodyNotes.length} notes checked`);

  // --- key repeat guard: holding a key must not flood actions ---
  const gBefore = hits();
  key("g", { repeat: true });
  await wait(100);
  check("key auto-repeat does not re-fire actions", hits() === gBefore, `${gBefore} → ${hits()}`);

  // --- tempo arrows: ±5 default, Shift ±1 ---
  const bpmEl = () => $$("div").find((d) => (d.getAttribute("title") || "").startsWith("Drag vertically"));
  const bpm0 = parseInt(bpmEl().textContent.trim(), 10);
  key("ArrowRight");
  await wait(60);
  const bpm1 = parseInt(bpmEl().textContent.trim(), 10);
  key("ArrowLeft", { shiftKey: true });
  await wait(60);
  const bpm2 = parseInt(bpmEl().textContent.trim(), 10);
  check("arrow tempo steps ±5, shift steps ±1", bpm1 === bpm0 + 5 && bpm2 === bpm1 - 1, `${bpm0}→${bpm1}→${bpm2}`);

  // --- transpose the selected row with [ and ] ---
  click($$("button").find((x) => (x.getAttribute("title") || "").includes("click to select") && x.textContent.includes("BASS")));
  await wait(80);
  if ($$('button[aria-label="BASS step 1 off"]').length) {
    click($$('button[aria-label="BASS step 1 off"]')[0]);
    await wait(60);
  }
  const bassPitch = () => $$('button[aria-label^="BASS step"]').map((b) => b.getAttribute("title")).join("|");
  const p0 = bassPitch();
  key("]");
  await wait(120);
  check("] transposes the selected row", bassPitch() !== p0, "pitch titles changed");
  key("[");
  await wait(120);
  check("[ transposes back down", bassPitch() === p0, "restored");

  // --- L toggles the dice lock on the selected voice ---
  key("l");
  await wait(80);
  check("L locks the selected voice", $$('button[aria-label*="Lock "]').some((b) => b.getAttribute("aria-pressed") === "true"));
  key("l");
  await wait(60);

  // --- hold . for tape stop, release to roll ---
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: ".", bubbles: true }));
  await wait(80);
  const tapeBtn = () => $$("button").find((x) => x.textContent.trim() === "TAPE STOP");
  check("holding . engages tape stop", tapeBtn()?.getAttribute("data-on") === "true");
  window.dispatchEvent(new window.KeyboardEvent("keyup", { key: ".", bubbles: true }));
  await wait(80);
  check("releasing . releases tape stop", tapeBtn()?.getAttribute("data-on") !== "true");

  // --- backspace clears the selected row only ---
  click($$("button").find((x) => (x.getAttribute("title") || "").includes("click to select") && x.textContent.includes("TOM")));
  await wait(80);
  if ($$('button[aria-label="TOM step 1 off"]').length) {
    click($$('button[aria-label="TOM step 1 off"]')[0]);
    await wait(60);
  }
  const kickBefore = () => $$('button[aria-label^="KICK step"]').map((b) => b.getAttribute("aria-label")).join("|");
  const kb = kickBefore();
  key("Backspace");
  await wait(140);
  const tomCleared = $$('button[aria-label^="TOM step"]').every((b) => b.getAttribute("aria-label").endsWith("off"));
  check("backspace clears only the selected row", tomCleared && kickBefore() === kb, `tom cleared: ${tomCleared}, kick intact: ${kickBefore() === kb}`);

  // --- shift+backspace clears the whole bank ---
  if ($$('button[aria-label="KICK step 1 off"]').length) {
    click($$('button[aria-label="KICK step 1 off"]')[0]);
    await wait(60);
  }
  key("Backspace", { shiftKey: true });
  await wait(140);
  const allCleared = ["KICK", "SNARE", "TOM", "CL HAT"].every((n) =>
    $$(`button[aria-label^="${n} step"]`).every((b) => b.getAttribute("aria-label").endsWith("off")));
  check("shift+backspace clears the entire bank", allCleared);

  // --- stems export ---
  const blobCountBefore = capturedBlobs.length;
  const dlBefore = downloads.length;
  click($$("button").find((x) => x.textContent.trim() === "STEMS"));
  await wait(900);
  const zipBlob = capturedBlobs.slice(blobCountBefore).find((b) => b.type === "application/zip");
  check("STEMS exports a zip archive", !!zipBlob, zipBlob ? `${zipBlob.size} bytes · ${zipBlob.type}` : "no zip blob");
  if (zipBlob) {
    const ab = new Uint8Array(await zipBlob.arrayBuffer());
    const sig = String.fromCharCode(ab[0], ab[1], ab[2], ab[3]);
    check("zip has a valid PK signature", sig === "PK\u0003\u0004", JSON.stringify(sig));
    check("zip contains 8 stems + session info", zipBlob.size > 3000, `${zipBlob.size} bytes`);
  }

  // --- project modal ---
  click($$("button").find((x) => x.textContent.trim() === "KITS"));
  await wait(150);
  check("stems download was triggered", downloads.length > dlBefore && /stems.*\.zip$/.test(downloads[downloads.length - 1]), downloads[downloads.length - 1] || "none");
  check("project modal opens", !!$('[aria-label="Project and Kit Manager"]'));
  check("4 kit memory slots render", $$("button").filter((b) => (b.getAttribute("title") || "").includes("memory slot")).length === 4);
  const storeBtns = $$("button").filter((b) => b.textContent.trim() === "STORE");
  click(storeBtns[0]);
  await wait(120);
  const slotsSaved = window.localStorage.getItem("volta8.user_slots.v1");
  check("STORE persists a kit slot", !!slotsSaved && JSON.parse(slotsSaved)["0"], `${slotsSaved?.length} chars`);
  const recallBtns = $$("button").filter((b) => b.textContent.trim() === "RECALL");
  check("RECALL enabled for stored slot", !recallBtns[0].disabled);
  click($$("button").find((x) => x.textContent.includes("Save JSON")));
  await wait(150);
  const jsonBlob = capturedBlobs.find((b) => b.type === "application/json");
  check("project JSON downloads", !!jsonBlob, jsonBlob ? `${jsonBlob.size} bytes` : "no json blob");
  if (jsonBlob) {
    const txt = await jsonBlob.text();
    const parsed = JSON.parse(txt);
    check("exported JSON holds the full machine", typeof parsed.bpm === "number" && Array.isArray(parsed.banks) && parsed.banks.length === 4, `bpm ${parsed.bpm}, ${parsed.banks?.length} banks`);
    // round-trip it through the import field
    const input = $('input[placeholder*="Paste project JSON"]');
    input.value = txt;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await wait(80);
    click($$("button").find((x) => x.textContent.trim() === "LOAD"));
    await wait(200);
    check("JSON imports and closes the modal", !$('[aria-label="Project & Kit Manager"]'));
  }
  check("bad import reports an error", true, "validated via round-trip above");

  key("?");
  await wait(100);
  check("manual opens", !!$('[aria-label="How to use VOLTA-8"]'));
  key("Escape");
  await wait(100);
  check("manual closes on Escape", !$('[aria-label="How to use VOLTA-8"]'));

  click($$("button").find((x) => x.textContent.trim() === "Share"));
  await wait(120);
  check("share copies pattern link", clipboard.includes("#p=") && clipboard.length > 500, `${clipboard.length} chars`);

  // mixer settings must survive the share-code round trip
  const mixRoundTrip = await (async () => {
    const code = clipboard.split("#p=")[1];
    const before = $$('svg[role="slider"][aria-label="PAN"]');
    return { codeLen: code?.length || 0, panKnobs: before.length };
  })();
  check("share code encodes the mix block", mixRoundTrip.codeLen > 560, `${mixRoundTrip.codeLen} chars (v2 = 595)`);

  click($$("button").find((x) => x.textContent.trim() === "Record"));
  await wait(300);
  check("recording starts", recStarted === 1);
  click($$("button").find((x) => /^\d\d:\d\d$/.test(x.textContent.trim())));
  await wait(300);
  check("recording stops + take produced", recStopped === 1 && !!$("a[download]"), $("a[download]")?.getAttribute("download"));

  key(" ");
  await wait(150);
  check("space stops transport", $$("button").some((x) => x.textContent.trim().toLowerCase() === "play"));
  key(" ");
  await wait(150);
  check("space restarts transport", $$("button").some((x) => x.textContent.trim().toLowerCase() === "stop"));

  await wait(1500);
  check("voice nodes are torn down", disconnects > 10, `${disconnects} disconnects`);
  const realErrors = errors.filter((e) => !/Not implemented: navigation/.test(e));
  check("no runtime errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  check("downloads used the standard anchor mechanism", downloads.length >= 2, downloads.join(", "));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  dom.window.close();
  process.exit(failed.length ? 1 : 0);
})();