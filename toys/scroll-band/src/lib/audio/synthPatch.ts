// 滚动乐团 · 自造音色补丁（简化合成器面板的唯一参数真源）
// 纯本地持久：localStorage so-synth-patch；读档逐字段 clamp 兜底（防旧档/坏档炸引擎）。
// 预设音色不走这套参数——只有 voiceId === "custom" 的旋律音读这里的补丁。

export type SynthWave = "sine" | "square" | "sawtooth" | "triangle";
export type LfoTarget = "pitch" | "filter" | "vol";

export interface SynthPatch {
  // 振荡器：双波形 + B 相对 A 失谐 + 共享八度偏移
  waveA: SynthWave;
  waveB: SynthWave;
  detuneB: number; // -50..50 音分
  octave: number; // -2..+2
  // 滤波器：截止 / 共振 / 滤波器 ADSR（起音从低扫向截止再随 S/R 回落）
  cutoff: number; // 80..12000 Hz
  q: number; // 0.1..18
  fA: number; // 0..1s
  fD: number; // 0..1s
  fS: number; // 0..1 保持电平（×截止）
  fR: number; // 0..2s
  // 放大器 ADSR（与滤波 ADSR 分开）
  aA: number; // 0..1s
  aD: number; // 0..1s
  aS: number; // 0..1
  aR: number; // 0..2s
  // 效果器链：失真 → 合唱 → 延迟 → 混响（各路 mix=0 即旁通）
  drive: number; // 0..100
  distMix: number; // 0..1
  choRate: number; // 0.1..4Hz
  choDepth: number; // 0..100
  choMix: number; // 0..1
  dlyTime: number; // 0.05..1s
  dlyFb: number; // 0..0.85
  dlyMix: number; // 0..1
  revSize: number; // 0.5..4s
  revMix: number; // 0..1
  // 调制 LFO：音=颤音 / 滤波=cutoff 扫动 / 音量=音量颤动
  lfoTarget: LfoTarget;
  lfoRate: number; // 0.05..12Hz
  lfoDepth: number; // 0..100
}

const num = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : dflt;
  return Math.min(max, Math.max(min, n));
};

const WAVES: SynthWave[] = ["sine", "square", "sawtooth", "triangle"];
const wave = (v: unknown, dflt: SynthWave): SynthWave =>
  WAVES.includes(v as SynthWave) ? (v as SynthWave) : dflt;

const TARGETS: LfoTarget[] = ["pitch", "filter", "vol"];
const target = (v: unknown, dflt: LfoTarget): LfoTarget =>
  TARGETS.includes(v as LfoTarget) ? (v as LfoTarget) : dflt;

// 出厂默认：双锯齿轻失谐 + 中亮滤波短包络，效果全关 = 最干净的起点
export const DEFAULT_SYNTH_PATCH: SynthPatch = {
  waveA: "sawtooth",
  waveB: "square",
  detuneB: 7,
  octave: 0,
  cutoff: 2600,
  q: 1.2,
  fA: 0.01,
  fD: 0.35,
  fS: 0.55,
  fR: 0.3,
  aA: 0.008,
  aD: 0.16,
  aS: 0.5,
  aR: 0.22,
  drive: 0,
  distMix: 0,
  choRate: 0.8,
  choDepth: 40,
  choMix: 0,
  dlyTime: 0.3,
  dlyFb: 0.32,
  dlyMix: 0,
  revSize: 2.2,
  revMix: 0,
  lfoTarget: "pitch",
  lfoRate: 5.2,
  lfoDepth: 0,
};

