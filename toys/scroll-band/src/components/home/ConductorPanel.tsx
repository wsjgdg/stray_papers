import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { useHome } from "@/pages/Home/useHome";
import { runAgent } from "@/lib/agent";
import { prefersReducedMotion, usePanelEntrance } from "./usePanelMotion";
import { loadVoiceVol } from "@/lib/voiceVolume";

type Msg = { role: "user" | "assistant"; text: string };

// 快捷提问题库（点击即发送）：一次只露 3 条，「换一批」按批轮换；按 情绪 / 乐理 / 编曲 / 练法 / 玩法 / 场景 六类配齐 132 条
const QUICK_GROUPS: { cat: string; items: string[] }[] = [
  {
    cat: "情绪",
    items: [
      "雨夜独奏的感觉怎么搭？",
  "晨光感该怎么配？",
  "街机像素味怎么出来？",
  "仪式感、庄严一点的编法",
  "深夜 Lo-fi 来一套",
  "孤独感怎么弹出来？",
  "治愈系的小温暖怎么配？",
  "老唱片的复古味怎么弄？",
  "梦境漂浮感用什么音阶？",
  "太空辽阔感怎么搭？",
  "深海水压感怎么表现？",
  "森林晨雾的画面感",
  "雪落无声的安静怎么弹？",
  "火车窗外的流动感",
  "霓虹都市的夜行感",
  "游戏 Boss 战的紧张感",
  "片尾字幕的谢幕感",
  "音乐盒的童真感",
  "爵士酒吧的慵懒感",
  "中国风往哪个音阶靠？",
  "日系阴翳感怎么配？",
      "电影开场的悬念感",
    ],
  },
  {
    cat: "乐理",
    items: [
  "六种音阶各是什么性格？",
  "五声和大调差在哪？",
  "小调为什么听着忧伤？",
  "布鲁斯的蓝味是哪来的？",
  "全音音阶听着怪，怎么用对？",
  "都节音阶适合什么画面？",
  "音程到底是什么？",
  "和弦是怎么构成的？",
  "协和与不协和好听在哪？",
  "和声的解决感怎么听？",
  "BPM 快慢差在什么情绪？",
  "节拍和切分是怎么回事？",
  "琶音为什么一响就华丽？",
  "调式和音阶是一回事吗？",
  "八度为什么听着像同一个音？",
  "十二平均律是什么？",
  "音的高低是怎么定的？",
  "力度对演奏有多重要？",
  "音色背后的泛音是什么？",
      "为什么 Do Re Mi 走到高八度像回家？",
    ],
  },
  {
    cat: "编曲",
    items: [
  "循环叠得糊了，帮我做减法",
  "怎么给作品加低音？",
  "旋律留白怎么留？",
  "锚点放几个才不抢戏？",
  "怎么让旋律更有记忆点？",
  "画线往哪个方向画好听？",
  "上行线和下行线情绪不同吗？",
  "闭合圈画成琶音好用吗？",
  "两条线怎么叠不打架？",
  "低音声部怎么画？",
  "打字鼓的节奏怎么变化？",
  "鼓怎么加花不腻？",
  "强拍弱拍怎么安排？",
  "长音什么时候用最好？",
  "重复段落怎么做出变化？",
  "前奏怎么铺垫？",
  "结尾怎么收得干净？",
  "循环设几拍最好对齐？",
  "锚点和画线怎么分工？",
  "和弦音用锚点怎么垫？",
  "怎么让作品有问答感？",
      "主旋律和伴奏怎么分层？",
    ],
  },
  {
    cat: "练法",
    items: [
  "挑战关怎么练才不慌？",
  "弹挑战老 Miss 怎么办？",
  "快速段落总跟不上怎么办？",
  "指法建议怎么看懂？",
  "慢速练习多少倍合适？",
  "循环本小节怎么练最有效？",
  "等待模式适合什么情况？",
  "怎么练才记得住谱面？",
  "字母钢琴怎么上手？",
  "黑键怎么按不磕绊？",
  "延音踏板怎么用不糊？",
  "弱音器踏板什么时候踩？",
  "打字鼓怎么跟上手速？",
  "多指同时弹怎么协调？",
  "怎么练即兴不乱跑？",
  "八度范围怎么挑？",
  "即兴跑句怎么弹华丽？",
  "练琴先练节奏还是音高？",
  "错音后怎么接回去？",
      "演出前怎么热身？",
    ],
  },
  {
    cat: "玩法",
    items: [
  "循环台第一层录什么好？",
  "循环台怎么叠不糊？",
  "循环对不齐是什么原因？",
  "乐句宏琶音怎么玩？",
  "乐句宏音阶档有什么效果？",
  "动色自动档到底在干什么？",
  "动色锁定档什么时候用？",
  "四套鼓包各适合什么曲子？",
  "八种音色怎么选？",
  "玻璃和拨弦什么时候用？",
  "钟音色配什么曲子？",
  "贝斯音色能当低音吗？",
  "弦乐音色怎么拉长弓？",
  "空间混响开多大合适？",
  "环境垫音要不要开？",
  "遥测表各格在看什么？",
  "画布存档怎么用最顺？",
  "BPM 面板怎么打拍定速？",
  "MIDI 导出能干什么？",
  "导出的 .mid 还能怎么续编？",
  "分享链接别人能干嘛？",
  "画廊里能看到什么？",
  "自定义乐谱怎么导入？",
  "文本谱怎么写？",
  "挑战演示模式怎么用？",
  "慢速练习本关怎么开？",
  "分享演奏是怎么做到的？",
  "背景琴键有什么用？",
  "触屏键盘哪里开？",
  "更多折叠里藏了什么？",
  "打字层和琴键怎么配合？",
      "钢琴模式字母怎么排键？",
    ],
  },
  {
    cat: "场景",
    items: [
  "给春天写一小段",
  "写一段告白的旋律",
  "离别场景配什么感觉？",
  "运动会入场式的热闹",
  "恐怖片瞬间怎么奏效？",
  "童话开场往哪个方向画？",
  "雨过天晴的转晴感",
  "深夜赶路的疲惫感",
  "海边日落的松弛感",
  "圣诞氛围小曲怎么配？",
  "给失眠写一段安神的",
  "写一段给孩子的摇篮曲",
  "咖啡馆背景音乐怎么搭？",
  "直播开场 BGM 想要抓耳",
  "游戏存档点的安全感",
      "胜利结算画面的爽感",
    ],
  },
];

type QuickItem = { q: string; cat: string };
// 展平：每条带类别标签，供 chip 展示、按类筛选与沉底排序共用
const QUICK_POOL: QuickItem[] = QUICK_GROUPS.flatMap((g) => g.items.map((q) => ({ q, cat: g.cat })));
const QUICK_TEXTS = new Set(QUICK_POOL.map((o) => o.q));
const QUICK_PAGE = 3;

// 开场白随人格而定（换人格后「重开」见新招呼；进行中的对话不追溯）
const GREETINGS: Record<Persona, string> = {
  default: "你好，我是指挥。说说你想听到什么样的感觉，我把它翻成这儿能立刻上手的玩法；乐理、编曲、练法都可以问。",
  mentor: "指挥在此，规矩先说在前：我不兜圈子。报上目标或问题，我按标准给你拆——进步了我认，偷懒我也说。",
  buddy: "嘿，我是指挥，你的玩音乐搭子。想弄点什么感觉的？别怕问“傻问题”，这儿没有傻问题，只有还没玩到的玩法。",
  explorer: "我是指挥。今天的规矩：没有“不应该”。全音阶配摇篮曲？88 BPM 的舞曲？尽管抛过来，我们把翻车录成素材。",
};
const greetingOf = (ps: Persona): Msg => ({ role: "assistant", text: GREETINGS[ps] });
// 输入框引导语也随人格
const INPUT_HINT: Record<Persona, string> = {
  default: "说说你想要的感觉，或想问的乐理…",
  mentor: "直接报目标：这周要练成什么？",
  buddy: "想玩点什么感觉的？",
  explorer: "想炸点什么规矩？",
};

