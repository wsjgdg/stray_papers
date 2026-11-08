// 录音事件序列 ⇄ URL 参数（base36 定长压缩编码）
// 事件: n=音符 s=延音 d=鼓 p=钢琴 x=延音结束；t 毫秒4位 / idx 2位 / 力度1位 / 滤波1位 / 鼓型1位
// p 事件: t4 + 键位索引1 + 黑键×延音×弱音1 + 力度1（一段一字符，控制分享链接长度）
// 状态字符 0..7 位枚举：bit0=黑键 bit1=延音 bit2=弱音；旧数据 0..3 天然兼容（弱音位缺省为 0）
// ?t= 短参数编码 音阶id+音色id+鼓包id+打字模式（一段一字符），旧链接缺段回落 五声+玻璃+原声+鼓

import {
  DEFAULT_DRUMKIT_ID,
  DEFAULT_SCALE_ID,
  DEFAULT_VOICE_ID,
  DRUM_KITS,
  SCALES,
  VOICES,
  drumKitIndexOf,
  scaleIndexOf,
  voiceIndexOf,
} from "@/lib/audio/scales";
import type { TypingMode } from "@/lib/audio/pianoMap";

export interface ScoreEvent {
  t: number; // 距录音开始的秒数
  k: "n" | "s" | "d" | "p" | "x";
  idx?: number; // 音级绝对索引 0..24
  v?: number; // 力度 0..15
  c?: number; // 滤波截止档位 0..15
  g?: number; // 鼓型索引 0..3
  ki?: number; // 钢琴键位索引 0..25（k="p"）
  b?: number; // 钢琴黑键标志 0/1（k="p"，Shift 弹右邻黑键；编码时与延音/弱音位合并为 0..7 状态字符）
  s?: number; // 钢琴延音踏板位 0/1（k="p"，演奏时踏板是否踩着；回放重现长尾延续）
  soft?: number; // 钢琴弱音器位 0/1（k="p"，演奏时弱音是否踩着；回放重现压暗变轻音色）
}

export interface Score {
  bpm: number;
  events: ScoreEvent[];
}

const B36 = /^[0-9a-z]$/;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function tStr(t: number): string {
  return Math.round(clamp(t * 1000, 0, 1679615))
    .toString(36)
    .padStart(4, "0");
}

export function encodeScore(events: ScoreEvent[], bpm: number): string {
  if (events.length === 0) return "";
  const body = events
    .map((e) => {
      const t = tStr(e.t);
      const v = clamp(Math.round(e.v ?? 8), 0, 35).toString(36);
      const c = clamp(Math.round(e.c ?? 8), 0, 35).toString(36);
      const idx = clamp(Math.round(e.idx ?? 12), 0, 1295)
        .toString(36)
        .padStart(2, "0");
      if (e.k === "n" || e.k === "s") return `${e.k}${t}${idx}${v}${c}`;
      if (e.k === "d") return `d${t}${clamp(e.g ?? 0, 0, 3)}`;
      if (e.k === "p") {
        const ki = clamp(Math.round(e.ki ?? 0), 0, 25).toString(36);
        const bs = clamp(
          (e.b === 1 ? 1 : 0) + (e.s === 1 ? 2 : 0) + (e.soft === 1 ? 4 : 0),
          0,
          7,
        );
        return `p${t}${ki}${bs}${clamp(Math.round(e.v ?? 8), 0, 35).toString(36)}`;
      }
      return `x${t}`;
    })
    .join("");
  return `b${clamp(Math.round(bpm), 40, 240)}.${body}`;
}

function read36(s: string, at: number, len: number): number | null {
  for (let i = at; i < at + len; i += 1) {
    if (!B36.test(s[i] ?? "")) return null;
  }
  return parseInt(s.slice(at, at + len), 36);
}

export function decodeScore(raw: string): Score | null {
  const m = /^b(\d{2,3})\./.exec(raw);
  if (!m) return null;
  const bpm = parseInt(m[1], 10);
  const body = raw.slice(m[0].length);
  const events: ScoreEvent[] = [];
  let p = 0;
  while (p < body.length) {
    const k = body[p];
    if (k === "n" || k === "s") {
      if (p + 9 > body.length) return null;
      const t = read36(body, p + 1, 4);
      const idx = read36(body, p + 5, 2);
      const v = read36(body, p + 7, 1);
      const c = read36(body, p + 8, 1);
      if (t === null || idx === null || v === null || c === null) return null;
      events.push({ t: t / 1000, k, idx, v, c });
      p += 9;
    } else if (k === "d") {
      if (p + 6 > body.length) return null;
      const t = read36(body, p + 1, 4);
      const g = parseInt(body[p + 5] ?? "", 10);
      if (t === null || Number.isNaN(g) || g < 0 || g > 3) return null;
      events.push({ t: t / 1000, k: "d", g, v: 10 });
      p += 6;
    } else if (k === "p") {
      if (p + 8 > body.length) return null;
      const t = read36(body, p + 1, 4);
      const ki = read36(body, p + 5, 1);
      const bs = parseInt(body[p + 6] ?? "", 10);
      const v = read36(body, p + 7, 1);
      // 三位合并位枚举：bit0 黑键 / bit1 延音 / bit2 弱音；旧值 0..3 天然兼容（弱音位缺省 0），越界视为损坏
      if (t === null || ki === null || ki > 25 || Number.isNaN(bs) || bs < 0 || bs > 7 || v === null) return null;
      events.push({
        t: t / 1000,
        k: "p",
        ki,
        b: bs & 1,
        v,
        s: (bs >> 1) & 1,
        soft: (bs >> 2) & 1,
      });
      p += 8;
    } else if (k === "x") {
      if (p + 5 > body.length) return null;
      const t = read36(body, p + 1, 4);
      if (t === null) return null;
      events.push({ t: t / 1000, k: "x" });
      p += 5;
    } else {
      return null;
    }
  }
  if (events.length === 0) return null;
  return { bpm, events };
}

