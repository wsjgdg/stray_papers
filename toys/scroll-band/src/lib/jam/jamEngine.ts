// AI 合奏伙伴（Jam Session）· 本地规则引擎——无后端、无模型，纯乐理规则轮话：
//   你弹一句（监听最近若干音的音高轮廓/节奏密度/力度），停一拍，AI 用同音阶、相近音区回一句。
//   模仿型：抄你的轮廓、换你的节奏型、力度跟随；
//   对比型：轮廓取反、音区对调、你密我疏你响我轻；
//   推进型：越接越热——力度/密度/速度逐级抬升，你慢下来它也跟着降温。
//   卡农型：不改写——把你弹的这句照原样、按原节奏晚一点跟读，像轮唱。
// 音级在「音阶级索引」空间里变换（天然落在当前音阶内），出音前再夹进 26 键琴域。
import { PIANO_C3_MIDI, PIANO_KEYS } from "@/lib/audio/pianoMap";
import { scaleMidi, type Scale } from "@/lib/audio/scales";

export type JamPersona = "mirror" | "contrast" | "drive" | "canon";

export const JAM_MIN_MIDI = PIANO_C3_MIDI;
export const JAM_MAX_MIDI = PIANO_KEYS[PIANO_KEYS.length - 1].midi;

interface Obs {
  midi: number;
  vel: number;
  t: number; // AudioContext 秒
}

const MAX_OBS = 14;
const OBS_KEEP_S = 6; // 超过 6 秒的旧音踢出窗口（"最近两小节"的粗略等价）

