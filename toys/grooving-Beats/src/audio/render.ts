/* ------------------------------------------------------------------
   VOLTA-8 · offline audio renderer
   Renders master loop or individual track stems through the EXACT SAME
   voice synthesis as live playback. Outputs 16-bit 44.1kHz PCM WAVs
   and standard multi-track zip bundles.
------------------------------------------------------------------ */
import { MachineState, TRACKS, TrackId, VELOCITY, getScale, DEFAULT_PAN } from "./model";
import { makeNoise, playVoice } from "./voices";
import { filterHz } from "./engine";
import { createZip, ZipEntry } from "./zip";

export function encodeWavBytes(buf: AudioBuffer): Uint8Array {
  const ch = Math.min(2, buf.numberOfChannels);
  const len = buf.length;
  const sr = buf.sampleRate;
  const bytes = 44 + len * ch * 2;
  const u8 = new Uint8Array(bytes);
  const dv = new DataView(u8.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  dv.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * ch * 2, true);
  dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, len * ch * 2, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return u8;
}

function encodeWav(buf: AudioBuffer): Blob {
  const u8 = encodeWavBytes(buf);
  return new Blob([u8.buffer as ArrayBuffer], { type: "audio/wav" });
}

export async function renderLoopToWav(s: MachineState, bars = 4): Promise<Blob> {
  const Ctor =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctor) throw new Error("OfflineAudioContext not supported");

  const steps = s.steps || 16;
  const stepDur = 60 / s.bpm / 4;
  const total = bars * steps;
  const dur = total * stepDur + 1.4; // tail for decays
  const sr = 44100;
  const ctx = new Ctor(2, Math.ceil(dur * sr), sr);
  const noise = makeNoise(ctx);
  const intervals = getScale(s.scaleId).intervals;

  // Master bus glue chain
  const master = ctx.createGain();
  master.gain.value = s.master;
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = 0.7;
  filt.frequency.value = filterHz(s.fx.filter);
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6) * 0.86;
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -15;
  comp.knee.value = 14;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  master.connect(filt);
  filt.connect(shaper);
  shaper.connect(comp);
  comp.connect(ctx.destination);

  // Per-track gain + pan
  const anySolo = TRACKS.some((d) => s.tracks[d.id].solo);
  const out = {} as Record<TrackId, GainNode>;
  for (const def of TRACKS) {
    const ts = s.tracks[def.id];
    const audible = !ts.mute && (!anySolo || ts.solo);
    const g = ctx.createGain();
    g.gain.value = audible ? ts.gain : 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = ts.pan !== undefined ? ts.pan : DEFAULT_PAN[def.id];
    g.connect(pan);
    pan.connect(master);
    out[def.id] = g;
  }

  const t0 = 0.05;
  for (let i = 0; i < total; i++) {
    const bankIdx = s.chain ? Math.floor(i / steps) % 4 : s.bankIndex;
    const bank = s.banks[bankIdx] ?? s.banks[0];
    const swing = i % 2 === 1 ? s.swing * 0.55 * stepDur : 0;
    const t = t0 + i * stepDur + swing;
    for (const def of TRACKS) {
      const st = bank[def.id][i % steps];
      if (!st || st.v === 0) continue;
      const ts = s.tracks[def.id];
      if (ts.mute || (anySolo && !ts.solo)) continue;
      playVoice(ctx, noise, out[def.id], def.id, t, VELOCITY[st.v], ts.p1, ts.p2, st.n, s.keyRoot, stepDur, intervals);
    }
  }

  const buf = await ctx.startRendering();
  return encodeWav(buf);
}

/** Render all 8 separate track stems into a DAW-ready ZIP file */
export async function renderStemsToZip(s: MachineState, bars = 4): Promise<Blob> {
  const Ctor =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctor) throw new Error("OfflineAudioContext not supported");

  const steps = s.steps || 16;
  const stepDur = 60 / s.bpm / 4;
  const total = bars * steps;
  const dur = total * stepDur + 1.2;
  const sr = 44100;
  const intervals = getScale(s.scaleId).intervals;

  const entries: ZipEntry[] = [];

  for (let idx = 0; idx < TRACKS.length; idx++) {
    const def = TRACKS[idx];
    const ts = s.tracks[def.id];
    const ctx = new Ctor(2, Math.ceil(dur * sr), sr);
    const noise = makeNoise(ctx);

    const gain = ctx.createGain();
    gain.gain.value = ts.gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = ts.pan !== undefined ? ts.pan : DEFAULT_PAN[def.id];
    gain.connect(pan);
    pan.connect(ctx.destination);

    const t0 = 0.05;
    for (let i = 0; i < total; i++) {
      const bankIdx = s.chain ? Math.floor(i / steps) % 4 : s.bankIndex;
      const bank = s.banks[bankIdx] ?? s.banks[0];
      const swing = i % 2 === 1 ? s.swing * 0.55 * stepDur : 0;
      const t = t0 + i * stepDur + swing;
      const st = bank[def.id][i % steps];
      if (st && st.v > 0) {
        playVoice(ctx, noise, gain, def.id, t, VELOCITY[st.v], ts.p1, ts.p2, st.n, s.keyRoot, stepDur, intervals);
      }
    }

    const buf = await ctx.startRendering();
    const wavBytes = encodeWavBytes(buf);
    const fileName = `stem_0${idx + 1}_${def.name.replace(/\s+/g, "")}.wav`;
    entries.push({ name: fileName, data: wavBytes });
  }

  // Include session readme
  const info = [
    `VOLTA-8 STEMS EXPORT`,
    `===================`,
    `BPM: ${Math.round(s.bpm)}`,
    `Steps: ${steps}`,
    `Bars: ${bars}`,
    `Key: ${s.keyRoot}`,
    `Scale: ${getScale(s.scaleId).name}`,
    `Swing: ${Math.round(s.swing * 100)}%`,
    ``,
    `Tracks:`,
    ...TRACKS.map((t, i) => `0${i + 1}_${t.name}: Level ${Math.round(s.tracks[t.id].gain * 100)}%`),
  ].join("\r\n");

  entries.push({
    name: "SESSION_INFO.txt",
    data: new TextEncoder().encode(info),
  });

  return createZip(entries);
}
