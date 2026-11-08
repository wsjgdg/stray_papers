// 滚动乐团 · AI 歌词生成纯函数层
// 旋律对象 → 音符事件 → 情绪描述 → 文本生成提示词 → 返回解析与分词对齐。
// 全部纯函数：无副作用、无 React 依赖，供 Logic 层（useHome）调用。
import {
  toLoopSpec,
  type CanvasObject,
  type LoopEvent,
  type LyricLang,
} from "@/lib/canvas/scoreCanvas";
import type { LlmMessage } from "@/lib/llm";

// 本页歌词用的文本模型（后端 allowlist 里只有这一个 route，页面不暴露模型名）
export const LYRIC_LLM_MODEL = "doubao-seed-2.1-pro";

// LlmCallResult.error 是英文 raw code，一律翻成中文再展示（禁把 raw 抛给用户）
export const LLM_ERR_ZH: Record<string, string> = {
  timeout: "AI 生成超时（服务器可能正忙），请稍后重试",
  not_found: "请求未能到达文本生成，请检查网络后重试",
  rh_login_required: "请先用右上角按钮登录 RunningHub，再给这段旋律配词",
  insufficient_balance: "RunningHub 账户余额不足，请充值后重试",
  unknown: "发生未知错误，请再试一次或换个主题",
};

// 可配词判定：只有「循环中的旋律线」可以——曲线对象/鼓律动轨不发音于旋律语义、
// 锚点是一次性音（loopBeats 0）不进循环，全部没有入口
export function lyricTargetOk(obj: CanvasObject): boolean {
  return obj.type === "stroke" && !obj.drum && obj.audio.loopBeats > 0 && !obj.muted;
}

// 对象 → 循环旋律事件（与排程同源的 toLoopSpec；剔除鼓谱事件）
export function compileLyricEvents(
  obj: CanvasObject,
  bpm: number,
  baseIdx: number,
  degs: number,
): LoopEvent[] {
  return toLoopSpec(obj, bpm, baseIdx, degs).events.filter((e) => e.d === undefined);
}

