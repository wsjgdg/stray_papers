/* ------------------------------------------------------------------
   VOLTA-8 · Web Audio engine
   Analog-modelled voices, lookahead scheduler, FX bus, live analysis.
------------------------------------------------------------------ */
import {
  MachineState,
  TRACKS,
  TrackId,
  VELOCITY,
  getScale,
  DEFAULT_PAN,
  DEFAULT_REV,
  DEFAULT_DLY,
} from "./model";
import { makeNoise, playVoice } from "./voices";

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

interface Strip {
  input: GainNode;
  pan: StereoPannerNode;
  rev: GainNode;
  dly: GainNode;
}

const PAN: Record<TrackId, number> = {
  kick: 0, snare: -0.08, clap: 0.14, chh: 0.24, ohh: -0.26, tom: -0.34, bass: 0, stab: 0.2,
};

export const filterHz = (v: number) => 200 * Math.pow(90, v);

export class Engine {
  ctx: AudioContext;
  analyser: AnalyserNode;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private stutterGain: GainNode;
  private shaper: WaveShaperNode;
  private comp: DynamicsCompressorNode;
  private convolver: ConvolverNode;
  private revReturn: GainNode;
  private delay: DelayNode;
  private fbGain: GainNode;
  private dlyReturn: GainNode;
  private noise: AudioBuffer;
  private strips = {} as Record<TrackId, Strip>;
  private getState: () => MachineState;

  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private playBank = 0;
  private queue: { step: number; bank: number; time: number }[] = [];
  private visual = { step: -1, bank: 0 };
  private levelBuf: Float32Array<ArrayBuffer>;

  private stutter = false;
  private rate = 1;
  private rateTarget = 1;

  private recDest: MediaStreamAudioDestinationNode;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  onRecorded: ((blob: Blob, ext: string) => void) | null = null;

  playing = false;