export function scoreParamFromUrl(): Score | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("score");
  if (!raw) return null;
  return decodeScore(raw);
}

export function canvasParamFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("canvas");
}

/** ?ro=1：只读分享——打开的人能听能弹，但画布编辑全部禁用（顶栏可「复制继续创作」解锁） */
export function roParamFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("ro") === "1";
}

// ---- ?relay= 接龙账本（异步协作传纸条）----
// 账本 [{n:昵称, k:该棒新增对象数}]，对象按解码顺序连续归属：前 k1 个属第 1 棒、接下来 k2 个属第 2 棒……
// 解析失败返回 null，视为非接龙链接走普通 guest。
export interface RelayLeg {
  n: string;
  k: number;
}

export function encodeRelayParam(ledger: RelayLeg[]): string {
  if (!Array.isArray(ledger) || ledger.length === 0) return "";
  return JSON.stringify(ledger.map((l) => ({ n: String(l.n).slice(0, 24), k: Math.max(0, Math.floor(l.k)) })));
}

export function decodeRelayParam(raw: string): RelayLeg[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: RelayLeg[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) return null;
      const l = item as { n?: unknown; k?: unknown };
      if (typeof l.n !== "string" || typeof l.k !== "number" || !Number.isFinite(l.k) || l.k < 0) return null;
      out.push({ n: l.n.slice(0, 24), k: Math.floor(l.k) });
    }
    return out;
  } catch {
    return null;
  }
}

export function relayParamFromUrl(): RelayLeg[] | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("relay");
  if (!raw) return null;
  return decodeRelayParam(raw);
}

/** ?t= 编码：s<音阶索引>v<音色索引>k<鼓包索引>m<打字模式索引>（k/m 段可缺省，兼容旧链接） */
export function buildTParam(
  scaleId: string,
  voiceId: string,
  drumKitId: string,
  typingMode: TypingMode = "drum",
): string {
  return `s${scaleIndexOf(scaleId)}v${voiceIndexOf(voiceId)}k${drumKitIndexOf(drumKitId)}m${typingMode === "piano" ? 1 : 0}`;
}

export function tParamFromUrl(): {
  scaleId: string;
  voiceId: string;
  drumKitId: string;
  typingMode: TypingMode;
} {
  const fallback = {
    scaleId: DEFAULT_SCALE_ID,
    voiceId: DEFAULT_VOICE_ID,
    drumKitId: DEFAULT_DRUMKIT_ID,
    typingMode: "drum" as TypingMode,
  };
  if (typeof window === "undefined") return fallback;
  const raw = new URLSearchParams(window.location.search).get("t");
  if (!raw) return fallback;
  const m = /^s(\d)v(\d)(?:k(\d))?(?:m(\d))?$/.exec(raw);
  if (!m) return fallback;
  const si = parseInt(m[1], 10);
  const vi = parseInt(m[2], 10);
  const ki = m[3] === undefined ? -1 : parseInt(m[3], 10);
  const mi = m[4] === undefined ? -1 : parseInt(m[4], 10);
  return {
    scaleId: si >= 0 && si < SCALES.length ? SCALES[si].id : DEFAULT_SCALE_ID,
    voiceId: vi >= 0 && vi < VOICES.length ? VOICES[vi].id : DEFAULT_VOICE_ID,
    drumKitId: ki >= 0 && ki < DRUM_KITS.length ? DRUM_KITS[ki].id : DEFAULT_DRUMKIT_ID,
    typingMode: mi === 1 ? "piano" : "drum",
  };
}

export function buildShareUrl(
  scoreCode?: string,
  canvasCode?: string,
  tCode?: string,
  relayCode?: string,
  styleCode?: string,
): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const params: string[] = [];
  if (scoreCode) params.push(`score=${encodeURIComponent(scoreCode)}`);
  if (canvasCode) params.push(`canvas=${encodeURIComponent(canvasCode)}`);
  if (tCode) params.push(`t=${encodeURIComponent(tCode)}`);
  if (relayCode) params.push(`relay=${encodeURIComponent(relayCode)}`);
  // ?style= 风格迁移标记：打开方按 preset id 先快照再重放变换；旧链接缺此参数照常原样播放
  if (styleCode) params.push(`style=${encodeURIComponent(styleCode)}`);
  return params.length > 0 ? `${base}?${params.join("&")}` : base;
}

/** ?style= 风格迁移标记（jazz/bit8/orch/lofi/synthpop），无 = null（原样播放，旧链接向后兼容） */
export function styleParamFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("style");
}

// UGC 关卡分享短链：?lid=<记录id>（与 ?score=/?canvas= 互不干扰，lid 优先级最低——
// 启动读取方只在两者都缺位时才认 lid，三参数永不打架）
export function buildLevelShareUrl(lid: string): string {
  return `${window.location.origin}${window.location.pathname}?lid=${encodeURIComponent(lid)}`;
}