// 本地持久：关掉面板、刷新页面聊天记录都不丢（多轮上下文在服务端，这里连界面与会话 id 也续上）；
// 只留最近 60 条，读写失败（如隐私模式）静默降级为内存缓存
const CHAT_KEY = "so-conductor-chat-v1";

// 点过的快捷提问（本地留存）：下次打开面板时问过的自动沉底，先让你看到没见过的
const QUICK_SEEN_KEY = "so-conductor-quick-seen-v1";

function loadQuickSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(QUICK_SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function loadChatCache(): { msgs: Msg[]; sessionId?: string } {
  try {
    const raw = window.localStorage.getItem(CHAT_KEY);
    if (!raw) return { msgs: [] };
    const data = JSON.parse(raw) as { msgs?: unknown; sessionId?: unknown };
    const msgs = Array.isArray(data.msgs)
      ? data.msgs
          .slice(-60)
          .filter(
            (m): m is Msg =>
              !!m &&
              typeof m === "object" &&
              "text" in m &&
              typeof (m as Msg).text === "string" &&
              ((m as Msg).role === "user" || (m as Msg).role === "assistant"),
          )
      : [];
    return { msgs, sessionId: typeof data.sessionId === "string" ? data.sessionId : undefined };
  } catch {
    return { msgs: [] };
  }
}

const chatCache: { msgs: Msg[]; sessionId?: string } = loadChatCache();

// 指挥回复末尾可附三类暗号块：```stage（翻成「应用到舞台」按钮）、```report（翻成体检报告卡）
// 与 ```next（翻成两颗可点的追问按钮）。三种块的原文都不进气泡；流式打字途中半截的块也不让它闪出来
type CanvasReport = { grade: string; hear: string; good: string[]; risk: string[]; next: string };

function auxView(text: string): {
  shown: string;
  hints: Record<string, string | number> | null;
  report: CanvasReport | null;
  followUps: string[];
} {
  const stageM = /```stage\n([\s\S]*?)```/.exec(text);
  const reportM = /```report\n([\s\S]*?)```/.exec(text);
  const nextM = /```next\n([\s\S]*?)```/.exec(text);
  let shown = text.replace(/```(stage|report|next)\n[\s\S]*?```/g, "");
  for (const tag of ["```stage", "```report", "```next"]) {
    const cut = shown.indexOf(tag);
    if (cut >= 0) shown = shown.slice(0, cut);
  }
  const followUps = nextM
    ? nextM[1]
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const hints: Record<string, string | number> = {};
  if (stageM) {
    for (const line of stageM[1].split("\n")) {
      const kv = /^\s*([A-Za-z]+)\s*[:：]\s*(.+?)\s*$/.exec(line);
      if (!kv) continue;
      const key = kv[1].toLowerCase();
      if (key === "bpm") {
        const n = Number(kv[2]);
        if (Number.isFinite(n)) hints[key] = n;
      } else {
        hints[key] = kv[2];
      }
    }
  }
  let report: CanvasReport | null = null;
  if (reportM) {
    const f: Record<string, string> = {};
    for (const line of reportM[1].split("\n")) {
      const kv = /^\s*([A-Za-z]+)\s*[:：]\s*(.+?)\s*$/.exec(line);
      if (kv) f[kv[1].toLowerCase()] = kv[2];
    }
    const list = (v?: string) =>
      (v ?? "")
        .split(/[|｜]/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (f.grade && f.next) {
      report = { grade: f.grade, hear: f.hear ?? "", good: list(f.good), risk: list(f.risk), next: f.next };
    }
  }
  return {
    shown: shown.trimEnd(),
    hints: Object.keys(hints).length > 0 ? hints : null,
    report,
    followUps,
  };
}

// key=value / key: value 行解析（stage 块与隐患修复暗号共用）
function parseKv(src: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const line of src.split(/[;\n]/)) {
    const kv = /^\s*([A-Za-z]+)\s*[:=：]\s*(.+?)\s*$/.exec(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    if (key === "bpm") {
      const n = Number(kv[2]);
      if (Number.isFinite(n)) out[key] = n;
    } else {
      out[key] = kv[2];
    }
  }
  return out;
}

// 隐患条目末尾的修复暗号 ⟦scale=dorian;bpm=90⟧：拆出展示文本 + 可一键应用的补丁
// （指挥按体检按钮 payload 里的约定输出；不带暗号的隐患就是纯文字建议）
function splitRiskFix(risk: string): { text: string; fix: Record<string, string | number> | null } {
  const m = /^(.*?)⟦(.+?)⟧\s*$/.exec(risk.trim());
  if (!m) return { text: risk, fix: null };
  const fix = parseKv(m[2]);
  if (Object.keys(fix).length === 0) return { text: risk, fix: null };
  return { text: m[1].trim() || risk, fix };
}

// 从可能裹着 markdown 的字符串里抠出第一个 {...} JSON（B 层二次抽取用）
function extractJson(s: string): string {
  const f = s.indexOf("{")
  const l = s.lastIndexOf("}")
  if (f >= 0 && l > f) return s.slice(f, l + 1)
  return s
}

// 兜底抽取：从正文正则捞可应用设置（A/B 都没拿到 structured 时的保底，C 层）
function regexHints(text: string): Record<string, string | number> | null {
  type Rule = { re: RegExp; key: string; num: boolean }
  const rules: Rule[] = [
    { re: /([A-Za-z一-龥]{1,10})\s*(?:音阶|调式|scale)/i, key: "scale", num: false },
    { re: /(?:音阶|调式|scale)\s*[:：=是]?\s*([A-Za-z一-龥]{1,10})/i, key: "scale", num: false },
    { re: /([A-Za-z一-龥]{1,10})\s*(?:音色|voice)/i, key: "voice", num: false },
    { re: /(?:音色|voice)\s*[:：=是]?\s*([A-Za-z一-龥]{1,10})/i, key: "voice", num: false },
    { re: /([A-Za-z一-龥]{1,10})\s*(?:鼓组?|drum)/i, key: "drum", num: false },
    { re: /(?:鼓组?|drum)\s*[:：=是]?\s*([A-Za-z一-龥]{1,10})/i, key: "drum", num: false },
    { re: /([A-Za-z一-龥]{1,10})\s*(?:动色|timbre)/i, key: "timbre", num: false },
    { re: /(?:动色|timbre)\s*[:：=是]?\s*([A-Za-z一-龥]{1,10})/i, key: "timbre", num: false },
    { re: /(?:bpm|速度)\s*[:：=]?\s*(\d{2,3})/i, key: "bpm", num: true },
  ]
  const bad = /[?？什么哪如何怎么吗呢]/
  const out: Record<string, string | number> = {}
  for (const r of rules) {
    if (out[r.key] !== undefined) continue
    const m = r.re.exec(text)
    if (!m) continue
    const v = m[1].trim()
    if (!v || bad.test(v)) continue
    out[r.key] = r.num ? Number(v) : v
  }
  return Object.keys(out).length ? out : null
}

// stage 键的中文名（逐项确认条上用）
const HINT_LABELS: Record<string, string> = {
  scale: "音阶",
  voice: "音色",
  drum: "鼓组",
  bpm: "BPM",
  timbre: "动色",
};

// ---- 指挥人格（本地留存）：每条消息随站方指令下发，服务端旧会话也会被持续校准 ----
type Persona = "default" | "mentor" | "buddy" | "explorer";
const PERSONA_KEY = "so-conductor-persona-v1";
const PERSONAS: { id: Persona; label: string; directive: string }[] = [
  { id: "default", label: "默认", directive: "" },
  {
    id: "mentor",
    label: "严格导师",
    directive:
      "你现在的性格是「严格导师」：直言不讳、标准明确，先点破问题再给可执行的练习量与达标线（如“这周每天慢速两遍”），不客套不灌水，但真实的进步会明确认可。",
  },
  {
    id: "buddy",
    label: "轻松伙伴",
    directive:
      "你现在的性格是「轻松伙伴」：聊天松弛、先肯定再建议，多用生活化比喻（把音阶比成调色盘、BPM 比成步速），少用术语、不用理论压人，玩起来最重要。",
  },
  {
    id: "explorer",
    label: "实验先锋",
    directive:
      "你现在的性格是「实验先锋」：大胆给反常规建议（冷门音阶、奇怪拍速、故意破坏再重建），对用户每个想法都好奇，把“翻车”当素材聊，鼓励试错但不空喊口号。",
  },
];

function loadPersona(): Persona {
  try {
    const v = window.localStorage.getItem(PERSONA_KEY);
    return PERSONAS.some((x) => x.id === v) ? (v as Persona) : "default";
  } catch {
    return "default";
  }
}

// 每个性格对应的中文音色偏好：优先按名称子串命中（含中文名，因为 Edge 神经语音名字是中文，如「云希」），
// 再按性别/神经语音回退，最后退到首个中文 voice。
// 关键：Windows 旧 SAPI 语音（Huihui/Yaoyao/Kangkang，拼音名）是同一引擎别名，听感无差别；
// 真正能分出音色的是神经语音（带 "Online"/"Natural"，名字是中文「晓晓/云希/云扬…」），且只取
// 「Chinese (Mandarin, Simplified)」那 6 个标准普通话 voice（晓晓/云希/云健/晓伊/云扬/云夏），避开方言/粤语/台语。
const PERSONA_VOICE: Record<Persona, { gender: "male" | "female"; names: string[] }> = {
  default: { gender: "female", names: ["晓晓", "Xiaoxiao", "Yaoyao", "Huihui"] },
  mentor: { gender: "male", names: ["云希", "Yunxi", "云扬", "Yunyang", "Kangkang", "Zhiwei"] },
  buddy: { gender: "female", names: ["晓晓", "Xiaoxiao", "晓伊", "Xiaoyi", "Yaoyao", "Huihui", "Tingting"] },
  explorer: { gender: "female", names: ["晓伊", "Xiaoyi", "云扬", "Yunyang", "云希", "Yunxi", "Kangkang", "Zhiwei"] },
};

function isNeural(v: SpeechSynthesisVoice): boolean {
  return /online|natural/i.test(v.name);
}

function matchGender(
  voices: SpeechSynthesisVoice[],
  gender: "male" | "female",
): SpeechSynthesisVoice | null {
  // 同时覆盖中文名（神经语音）与拼音名（旧 SAPI）
  const femaleTokens = ["晓晓", "晓伊", "云夏", "xiaoxiao", "yaoyao", "huihui", "tingting", "xiaoyi", "xiaobei", "yueyue", "ruoxi"];
  const maleTokens = ["云希", "云健", "云扬", "yunxi", "kangkang", "zhiwei", "yunyang", "xiaoxuan"];
  const toks = gender === "female" ? femaleTokens : maleTokens;
  const low = (s: string) => s.toLowerCase();
  return voices.find((v) => toks.some((t) => low(v.name).includes(t))) ?? null;
}

function pickVoice(persona: Persona, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const zh = voices.filter((v) => v.lang.toLowerCase().startsWith("zh"));
  if (zh.length === 0) return null;
  const pref = PERSONA_VOICE[persona];
  // 1) 名称子串命中（本地 voice 优先：神经「Online」语音在本机 Web Speech API 下不出声，仅作兜底）
  const nameHits = pref.names
    .map((n) => zh.find((v) => v.name.includes(n)))
    .filter((v): v is SpeechSynthesisVoice => !!v)
    .sort((a, b) => Number(isNeural(a)) - Number(isNeural(b)));
  if (nameHits.length) return nameHits[0];
  // 2) 同性别本地 voice
  const sameGLocal = zh.filter((v) => !isNeural(v)).find((v) => matchGender([v], pref.gender));
  if (sameGLocal) return sameGLocal;
  // 3) 同性别任意 voice
  const sameG = matchGender(zh, pref.gender);
  if (sameG) return sameG;
  // 4) 首个本地 voice（兜底保证出声）
  const anyLocal = zh.find((v) => !isNeural(v));
  if (anyLocal) return anyLocal;
  // 5) 实在没有本地 voice 才退回神经语音
  const anyNeural = zh.find(isNeural);
  if (anyNeural) return anyNeural;
  return zh[0];
}

// ---- 朗读参数（语速/音高，本地留存）----
type TtsPrefs = { rate: number; pitch: number; autoRead: boolean };
const TTS_KEY = "so-conductor-tts-v1";
function loadTtsPrefs(): TtsPrefs {
  try {
    const raw = window.localStorage.getItem(TTS_KEY);
    const d = raw ? (JSON.parse(raw) as { rate?: unknown; pitch?: unknown; autoRead?: unknown }) : {};
    const num = (v: unknown, dft: number) => (typeof v === "number" && v >= 0.4 && v <= 2 ? v : dft);
    return {
      rate: num(d.rate, 1.05),
      pitch: num(d.pitch, 1),
      autoRead: typeof d.autoRead === "boolean" ? d.autoRead : false,
    };
  } catch {
    return { rate: 1.05, pitch: 1, autoRead: false };
  }
}

// 体检报告生成中：扫描卡——光带循环扫过 + 步骤文案逐条点亮（减少动效时全静态）
const SCAN_STEPS = ["铺开画布对象", "逐条读线的走向", "核对循环拍点", "听声部层次", "拟写评级"];

function ScanCard({ count }: { count: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  useGSAP(
    () => {
      if (!rootRef.current || prefersReducedMotion()) return;
      gsap.fromTo(
        ".scan-sweep",
        { xPercent: -110 },
        { xPercent: 320, duration: 1.15, ease: "none", repeat: -1 },
      );
    },
    { scope: rootRef },
  );
  useGSAP(
    () => {
      if (!rootRef.current || prefersReducedMotion()) return;
      gsap.fromTo(".scan-step", { autoAlpha: 0, y: 5 }, { autoAlpha: 1, y: 0, duration: 0.28 });
    },
    { scope: rootRef, dependencies: [step] },
  );
  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => (s + 1) % SCAN_STEPS.length), 950);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div ref={rootRef} className="w-full border border-primary/50 bg-background/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="font-mono text-xs tracking-widest text-primary">画布体检 · 扫描中</span>
      </div>
      <div className="relative mt-2 h-1 overflow-hidden bg-muted">
        <span className="scan-sweep absolute inset-y-0 left-0 w-1/3 bg-primary" />
      </div>
      <div className="scan-step mt-2 font-mono text-xs text-muted-foreground">
        {SCAN_STEPS[step]}
        {step === 0 ? ` · ${count} 个对象` : ""}
      </div>
    </div>
  );
}

