/*
 * audio.js — zero-asset procedural audio for the visual novel.
 * Vanilla JS, single IIFE, no audio files, no fetch.
 * Defines exactly one global: window.VN_AUDIO
 *
 *   scene(bgId)        crossfade the ambient bed matching a background id
 *                      (null / unknown id -> fade to silence)
 *   type()             typewriter tick, self-throttled (~45 ms min gap)
 *   ui(kind)           one-shot UI sound: "start" | "select" | "save" | "load"
 *   swell()            one-shot cinematic swell (dolly reveal cue): two
 *                      detuned oscillators glide 180 -> 55 Hz over a noise
 *                      presence band, ~0.12 peak, gone by ~2.4 s; self-
 *                      throttled (~3 s min gap)
 *   enabled()          -> bool
 *   setEnabled(bool)   -> bool (new state); false ramps master to 0 in 0.3 s,
 *                         kills scheduled nodes, then suspends the context
 *   setVolume(v)       -> clamped number (0..1); master gain target becomes
 *                         0.8*v via setTargetAtTime (smooth slider response).
 *                         Before the context exists it only records the value
 *                         — the first activation applies it. Persisted under
 *                         "vn-settings" as JSON {volume}
 *   volume()           -> current volume number (default 1)
 *
 * The AudioContext is created lazily inside the first scene()/ui()/type()
 * /swell() call that happens after a real user gesture (pointerdown / touchend /
 * keydown / click). Earlier calls only record intent. Enabled state is
 * persisted in localStorage under "vn-audio" (default: ON); the volume lives
 * in the shared "vn-settings" JSON (key "volume") written by the settings
 * panel in engine.js — writes here merge so "autoDelay" is never clobbered.
 *
 * One-shot bed events (droplets, crickets, thunder, heartbeat, chimes...)
 * run on a Web Audio-clock lookahead scheduler: one 25 ms timer per module
 * walks each live bed's event queue and start(time)-schedules due events
 * 0.1 s ahead of ctx.currentTime, never via per-event setTimeout chains.
 */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Tunables
   * ------------------------------------------------------------------ */

  var MASTER_LEVEL = 0.8;
  var TYPE_GAP_MS = 45; // typewriter min gap
  var SWELL_GAP_MS = 3000; // swell cue min gap (self-throttle)
  var FADE_OUT_S = 1.2; // old bed fade
  var FADE_IN_S = 1.5; // new bed fade
  var KILL_RAMP_S = 0.3; // setEnabled(false) master ramp
  var SUSPEND_MS = 380; // suspend context after the kill ramp
  var MAX_LIVE_BEDS = 2; // current bed + at most one fading
  var SCHED_TICK_MS = 25; // lookahead scheduler tick
  var SCHED_AHEAD_S = 0.1; // schedule events this far ahead of the audio clock
  var SCHED_LEAD_S = 0.05; // first-event anchor lead on bed activation
  var SCHED_MAX_CATCHUP = 32; // max events per bed per tick (time-jump guard)
  var STORE_KEY = "vn-audio";
  var SETTINGS_KEY = "vn-settings"; // shared with engine.js settings panel
  var VOL_TAU_S = 0.05; // setTargetAtTime smoothing for slider moves

  /* ------------------------------------------------------------------ *
   *  Environment / state
   * ------------------------------------------------------------------ */

  var target =
    typeof window !== "undefined" && window
      ? window
      : typeof globalThis !== "undefined"
        ? globalThis
        : null;
  if (!target) return;

  var supported = getAudioCtor() != null; // no Web Audio -> enabled() stays false
  var broken = false; // context creation failed permanently
  var on = readPref(); // user preference (persisted, default ON)
  var vol = readVolume(); // user volume 0..1 (persisted, default 1)
  var gestureSeen = false;
  var ctx = null;
  var master = null;
  var sfxBus = null;
  var desiredBg = null; // recorded scene intent before the context exists
  var allBeds = []; // bed instances (including ones still fading out)
  var liveSources = []; // one-shot sources, hard-killed on disable
  var lastTypeAt = 0;
  var lastSwellAt = 0;
  var suspTimer = 0;
  var schedTimer = 0; // lookahead scheduler tick handle (0 = not running)
  var warned = false;
  var bornSeq = 0;

  var noiseWhite = null;
  var noisePink = null;
  var noiseBrown = null;

  /* ------------------------------------------------------------------ *
   *  Small utilities
   * ------------------------------------------------------------------ */

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function warnOnce(msg) {
    if (warned) return;
    warned = true;
    try {
      console.warn(msg);
    } catch (e) {}
  }

  function getAudioCtor() {
    try {
      if (typeof window !== "undefined" && window) {
        if (window.AudioContext) return window.AudioContext;
        if (window.webkitAudioContext) return window.webkitAudioContext;
      }
      if (typeof AudioContext !== "undefined" && AudioContext) return AudioContext;
    } catch (e) {}
    return null;
  }

  function storage() {
    try {
      if (typeof window !== "undefined" && window && window.localStorage) {
        return window.localStorage;
      }
    } catch (e) {}
    return null;
  }

  function readPref() {
    var s = storage();
    if (!s) return true;
    try {
      return s.getItem(STORE_KEY) !== "0";
    } catch (e) {
      return true;
    }
  }

  function writePref(v) {
    var s = storage();
    if (!s) return;
    try {
      s.setItem(STORE_KEY, v ? "1" : "0");
    } catch (e) {}
  }

  // Volume lives in the shared "vn-settings" JSON next to the engine's
  // autoDelay. Reads are defensive: anything but a finite number -> default 1.
  function readVolume() {
    var s = storage();
    if (!s) return 1;
    try {
      var data = JSON.parse(s.getItem(SETTINGS_KEY));
      if (data && typeof data === "object") {
        var v = data.volume;
        if (typeof v === "number" && isFinite(v)) {
          if (v < 0) v = 0;
          if (v > 1) v = 1;
          return v;
        }
      }
    } catch (e) {}
    return 1;
  }

  // Merge-write: keep any sibling keys (engine's autoDelay) intact.
  function writeVolume() {
    var s = storage();
    if (!s) return;
    var data = {};
    try {
      var raw = s.getItem(SETTINGS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") data = parsed;
      }
    } catch (e) {
      data = {}; // corrupt payload: start a fresh object
    }
    if (typeof data !== "object" || data === null) data = {};
    data.volume = vol;
    try {
      s.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function now() {
    return ctx ? ctx.currentTime || 0 : 0;
  }

  function link(a, b) {
    try {
      a.connect(b);
    } catch (e) {}
  }

  function mkGain(v) {
    var g = ctx.createGain();
    try {
      g.gain.value = v;
    } catch (e) {}
    return g;
  }

  function mkOsc(type, freq) {
    var o = ctx.createOscillator();
    try {
      o.type = type;
      o.frequency.value = freq;
    } catch (e) {}
    return o;
  }

  function mkFilter(type, freq, q) {
    var f = ctx.createBiquadFilter();
    try {
      f.type = type;
      f.frequency.value = freq;
      if (q != null && f.Q) f.Q.value = q;
    } catch (e) {}
    return f;
  }

  function startAt(src, when, offset, dur) {
    try {
      if (offset != null) src.start(when, offset, dur);
      else src.start(when);
    } catch (e) {}
  }

  function stopAt(src, when) {
    try {
      src.stop(when);
    } catch (e) {}
  }

  // Cancel-then-ramp with a direct-assignment fallback (stub safety).
  function rampParam(param, value, t0, dur) {
    try {
      param.cancelScheduledValues(t0);
      param.setValueAtTime(param.value, t0);
      param.linearRampToValueAtTime(value, t0 + dur);
    } catch (e) {
      try {
        param.value = value;
      } catch (e2) {}
    }
  }

  function trackOne(src) {
    liveSources.push(src);
    try {
      src.onended = function () {
        var i = liveSources.indexOf(src);
        if (i >= 0) liveSources.splice(i, 1);
      };
    } catch (e) {}
  }

  function track(bed, src) {
    bed.sources.push(src);
    trackOne(src);
  }

  // Queue a one-shot generator on a bed's audio-clock event list:
  // makeEvent(time) schedules its nodes at exactly `time`; nextGap() returns
  // the seconds until the following event, or a non-positive value to retire
  // the entry (e.g. an evolving pattern that has finished).
  function addBedEvent(bed, firstS, makeEvent, nextGap) {
    if (bed.stopped || bed.done) return;
    bed.events.push({
      nextTime: now() + SCHED_LEAD_S + (firstS > 0 ? firstS : 0),
      makeEvent: makeEvent,
      nextGap: nextGap
    });
    schedKick();
  }

  // Repeating one-shot events on the scheduler: fn(time) fires at an exact
  // ctx.currentTime-derived time, gaps random between minMs/maxMs.
  function loopEvents(bed, minMs, maxMs, fn, firstMs) {
    addBedEvent(
      bed,
      firstMs == null ? 0 : firstMs / 1000,
      fn,
      function () {
        return rnd(minMs, maxMs) / 1000;
      }
    );
  }

  // True while at least one live bed still has queued one-shot events.
  function schedHasWork() {
    for (var i = 0; i < allBeds.length; i++) {
      var b = allBeds[i];
      if (!b.stopped && !b.done && b.events.length) return true;
    }
    return false;
  }

  // The lookahead scheduler: one timer for the whole module. Each tick it
  // walks every live bed's queue and schedules each event due within
  // SCHED_AHEAD_S of ctx.currentTime at its exact audio-clock time, so
  // one-shots never jitter with main-thread delays.
  function schedPump() {
    schedTimer = 0;
    try {
      var suspended = false;
      try {
        suspended = !!ctx && ctx.state === "suspended";
      } catch (e) {}
      if (ctx && !suspended) {
        var t = now();
        for (var i = 0; i < allBeds.length; i++) {
          var bed = allBeds[i];
          if (bed.stopped || bed.done) {
            bed.events.length = 0; // crossfaded out: queued events never started
            continue;
          }
          if (!bed.events.length) continue;
          var budget = SCHED_MAX_CATCHUP;
          for (var j = 0; j < bed.events.length && budget > 0; j++) {
            var e = bed.events[j];
            while (e.nextTime < t + SCHED_AHEAD_S) {
              try {
                e.makeEvent(e.nextTime);
              } catch (err) {}
              budget--;
              var gap = 0;
              try {
                gap = e.nextGap();
              } catch (err2) {
                gap = 0;
              }
              if (!(gap > 0)) {
                e.retired = true;
                break;
              }
              e.nextTime += gap;
              if (budget <= 0) {
                // Catch-up overflow after a suspend/resume time jump: drop
                // the backlog and re-anchor instead of bursting every tick.
                if (e.nextTime < t) e.nextTime = t + SCHED_LEAD_S;
                break;
              }
            }
          }
          for (var k = bed.events.length - 1; k >= 0; k--) {
            if (bed.events[k].retired) bed.events.splice(k, 1);
          }
        }
      }
    } catch (e3) {}
    if (schedHasWork()) {
      try {
        schedTimer = setTimeout(schedPump, SCHED_TICK_MS);
      } catch (e4) {}
    }
  }

  // Start the scheduler timer if it is not already running.
  function schedKick() {
    if (schedTimer) return;
    try {
      schedTimer = setTimeout(schedPump, SCHED_TICK_MS);
    } catch (e) {}
  }

  // Slow LFO: sine oscillator -> depth gain -> target AudioParam.
  function addLfo(bed, freq, depth, param) {
    var o = mkOsc("sine", freq);
    var g = mkGain(depth);
    link(o, g);
    link(g, param);
    startAt(o, now());
    track(bed, o);
    return o;
  }

  function killOneShots() {
    var list = liveSources.slice();
    liveSources.length = 0;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      try {
        if (s.stop) s.stop(now());
      } catch (e) {}
      try {
        s.onended = null;
      } catch (e) {}
      try {
        s.disconnect();
      } catch (e) {}
    }
  }

  /* ------------------------------------------------------------------ *
   *  Noise buffers (built once): white / pink / brown, 2 s each
   * ------------------------------------------------------------------ */

  function clamp1(x) {
    return x > 1 ? 1 : x < -1 ? -1 : x;
  }

  function makeNoiseBuffers() {
    if (noiseWhite || !ctx.createBuffer) return;
    var sr = ctx.sampleRate || 44100;
    var len = Math.max(1, Math.floor(sr * 2));
    var wb = ctx.createBuffer(1, len, sr);
    var pb = ctx.createBuffer(1, len, sr);
    var bb = ctx.createBuffer(1, len, sr);
    var w = wb.getChannelData(0);
    var p = pb.getChannelData(0);
    var b = bb.getChannelData(0);
    var b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0,
      br = 0,
      i,
      wht;
    for (i = 0; i < len; i++) {
      wht = Math.random() * 2 - 1;
      w[i] = wht;
      // Pink noise via the Paul Kellet approximate filter.
      b0 = 0.99886 * b0 + wht * 0.0555179;
      b1 = 0.99332 * b1 + wht * 0.0750759;
      b2 = 0.969 * b2 + wht * 0.153852;
      b3 = 0.8665 * b3 + wht * 0.3104856;
      b4 = 0.55 * b4 + wht * 0.5329522;
      b5 = -0.7616 * b5 - wht * 0.016898;
      p[i] = clamp1((b0 + b1 + b2 + b3 + b4 + b5 + b6 + wht * 0.5362) * 0.11);
      b6 = wht * 0.115926;
      // Brown noise via a leaky integrator.
      br = (br + 0.02 * wht) / 1.02;
      b[i] = clamp1(br * 3.5);
    }
    noiseWhite = wb;
    noisePink = pb;
    noiseBrown = bb;
  }

  function noiseSrc(kind, loop) {
    if (!ctx || !ctx.createBufferSource) return null;
    var buf = kind === "pink" ? noisePink : kind === "brown" ? noiseBrown : noiseWhite;
    if (!buf) return null;
    try {
      var s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = loop !== false;
      return s;
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Bed lifecycle: build / fade / stop / disconnect
   * ------------------------------------------------------------------ */

  function buildBed(id) {
    var def = BED_DEFS[id];
    if (!def || !ctx || !ctx.createGain) return null;
    var bed = {
      id: id,
      level: def.level,
      gain: null,
      sources: [],
      events: [], // one-shot event queue entries for the scheduler
      stopped: false,
      done: false,
      teardownTimer: 0,
      born: bornSeq++
    };
    try {
      bed.gain = ctx.createGain();
      bed.gain.gain.value = 0;
      bed.gain.connect(master);
    } catch (e) {
      return null;
    }
    try {
      def.build(bed);
    } catch (e) {
      stopBed(bed, 0.05);
      return null;
    }
    return bed;
  }

  function stopBed(bed, fadeSec) {
    if (!bed || bed.done) return;
    bed.stopped = true;
    bed.events.length = 0; // queued one-shots were never started: drop them
    var i;
    try {
      rampParam(bed.gain.gain, 0, now(), fadeSec);
    } catch (e) {}
    var t = now() + fadeSec + 0.05;
    for (i = 0; i < bed.sources.length; i++) stopAt(bed.sources[i], t);
    if (bed.teardownTimer) {
      try {
        clearTimeout(bed.teardownTimer);
      } catch (e) {}
    }
    try {
      bed.teardownTimer = setTimeout(function () {
        finishTeardown(bed);
      }, Math.max(80, (fadeSec + 0.4) * 1000));
    } catch (e) {
      finishTeardown(bed);
    }
  }

  function hardStopBed(bed) {
    if (!bed || bed.done) return;
    if (!bed.stopped) {
      stopBed(bed, 0.08);
      return;
    }
    if (bed.teardownTimer) {
      try {
        clearTimeout(bed.teardownTimer);
      } catch (e) {}
      bed.teardownTimer = 0;
    }
    finishTeardown(bed);
  }

  function finishTeardown(bed) {
    if (!bed || bed.done) return;
    bed.done = true;
    bed.stopped = true;
    bed.events.length = 0;
    var i;
    if (bed.teardownTimer) {
      try {
        clearTimeout(bed.teardownTimer);
      } catch (e) {}
      bed.teardownTimer = 0;
    }
    for (i = 0; i < bed.sources.length; i++) {
      var s = bed.sources[i];
      stopAt(s, now());
      try {
        s.disconnect();
      } catch (e) {}
    }
    bed.sources.length = 0;
    try {
      bed.gain.disconnect();
    } catch (e) {}
    var k = allBeds.indexOf(bed);
    if (k >= 0) allBeds.splice(k, 1);
  }

  // Never keep more than MAX_LIVE_BEDS connected bed graphs.
  function capBeds(keep) {
    var guard = 0;
    while (guard++ < 8) {
      var live = [];
      var i;
      for (i = 0; i < allBeds.length; i++) {
        if (!allBeds[i].done) live.push(allBeds[i]);
      }
      if (live.length <= MAX_LIVE_BEDS) return;
      var victim = null;
      for (i = 0; i < live.length; i++) {
        if (live[i] !== keep && (victim === null || live[i].born < victim.born)) {
          victim = live[i];
        }
      }
      if (victim === null) return;
      hardStopBed(victim);
    }
  }

  function applyScene() {
    if (!ctx || !master) return;
    var want = desiredBg && BED_DEFS[desiredBg] ? desiredBg : null;
    var keep = null;
    var i, b;
    for (i = 0; i < allBeds.length; i++) {
      b = allBeds[i];
      if (!b.stopped && !b.done && want && b.id === want) keep = b;
    }
    for (i = allBeds.length - 1; i >= 0; i--) {
      b = allBeds[i];
      if (b !== keep && !b.stopped) stopBed(b, FADE_OUT_S);
    }
    capBeds(keep);
    if (want && !keep) {
      var bed = buildBed(want);
      if (bed) {
        allBeds.push(bed);
        rampParam(bed.gain.gain, bed.level, now(), FADE_IN_S);
        capBeds(bed);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   *  Ambient bed builders (one per background id)
   * ------------------------------------------------------------------ */

  function bedTone(bed, freq, at, dur, peak, glideTo) {
    var o = mkOsc("sine", freq);
    var g = mkGain(0.0001);
    link(o, g);
    link(g, bed.gain);
    try {
      if (glideTo) {
        o.frequency.setValueAtTime(freq, at);
        o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
      }
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + Math.min(0.012, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    } catch (e) {
      try {
        g.gain.value = peak;
      } catch (e2) {}
    }
    startAt(o, at);
    stopAt(o, at + dur + 0.03);
    track(bed, o);
  }

  // streets_rain: pink noise wall + sparse droplet ticks + very low rumble
  function buildStreetsRain(bed) {
    var wall = noiseSrc("pink");
    if (wall) {
      var lp = mkFilter("lowpass", 1200, 0.4);
      var g = mkGain(0.55);
      link(wall, lp);
      link(lp, g);
      link(g, bed.gain);
      startAt(wall, now());
      track(bed, wall);
      addLfo(bed, 0.11, 250, lp.frequency);
    }
    var rum = noiseSrc("brown");
    if (rum) {
      var rlp = mkFilter("lowpass", 110, 0.5);
      var rg = mkGain(0.25);
      link(rum, rlp);
      link(rlp, rg);
      link(rg, bed.gain);
      startAt(rum, now());
      track(bed, rum);
      addLfo(bed, 0.06, 0.1, rg.gain);
    }
    // droplets: short bandpass noise bursts, random 0.1-0.4 s gaps
    loopEvents(
      bed,
      100,
      400,
      function (t) {
        droplet(bed, t);
      },
      rnd(50, 150)
    );
  }

  function droplet(bed, t) {
    var s = noiseSrc("white", false);
    if (!s) return;
    var bp = mkFilter("bandpass", rnd(2500, 6500), rnd(7, 14));
    var g = mkGain(0.0001);
    link(s, bp);
    link(bp, g);
    link(g, bed.gain);
    var peak = rnd(0.02, 0.055);
    try {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.03, 0.07));
    } catch (e) {
      try {
        g.gain.value = peak;
      } catch (e2) {}
    }
    startAt(s, t, Math.random() * 1.5, 0.12);
    track(bed, s);
  }

  // observatory_night: quiet wind + sparse cricket trills + faint shimmer
  function buildObservatoryNight(bed) {
    var wind = noiseSrc("brown");
    if (wind) {
      var lp = mkFilter("lowpass", 400, 0.6);
      var g = mkGain(0.16);
      link(wind, lp);
      link(lp, g);
      link(g, bed.gain);
      startAt(wind, now());
      track(bed, wind);
      addLfo(bed, 0.07, 160, lp.frequency);
      addLfo(bed, 0.045, 0.07, g.gain);
    }
    // faint high shimmer pad: two detuned sines, very low gain, 8 s LFO
    var sg = mkGain(0.006);
    link(sg, bed.gain);
    var o1 = mkOsc("sine", 1975);
    var o2 = mkOsc("sine", 1981.5);
    link(o1, sg);
    link(o2, sg);
    startAt(o1, now());
    startAt(o2, now());
    track(bed, o1);
    track(bed, o2);
    addLfo(bed, 0.125, 0.004, sg.gain);
    // crickets: 4-6 kHz sine trills, 30 ms x 3 bursts, rare
    loopEvents(
      bed,
      3500,
      9000,
      function (t) {
        cricketTrill(bed, t);
      },
      rnd(1500, 4000)
    );
  }

  function cricketTrill(bed, t) {
    var f = rnd(4200, 5600);
    for (var i = 0; i < 3; i++) {
      bedTone(bed, f + rnd(-150, 150), t + i * 0.07, 0.03, 0.02);
    }
  }

  // server_room: 55/110 Hz hum + 0.5 Hz AM fan noise + rare pentatonic blips
  function buildServerRoom(bed) {
    var lp = mkFilter("lowpass", 170, 0.4);
    var hg = mkGain(0.07);
    link(lp, hg);
    link(hg, bed.gain);
    var h1 = mkOsc("sawtooth", 55);
    var h2 = mkOsc("sawtooth", 110.5);
    link(h1, lp);
    link(h2, lp);
    startAt(h1, now());
    startAt(h2, now());
    track(bed, h1);
    track(bed, h2);
    var fan = noiseSrc("white");
    if (fan) {
      var flp = mkFilter("lowpass", 900, 0.5);
      var am = mkGain(0.018);
      link(fan, flp);
      link(flp, am);
      link(am, bed.gain);
      startAt(fan, now());
      track(bed, fan);
      addLfo(bed, 0.5, 0.016, am.gain);
    }
    loopEvents(
      bed,
      7000,
      16000,
      function (t) {
        dataBlip(bed, t);
      },
      rnd(2500, 6000)
    );
  }

  var PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

  function dataBlip(bed, t) {
    var f = PENTA[Math.floor(Math.random() * PENTA.length)];
    var o = mkOsc("square", f);
    var lp = mkFilter("lowpass", 1600, 1);
    var g = mkGain(0.0001);
    link(o, lp);
    link(lp, g);
    link(g, bed.gain);
    try {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    } catch (e) {
      try {
        g.gain.value = 0.018;
      } catch (e2) {}
    }
    startAt(o, t);
    stopAt(o, t + 0.15);
    track(bed, o);
  }

  // apartment_night: muffled rain + rare muffled thunder + room tone
  function buildApartmentNight(bed) {
    var rain = noiseSrc("pink");
    if (rain) {
      var lp = mkFilter("lowpass", 600, 0.4);
      var g = mkGain(0.4);
      link(rain, lp);
      link(lp, g);
      link(g, bed.gain);
      startAt(rain, now());
      track(bed, rain);
      addLfo(bed, 0.09, 0.06, g.gain);
    }
    var h1 = mkOsc("sine", 60);
    var hg1 = mkGain(0.014);
    link(h1, hg1);
    link(hg1, bed.gain);
    startAt(h1, now());
    track(bed, h1);
    var h2 = mkOsc("sine", 120);
    var hg2 = mkGain(0.007);
    link(h2, hg2);
    link(hg2, bed.gain);
    startAt(h2, now());
    track(bed, h2);
    // thunder: filtered noise burst, ~1.5 s decay, every 25-45 s
    loopEvents(
      bed,
      25000,
      45000,
      function (t) {
        thunder(bed, t);
      },
      rnd(12000, 25000)
    );
  }

  function thunder(bed, t) {
    var s = noiseSrc("brown", false);
    if (!s) return;
    var lp = mkFilter("lowpass", 200, 0.7);
    var g = mkGain(0.0001);
    link(s, lp);
    link(lp, g);
    link(g, bed.gain);
    try {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.68);
    } catch (e) {
      try {
        g.gain.value = 0.32;
      } catch (e2) {}
    }
    startAt(s, t, Math.random() * 0.1, 1.9);
    track(bed, s);
  }

  // email_screen: 120 Hz hum + rare two-tone blip + light noise floor
  function buildEmailScreen(bed) {
    var hum = mkOsc("sine", 120);
    var hg = mkGain(0.02);
    link(hum, hg);
    link(hg, bed.gain);
    startAt(hum, now());
    track(bed, hum);
    var floor = noiseSrc("white");
    if (floor) {
      var lp = mkFilter("lowpass", 2800, 0.3);
      var g = mkGain(0.007);
      link(floor, lp);
      link(lp, g);
      link(g, bed.gain);
      startAt(floor, now());
      track(bed, floor);
    }
    loopEvents(
      bed,
      16000,
      34000,
      function (t) {
        bedTone(bed, 880, t, 0.07, 0.028);
        bedTone(bed, 1174.66, t + 0.11, 0.09, 0.028);
      },
      rnd(8000, 15000)
    );
  }

  // memory_white: 3 detuned sines, slow tremolo + swells, highpassed air
  function buildMemoryWhite(bed) {
    var trem = mkGain(0.85);
    link(trem, bed.gain);
    var swell = mkGain(0.75);
    link(swell, trem);
    var voices = [220, 277.18, 329.63];
    for (var i = 0; i < voices.length; i++) {
      var o1 = mkOsc("sine", voices[i] * 0.9995);
      var o2 = mkOsc("sine", voices[i] * 1.0005);
      var vg = mkGain(0.018);
      link(o1, vg);
      link(o2, vg);
      link(vg, swell);
      startAt(o1, now());
      startAt(o2, now());
      track(bed, o1);
      track(bed, o2);
    }
    addLfo(bed, 0.14, 0.3, trem.gain); // slow tremolo
    addLfo(bed, 0.1, 0.3, swell.gain); // ~10 s swells
    var airy = noiseSrc("white");
    if (airy) {
      var hp = mkFilter("highpass", 2000, 0.5);
      var ag = mkGain(0.006);
      link(airy, hp);
      link(hp, ag);
      link(ag, trem);
      startAt(airy, now());
      track(bed, airy);
    }
  }

  // dawn_ending: warm triad pad with slow attack + breeze + rare birdsong
  function buildDawnEnding(bed) {
    var pad = mkGain(0.0001);
    var padTrem = mkGain(0.9);
    link(pad, padTrem);
    link(padTrem, bed.gain);
    var notes = [
      [261.63, 0.02],
      [329.63, 0.016],
      [392, 0.014],
      [523.25, 0.008]
    ];
    for (var i = 0; i < notes.length; i++) {
      var o = mkOsc("sine", notes[i][0]);
      var g = mkGain(notes[i][1]);
      link(o, g);
      link(g, pad);
      startAt(o, now());
      track(bed, o);
    }
    try {
      pad.gain.setValueAtTime(0.0001, now());
      pad.gain.linearRampToValueAtTime(1, now() + 4); // slow attack
    } catch (e) {
      try {
        pad.gain.value = 1;
      } catch (e2) {}
    }
    addLfo(bed, 0.08, 0.18, padTrem.gain);
    var breeze = noiseSrc("pink");
    if (breeze) {
      var lp = mkFilter("lowpass", 500, 0.4);
      var bg = mkGain(0.06);
      link(breeze, lp);
      link(lp, bg);
      link(bg, bed.gain);
      startAt(breeze, now());
      track(bed, breeze);
      addLfo(bed, 0.06, 0.03, bg.gain);
    }
    // birdsong: descending 2-4 kHz sine glides, rare
    loopEvents(
      bed,
      6000,
      13000,
      function (t) {
        birdsong(bed, t);
      },
      rnd(3000, 7000)
    );
  }

  function birdsong(bed, t) {
    var n = 2 + Math.floor(Math.random() * 2); // 2-3 chirps
    for (var i = 0; i < n; i++) {
      var f = rnd(2600, 4000);
      bedTone(bed, f, t + i * rnd(0.16, 0.24), rnd(0.1, 0.16), 0.022, f * rnd(0.55, 0.7));
    }
  }

  // finale_star: suspended pad resolving to major + settling sub heartbeat
  // + sparse starlight chimes + highpassed air
  function buildFinaleStar(bed) {
    // warm pad: detuned Asus4 voicing (4 sines) that resolves to A major
    var pad = mkGain(0.0001);
    var padTrem = mkGain(0.9);
    var lp = mkFilter("lowpass", 900, 0.4);
    link(pad, lp);
    link(lp, padTrem);
    link(padTrem, bed.gain);
    var t0 = now();
    var padNotes = [
      [220 * 0.9995, 0.02], // A3 root
      [329.63 * 1.0005, 0.013], // E4 fifth
      [440 * 0.9995, 0.009] // A4 octave
    ];
    for (var i = 0; i < padNotes.length; i++) {
      var po = mkOsc("sine", padNotes[i][0]);
      var pg = mkGain(padNotes[i][1]);
      link(po, pg);
      link(pg, pad);
      startAt(po, now());
      track(bed, po);
    }
    var susO = mkOsc("sine", 293.66); // D4 suspended 4th
    var susG = mkGain(0.015);
    link(susO, susG);
    link(susG, pad);
    startAt(susO, now());
    track(bed, susO);
    var resO = mkOsc("sine", 277.18 * 1.0005); // C#4 major 3rd, resolution voice
    var resG = mkGain(0.0001);
    link(resO, resG);
    link(resG, pad);
    startAt(resO, now());
    track(bed, resO);
    try {
      pad.gain.setValueAtTime(0.0001, t0);
      pad.gain.linearRampToValueAtTime(1, t0 + 6); // slow bloom
    } catch (e) {
      try {
        pad.gain.value = 1;
      } catch (e2) {}
    }
    try {
      // one-way resolution, scheduled once: 4th recedes as the 3rd arrives
      susG.gain.setValueAtTime(0.015, t0);
      susG.gain.linearRampToValueAtTime(0.004, t0 + 20);
      resG.gain.setValueAtTime(0.0001, t0);
      resG.gain.linearRampToValueAtTime(0.014, t0 + 20);
    } catch (e) {
      try {
        susG.gain.value = 0.004;
        resG.gain.value = 0.014;
      } catch (e2) {}
    }
    addLfo(bed, 0.05, 180, lp.frequency); // very slow filter drift
    addLfo(bed, 0.08, 0.15, padTrem.gain);
    // sub heartbeat: 55 Hz pulse at ~50 bpm, slowing + widening, gone by ~45 s
    // (one scheduler entry whose gap evolves; retires itself at 45 s)
    var hbBeatMs = 1200;
    var hbElapsedMs = 0;
    addBedEvent(
      bed,
      1.5,
      function (t) {
        subPulse(bed, hbBeatMs, 1 - hbElapsedMs / 45000, t);
      },
      function () {
        hbElapsedMs += hbBeatMs;
        if (hbElapsedMs >= 45000) return 0; // evolution complete: retire
        hbBeatMs = Math.min(3000, hbBeatMs * 1.07);
        return hbBeatMs / 1000;
      }
    );
    // starlight: tiny chime partials, 6-14 s apart, very quiet
    loopEvents(
      bed,
      6000,
      14000,
      function (t) {
        starChime(bed, t);
      },
      rnd(3000, 7000)
    );
    // air: highpassed pink noise, very low gain, 10-14 s swell
    var airy = noiseSrc("pink");
    if (airy) {
      var hp = mkFilter("highpass", 2400, 0.5);
      var ag = mkGain(0.004);
      link(airy, hp);
      link(hp, ag);
      link(ag, bed.gain);
      startAt(airy, now());
      track(bed, airy);
      addLfo(bed, 0.075, 0.003, ag.gain);
    }
  }

  // one soft 55 Hz sub pulse at exact audio-clock time `t`;
  // peakScale carries the ~45 s fade-out
  function subPulse(bed, beatMs, peakScale, t) {
    if (peakScale <= 0.03) return;
    var o = mkOsc("sine", 55);
    var g = mkGain(0.0001);
    link(o, g);
    link(g, bed.gain);
    var peak = 0.045 * peakScale;
    var dur = 0.4 + (beatMs / 1000) * 0.28; // envelope widens as it slows
    try {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } catch (e) {
      try {
        g.gain.value = peak;
      } catch (e2) {}
    }
    startAt(o, t);
    stopAt(o, t + dur + 0.03);
    track(bed, o);
  }

  var STAR_CHIME = [2217.46, 2637.02, 2959.96, 3520, 3951.07]; // A-major pentatonic, 2-4 kHz

  function starChime(bed, t) {
    var f = STAR_CHIME[Math.floor(Math.random() * STAR_CHIME.length)];
    bedTone(bed, f, t, rnd(0.28, 0.45), 0.012);
    bedTone(bed, f * 2.01, t + 0.012, rnd(0.18, 0.3), 0.004); // faint upper partial
  }

  var BED_DEFS = {
    streets_rain: { level: 0.5, build: buildStreetsRain },
    observatory_night: { level: 0.4, build: buildObservatoryNight },
    server_room: { level: 0.45, build: buildServerRoom },
    apartment_night: { level: 0.5, build: buildApartmentNight },
    email_screen: { level: 0.35, build: buildEmailScreen },
    memory_white: { level: 0.4, build: buildMemoryWhite },
    dawn_ending: { level: 0.45, build: buildDawnEnding },
    finale_star: { level: 0.4, build: buildFinaleStar }
  };

  /* ------------------------------------------------------------------ *
   *  SFX synthesis (one-shots: ticks/ui <= 0.4 s, peaks ~0.05-0.1;
   *  swell() is the long-form exception at ~2.4 s)
   * ------------------------------------------------------------------ */

  // Typewriter tick: ~1800 Hz blip with a 25 ms decay (+ 2 ms noise transient).
  function playTypeTick() {
    var t = now();
    var o = mkOsc("sine", rnd(1700, 1900));
    var g = mkGain(0.0001);
    link(o, g);
    link(g, sfxBus);
    try {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    } catch (e) {
      try {
        g.gain.value = 0.07;
      } catch (e2) {}
    }
    startAt(o, t);
    stopAt(o, t + 0.04);
    trackOne(o);
    if (Math.random() < 0.5) {
      var s = noiseSrc("white", false);
      if (s) {
        var hp = mkFilter("highpass", 3000, 0.7);
        var ng = mkGain(0.0001);
        link(s, hp);
        link(hp, ng);
        link(ng, sfxBus);
        try {
          ng.gain.setValueAtTime(0.05, t);
          ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
        } catch (e) {
          try {
            ng.gain.value = 0.05;
          } catch (e2) {}
        }
        startAt(s, t, Math.random(), 0.03);
        trackOne(s);
      }
    }
  }

  // "start": soft swell (three sines rising 0.22 s, falling by 0.4 s).
  function uiStart() {
    var t = now();
    var notes = [
      [261.63, 0.1],
      [329.63, 0.08],
      [392, 0.07]
    ];
    for (var i = 0; i < notes.length; i++) {
      var o = mkOsc("sine", notes[i][0]);
      var g = mkGain(0.0001);
      link(o, g);
      link(g, sfxBus);
      try {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(notes[i][1], t + 0.22);
        g.gain.linearRampToValueAtTime(0.0001, t + 0.4);
      } catch (e) {
        try {
          g.gain.value = notes[i][1];
        } catch (e2) {}
      }
      startAt(o, t);
      stopAt(o, t + 0.45);
      trackOne(o);
    }
  }

  // "select": click (highpassed noise burst) + quick up-chirp.
  function uiSelect() {
    var t = now();
    var s = noiseSrc("white", false);
    if (s) {
      var hp = mkFilter("highpass", 2500, 0.7);
      var g = mkGain(0.0001);
      link(s, hp);
      link(hp, g);
      link(g, sfxBus);
      try {
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      } catch (e) {
        try {
          g.gain.value = 0.09;
        } catch (e2) {}
      }
      startAt(s, t, Math.random(), 0.05);
      trackOne(s);
    }
    var o = mkOsc("sine", 1250);
    var og = mkGain(0.0001);
    link(o, og);
    link(og, sfxBus);
    try {
      o.frequency.setValueAtTime(1250, t + 0.01);
      o.frequency.exponentialRampToValueAtTime(1900, t + 0.08);
      og.gain.setValueAtTime(0.0001, t + 0.01);
      og.gain.linearRampToValueAtTime(0.07, t + 0.03);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    } catch (e) {
      try {
        og.gain.value = 0.07;
      } catch (e2) {}
    }
    startAt(o, t + 0.01);
    stopAt(o, t + 0.16);
    trackOne(o);
  }

  function uiNote(freq, at, dur) {
    var o = mkOsc("sine", freq);
    var g = mkGain(0.0001);
    link(o, g);
    link(g, sfxBus);
    try {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.09, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    } catch (e) {
      try {
        g.gain.value = 0.09;
      } catch (e2) {}
    }
    startAt(o, at);
    stopAt(o, at + dur + 0.03);
    trackOne(o);
  }

  // "save": two notes up. "load": two notes down.
  function uiTwoNotes(f1, f2) {
    var t = now();
    uiNote(f1, t, 0.1);
    uiNote(f2, t + 0.13, 0.12);
  }

  // "swell": cinematic emotional-reveal cue paired with the dolly line fx.
  // Layer A (weight): two detuned oscillators (sine + sawtooth) gliding
  // 180 -> 55 Hz through a lowpass over ~1.6 s. Layer B (presence, so laptop
  // speakers hear the move): a bandpassed noise burst centered ~300 Hz with a
  // gentle 0.8 s attack. One quiet shared dynamic: swell to peak over 0.9 s,
  // short hold, decayed to silence by ~2.4 s.
  function playSwell() {
    var t = now();
    var lp = mkFilter("lowpass", 240, 0.5);
    var env = mkGain(0.0001);
    link(lp, env);
    link(env, sfxBus);
    var oSine = mkOsc("sine", 180);
    var oSaw = mkOsc("sawtooth", 180.9); // slight detune -> slow beating
    link(oSine, lp);
    link(oSaw, lp);
    try {
      oSine.frequency.setValueAtTime(180, t);
      oSine.frequency.exponentialRampToValueAtTime(55, t + 1.6);
      oSaw.frequency.setValueAtTime(180.9, t);
      oSaw.frequency.exponentialRampToValueAtTime(55.2, t + 1.6);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.12, t + 0.9);
      env.gain.linearRampToValueAtTime(0.12, t + 1.25); // hold
      env.gain.linearRampToValueAtTime(0, t + 2.4);
    } catch (e) {
      try {
        env.gain.value = 0.12;
      } catch (e2) {}
    }
    startAt(oSine, t);
    startAt(oSaw, t);
    stopAt(oSine, t + 2.45);
    stopAt(oSaw, t + 2.45);
    trackOne(oSine);
    trackOne(oSaw);
    // Layer B: bandpassed noise presence, gentle attack, fades with layer A.
    var s = noiseSrc("white");
    if (s) {
      var bp = mkFilter("bandpass", 300, 0.9);
      var ng = mkGain(0.0001);
      link(s, bp);
      link(bp, ng);
      link(ng, sfxBus);
      try {
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.linearRampToValueAtTime(0.05, t + 0.8);
        ng.gain.linearRampToValueAtTime(0.05, t + 1.1);
        ng.gain.linearRampToValueAtTime(0, t + 2.3);
      } catch (e) {
        try {
          ng.gain.value = 0.05;
        } catch (e2) {}
      }
      startAt(s, t);
      stopAt(s, t + 2.35);
      trackOne(s);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Context / master chain / enable-disable
   * ------------------------------------------------------------------ */

  function buildMaster() {
    master = ctx.createGain();
    try {
      master.gain.value = MASTER_LEVEL * vol;
    } catch (e) {}
    var out = ctx.destination;
    var routed = false;
    try {
      var comp = ctx.createDynamicsCompressor();
      try {
        comp.threshold.value = -18;
        comp.knee.value = 24;
        comp.ratio.value = 3;
        comp.attack.value = 0.01;
        comp.release.value = 0.25;
      } catch (e) {}
      master.connect(comp);
      comp.connect(out);
      routed = true;
    } catch (e) {
      routed = false;
    }
    if (!routed) {
      try {
        master.connect(out);
      } catch (e) {}
    }
    sfxBus = ctx.createGain();
    try {
      sfxBus.gain.value = 1;
    } catch (e) {}
    link(sfxBus, master);
  }

  function tryResume() {
    if (!ctx || !on) return;
    try {
      if (ctx.state === "suspended" && ctx.resume) {
        var r = ctx.resume();
        if (r && typeof r.catch === "function") r.catch(function () {});
      }
    } catch (e) {}
  }

  // Returns the context only when supported, enabled and post-gesture;
  // otherwise null (callers no-op, the scene intent stays recorded).
  function ensureCtx() {
    if (!supported || broken || !on || !gestureSeen) return null;
    if (ctx) {
      tryResume();
      return ctx;
    }
    var AC = getAudioCtor();
    if (!AC) {
      broken = true;
      warnOnce("VN_AUDIO: Web Audio API is not available");
      return null;
    }
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      broken = true;
      warnOnce("VN_AUDIO: AudioContext creation failed");
      return null;
    }
    try {
      buildMaster();
    } catch (e) {
      master = null;
      broken = true;
      return null;
    }
    try {
      makeNoiseBuffers();
    } catch (e) {}
    tryResume();
    if (desiredBg) {
      try {
        applyScene();
      } catch (e) {}
    }
    return ctx;
  }

  function disableAudio() {
    // Audible fast kill: master ramp + stop every scheduled/looping node.
    try {
      rampParam(master.gain, 0, now(), KILL_RAMP_S);
    } catch (e) {
      try {
        master.gain.value = 0;
      } catch (e2) {}
    }
    try {
      killOneShots();
    } catch (e) {}
    try {
      for (var i = allBeds.length - 1; i >= 0; i--) stopBed(allBeds[i], 0.25);
    } catch (e) {}
    try {
      if (suspTimer) {
        clearTimeout(suspTimer);
        suspTimer = 0;
      }
      suspTimer = setTimeout(function () {
        suspTimer = 0;
        if (on || !ctx) return;
        try {
          if (ctx.state === "running" && ctx.suspend) {
            var r = ctx.suspend();
            if (r && typeof r.catch === "function") r.catch(function () {});
          }
        } catch (e) {}
      }, SUSPEND_MS);
    } catch (e) {}
  }

  function apiEnabled() {
    return supported && !broken && !!on;
  }

  function apiSetEnabled(v) {
    try {
      v = !!v;
      if (!supported || broken) return false;
      on = v;
      writePref(on);
      if (!ctx) {
        if (on) ensureCtx(); // still gated on gestureSeen inside
        return apiEnabled();
      }
      if (suspTimer) {
        clearTimeout(suspTimer);
        suspTimer = 0;
      }
      if (on) {
        tryResume();
        rampParam(master.gain, MASTER_LEVEL * vol, now(), KILL_RAMP_S);
        if (desiredBg) applyScene();
      } else {
        disableAudio();
      }
      return apiEnabled();
    } catch (e) {
      return apiEnabled();
    }
  }

  // Smooth slider move: exponential-approach toward the new master level.
  // Only touches the graph while enabled — a disabled context stays silent
  // (setEnabled(false) ramps to 0; re-enable returns to MASTER_LEVEL * vol).
  function applyVolumeGain() {
    if (!ctx || !master) return;
    var v = MASTER_LEVEL * vol;
    try {
      master.gain.cancelScheduledValues(now());
      master.gain.setTargetAtTime(v, now(), VOL_TAU_S);
    } catch (e) {
      try {
        master.gain.value = v;
      } catch (e2) {}
    }
  }

  function apiVolume() {
    try {
      return vol;
    } catch (e) {
      return 1;
    }
  }

  function apiSetVolume(v) {
    try {
      if (typeof v !== "number" || !isFinite(v)) return vol;
      if (v < 0) v = 0;
      if (v > 1) v = 1;
      vol = v;
      writeVolume();
      if (on) applyVolumeGain();
      return vol;
    } catch (e) {
      return vol;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Gesture watching + public API
   * ------------------------------------------------------------------ */

  function onGesture() {
    gestureSeen = true;
    tryResume(); // wake a policy-suspended context on real interaction
  }

  function watchGestures() {
    if (!target.addEventListener) return;
    var evs = ["pointerdown", "touchend", "keydown", "click"];
    for (var i = 0; i < evs.length; i++) {
      try {
        target.addEventListener(evs[i], onGesture, true);
      } catch (e) {}
    }
  }

  function apiScene(bgId) {
    try {
      desiredBg = bgId && BED_DEFS[bgId] ? String(bgId) : null;
      if (!ensureCtx()) return;
      applyScene();
    } catch (e) {}
  }

  function apiType() {
    try {
      var t = Date.now();
      if (t - lastTypeAt < TYPE_GAP_MS) return;
      lastTypeAt = t;
      if (!ensureCtx()) return;
      playTypeTick();
    } catch (e) {}
  }

  function apiUi(kind) {
    try {
      if (!ensureCtx()) return;
      if (kind === "start") uiStart();
      else if (kind === "select") uiSelect();
      else if (kind === "save") uiTwoNotes(587.33, 880);
      else if (kind === "load") uiTwoNotes(880, 587.33);
    } catch (e) {}
  }

  // Self-throttled one-shot: ignores calls within SWELL_GAP_MS of the
  // previous swell (mirrors the type() throttle-then-gate order).
  function apiSwell() {
    try {
      var t = Date.now();
      if (t - lastSwellAt < SWELL_GAP_MS) return;
      lastSwellAt = t;
      if (!ensureCtx()) return;
      playSwell();
    } catch (e) {}
  }

  try {
    target.VN_AUDIO = {
      scene: apiScene,
      type: apiType,
      ui: apiUi,
      swell: apiSwell,
      enabled: apiEnabled,
      setEnabled: apiSetEnabled,
      setVolume: apiSetVolume,
      volume: apiVolume
    };
  } catch (e) {}

  try {
    watchGestures();
  } catch (e) {}
})();