// 汉字/假名单字判定（不含标点：标点先清掉，绝不占音符词位）
const CJK_CHAR = /[㐀-䶿一-鿿豈-﫿぀-ゟ゠-ヿ]/u;
const PUNCT_STRIP = /[，。、！？；：「」『』（）《》…—·,.!?;:~"'`()\[\]{}]/g;

// 整行文本 → 可演唱单位：先清标点，再中文/日文逐字切开，拉丁词按空格分（混排英文段整体保留）
export function tokenizeLyric(text: string, lang: LyricLang): string[] {
  const cleaned = text.replace(PUNCT_STRIP, lang === "en" ? " " : "").trim();
  const rawTokens = cleaned.split(/\s+/).filter((s) => s.length > 0);
  const out: string[] = [];
  for (const tok of rawTokens) {
    if (lang === "en") {
      out.push(tok);
      continue;
    }
    let buf = "";
    for (const ch of tok) {
      if (CJK_CHAR.test(ch)) {
        if (buf) {
          out.push(buf);
          buf = "";
        }
        out.push(ch);
      } else {
        buf += ch;
      }
    }
    if (buf) out.push(buf);
  }
  return out;
}

// 词数↔音符数对齐：多则均匀合并进音符（长音吃词）、少则尾部空槽 = 无词延音、
// 恰好相等直通。永远返回长度 === noteCount 的数组
export function alignLyricWords(words: string[], noteCount: number): string[] {
  if (noteCount <= 0) return [];
  if (words.length === noteCount) return words.slice();
  if (words.length === 0) return new Array(noteCount).fill("");
  if (words.length > noteCount) {
    const out: string[] = [];
    for (let i = 0; i < noteCount; i += 1) {
      const a = Math.floor((i * words.length) / noteCount);
      const b = Math.max(
        a + 1,
        Math.min(words.length, Math.ceil(((i + 1) * words.length) / noteCount)),
      );
      out.push(words.slice(a, b).join(""));
    }
    return out;
  }
  return [...words, ...new Array(noteCount - words.length).fill("")];
}

// 由音区/密度/力度/BPM 推的旋律情绪描述（进提示词，帮模型定意象）
export function describeLyricMood(
  events: LoopEvent[],
  bpm: number,
  loopBeats: number,
): string {
  if (events.length === 0) return "平静";
  let vmin = Infinity;
  let vmax = -Infinity;
  let vsum = 0;
  let imin = Infinity;
  let imax = -Infinity;
  for (const e of events) {
    vsum += e.v;
    if (e.v < vmin) vmin = e.v;
    if (e.v > vmax) vmax = e.v;
    if (e.idx < imin) imin = e.idx;
    if (e.idx > imax) imax = e.idx;
  }
  const density = events.length / Math.max(0.5, loopBeats);
  const avgV = vsum / events.length;
  const spread = imax - imin;
  const dyn = vmax - vmin;
  const parts: string[] = [];
  parts.push(density >= 2.2 ? "轻快跃动" : density <= 0.9 ? "舒缓绵长" : "从容流动");
  parts.push(avgV >= 0.55 ? "力度饱满" : avgV <= 0.32 ? "轻柔低语" : "强弱有致");
  if (spread <= 3) parts.push("音区起伏小巧");
  else if (spread >= 10) parts.push("音区跨度开阔");
  if (dyn >= 0.5) parts.push("明暗对比明显");
  parts.push(bpm >= 112 ? "节拍利落向前" : bpm <= 76 ? "速度慢板沉静" : "中速步态");
  return parts.join("、");
}

const LANG_PROMPT: Record<LyricLang, string> = {
  zh: "中文——数组每项 = 一个汉字（歌词逐字对齐音符）",
  en: "English——each item = one English word (one word per note)",
  ja: "日本語——配列の各要素 = ひらがな/カタカナ/漢字の1文字",
};

// 组装消息：强约束 JSON 数组 + 长度 = 音符数 + 押韵/意象要求（提示词模板内置调用侧）
export function buildLyricMessages(opts: {
  events: LoopEvent[];
  bpm: number;
  loopBeats: number;
  theme: string;
  lang: LyricLang;
}): LlmMessage[] {
  const n = opts.events.length;
  const contour = opts.events
    .map((e) => e.idx)
    .filter((_, i) => i % 2 === 0 || n <= 60)
    .join(" ");
  const themeLine = opts.theme
    ? `主题：${opts.theme}`
    : "主题：未指定——请按旋律情绪自行选一个贴切的意象主题";
  return [
    {
      role: "system",
      content:
        "你是替循环旋律配词的词作者。用户会给出这段旋律的音符数、音高轮廓、速度、时长与情绪。" +
        "你只返回一个 JSON 字符串数组作为回复，禁止任何解释、禁止代码围栏。硬性要求：" +
        "1) 数组长度必须恰好等于给定音符数 N，一词（字）一音符；" +
        "2) 每项是一个可唱的单词位；" +
        "3) 押韵与上口优先，意象贴合给定主题与旋律情绪；" +
        "4) 内容健康，避免生僻字。",
    },
    {
      role: "user",
      content:
        `语言：${LANG_PROMPT[opts.lang]}\n` +
        `${themeLine}\n` +
        `旋律：共 ${n} 个音符（N=${n}），循环约 ${opts.loopBeats} 拍，BPM ${opts.bpm}，情绪「${describeLyricMood(opts.events, opts.bpm, opts.loopBeats)}」。\n` +
        `音高轮廓（绝对音级序列，从低到高数值递增）：${contour}\n` +
        `请返回长度 = ${n} 的 JSON 字符串数组。`,
    },
  ];
}

// 模型返回 → 词数组：剥代码围栏后取首尾方括号做 JSON.parse；解析不出 = null（走失败话术）
export function parseLyricJson(raw: string): string[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const arr: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    const out = arr
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x.length > 0);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