/** 任意 MIDI → 音阶级索引（就近吸附到音阶内音） */
function nearestIdx(scale: Scale, midi: number): number {
  const n = scale.semitones.length;
  const band = Math.floor((midi - PIANO_C3_MIDI) / 12);
  let best = band * n;
  let bestD = Infinity;
  for (let cand = (band - 1) * n; cand <= (band + 2) * n; cand += 1) {
    const d = Math.abs(scaleMidi(scale, cand) - midi);
    if (d < bestD) {
      bestD = d;
      best = cand;
    }
  }
  return best;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class JamEngine {
  private obs: Obs[] = [];
  private heat = 0;

  observe(midi: number, vel: number, t: number): void {
    this.obs.push({ midi, vel, t });
    const cutoff = t - OBS_KEEP_S;
    while (this.obs.length > MAX_OBS || (this.obs[0] && this.obs[0].t < cutoff)) this.obs.shift();
  }

  get lastT(): number {
    return this.obs.length > 0 ? this.obs[this.obs.length - 1].t : -1e9;
  }

  /** 玩家抢话/切模式时清场 */
  clear(): void {
    this.obs = [];
  }

  /** 最近一句的节奏中位间隔（ms）；太少则给个从容默认 */
  medianIoI(): number {
    if (this.obs.length < 2) return 400;
    const ds: number[] = [];
    for (let i = 1; i < this.obs.length; i += 1) ds.push(this.obs[i].t - this.obs[i - 1].t);
    ds.sort((a, b) => a - b);
    return clamp(ds[Math.floor(ds.length / 2)] * 1000, 90, 1200);
  }

  /** 静默多久该接话：跟你的语速走（你弹得密它接得快），下限 300ms */
  suggestGapMs(): number {
    return Math.max(300, this.medianIoI() * 1.4);
  }

  /** 轮到 AI 说话了吗：窗口里 ≥3 个音且已静默过 gap */
  ready(now: number, gapMs: number): boolean {
    return this.obs.length >= 3 && now - this.lastT >= gapMs / 1000;
  }

  /** 生成回应乐句并清空当前窗口（轮流说话：答完从头听）。
   *  beatMs > 0 时把每个音的时刻吸附到 1/4 拍网格——接话踩在拍子上，合奏才"合"得拢；
   *  harmony = 每个旋律音下方轻奏一个三度和声（音阶级 +2，力度 55%，标记 h 供视觉/录音区分）；
   *  canonVoices = 卡农型轮唱层数 1-4（逐层更轻；长句自动退回单层）；
   *  canonGapBeats = 相邻两层错开进入的拍数（1 紧接 / 2 标准轮唱 / 4 宽松交叠） */
  respond(
    scale: Scale,
    persona: JamPersona,
    beatMs = 0,
    harmony = false,
    canonVoices = 2,
    canonGapBeats = 2,
  ): { dtMs: number; midi: number; vel: number; h?: number }[] {
    const src = this.obs.slice(-12);
    const ioi = this.medianIoI(); // 必须在清窗前取：清完再取只会拿到默认值
    this.obs = [];
    if (src.length < 2) return [];
    const idxs = src.map((o) => nearestIdx(scale, o.midi));
    let sumVel = 0;
    for (const o of src) sumVel += o.vel;
    const meanVel = clamp(sumVel / src.length, 0.2, 1);
    const sorted = [...idxs].sort((a, b) => a - b);
    const medianIdx = sorted[Math.floor(sorted.length / 2)];
    const minIdx = nearestIdx(scale, JAM_MIN_MIDI);
    const maxIdx = nearestIdx(scale, JAM_MAX_MIDI);

    let flip = 1;
    let start = clamp(medianIdx + 1, minIdx, maxIdx);
    let spacing = ioi;
    let count = clamp(src.length, 4, 8);
    let vel = meanVel;
    let accel = 0;

    if (persona === "mirror") {
      // 学你：相近音区 + 跟随力度，节奏改成"长短交替"的切分（同轮廓换节奏型）
      spacing = ioi * 1.05;
      vel = meanVel;
    } else if (persona === "contrast") {
      // 反着来：音区对调、轮廓翻转、你密我疏你响我轻
      const center = nearestIdx(scale, Math.round((JAM_MIN_MIDI + JAM_MAX_MIDI) / 2));
      start = clamp(center * 2 - medianIdx, minIdx, maxIdx);
      flip = -1;
      spacing = ioi * (ioi < 320 ? 1.55 : 0.72);
      vel = clamp(1.25 - meanVel, 0.35, 0.95);
      this.heat = 0;
    } else if (persona === "drive") {
      // 推进：越接越热；你明显放慢（间隔 >600ms）则降温一档
      if (ioi > 600) this.heat = Math.max(0, this.heat - 1);
      this.heat = Math.min(5, this.heat + 1);
      start = clamp(medianIdx + 1, minIdx, maxIdx);
      spacing = ioi * (0.78 - this.heat * 0.04);
      count = Math.min(10, src.length + 2);
      vel = clamp(0.5 + this.heat * 0.11, 0.3, 1);
      accel = Math.min(0.22, 0.03 * this.heat);
    }
    // canon 不进上面任何分支：回声整句在下面按原话生成，heat/轮廓变换都不参与

    let notes: { dtMs: number; midi: number; vel: number; h?: number }[] = [];
    if (persona === "canon") {
      // 卡农轮唱：原音原节奏复述（回声力度略收，让你的声部浮在上面）；
      // 时值取你相邻两音的真实间隔，后续节拍吸附让跟读稳稳踩进同一张拍网
      const t0 = src[0].t;
      const phrase = src
        .slice(-10)
        .map((o) => ({ dtMs: Math.round((o.t - t0) * 1000), midi: clampMidi(o.midi), vel: round2(clamp(o.vel * 0.9, 0.2, 1)) }));
      const off0 = 220; // 首音同样留一口呼吸再开口
      // 轮唱声部数：手动 1-4 层，层间错开 canonGapBeats 拍进入、逐层更轻（×0.75）；
      // 句子 ≤6 拍才允许多层（长句错开会在句中撞得太碎，自动退回单声部跟读）
      const gap = [1, 2, 4].includes(Math.round(canonGapBeats)) ? Math.round(canonGapBeats) : 2;
      const phraseEnd = phrase[phrase.length - 1].dtMs;
      const voices = beatMs > 0 && phraseEnd <= beatMs * 6 ? clamp(Math.round(canonVoices) || 1, 1, 4) : 1;
      for (let v = 0; v < voices; v += 1) {
        const off = off0 + v * beatMs * gap;
        const vK = Math.pow(0.75, v);
        for (const ph of phrase) {
          notes.push({ ...ph, dtMs: ph.dtMs + off, vel: round2(clamp(ph.vel * vK, 0.2, 1)) });
        }
      }
      notes.sort((a, b) => a.dtMs - b.dtMs); // 多声部交错合流，网格吸附按升序处理
    } else {
      let cur = start;
      let acc = 220; // 首音前留一口呼吸
      notes.push({ dtMs: acc, midi: clampMidi(scaleMidi(scale, cur)), vel: round2(vel) });
      for (let i = 1; i < count; i += 1) {
        const raw = i < idxs.length ? idxs[i] - idxs[i - 1] : Math.round((Math.random() - 0.5) * 3);
        let step = raw * flip;
        if (persona === "drive") step = Math.round(step * 1.5);
        if (persona === "mirror" && step === 0) step = Math.random() < 0.5 ? 1 : -1; // 模仿者把同音重复换成微动
        step = clamp(step, -3, 3);
        cur = clamp(cur + step, minIdx, maxIdx);
        // 节奏型差异化：mirror 长短交替、contrast 平稳等距、drive 逐级加速
        const shape = persona === "mirror" ? (i % 2 === 0 ? 1.35 : 0.68) : persona === "drive" ? 1 - Math.min(accel, accel * (i / count)) : 1;
        acc += Math.max(70, spacing * shape * (1 + (Math.random() - 0.5) * 0.12));
        const vJit = persona === "drive" && i % 4 === 0 ? 0.1 : (Math.random() - 0.5) * 0.12;
        notes.push({ dtMs: Math.round(acc), midi: clampMidi(scaleMidi(scale, cur)), vel: round2(clamp(vel + vJit, 0.2, 1)) });
      }
    }
    if (harmony) {
      // 三度和声：每个旋律音延后 25ms 轻奏音阶级 +2 的和声音（h 标记；撞网格时自然错到下一格）
      const maxD = nearestIdx(scale, JAM_MAX_MIDI);
      const withHarm: { dtMs: number; midi: number; vel: number; h?: number }[] = [];
      for (const n of notes) {
        withHarm.push(n);
        withHarm.push({
          dtMs: n.dtMs + 25,
          midi: clampMidi(scaleMidi(scale, Math.min(nearestIdx(scale, n.midi) + 2, maxD))),
          vel: round2(n.vel * 0.55),
          h: 1,
        });
      }
      notes = withHarm;
    }
    if (beatMs > 0) {
      // 吸附 1/4 拍网格（下限 60ms 防高 BPM 挤成一团）；吸附后保持严格递增
      const grid = Math.max(beatMs / 4, 60);
      let prev = -grid;
      for (const n of notes) {
        n.dtMs = Math.max(prev + grid, Math.round(n.dtMs / grid) * grid);
        prev = n.dtMs;
      }
    }
    return notes;
  }
}

function clampMidi(m: number): number {
  return clamp(Math.round(m), JAM_MIN_MIDI, JAM_MAX_MIDI);
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