// 起点模板：一键灌参数再细调
export const SYNTH_TEMPLATES: { id: string; name: string; desc: string; patch: SynthPatch }[] = [
  {
    id: "pad",
    name: "暖垫 Pad",
    desc: "慢起慢落的长音铺底，合唱 + 混响开着",
    patch: {
      ...DEFAULT_SYNTH_PATCH,
      waveA: "triangle",
      waveB: "sawtooth",
      detuneB: 12,
      octave: -1,
      cutoff: 1400,
      q: 0.9,
      fA: 0.6,
      fD: 0.8,
      fS: 0.8,
      fR: 1.4,
      aA: 0.5,
      aD: 0.6,
      aS: 0.75,
      aR: 1.2,
      choRate: 0.4,
      choDepth: 55,
      choMix: 0.35,
      revSize: 3.2,
      revMix: 0.4,
      lfoTarget: "filter",
      lfoRate: 0.18,
      lfoDepth: 25,
    },
  },
  {
    id: "pluck",
    name: "拨拨 Pluck",
    desc: "快起快落的弹跳短音，带一点延迟尾",
    patch: {
      ...DEFAULT_SYNTH_PATCH,
      waveA: "triangle",
      waveB: "square",
      detuneB: -9,
      cutoff: 3800,
      q: 2.5,
      fA: 0.005,
      fD: 0.12,
      fS: 0.2,
      fR: 0.12,
      aA: 0.004,
      aD: 0.09,
      aS: 0.08,
      aR: 0.1,
      dlyTime: 0.22,
      dlyFb: 0.38,
      dlyMix: 0.28,
      lfoTarget: "pitch",
      lfoRate: 6.5,
      lfoDepth: 8,
    },
  },
  {
    id: "lead",
    name: "尖叫 Lead",
    desc: "失谐双锯齿过失真吼出来，揉音拉满",
    patch: {
      ...DEFAULT_SYNTH_PATCH,
      waveA: "sawtooth",
      waveB: "sawtooth",
      detuneB: 28,
      cutoff: 6200,
      q: 4.5,
      fA: 0.01,
      fD: 0.4,
      fS: 0.7,
      fR: 0.35,
      aA: 0.006,
      aD: 0.25,
      aS: 0.7,
      aR: 0.25,
      drive: 58,
      distMix: 0.55,
      dlyTime: 0.26,
      dlyFb: 0.45,
      dlyMix: 0.22,
      lfoTarget: "pitch",
      lfoRate: 5.8,
      lfoDepth: 45,
    },
  },
];

/** 任意来源的补丁逐字段 clamp 兜底（旧档缺字段 / 坏值一律回落默认） */
export function clampSynthPatch(raw: Partial<SynthPatch> | null | undefined): SynthPatch {
  const d = DEFAULT_SYNTH_PATCH;
  const p = raw && typeof raw === "object" ? raw : {};
  return {
    waveA: wave(p.waveA, d.waveA),
    waveB: wave(p.waveB, d.waveB),
    detuneB: num(p.detuneB, -50, 50, d.detuneB),
    octave: Math.round(num(p.octave, -2, 2, d.octave)),
    cutoff: num(p.cutoff, 80, 12000, d.cutoff),
    q: num(p.q, 0.1, 18, d.q),
    fA: num(p.fA, 0, 1, d.fA),
    fD: num(p.fD, 0, 1, d.fD),
    fS: num(p.fS, 0, 1, d.fS),
    fR: num(p.fR, 0, 2, d.fR),
    aA: num(p.aA, 0, 1, d.aA),
    aD: num(p.aD, 0, 1, d.aD),
    aS: num(p.aS, 0, 1, d.aS),
    aR: num(p.aR, 0, 2, d.aR),
    drive: num(p.drive, 0, 100, d.drive),
    distMix: num(p.distMix, 0, 1, d.distMix),
    choRate: num(p.choRate, 0.1, 4, d.choRate),
    choDepth: num(p.choDepth, 0, 100, d.choDepth),
    choMix: num(p.choMix, 0, 1, d.choMix),
    dlyTime: num(p.dlyTime, 0.05, 1, d.dlyTime),
    dlyFb: num(p.dlyFb, 0, 0.85, d.dlyFb),
    dlyMix: num(p.dlyMix, 0, 1, d.dlyMix),
    revSize: num(p.revSize, 0.5, 4, d.revSize),
    revMix: num(p.revMix, 0, 1, d.revMix),
    lfoTarget: target(p.lfoTarget, d.lfoTarget),
    lfoRate: num(p.lfoRate, 0.05, 12, d.lfoRate),
    lfoDepth: num(p.lfoDepth, 0, 100, d.lfoDepth),
  };
}

export const SYNTH_PATCH_KEY = "so-synth-patch";

export function loadSynthPatch(): SynthPatch {
  try {
    const raw = window.localStorage.getItem(SYNTH_PATCH_KEY);
    if (!raw) return { ...DEFAULT_SYNTH_PATCH };
    return clampSynthPatch(JSON.parse(raw) as Partial<SynthPatch>);
  } catch {
    return { ...DEFAULT_SYNTH_PATCH };
  }
}

export function saveSynthPatch(p: SynthPatch): void {
  try {
    window.localStorage.setItem(SYNTH_PATCH_KEY, JSON.stringify(p));
  } catch {
    // 隐私模式写不进：面板当场仍可玩，只是刷新回落
  }
}
