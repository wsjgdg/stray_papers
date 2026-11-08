/* ------------------------------------------------------------------
   VOLTA-8 · shared voice synthesis
   Used by the realtime engine AND the offline loop renderer, so an
   exported WAV sounds exactly like the live machine.
------------------------------------------------------------------ */
import { SCALE, TrackId, VELOCITY } from "./model";

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noiseSrc(ctx: BaseAudioContext, noise: AudioBuffer, t: number, dur: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 1;
  const off = Math.random() * 1.5;
  src.start(t, off, dur + 0.05);
  src.stop(t + dur + 0.05);
  return src;
}

function env(ctx: BaseAudioContext, t: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

export function playVoice(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  out: AudioNode,
  id: TrackId,
  t: number,
  v: number,
  p1: number,
  p2: number,
  n: number,
  keyRoot: number,
  stepDur: number,
  intervals: number[] = SCALE,
) {
  switch (id) {
    case "kick": {
      const f = 38 + p1 * 36;
      const dur = 0.18 + p2 * 0.75;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f * 3.4, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.055);
      const g = env(ctx, t, v, 0.003, dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.06);
      const nz = noiseSrc(ctx, noise, t, 0.03);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1400;
      const ng = env(ctx, t, v * 0.28, 0.001, 0.022);
      nz.connect(hp).connect(ng).connect(out);
      break;
    }
    case "snare": {
      const dur = 0.08 + p2 * 0.25;
      const nz = noiseSrc(ctx, noise, t, dur + 0.1);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1100 + p1 * 2500;
      bp.Q.value = 0.7;
      const ng = env(ctx, t, v * 0.8, 0.002, dur);
      nz.connect(bp).connect(ng).connect(out);
      for (const [freq, amp] of [[185, 0.42], [278, 0.3]] as const) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq * 1.35, t);
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
        const g = env(ctx, t, v * amp, 0.002, dur * 0.55);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
      break;
    }
    case "clap": {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 800 + p1 * 1300;
      bp.Q.value = 1.3;
      bp.connect(out);
      for (const off of [0, 0.011, 0.021]) {
        const nz = noiseSrc(ctx, noise, t + off, 0.03);
        const g = env(ctx, t + off, v * 1.0, 0.001, 0.024);
        nz.connect(g).connect(bp);
      }
      const tail = noiseSrc(ctx, noise, t + 0.028, 0.12 + p2 * 0.3);
      const tg = env(ctx, t + 0.028, v * 1.1, 0.003, 0.12 + p2 * 0.3);
      tail.connect(tg).connect(bp);
      break;
    }
    case "chh":
    case "ohh": {
      const open = id === "ohh";
      const dur = open ? 0.14 + p2 * 0.5 : 0.02 + p2 * 0.09;
      const base = open ? 5000 + p1 * 4500 : 6000 + p1 * 5000;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = base * 0.8;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = base * 1.35;
      bp.Q.value = 0.9;
      const g = env(ctx, t, v * (open ? 0.62 : 0.55), 0.001, dur);
      hp.connect(bp).connect(g).connect(out);
      noiseSrc(ctx, noise, t, dur + 0.05).connect(hp);
      const metal = ctx.createGain();
      metal.gain.value = 0.13;
      metal.connect(hp);
      for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = 40 * r * (base / 8000);
        o.connect(metal);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
      break;
    }
    case "tom": {
      const f = 96 + p1 * 164;
      const dur = 0.18 + p2 * 0.4;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f * 1.7, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
      const g = env(ctx, t, v * 0.85, 0.003, dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
      const nz = noiseSrc(ctx, noise, t, 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f * 4;
      const ng = env(ctx, t, v * 0.14, 0.001, 0.05);
      nz.connect(bp).connect(ng).connect(out);
      break;
    }
    case "bass": {
      const midi = 36 + keyRoot + intervals[n % intervals.length];
      const f = mtof(midi);
      const gate = Math.max(0.07, Math.min(1.1, stepDur * (0.45 + p2 * 2.4)));
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 4.5;
      const cut = 220 + p1 * 2780;
      lp.frequency.setValueAtTime(Math.min(9000, cut * 2.6), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(110, cut * 0.45), t + gate * 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v * 0.7, t + 0.008);
      g.gain.setTargetAtTime(v * 0.46, t + 0.01, 0.08);
      g.gain.setTargetAtTime(0.0001, t + gate, 0.035);
      lp.connect(g).connect(out);
      const saw = ctx.createOscillator();
      saw.type = "sawtooth";
      saw.frequency.value = f;
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = f;
      const subG = ctx.createGain();
      subG.gain.value = 0.5;
      saw.connect(lp);
      sub.connect(subG).connect(g);
      saw.start(t); sub.start(t);
      saw.stop(t + gate + 0.3); sub.stop(t + gate + 0.3);
      break;
    }
    case "stab": {
      const midi = 60 + keyRoot + intervals[n % intervals.length];
      const dur = 0.42;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 3;
      const cut = 500 + p1 * 4700;
      lp.frequency.setValueAtTime(Math.min(12000, cut * 1.8), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(220, cut * 0.4), t + dur);
      const g = env(ctx, t, v * 0.3, 0.006, dur);
      lp.connect(g).connect(out);
      for (const iv of [0, 3, 7, 10]) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = mtof(midi + iv);
          o.detune.value = det;
          const og = ctx.createGain();
          og.gain.value = 0.25;
          o.connect(og).connect(lp);
          o.start(t);
          o.stop(t + dur + 0.1);
        }
      }
      break;
    }
  }
}

export { VELOCITY };