// 体检扫描进行中：一道光带缓慢扫过画布本体（浮层后半透可见），让「体检」有全局实感
function StageScanBeam() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      gsap.fromTo(
        ".beam-rail",
        { y: -40 },
        { y: () => window.innerHeight + 40, duration: 2.3, ease: "none", repeat: -1 },
      );
    },
    { scope: ref },
  );
  if (prefersReducedMotion()) return null;
  return (
    <div ref={ref} className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      <div className="beam-rail absolute inset-x-0 top-0">
        <span className="block h-5 bg-primary/15 blur-sm" />
        <span className="-mt-2.5 block h-0.5 bg-primary/80" />
      </div>
    </div>
  );
}

// 乐团指挥：常驻 AI 角色的对话浮层（多轮，会话 id 续接上下文；回复带逐字打字机）
export function ConductorPanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  // 指挥人格（严格导师 / 轻松伙伴 / 实验先锋…）：切换即持久，每条消息随指令下发
  const [persona, setPersona] = useState<Persona>(loadPersona);
  const [msgs, setMsgs] = useState<Msg[]>(() =>
    chatCache.msgs.length ? chatCache.msgs : [greetingOf(loadPersona())],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 逐项确认/撤销：msg 下标 → (stage 键 → 该键是否已上台 + 上台前的旧值快照)
  const [hintStates, setHintStates] = useState<Record<number, Record<string, { applied: boolean; prev?: string | number }>>>({});
  // 一键修复过的隐患（msg 下标 + 隐患原文作键）
  const [fixedRisks, setFixedRisks] = useState<Set<string>>(new Set());
  // 体检报告是否已复制过（同样随新消息失效）
  const [copiedIdx, setCopiedIdx] = useState(-1);
  // 单条回复的「复制文字」状态（好建议摘走记笔记用）
  const [copiedMsg, setCopiedMsg] = useState(-1);
  // 正在朗读哪条指挥回复（-1 = 没在播）；面板关闭 / 发新消息即停
  const [speakIdx, setSpeakIdx] = useState(-1);
  const pickPersona = (id: Persona) => {
    setPersona(id);
    try {
      window.localStorage.setItem(PERSONA_KEY, id);
    } catch {
      /* 存不上本次会话内仍生效 */
    }
  };
  // 朗读语速/音高：滑杆调完下一条朗读生效
  const [ttsPrefs, setTtsPrefs] = useState<TtsPrefs>(loadTtsPrefs);
  const [ttsOpen, setTtsOpen] = useState(false);
  const pickTts = (patch: Partial<TtsPrefs>) => {
    setTtsPrefs((cur) => {
      const next = { ...cur, ...patch };
      try {
        window.localStorage.setItem(TTS_KEY, JSON.stringify(next));
      } catch {
        /* 忽略 */
      }
      return next;
    });
  };
  // 快捷提问搜索：关键词同时命中题库与「你问过的问题」（含自由打字的历史）
  const [qSearch, setQSearch] = useState("");
  const searchQ = qSearch.trim().toLowerCase();
  const searchRes = useMemo<QuickItem[] | null>(() => {
    if (!searchQ) return null;
    const pool = QUICK_POOL.filter((o) => o.q.toLowerCase().includes(searchQ));
    const hit = new Set(pool.map((o) => o.q.toLowerCase()));
    const asked: QuickItem[] = [];
    for (let i = msgs.length - 1; i >= 0 && asked.length < 8; i--) {
      const m = msgs[i];
      if (m.role !== "user") continue;
      const t = m.text.trim();
      const k = t.toLowerCase();
      if (!t || hit.has(k) || !k.includes(searchQ)) continue;
      hit.add(k);
      asked.push({ q: t, cat: "问过" });
    }
    return [...pool, ...asked].slice(0, 8);
  }, [searchQ, msgs]);
  // 全部中文 voice 列表；当前音色由人格解析（persona 变即重算），而非固定取第一个
  const [zhVoices, setZhVoices] = useState<SpeechSynthesisVoice[]>([]);
  const zhVoice = useMemo(() => pickVoice(persona, zhVoices), [persona, zhVoices]);
  const ttsOk = typeof window !== "undefined" && "speechSynthesis" in window;
  const stopSpeak = () => {
    if (!ttsOk) return;
    window.speechSynthesis.cancel();
    setSpeakIdx(-1);
  };
  // 浏览器语音合成：zh-CN 发音读回复正文（stage/report 块已剥掉，不会把暗号念出来）
  // 朗读令牌：每次调用 speakMsg（含停止）自增，使上一次已排程的 rAF/看门狗失效，避免停止后又被重新朗读
  const speakTokenRef = useRef(0);
  const speakMsg = (text: string, i: number) => {
    if (!ttsOk) return;
    const myToken = ++speakTokenRef.current; // 任何新调用都让旧排程失效
    window.speechSynthesis.cancel();
    if (speakIdx === i) {
      setSpeakIdx(-1);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = ttsPrefs.rate;
    u.pitch = ttsPrefs.pitch;
    // 语音音量由「听感」面板统一管（下一条朗读生效）
    u.volume = loadVoiceVol();
    if (zhVoice) u.voice = zhVoice;
    let started = false;
    const done = () => setSpeakIdx((cur) => (cur === i ? -1 : cur));
    // onstart 点亮 started 标志；Edge/Chromium 偶发不回调 onstart 但仍能播，看门狗据此区分
    u.onstart = () => {
      started = true;
    };
    u.onend = done;
    u.onerror = done;
    setSpeakIdx(i);

    // Edge/Chromium 静音 bug 三重防御：
    // 1) 先 resume() 解锁卡死的 paused 态；
    // 2) 下一帧再 speak()（cancel 后同步 speak 常被静默吞掉且无 onerror）；
    // 3) 看门狗：约 300ms 后若既没 onstart 也没在播，重试一次。
    const fire = () => {
      try {
        const synth = window.speechSynthesis;
        if (synth.paused) synth.resume();
      } catch {
        /* ignore */
      }
      try {
        window.speechSynthesis.speak(u);
      } catch {
        /* ignore */
      }
    };
    requestAnimationFrame(() => {
      if (speakTokenRef.current !== myToken) return; // 已被新的朗读/停止取代
      fire();
      window.setTimeout(() => {
        if (speakTokenRef.current !== myToken || started) return;
        try {
          const synth = window.speechSynthesis;
          if (synth.speaking || synth.pending) return; // 已经在播，只是没回调 onstart
          if (synth.paused) synth.resume();
          window.speechSynthesis.speak(u);
        } catch {
          /* ignore */
        }
      }, 300);
    });
  };
  // 组件卸载（含关面板）时别留下语音在空播
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window)
        window.speechSynthesis.cancel();
    };
  }, []);
  // 中文 voice 可能异步加载：监听 voiceschanged 刷新，避免首次点击时 getVoices() 还为空
  useEffect(() => {
    if (!ttsOk) return;
    const load = () =>
      setZhVoices(
        window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("zh")),
      );
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [ttsOk]);
  const autoSpokenRef = useRef(-1);
  // 正在等体检报告：回复还没冒字时，气泡位置先放「扫描卡」
  const [reportPending, setReportPending] = useState(false);
  // 快捷提问当前批次的起点（点「换一批」整批前移）
  const [quickOff, setQuickOff] = useState(0);
  // 本次打开面板时的「问过名单」快照：没问过的排前面，点过只记不重排（当次不跳变，下次生效）
  const seenAtOpen = useRef<Set<string>>(loadQuickSeen()).current;
  const quickSeenRef = useRef(new Set(seenAtOpen));
  // 当前类别筛选（null = 全部）
  const [quickCat, setQuickCat] = useState<string | null>(null);
  // 汉堡菜单开合态：人格 / 类型 默认收起，点 ☰ 才展开（不铺开）
  const [personaOpen, setPersonaOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  // B 层二次抽取的结构化 hints（按消息下标缓存；null=抽空/失败，留给 C 层正则兜底）
  const [enriched, setEnriched] = useState<Record<number, Record<string, string | number> | null>>({});
  const quickOrder = useMemo(() => {
    const fresh = QUICK_POOL.filter((o) => !seenAtOpen.has(o.q));
    const old = QUICK_POOL.filter((o) => seenAtOpen.has(o.q));
    // 全问完就清零重来，保证永远有可点的
    return fresh.length >= QUICK_PAGE ? [...fresh, ...old] : QUICK_POOL;
  }, [seenAtOpen]);
  const quickBase = useMemo(() => {
    if (!quickCat) return quickOrder;
    const filtered = quickOrder.filter((o) => o.cat === quickCat);
    return filtered.length >= QUICK_PAGE ? filtered : quickOrder;
  }, [quickOrder, quickCat]);
  const quickBatch = Array.from(
    { length: QUICK_PAGE },
    (_, k) => quickBase[(quickOff + k) % quickBase.length],
  );
  const markQuickSeen = (q: string) => {
    if (quickSeenRef.current.has(q)) return;
    quickSeenRef.current.add(q);
    try {
      window.localStorage.setItem(QUICK_SEEN_KEY, JSON.stringify([...quickSeenRef.current]));
    } catch {
      // 存不上就算了，本次会话内仍然生效
    }
  };
  // B 层：主回复没带 ```stage 块时，二次把回复丢给 LLM 抽成结构化 hints（A 失败 → B → C 正则兜底）
  const enrichHints = async (text: string, idx: number) => {
    try {
      const r = await runAgent(
        "conductor",
        `从下面这段音乐建议里抽取可一键应用的设置，只输出严格 JSON：{"stage":[{"key":"scale|voice|drum|bpm|timbre","value":"..."}]}。没有就输出 {"stage":[]}。不要任何解释或 markdown。\n\n${text}`,
        undefined,
        undefined,
      );
      const obj = JSON.parse(extractJson(r.finalText)) as {
        stage?: Array<{ key: string; value: string | number }>;
      };
      const out: Record<string, string | number> = {};
      for (const it of obj.stage ?? []) {
        const k = String(it.key).toLowerCase();
        if (!["scale", "voice", "drum", "bpm", "timbre"].includes(k)) continue;
        out[k] = k === "bpm" ? Number(it.value) || 0 : it.value;
      }
      setEnriched((e) => ({ ...e, [idx]: Object.keys(out).length ? out : null }));
    } catch {
      setEnriched((e) => ({ ...e, [idx]: null }));
    }
  };
  // 输入历史补全：拿你问过的话按前缀匹配（近的优先），Tab / ↑↓+回车 / 点选 都能填
  const [acIdx, setAcIdx] = useState(-1);
  const [acDismiss, setAcDismiss] = useState(false);
  const acList = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q || acDismiss) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== "user") continue;
      const t = m.text.trim();
      if (!t || t === input.trim()) continue;
      const k = t.toLowerCase();
      if (seen.has(k) || !k.startsWith(q)) continue;
      seen.add(k);
      out.push(t);
      if (out.length >= 4) break;
    }
    return out;
  }, [input, msgs, acDismiss]);
  const sessionIdRef = useRef<string | undefined>(chatCache.sessionId);
  const listRef = useRef<HTMLDivElement>(null);
  // 打字机：只在「最后一条指挥气泡」上生效，len 追 target 的过程就是打字
  const [typed, setTyped] = useState(() => {
    const last = chatCache.msgs.length ? chatCache.msgs : [greetingOf(persona)];
    return { idx: last.length - 1, len: last[last.length - 1]?.text.length ?? 0 };
  });
  // 自动朗读：开着时每条新回复逐字打完就自动念出来（开场白不念，同一条只念一次）
  useEffect(() => {
    if (!ttsPrefs.autoRead || !ttsOk) return;
    const i = msgs.length - 1;
    const m = msgs[i];
    if (i < 2 || !m || m.role !== "assistant" || !m.text) return;
    if (autoSpokenRef.current === i) return;
    if (i === typed.idx && typed.len < m.text.length) return; // 还在逐字打，打完再念
    autoSpokenRef.current = i;
    const clean = auxView(m.text).shown.trim();
    if (clean) speakMsg(clean, i);
    // speakMsg 是渲染内闭包，依赖按数据源给即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsPrefs.autoRead, ttsOk, msgs, typed]);

  // 每次 msgs 变化回写缓存并落本地（会话 id 一并留住）
  useEffect(() => {
    chatCache.msgs = msgs;
    chatCache.sessionId = sessionIdRef.current;
    try {
      window.localStorage.setItem(
        CHAT_KEY,
        JSON.stringify({ msgs: msgs.slice(-60), sessionId: sessionIdRef.current }),
      );
    } catch {
      // 存不上就算了，内存缓存仍然生效
    }
  }, [msgs]);

  // 重开：清空界面记录并另起会话（服务端上下文从头开始）
  const resetChat = () => {
    stopSpeak();
    setMsgs([greetingOf(persona)]);
    setError("");
    setHintStates({});
    setFixedRisks(new Set());
    setEnriched({});
    setCopiedIdx(-1);
    sessionIdRef.current = undefined;
  };

  // 导出聊天记录为纯文本（跨设备带走；本地存档本来就一直留在浏览器里）
  const exportChat = () => {
    const lines = msgs
      .map((m) => {
        const t = (m.role === "assistant" ? auxView(m.text).shown.trim() : m.text).trim();
        if (!t) return null;
        return `${m.role === "user" ? "我" : "指挥"}：${t}`;
      })
      .filter(Boolean) as string[];
    if (lines.length < 2) {
      setError("还没聊出什么内容——先问指挥几句再导出");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const blob = new Blob([`【乐团指挥对话记录 · ${stamp}】\n\n${lines.join("\n\n")}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "指挥对话记录.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 打字机律动：每 30ms 露 2 字；轮询中途文字变长会自动接着追；偏好减少动效则整段直出
  useEffect(() => {
    const lastIdx = msgs.length - 1;
    const last = msgs[lastIdx];
    if (!last || last.role !== "assistant") return;
    const target = last.text.length;
    if (prefersReducedMotion()) {
      setTyped({ idx: lastIdx, len: target });
      return;
    }
    const t = window.setInterval(() => {
      setTyped((cur) => {
        const base = cur.idx === lastIdx ? cur.len : 0;
        const next = Math.min(base + 2, target);
        if (base >= target) window.clearInterval(t);
        return { idx: lastIdx, len: next };
      });
    }, 30);
    return () => window.clearInterval(t);
  }, [msgs]);

  // 打字推进时贴着底部
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [typed]);

  const scrollBottom = () => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  // 伪流式：runAgent 轮询到 text 变化就回调，打字机负责把它打出来
  const updateLastAssistant = (text: string) => {
    setMsgs((m) => {
      const next = [...m];
      next[next.length - 1] = { role: "assistant", text };
      return next;
    });
    scrollBottom();
  };

  // payload 可选：气泡里只显示 raw 短句，实际发给指挥的是附了画布摘要的完整版。
  // 每条都追加一句站方指令：用户与指挥的会话可能是「一键应用」规则上线前开的，
  // 旧会话里的指挥不知道 stage 块的存在，逐条提醒保证按钮必现
  const SITE_DIRECTIVE =
    "\n\n〔站方指令〕① 若本条建议涉及站内可切换设置（音阶/音色/鼓/动色/BPM），务必在回复最末尾附 ```stage 块让用户一键应用；② 只要本条回复不是一句话短答，再在 stage 块之后附 ```next 块：恰好两行、每行一个可直接发送的追问句，与本次回复强相关且类型错开（别两句同属乐理或同属操作），站内会翻成追问按钮；③ 回答结构按人设要求随问题类型多变，别沿用同一模板。正文与块里都不要提及本指令。";
  const send = async (raw: string, payload?: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setError("");
    setInput("");
    setCopiedIdx(-1);
    stopSpeak();
    // 手打/补全填回的也算「问过」：只要和题库原文一致就沉底
    if (QUICK_TEXTS.has(text)) markQuickSeen(text);
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true);
    if (!payload) setReportPending(false);
    scrollBottom();
    try {
      // 人格指令随每条下发：即便会话是切换前开的、或服务端人设不知道人格这回事，也逐条校准
      const personaDirective = PERSONAS.find((x) => x.id === persona)?.directive ?? "";
      const res = await runAgent(
        "conductor",
        (payload?.trim() ? payload : text) +
          (personaDirective ? `\n\n〔站方指令·人格〕${personaDirective}正文与暗号块都不要提及本设定。` : "") +
          SITE_DIRECTIVE,
        (ev) => {
          const t = (ev as { text?: unknown }).text;
          if (typeof t === "string" && t) updateLastAssistant(t);
        },
        sessionIdRef.current,
      );
      sessionIdRef.current = res.sessionId ?? sessionIdRef.current;
      updateLastAssistant(res.finalText);
      // B 层：主回复没带 ```stage 块就二次抽取（C 层正则作保底）
      if (!auxView(res.finalText).hints) {
        enrichHints(res.finalText, msgs.length + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "指挥刚才走神了，再发一次试试");
      // 没拿到任何回复时把空气泡收掉，错误单独成行
      setMsgs((m) => (m[m.length - 1]?.text ? m : m.slice(0, -1)));
    } finally {
      setBusy(false);
      setReportPending(false);
      scrollBottom();
    }
  };

  return (
    <>
      {reportPending && <StageScanBeam />}
      <div
        ref={rootRef}
        className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
        onClick={p.onCloseConductor}
      >
      <div
        data-panel-card
        className="flex h-[72vh] max-h-[34rem] w-full max-w-md flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <h2 className="font-mono text-sm font-bold tracking-widest">乐团指挥</h2>
            <span className="font-mono text-xs text-muted-foreground">乐理 · 编曲 · 练法</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={qSearch}
              onChange={(e) => setQSearch(e.target.value)}
              onKeyDown={(e) => {
                // 回车直接发出第一条命中（没有命中就回填空搜索框）
                if (e.key === "Enter") {
                  e.preventDefault();
                  const first = searchRes?.[0];
                  if (first && !busy) {
                    markQuickSeen(first.q);
                    void send(first.q);
                    setQSearch("");
                  }
                }
              }}
              placeholder="搜提问…"
              aria-label="搜索快捷提问与你问过的问题"
              maxLength={30}
              className="w-24 border border-border bg-transparent px-2 py-1 font-mono text-xs placeholder:text-muted-foreground focus-visible:shadow-[var(--focus-ring)]"
            />
            {qSearch && (
              <button
                type="button"
                onClick={() => setQSearch("")}
                aria-label="清空提问搜索"
                className="border border-border px-1.5 py-1 font-mono text-xs text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              onClick={exportChat}
              aria-label="把这段指挥对话导出成文本文件（换设备也能带走）"
              title="聊天记录本就随浏览器留存；导出成 .txt 可换设备带走"
              className="px-2 py-1 font-mono text-xs text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
            >
              导出
            </button>
            <button
              type="button"
              onClick={resetChat}
              aria-label="清空与指挥的聊天记录，重新开始一段对话"
              className="px-2 py-1 font-mono text-xs text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
            >
              重开
            </button>
            <button
              type="button"
              onClick={p.onCloseConductor}
              aria-label="关闭指挥对话"
              className="px-2 py-1 font-mono text-xs text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
            >
              关闭
            </button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4 font-mono text-xs leading-relaxed" aria-live="polite">
          {msgs.map((m, i) => {
            // typingThis = 还在逐字打；打完（len 追平）即 false，报告卡/应用按钮才会接棒出现
            const typingThis =
              m.role === "assistant" && i === typed.idx && typed.len < m.text.length;
            const view = auxView(typingThis ? m.text.slice(0, typed.len) : m.text);
            const caret = typingThis || (busy && !m.text && i === typed.idx);
            // 「应用到舞台」与报告卡只挂在最新一条已说完的指挥回复上
            const full = m.role === "assistant" && !typingThis ? auxView(m.text) : null;
            const hints =
              full?.hints ??
              enriched[i] ??
              (m.role === "assistant" && !typingThis ? regexHints(m.text) : null);
            const canApply = !busy && i === msgs.length - 1 && !!hints;
            const report = !busy && i === msgs.length - 1 ? full?.report ?? null : null;
            // 等体检报告、一个字还没冒出来：气泡位置先站一张扫描卡
            const scanPhase =
              m.role === "assistant" && reportPending && busy && i === msgs.length - 1 && !view.shown;
            return (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className="flex max-w-[85%] flex-col items-start">
                  {scanPhase ? (
                    <ScanCard count={p.objectCount} />
                  ) : (
                    <div
                      className={
                        m.role === "user"
                          ? "border border-primary/40 bg-primary/10 px-3 py-2 text-card-foreground"
                          : "border border-border bg-background/60 px-3 py-2 text-card-foreground whitespace-pre-wrap"
                      }
                    >
                      {view.shown || (busy && i === msgs.length - 1 ? "指挥想了想…" : "")}
                      {caret && <span className="text-primary">▍</span>}
                    </div>
                  )}
                  {m.role === "assistant" && !scanPhase && !typingThis && view.shown && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {ttsOk && (
                        <button
                          type="button"
                          onClick={() => speakMsg(view.shown, i)}
                          aria-label={speakIdx === i ? "停止朗读这条回复" : "朗读这条指挥回复"}
                          title={!zhVoice ? "本机未安装中文语音包，朗读可能无声——去系统装中文(简体)语音" : undefined}
                          className="border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                        >
                          {speakIdx === i ? "停止朗读 ■" : (zhVoice ? "朗读 ♪" : "朗读 ⚠")}
                        </button>
                      )}
                      {ttsOk && !zhVoice && (
                        <span className="text-[10px] text-destructive">本机无中文语音</span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void window.navigator.clipboard
                            .writeText(view.shown.trim())
                            .then(() => setCopiedMsg(i))
                            .catch(() => setError("浏览器没让复制——直接选中回复文字抄一份吧"))
                        }
                        aria-label="复制这条指挥回复到剪贴板"
                        className="border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                      >
                        {copiedMsg === i ? "已复制 ✓" : "复制文字"}
                      </button>
                    </div>
                  )}
                  {report && (
                    <div className="mt-2 w-full border border-primary/50 bg-background/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs tracking-widest text-muted-foreground">画布体检报告</span>
                          <span className="border border-primary px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                            {report.grade}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const plain = [
                              `【画布体检报告】评级 ${report.grade}`,
                              report.hear && `听感：${report.hear}`,
                              report.good.length > 0 && `亮点：${report.good.join("；")}`,
                              // 复制走干净文本：修复暗号 ⟦…⟧ 不带出去
                              report.risk.length > 0 &&
                                `隐患：${report.risk.map((r) => splitRiskFix(r).text).join("；")}`,
                              `下一步：${report.next}`,
                            ]
                              .filter(Boolean)
                              .join("\n");
                            void window.navigator.clipboard
                              .writeText(plain)
                              .then(() => setCopiedIdx(i))
                              .catch(() => setError("浏览器没让复制——直接选中报告文字抄一份吧"));
                          }}
                          aria-label="复制这份画布体检报告"
                          className="border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                        >
                          {copiedIdx === i ? "已复制 ✓" : "复制报告"}
                        </button>
                      </div>
                      {report.hear && <div className="mt-2 text-muted-foreground">{report.hear}</div>}
                      {report.good.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          <span className="text-muted-foreground">亮点</span>
                          {report.good.map((g) => (
                            <div key={g} className="pl-2 text-card-foreground">＋ {g}</div>
                          ))}
                        </div>
                      )}
                      {report.risk.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <span className="text-muted-foreground">隐患（带补丁的直接一键修）</span>
                          {report.risk.map((r) => {
                            const { text, fix } = splitRiskFix(r);
                            const fixedKey = `${i}:${r}`;
                            return (
                              <div key={r} className="flex items-start justify-between gap-2">
                                <span className="pl-2 text-card-foreground">− {text}</span>
                                {fix && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      p.onApplyConductorHints(fix);
                                      setFixedRisks((s) => new Set(s).add(fixedKey));
                                    }}
                                    aria-label={`一键修复隐患：${text}`}
                                    className={`shrink-0 border px-1.5 py-0.5 font-mono text-xs ${
                                      fixedRisks.has(fixedKey)
                                        ? "border-border text-muted-foreground"
                                        : "border-primary/60 text-primary hover:bg-primary/10"
                                    } focus-visible:shadow-[var(--focus-ring)]`}
                                  >
                                    {fixedRisks.has(fixedKey) ? "已修 ✓" : "一键修复"}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-2 border-t border-border pt-2">
                        <span className="text-primary">下一步：{report.next}</span>
                      </div>
                    </div>
                  )}
                  {canApply && hints && (
                    <div className="mt-1.5 w-full border border-primary/50 bg-primary/5 p-2">
                      <div className="text-muted-foreground">
                        这条建议要动 <span className="text-primary">{Object.keys(hints).length}</span>{" "}
                        项设置——<span className="text-primary">高亮项可逐条上台、上台后可撤销</span>：
                      </div>
                      {Object.entries(hints).map(([k, v]) => {
                        const hs = hintStates[i]?.[k];
                        const disp =
                          k === "timbre"
                            ? v === "off"
                              ? "关"
                              : v === "auto"
                                ? "自动"
                                : String(v)
                            : String(v);
                        return (
                          <div key={k} className="mt-1 flex items-center justify-between gap-2">
                            <span className="border border-primary/60 bg-primary/10 px-1.5 py-0.5 text-primary">
                              {HINT_LABELS[k] ?? k} → {disp}
                            </span>
                            {hs?.applied ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (hs.prev !== undefined) p.onApplyConductorHints({ [k]: hs.prev });
                                  setHintStates((s) => ({
                                    ...s,
                                    [i]: { ...(s[i] ?? {}), [k]: { ...hs, applied: false } },
                                  }));
                                }}
                                aria-label={`撤销这条建议的「${HINT_LABELS[k] ?? k}」改动`}
                                className="shrink-0 border border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                              >
                                ↺ 撤销
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const snap = p.onConductorSnapshot();
                                  p.onApplyConductorHints({ [k]: v });
                                  setHintStates((s) => ({
                                    ...s,
                                    [i]: { ...(s[i] ?? {}), [k]: { applied: true, prev: snap[k] ?? v } },
                                  }));
                                }}
                                aria-label={`只把这条建议的「${HINT_LABELS[k] ?? k}」应用到舞台`}
                                className="shrink-0 border border-primary px-1.5 py-0.5 text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
                              >
                                ✓ 上台
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        disabled={Object.keys(hints).every((k) => hintStates[i]?.[k]?.applied)}
                        onClick={() => {
                          const snap = p.onConductorSnapshot();
                          const cur = { ...(hintStates[i] ?? {}) };
                          const pend: Record<string, string | number> = {};
                          for (const [k, v] of Object.entries(hints)) {
                            if (cur[k]?.applied) continue;
                            pend[k] = v;
                            cur[k] = { applied: true, prev: snap[k] ?? v };
                          }
                          if (Object.keys(pend).length > 0) p.onApplyConductorHints(pend);
                          setHintStates((s) => ({ ...s, [i]: cur }));
                        }}
                        aria-label="把这条建议的全部设置一次上台"
                        className="mt-1.5 border border-primary px-2 py-0.5 text-primary hover:bg-primary/10 disabled:border-border disabled:text-muted-foreground focus-visible:shadow-[var(--focus-ring)]"
                      >
                        {Object.keys(hints).every((k) => hintStates[i]?.[k]?.applied)
                          ? "全部已上台 ✓（可逐条撤）"
                          : "全部上台"}
                      </button>
                    </div>
                  )}
                  {/* 追问邀请：指挥回复末尾的 next 块翻成两颗按钮，点一下直接续问（只挂最新一条） */}
                  {!busy && i === msgs.length - 1 && (full?.followUps.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex w-full flex-wrap gap-1.5">
                      {full!.followUps.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => void send(q)}
                          aria-label={`顺着这条继续问指挥：${q}`}
                          className="border border-primary/40 px-2 py-1 font-mono text-xs text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
                        >
                          ↳ {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {error && <div className="border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive">{error}</div>}
        </div>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {/* 人格：汉堡菜单（默认收起，不铺开） */}
            <div>
              <button
                type="button"
                onClick={() => { setPersonaOpen((v) => !v); setTypeOpen(false); setTtsOpen(false); }}
                aria-expanded={personaOpen}
                aria-label="选择指挥人格"
                className="flex items-center gap-1 border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                <span className="text-sm leading-none">☰</span>
                <span>人格：{PERSONAS.find((x) => x.id === persona)?.label}</span>
                <span className="text-[10px]">{personaOpen ? "▲" : "▼"}</span>
              </button>
              {personaOpen && (
                <div className="mt-1 flex w-32 flex-col gap-1 border border-border bg-card p-1.5 shadow-lg">
                  {PERSONAS.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => { pickPersona(x.id); setPersonaOpen(false); }}
                      aria-pressed={persona === x.id}
                      className={`border px-2 py-1 text-left font-mono text-xs ${
                        persona === x.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-transparent text-muted-foreground hover:border-primary/60 hover:text-primary"
                      } focus-visible:shadow-[var(--focus-ring)]`}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 类型：汉堡菜单（默认收起，不铺开） */}
            <div>
              <button
                type="button"
                onClick={() => { setTypeOpen((v) => !v); setPersonaOpen(false); setTtsOpen(false); }}
                aria-expanded={typeOpen}
                aria-label="按类别筛选快捷提问"
                className="flex items-center gap-1 border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                <span className="text-sm leading-none">☰</span>
                <span>类型：{quickCat ?? "全部"}</span>
                <span className="text-[10px]">{typeOpen ? "▲" : "▼"}</span>
              </button>
              {typeOpen && (
                <div className="mt-1 grid w-36 grid-cols-2 gap-1 border border-border bg-card p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => { setQuickCat(null); setQSearch(""); setQuickOff(0); setTypeOpen(false); }}
                    aria-pressed={quickCat === null}
                    className={`border px-2 py-1 text-left font-mono text-xs ${
                      quickCat === null
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-transparent text-muted-foreground hover:border-primary/60 hover:text-primary"
                    } focus-visible:shadow-[var(--focus-ring)]`}
                  >
                    全部
                  </button>
                  {QUICK_GROUPS.map((g) => (
                    <button
                      key={g.cat}
                      type="button"
                      onClick={() => { setQuickCat(g.cat); setQSearch(""); setQuickOff(0); setTypeOpen(false); }}
                      aria-pressed={quickCat === g.cat}
                      className={`border px-2 py-1 text-left font-mono text-xs ${
                        quickCat === g.cat
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-transparent text-muted-foreground hover:border-primary/60 hover:text-primary"
                      } focus-visible:shadow-[var(--focus-ring)]`}
                    >
                      {g.cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 朗读：汉堡菜单（默认收起，不铺开）；含语速/音高微调 + 自动朗读开关 */}
            {ttsOk && (
            <div>
              <button
                type="button"
                onClick={() => { setTtsOpen((v) => !v); setPersonaOpen(false); setTypeOpen(false); }}
                aria-expanded={ttsOpen}
                aria-label="朗读语速、音高与自动朗读设置"
                className="flex items-center gap-1 border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                <span className="text-sm leading-none">☰</span>
                <span>朗读 · {ttsPrefs.rate.toFixed(2)}x</span>
                <span className="text-[10px]">{ttsOpen ? "▲" : "▼"}</span>
              </button>
              {ttsOpen && (
                <div className="mt-1 w-48 space-y-1.5 border border-border bg-card p-2 shadow-lg">
                  <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    语速
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.05}
                      value={ttsPrefs.rate}
                      onChange={(e) => pickTts({ rate: Number(e.target.value) })}
                      aria-label="朗读语速（0.5 到 2 倍）"
                      className="min-w-0 flex-1 accent-primary"
                    />
                    <span className="w-12 text-right text-primary">{ttsPrefs.rate.toFixed(2)}x</span>
                  </label>
                  <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    音高
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={ttsPrefs.pitch}
                      onChange={(e) => pickTts({ pitch: Number(e.target.value) })}
                      aria-label="朗读音高（0.5 到 1.5）"
                      className="min-w-0 flex-1 accent-primary"
                    />
                    <span className="w-12 text-right text-primary">{ttsPrefs.pitch.toFixed(2)}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      // 刚开自动朗读时把当前最后一条算作已念，避免开关一按就突然开口
                      if (!ttsPrefs.autoRead) autoSpokenRef.current = msgs.length - 1;
                      pickTts({ autoRead: !ttsPrefs.autoRead });
                    }}
                    aria-pressed={ttsPrefs.autoRead}
                    aria-label="自动朗读每条新回复"
                    className={`border px-2 py-1 font-mono text-xs focus-visible:shadow-[var(--focus-ring)] ${
                      ttsPrefs.autoRead
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
                    }`}
                  >
                    {ttsPrefs.autoRead ? "自动朗读 ✓" : "自动朗读"}
                  </button>
                  <div className="text-xs text-muted-foreground">
                    当前音色：{zhVoice ? zhVoice.name : "无中文语音"}（随人格切换）
                  </div>
                  <div className="text-xs text-muted-foreground">下一条朗读生效；调慢适合逐句跟着读</div>
                </div>
              )}
            </div>
            )}
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(searchRes ?? quickBatch).map((it) => (
              <button
                key={it.q}
                type="button"
                disabled={busy}
                onClick={() => {
                  markQuickSeen(it.q);
                  void send(it.q);
                }}
                className="flex items-center gap-1.5 border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
              >
                {(searchRes || quickCat === null) && (
                  <span className="border border-primary/40 px-1 py-0.5 text-xs text-primary">{it.cat}</span>
                )}
                {it.q}
                {!searchRes && seenAtOpen.has(it.q) && <span className="text-muted-foreground">· 问过</span>}
              </button>
            ))}
            {searchRes && searchRes.length === 0 && (
              <span className="font-mono text-xs text-muted-foreground">
                没搜到「{qSearch}」——换个词试试，或直接把问题打在下面
              </span>
            )}
            {!searchRes && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setQuickOff((o) => (o + QUICK_PAGE) % quickBase.length)}
              aria-label="换一批快捷提问"
              title="换一批快捷提问"
              className="border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
            >
              ↻ 换一批
            </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                // 抽一条还没问过的题（全问完就随便抽），直接替用户发给指挥
                const fresh = QUICK_POOL.filter((o) => !quickSeenRef.current.has(o.q));
                const pool = fresh.length > 0 ? fresh : QUICK_POOL;
                const it = pool[Math.floor(Math.random() * pool.length)];
                markQuickSeen(it.q);
                void send(it.q);
              }}
              aria-label="随机抽一个话题让指挥接话"
              title="随机抽一个话题问指挥（优先抽你还没问过的）"
              className="border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
            >
              给我灵感
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!p.objectCount) {
                  setError("画布还是空的——先拖两条线或点几个锚点，再叫他来挑毛病");
                  return;
                }
                setReportPending(true);
                void send(
                  "给我的画布做个体检",
                  `用户站在作曲画布前请你出具体检报告，只依据下面这份站内自动生成的画布摘要发言，按「画布体检报告」格式给出：\n${p
                    .onCanvasCritiqueBrief()}\n〔站方指令·补丁〕每条「隐患」若存在站内可一键切换的补救（音阶/音色/鼓/动色/BPM），在该条末尾追加 ⟦key=value;key=value⟧（键只许 scale/voice/drum/bpm/timbre，值用英文 id 或中文名，用分号分隔），没有合适补丁的隐患不要加；正文里不要出现这种暗号。`,
                );
              }}
              aria-label="让指挥看你作曲画布上的线和锚点，出一键体检报告"
              title="指挥看你画布上的线和锚点，出一份带评级、亮点、隐患、下一步的体检报告"
              className="border border-primary/60 px-2 py-1 font-mono text-xs text-primary hover:bg-primary/10 disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
            >
              画布体检报告
            </button>
          </div>
          {acList.length > 0 && (
            <div className="mb-1.5 border border-border bg-card" role="listbox" aria-label="你问过的问题">
              {acList.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  role="option"
                  aria-selected={i === acIdx}
                  // 按住不抢输入框焦点，点一下整句填回
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setInput(t);
                    setAcIdx(-1);
                  }}
                  className={`block w-full px-3 py-1.5 text-left font-mono text-xs hover:bg-primary/10 focus-visible:bg-primary/10 ${
                    i === acIdx ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
              <div className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
                ↑↓ 选 · 回车填入 · Esc 收起
              </div>
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setAcIdx(-1);
                setAcDismiss(false);
              }}
              onKeyDown={(e) => {
                if (acList.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setAcIdx((i) => (i + 1) % acList.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setAcIdx((i) => (i - 1 + acList.length) % acList.length);
                    return;
                  }
                  if (e.key === "Enter" && acIdx >= 0) {
                    e.preventDefault();
                    setInput(acList[acIdx]);
                    setAcIdx(-1);
                    return;
                  }
                }
                if (e.key === "Escape") setAcDismiss(true);
              }}
              placeholder={INPUT_HINT[persona]}
              aria-label="想对指挥说的话"
              maxLength={300}
              className="min-w-0 flex-1 border border-border bg-transparent px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus-visible:shadow-[var(--focus-ring)]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="发送给指挥"
              className="bg-primary px-3 py-2 font-mono text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
            >
              {busy ? "···" : "问"}
            </button>
          </form>
        </div>
        </div>
      </div>
    </>
  );
}