  constructor(getState: () => MachineState) {
    this.getState = getState;
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = getState().master;

    // master performance FX: lowpass "dub" filter → stutter gate → saturation
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = filterHz(getState().fx.filter);
    this.filter.Q.value = 0.7;
    this.stutterGain = ctx.createGain();
    this.stutterGain.gain.value = 1;

    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6) * 0.86;
    }
    this.shaper.curve = curve;
    this.shaper.oversample = "2x";

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -15;
    this.comp.knee.value = 14;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.72;
    this.levelBuf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));

    this.master.connect(this.filter);
    this.filter.connect(this.stutterGain);
    this.stutterGain.connect(this.shaper);
    this.shaper.connect(this.comp);
    this.comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.recDest = ctx.createMediaStreamDestination();
    this.comp.connect(this.recDest);

    // ---- reverb (synthesised impulse) ----
    this.convolver = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.9);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const early = i < ctx.sampleRate * 0.02 ? 0.35 : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * early;
      }
    }
    this.convolver.buffer = ir;
    this.revReturn = ctx.createGain();
    this.revReturn.gain.value = 0.9;
    const revHP = ctx.createBiquadFilter();
    revHP.type = "highpass";
    revHP.frequency.value = 380;
    this.convolver.connect(revHP);
    revHP.connect(this.revReturn);
    this.revReturn.connect(this.master);

    // ---- ping-pong-ish delay ----
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.24;
    this.fbGain = ctx.createGain();
    this.fbGain.gain.value = getState().fx.echo * 0.85;
    const dlyLP = ctx.createBiquadFilter();
    dlyLP.type = "lowpass";
    dlyLP.frequency.value = 2600;
    this.dlyReturn = ctx.createGain();
    this.dlyReturn.gain.value = 0.8;
    this.delay.connect(dlyLP);
    dlyLP.connect(this.fbGain);
    this.fbGain.connect(this.delay);
    dlyLP.connect(this.dlyReturn);
    this.dlyReturn.connect(this.master);

    // ---- noise source buffer ----
    this.noise = makeNoise(ctx);

    // ---- channel strips ----
    for (const def of TRACKS) {
      const input = ctx.createGain();
      input.gain.value = def.defaults.gain;
      const pan = ctx.createStereoPanner();
      pan.pan.value = PAN[def.id];
      const rev = ctx.createGain();
      rev.gain.value = 0;
      const dly = ctx.createGain();
      dly.gain.value = 0;
      input.connect(pan);
      pan.connect(this.master);
      pan.connect(rev);
      rev.connect(this.convolver);
      pan.connect(dly);
      dly.connect(this.delay);
      this.strips[def.id] = { input, pan, rev, dly };
    }
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  setMaster(v: number) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  get sampleRate() {
    return this.ctx.sampleRate;
  }

  readLevel() {
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this.levelBuf.length; i += 2) {
      const v = this.levelBuf[i];
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    return { rms: Math.sqrt(sum / (this.levelBuf.length / 2)), peak };
  }

  /* ------------------------------ transport ------------------------------ */

  start() {
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.playBank = this.getState().bankIndex;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.queue = [];
    this.tick();
    this.timer = window.setInterval(this.tick, TICK_MS);
  }

  stop() {
    this.playing = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.queue = [];
    this.visual = { step: -1, bank: this.getState().bankIndex };
    // gentle tail choke
    const t = this.ctx.currentTime;
    for (const def of TRACKS) {
      const g = this.strips[def.id].input.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0, t, 0.05);
    }
  }

  current() {
    while (this.queue.length && this.queue[0].time <= this.ctx.currentTime) {
      const ev = this.queue.shift()!;
      this.visual = { step: ev.step, bank: ev.bank };
    }
    return this.visual;
  }

  private tick = () => {
    const s = this.getState();
    const total = s.steps || 16;
    // tape-stop: transport rate eases toward its target
    this.rate += (this.rateTarget - this.rate) * 0.16;
    const stepDur = (60 / s.bpm / 4) / this.rate;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, now, 0.02);
    this.filter.frequency.setTargetAtTime(filterHz(s.fx.filter), now, 0.03);
    this.fbGain.gain.setTargetAtTime(s.fx.echo * 0.85, now, 0.05);
    this.delay.delayTime.setTargetAtTime((60 / s.bpm) * 0.75 / this.rate, now, 0.08);

    // stutter gate: chop each step to its first ~45%
    const g = this.stutterGain.gain;
    if (this.stutter) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(1, now);
      g.setTargetAtTime(0, now + stepDur * 0.45, 0.006);
    }

    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const swing = this.step % 2 === 1 ? s.swing * 0.55 * stepDur : 0;
      const t = this.nextTime + swing;
      this.scheduleStep(this.step, this.playBank, t, s, stepDur);
      this.queue.push({ step: this.step, bank: this.playBank, time: t });
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= total) {
        this.step = 0;
        this.playBank = s.chain ? (this.playBank + 1) % 4 : s.bankIndex;
      }
    }
  };

  /** jump the transport to a bank's downbeat — used by keys 1–4 while playing */
  jumpTo(bank: number) {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    this.step = 0;
    this.playBank = bank;
    this.nextTime = now + 0.04;
    this.queue = [];
    this.visual = { step: -1, bank };
  }

  setStutter(on: boolean) {
    this.stutter = on;
    if (!on) {
      this.stutterGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.015);
    }
  }

  setTape(on: boolean) {
    this.rateTarget = on ? 0.12 : 1;
  }

  private scheduleStep(i: number, bankIdx: number, t: number, s: MachineState, stepDur: number) {
    const bank = s.banks[bankIdx] ?? s.banks[0];
    const anySolo = TRACKS.some((d) => s.tracks[d.id].solo);
    const intervals = getScale(s.scaleId).intervals;

    for (const def of TRACKS) {
      const ts = s.tracks[def.id];
      const strip = this.strips[def.id];
      const audible = !ts.mute && (!anySolo || ts.solo);
      strip.input.gain.setTargetAtTime(audible ? ts.gain : 0, t, 0.008);

      const targetPan = ts.pan !== undefined ? ts.pan : DEFAULT_PAN[def.id];
      strip.pan.pan.setTargetAtTime(targetPan, t, 0.02);

      const space = def.id === "stab" ? ts.p2 : 0;
      const autoRev =
        def.id === "stab" ? space * 0.55
        : def.id === "clap" ? 0.22
        : def.id === "snare" ? 0.13
        : def.id === "ohh" ? 0.08
        : def.id === "tom" ? 0.14
        : 0;
      const targetRev = ts.rev !== undefined ? ts.rev : (DEFAULT_REV[def.id] || autoRev);
      const targetDly = ts.dly !== undefined ? ts.dly : (DEFAULT_DLY[def.id] || (space * 0.45 + (def.id === "tom" ? 0.06 : 0)));

      strip.rev.gain.setTargetAtTime(targetRev, t, 0.02);
      strip.dly.gain.setTargetAtTime(targetDly, t, 0.02);

      const st = bank[def.id][i];
      if (!st || st.v === 0 || !audible) continue;
      this.voice(def.id, t, VELOCITY[st.v], ts.p1, ts.p2, st.n, s.keyRoot, stepDur, strip.input, intervals);
    }
  }

  /** one-shot audition (also used by the keyboard) */
  audition(id: TrackId, degree = 0) {
    const s = this.getState();
    const ts = s.tracks[id];
    const strip = this.strips[id];
    const intervals = getScale(s.scaleId).intervals;
    strip.input.gain.cancelScheduledValues(this.ctx.currentTime);
    strip.input.gain.setValueAtTime(ts.mute ? 0 : ts.gain, this.ctx.currentTime);
    this.voice(id, this.ctx.currentTime + 0.01, 1, ts.p1, ts.p2, degree, s.keyRoot, 60 / s.bpm / 4, strip.input, intervals);
  }

  /* -------------------------------- voices -------------------------------- */

  private voice(
    id: TrackId, t: number, v: number, p1: number, p2: number,
    n: number, keyRoot: number, stepDur: number, out: AudioNode,
    intervals?: number[],
  ) {
    // every hit gets its own bus so the whole voice can be torn down afterwards
    const bus = this.ctx.createGain();
    bus.gain.value = 1;
    bus.connect(out);
    playVoice(this.ctx, this.noise, bus, id, t, v, p1, p2, n, keyRoot, stepDur, intervals);
    window.setTimeout(() => bus.disconnect(), Math.max(0, t - this.ctx.currentTime) * 1000 + 2000);
  }

  /* ------------------------------- recording ------------------------------- */

  get canRecord() {
    return typeof MediaRecorder !== "undefined" && !!this.recDest;
  }

  startRecording() {
    if (!this.canRecord || this.recorder) return false;
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
    try {
      this.recorder = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime } : undefined);
    } catch {
      return false;
    }
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const type = this.recorder?.mimeType || "audio/webm";
      const blob = new Blob(this.chunks, { type });
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      this.recorder = null;
      this.chunks = [];
      this.onRecorded?.(blob, ext);
    };
    this.recorder.start(200);
    return true;
  }

  stopRecording() {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
  }

  dispose() {
    this.stop();
    this.stopRecording();
    void this.ctx.close();
  }
}