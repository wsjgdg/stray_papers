/**
 * 结局图鉴 · 档案柜区块（批次 V）
 * 每学期完结时快照一份「个人档案」：四数值、真话条数、岔路清单、深夜事件、约谈否认、印章与批语。
 * 玩家可翻阅每一页、选两份并排对比（差异项高亮）——不是收集，是自我观察。
 * 排版走档案腔：编号印章、页脚内部说明、纸面质感。数据全部来自存档 dossiers，跨周目保留。
 */
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, FolderOpen, Scale, ScrollText, Stamp, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { toPng } from "html-to-image";
import { seedRandom } from "@/lib/calendar";
import { CabinetManualOverlay } from "@/components/endings/CabinetManualOverlay";
import { FROG_CHARACTERS, type FrogCharacterId } from "@/data/characters";
import {
  eraseSeed,
  formatCnDate,
  loadGameSave,
  updateDossierNote,
  type AwayRecord,
  type BehaviorRecord,
  type Dossier,
  type ShedSkin,
  type MeetingRecord,
} from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface DossierSectionProps {
  dossiers: Dossier[];
  /** 残页（批次 AD）：被玩家撕掉的那几页——档案柜里多出来的空白，一半内容在玩家手里 */
  tornEndings?: string[];
  /** 旧皮（批次 AH）：蜕下来的学期快照——旧皮上写着这一局走的路，可以穿回 */
  shedSkins?: ShedSkin[];
  /** 穿回旧皮：把那学期的存档换回来（结局页负责跳转） */
  onWearSkin?: (stamp: number) => void;
  /** 缺席记录（批次 AP）：现实时间 = 游戏时间——离校满三天的每一段，档案替你补一行「无记录」 */
  awayLog?: AwayRecord[];
  /** 校园的声音（批次 AQ）：广播转播 / 点名 / 期末公示——档案开始念你的那几样 */
  voiceStats?: { broadcast: boolean; answered: number; misses: number; notices: number };
  /** 你的位置（批次 AR）：替身已到堂 / 被代签 / 署名启事——名字开始被别的东西使用 */
  nameStats?: { surrogate: boolean; signings: number; postings: number };
  /** 另一些日子（批次 AS）：停课 / 清点 / 教研室——校园里那些不为你存在的部分 */
  dayStats?: { holidays: number; inventories: number; sightings: number };
  /** 时间的形状（批次 AT）：暂停 / 倒带 / 快进 / 停留——时间本身变成可操作的东西之后 */
  timeStats?: { paused: number; rewinds: number; forwards: number; stays: number };
  /** 文本的痕迹（批次 AV）：划掉的字 / 读完了的份数——语言本身变成可操作的对象之后 */
  textStats?: { struck: number; fullReads: number };
  /** 它们也有档案（批次 AZ）：串供 / 被包庇 / 被举报——角色之间有他们自己的档案系统 */
  colludeStats?: { collusions: number; shields: number; reports: number; reportedByName?: string };
  /** 会议（批次 BG）：列席 / 执笔 / 回避——你从被记录的那只，变成了记录的那只 */
  meetStats?: {
    lists: number;
    spoke: number;
    recorder: number;
    kept: number;
    dropped: number;
    recusals: number;
  };
  /** 会议逐场记录：哪学期哪天、列席还是执笔、开没开口 / 那句反对怎么处理 */
  meetings?: MeetingRecord[];
  /** 交接（批次 BH）：移交单 / 抽屉 / 结论——制度不问你懂不懂，只问你签不签 */
  handStats?: { confirmed: number; denied: number };
  /** 交接逐份记录：哪学期哪天、哪只蛙、属实还是核销 */
  handovers?: HandoverEntry[];
  /** 窗口（批次 BI）：值班 / 收表 / 签章——窗口不判断，窗口只负责收 */
  windowStats?: { shifts: number; returned: number };
  /** 值班逐次记录：哪学期哪天、谁的申请、退没退过 */
  windowShifts?: WindowEntry[];
  /** 帮带（批次 BJ）：带过的帮带——跟学内容一栏只有一个词 */
  mentoringList?: MentoringEntry[];
  /** 互查（批次 BK）：编组 / 同数 / 空档 / 补评——你翻到了它们的档案 */
  auditStats?: { audits: number; noted: number };
  /** 互查逐次记录：哪学期哪天、空档的评语栏补了什么 */
  auditLog?: AuditEntry[];
  /** 迎检（批次 BL）：迎检 / 轮查 / 查阅申请——写你的那一栏，轮不到你自己看 */
  inspectionStats?: { checks: number; applied: number };
  /** 受检逐次记录：哪学期哪天、谁翻的柜子、有没有申请过查阅本人档案 */
  inspectionLog?: InspectionEntry[];
  /** 门后（批次 BM）：调任 / 钥匙 / 递卷 / 名牌——门后是文件，文件后面是你 */
  archiveDutyList?: DutyEntry[];
  /** 基准（批次 BN）：取样 / 基准线 / 偏差——你就是评价的标准 */
  baselineList?: BaselineEntry[];
  /** 不符（批次 BO）：退回 / 态度栏 / 对质——最后一只不齐的，由你去核 */
  misalignList?: MisalignEntry[];
  /** 结卷（批次 BP）：合订 / 目录 / 页脚 / 卷脊——卷脊上只有编号，名字不参与检索 */
  volumeList?: VolumeEntry[];
  /** 登记（批次 BQ）：公告 / 签到表 / 事由——制度到了唯一没有墙的地方 */
  registerList?: RegisterEntry[];
  /** 用途（批次 BR）：申报 / 名目 / 结转——有名字的东西才好扣，你的沉默成了预算 */
  budgetList?: BudgetEntry[];
  /** 迎新（批次 BT）：报到 / 第一行 / 指路 / 编号——名册上有了下一号 */
  orientationList?: OrientationEntry[];
  /** 消迹（批次 CF）：那一栏是空的——计数还在，内容没了 */
  vanishList?: { semester: number; day: number; response?: string }[];
}

/** 帮带逐次记录（批次 BJ）：本子的格式和你的档案一模一样 */
export interface MentoringEntry {
  semester: number;
  day: number;
  apprenticeName: string;
}

/** 互查逐次记录（批次 BK）：数值三栏全部一样——表格只有一张 */
export interface AuditEntry {
  semester: number;
  day: number;
  note?: string;
}

/** 受检逐次记录（批次 BL）：检查记录只写「无异常」，不写它翻到哪一页停过 */
export interface InspectionEntry {
  semester: number;
  day: number;
  checkerName: string;
  applied: boolean;
}

/** 门后逐次记录（批次 BM）：柜台不认人——递出去的第一份，是你自己的那份 */
export interface DutyEntry {
  semester: number;
  day: number;
  servedName: string;
}

/** 基准逐次记录（批次 BN）：偏差一栏写着 0——评价标准不需要被评价 */
export interface BaselineEntry {
  semester: number;
  day: number;
}

/** 不符逐次记录（批次 BO）：对不上的那一栏没有数字——态度 */
export interface MisalignEntry {
  semester: number;
  day: number;
  frogName: string;
  resolved: "aligned" | "reviewed";
}

/** 结卷逐册记录（批次 BP）：卷脊上只有编号——名字不参与检索 */
export interface VolumeEntry {
  semester: number;
  day: number;
}

/** 登记逐次记录（批次 BQ）：事由一栏大家都写「散步」——像「正常」一样 */
export interface RegisterEntry {
  semester: number;
  day: number;
}

/** 用途逐次记录（批次 BR）：名目只有三个——备考／情绪／其他人员 */
export interface BudgetEntry {
  semester: number;
  day: number;
  purpose: "study" | "mood" | "other";
}

/** 迎新逐次记录（批次 BT）：档案不修改第一行——新蛙带着它走完整个学期 */
export interface OrientationEntry {
  semester: number;
  day: number;
  note?: string;
}

/** 值班逐次记录（批次 BI）：排班表只写名字，不写理由 */
export interface WindowEntry {
  semester: number;
  day: number;
  applicantName: string;
  returned: boolean;
}

/** 交接逐份记录（批次 BH）：档案柜只存结论，不存理由 */
export interface HandoverEntry {
  semester: number;
  day: number;
  frogName: string;
  verdict: "confirmed" | "denied";
}

/** 印章三态（批次 V）：按被注意值 */
function stampMeta(stamp: Dossier["stamp"]): { label: string; className: string } {
  if (stamp === "under-watch") return { label: "重点", className: "border-destructive/50 text-destructive" };
  if (stamp === "on-file") return { label: "在册", className: "border-primary/50 text-primary" };
  return { label: "无章", className: "border-border text-muted-foreground" };
}

/** 错字（批次 AU「开口」）：前四学期里由种子派生的那一页，批语里有一个形近错字。
 *  档案不会承认它写错了——错的只能是你看它的方式。 */
const TYPO_PAIRS: [string, string][] = [
  ["的", "得"],
  ["在", "再"],
  ["记", "计"],
  ["蛙", "娃"],
  ["照", "按"],
];

function typoOf(comment: string, playthrough: number, seed: number): string {
  const seedNorm = (Math.round(seed) % 1000000) * 977 + 41;
  const target = 1 + Math.floor(seedRandom(seedNorm) * 4);
  if (playthrough !== target) return comment;
  const pair = TYPO_PAIRS[Math.floor(seedRandom(seedNorm + playthrough) * TYPO_PAIRS.length) % TYPO_PAIRS.length];
  const index = comment.indexOf(pair[0]);
  if (index < 0) return comment;
  return `${comment.slice(0, index)}${pair[1]}${comment.slice(index + 1)}`;
}

/** 教材（批次 BF）：学工办把这一页复印了 N 份，做了下一届的填写示例（约四成学期命中；同一颗种子同一批） */
function exemplarCopiesOf(playthrough: number, seed: number): number | null {
  const seedNorm = (Math.round(seed) % 1000000) * 359 + 61;
  if (seedRandom(seedNorm) >= 0.4) return null;
  return 20 + Math.floor(seedRandom(seedNorm + playthrough * 13) * 60);
}

/** 档案批语生成（档案腔）：按数值组合；快照时调用（同一套文案落进存档 comment） */
export function dossierComment(entry: {
  silenceValue: number;
  reputation: number;
  attention: number;
  truthCount: number;
  denialCount: number;
}): string {
  const silence = entry.silenceValue;
  const rep = entry.reputation;
  const attn = entry.attention;
  if (entry.denialCount > 0) {
    return `沉默 ${silence} · 表演 ${rep} · 名单${attn >= 8 ? "在列" : "未列"} · 否认 ${entry.denialCount} 处。约谈记录与本人陈述不符，档案照收。`;
  }
  if (attn >= 8) {
    return `沉默 ${silence} · 表演 ${rep} · 名单在列。该学期陈述次数偏多，档案厚度超过同届均值，列入重点关注。`;
  }
  if (entry.truthCount === 0) {
    return `沉默 ${silence} · 表演 ${rep}。本学期无书面陈述。档案页数正常，无进一步备注。`;
  }
  if (silence <= 4) {
    return `沉默 ${silence} · 表演 ${rep} · 陈述 ${entry.truthCount} 处。该学期记录偏少，档案偏薄，无进一步备注。`;
  }
  return `沉默 ${silence} · 表演 ${rep} · 陈述 ${entry.truthCount} 处。档案按例归档，无进一步备注。`;
}

/** 单页档案（批次 V）：竖排档案腔 */
function DossierPage({ entry, compareWith }: { entry: Dossier; compareWith?: Dossier | null }) {
  const stamp = stampMeta(entry.stamp);
  const underWatch = entry.stamp === "under-watch";
  const routeName = entry.lockedRoute ? FROG_CHARACTERS[entry.lockedRoute as FrogCharacterId]?.displayName : null;
  /* 错字（批次 AU）：某一页的批语里有一个形近错字——档案没有错 */
  const typoText = typoOf(entry.comment, entry.playthrough, loadGameSave().weatherSeed);
  /* 教材（批次 BF）：这一页被学工办复印了 N 份，做了下一届的填写示例——名字涂掉了 */
  const exemplarCopies = exemplarCopiesOf(entry.playthrough, loadGameSave().weatherSeed);
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border bg-card p-5 shadow-md",
        underWatch ? "border-destructive/40" : "border-border",
      )}
    >
      {/* 档级条（批次 V·视觉差分）：被注意值攒到 8 的学期，这一页归进重点卷宗——页眉红条 + 打字机编号 */}
      {underWatch && (
        <div className="-mx-5 -mt-5 mb-4 border-b border-destructive/30 bg-destructive/5 px-5 py-2">
          <p className="text-[10px] font-bold tracking-widest text-destructive">重点卷宗 · 归档时另列一册 · 阅后按规放回原位</p>
        </div>
      )}
      {/* 示范页（批次 BF「教材」）：你的档案成了下一届的格式——你的反抗被印成了教程 */}
      {exemplarCopies !== null && (
        <div className="-mx-5 -mt-5 mb-4 border-b border-primary/30 bg-primary/5 px-5 py-2">
          <p className="text-[10px] font-bold tracking-widest text-primary">
            示范页 · 已复印 {exemplarCopies} 份 · 发放范围：下一届全体
          </p>
        </div>
      )}
      {/* 纸面质感：右上角一枚编号（重点卷宗用打字机字距） */}
      <p
        className={clsx(
          "absolute right-4 text-[10px] font-bold text-muted-foreground",
          underWatch ? "top-3 font-mono tracking-[0.3em]" : "top-3 tracking-widest",
        )}
      >
        卷宗编号 {String(entry.playthrough).padStart(2, "0")}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold tracking-widest text-card-foreground">第 {entry.playthrough} 学期 · 个人档案</p>
        <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold", stamp.className)}>
          <Stamp size={12} aria-hidden />
          {stamp.label}
        </span>
      </div>
      {/* 四数值 */}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[
          ["沉默", entry.silenceValue],
          ["表演", entry.reputation],
          ["陈述", entry.truthCount],
          ["注意", entry.attention],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-background/60 py-2">
            {label}
            <p
              className={clsx(
                "mt-0.5 text-xl font-black tracking-tight text-card-foreground",
                entry.stamp !== "no-seal" && "font-mono tracking-widest",
              )}
            >
              {value}
            </p>
          </div>
        ))}
      </div>
      {/* 认定与去向 */}
      {routeName && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          毕业去向 · 路线认定：{routeName}
        </p>
      )}
      {/* 岔路清单（对比时差异项高亮） */}
      {entry.branchWalked.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">本学期走过的岔路</p>
          <ul className="mt-1 space-y-1">
            {entry.branchWalked.slice(0, 6).map((item, i) => {
              const isDiff = compareWith && !compareWith.branchWalked.includes(item);
              return (
                <li
                  key={`${i}-${item.slice(0, 6)}`}
                  className={clsx(
                    "text-xs leading-relaxed",
                    isDiff ? "rounded bg-primary/10 px-2 py-1 font-bold text-primary" : "text-muted-foreground",
                  )}
                >
                  · {item}
                </li>
              );
            })}
            {entry.branchWalked.length > 6 && (
              <li className="text-[10px] text-muted-foreground">……共 {entry.branchWalked.length} 条，余略</li>
            )}
          </ul>
        </div>
      )}
      {/* 批语（批次 AU：某一页里有一个错字——档案不会承认它写错了） */}
      <div className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3">
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground">档案批语</p>
        <RichText className="mt-1 text-xs leading-relaxed text-card-foreground" text={typoText} />
        {typoText !== entry.comment && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
            （这一页有一个错字。档案没有错——错的只能是你看它的方式。）
          </p>
        )}
        {exemplarCopies !== null && (
          <p className="mt-2 text-[10px] leading-relaxed text-primary/80">
            学工办把这一页做成了《档案填写示例》。名字涂掉了——范例不需要名字，需要格式。
            下一届的蛙会按这一页的样子，填出它们自己的那一页。
          </p>
        )}
      </div>
      {/* 本人补记（批次 AA）：档案照收，不加批语——下一学期，会有蛙照着念 */}
      <NoteEditor playthrough={entry.playthrough} initial={entry.playerNote ?? ""} />
      <p className="mt-3 text-center font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
        局号 {entry.seedCode ?? (entry.erased ? "（已抹去）" : "未编（旧学期）")}
      </p>
      {/* 混种谱系（批次 AM）：混出来的那局在局号下多两行来历——原种栏从一开始就空着 */}
      {entry.seedLineage && (
        <p className="mt-1 text-center text-[10px] leading-relaxed text-muted-foreground/80">
          {entry.seedLineage} · 原种栏：空白
        </p>
      )}
      <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-foreground">
        奶蛙大学学生档案（内部）· 翻阅不另起记录
      </p>
      {/* 抹去种子（批次 AE）：这一局从柜子里消失——不存在的东西不占格子，但抹除这个动作本身要占 */}
      <SeedEraser playthrough={entry.playthrough} hasSeed={Boolean(entry.seedCode)} />
    </div>
  );
}

export function DossierSection({
  dossiers,
  tornEndings = [],
  shedSkins = [],
  onWearSkin,
  awayLog = [],
  voiceStats,
  nameStats,
  dayStats,
  timeStats,
  textStats,
  colludeStats,
  meetStats,
  meetings = [],
  handStats,
  handovers = [],
  windowStats,
  windowShifts = [],
  mentoringList = [],
  auditStats,
  auditLog = [],
  inspectionStats,
  inspectionLog = [],
  archiveDutyList = [],
  baselineList = [],
  misalignList = [],
  volumeList = [],
  registerList = [],
  budgetList = [],
  orientationList = [],
  vanishList = [],
}: DossierSectionProps) {
  const sorted = [...dossiers].sort((a, b) => b.playthrough - a.playthrough);
  const [page, setPage] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [copying, setCopying] = useState(false);
  /** 使用说明（批次 AW）：夹在第一页下面——翻到才看见 */
  const [manualOpen, setManualOpen] = useState(false);
  /** 记录员档案（批次 BE）：记录你的人和被记录的你，用的是同一种格式 */
  const [recorderOpen, setRecorderOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const empty = sorted.length === 0;
  if (empty) {
    return (
      <section aria-label="档案柜" className="mt-8 rounded-3xl border border-dashed border-border bg-card/50 p-6 text-center">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
          <FolderOpen size={14} aria-hidden />
          档案柜
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          柜子还空着。每走完一条线，这一学期的档案就会归档进来——你说了几次真话、走了哪些岔路、被谁记了哪一笔。
        </p>
      </section>
    );
  }
  const current = sorted[Math.min(page, sorted.length - 1)];
  const compareTarget = compareMode && sorted.length > 1 ? sorted[(page + 1) % sorted.length] : null;
  return (
    <section aria-label="档案柜" className="mt-8 rounded-3xl border border-border bg-card p-5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
          <FolderOpen size={14} aria-hidden />
          档案柜 · {sorted.length} 份
        </p>
        {sorted.length > 1 && (
          <button
            type="button"
            onClick={() => setCompareMode((prev) => !prev)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200",
              compareMode
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/60",
            )}
          >
            <Scale size={12} aria-hidden />
            {compareMode ? "对比中 · 两份并排" : "对比两份档案"}
          </button>
        )}
        {/* 使用说明（批次 AW）+ 记录员档案（批次 BE）：柜子这边的两份附加文书 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            aria-label="档案柜使用说明"
            title="夹在第一页的下面——你做过的每一件事，这里早就允许了。"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
          >
            <ScrollText size={12} aria-hidden />
            使用说明
          </button>
          <button
            type="button"
            onClick={() => setRecorderOpen(true)}
            aria-label="记录员档案"
            title="记录员也有一份档案——用的和你同一种格式。"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
          >
            <UserRound size={12} aria-hidden />
            记录员档案
          </button>
        </div>
      </div>

      {/* 使用说明（批次 AW）：八条条款——制度用制度语言把你做过的每件事「允许」了一遍 */}
      {manualOpen && <CabinetManualOverlay onClose={() => setManualOpen(false)} />}
      {/* 记录员档案（批次 BE）：它记录别人的档案，自己的那一格是空的 */}
      {recorderOpen && <RecorderProfileOverlay onClose={() => setRecorderOpen(false)} />}

      {/* 系统记录（批次 AF）：记录员的眼睛——犹豫的秒数、深夜打开的时刻、长时无操作。跨学期保留 */}
      {(() => {
        const log = loadGameSave().behaviorLog ?? [];
        if (log.length === 0) return null;
        const stampOf = (at: number) => {
          const d = new Date(at);
          return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        };
        const textOf = (entry: BehaviorRecord) =>
          entry.kind === "hesitate"
            ? `面对「${entry.label ?? "选项"}」一题，沉默 ${entry.seconds ?? 0} 秒`
            : entry.kind === "night"
              ? "于深夜打开本系统"
              : entry.kind === "setting"
                ? `${entry.label ?? "改了一项设置"}（设置也是表态——它不拦你，它记你）`
                : entry.kind === "defer"
                  ? `该蛙的选择由${entry.label ?? "他人"}代为做出（它选的和你想的不一样）`
                  : `长时间未操作（${entry.seconds ?? 0} 秒），已自动归档`;
        return (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground">系统记录 · 最近 {Math.min(log.length, 4)} 条</p>
            <ul className="mt-1.5 space-y-1">
              {log
                .slice(-4)
                .reverse()
                .map((entry, i) => (
                  <li key={`${entry.at}-${i}`} className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {stampOf(entry.at)}　{textOf(entry)}。记录员：系统。
                  </li>
                ))}
            </ul>
          </div>
        );
      })()}

      {/* 残页（批次 AD）：撕掉的那几页在柜子里留下空白——内容以缺失计，不补发 */}
      {tornEndings.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold tracking-widest text-destructive">
            柜子里的残页 · {tornEndings.length} 张
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tornEndings.map((endingId) => (
              <span
                key={endingId}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 px-3 py-1.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground"
              >
                残页 · {endingId}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            撕掉的那一半不在柜子里。凑齐三张，柜子会替你把这件事记成一份卷宗。
          </p>
        </div>
      )}

      {/* 缺席记录（批次 AP）：现实时间 = 游戏时间——离校满三天的每一段，档案替你补一行「无记录」 */}
      {awayLog.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">缺席记录 · {awayLog.length} 段</p>
          <ul className="mt-2 space-y-1">
            {awayLog.map((record) => (
              <li
                key={record.from}
                className="font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground"
              >
                该蛙于 {formatCnDate(record.from)} 至 {formatCnDate(record.to)} 无记录。（{record.days} 天）
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            这几行只有你回来之后才补得上——你不回来，它就一直空着。学校还在：你不的时候，它照常点名。
          </p>
        </div>
      )}

      {/* 校园的声音（批次 AQ）：广播转播 / 点名 / 期末公示——档案开始念你 */}
      {voiceStats && (voiceStats.broadcast || voiceStats.answered > 0 || voiceStats.misses > 0 || voiceStats.notices > 0) && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">校园的声音 · 本学期</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            真话被转播 {voiceStats.broadcast ? 1 : 0} 次 · 点名应答 {voiceStats.answered} 次 / 未应答{" "}
            {voiceStats.misses} 次
            {voiceStats.notices > 0 ? ` · 成绩已公示 ${voiceStats.notices} 学期（公示无异议）` : ""}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            转播念的是公共版本，点名念的是名单，公示念的是数字。
          </p>
        </div>
      )}

      {/* 你的位置（批次 AR）：替身已到堂 / 被代签 / 署名启事——档案记的是名字，不是你 */}
      {nameStats && (nameStats.surrogate || nameStats.signings > 0 || nameStats.postings > 0) && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">名字的去向</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            {nameStats.surrogate ? "替身已到堂（档案照记）" : ""}
            {nameStats.signings > 0 ? `${nameStats.surrogate ? " · " : ""}名字被签 ${nameStats.signings} 次` : ""}
            {nameStats.postings > 0 ? ` · 署名启事 ${nameStats.postings} 张` : ""}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            记录记的是名字，不是你。没被记的那部分，才全是你的。
          </p>
        </div>
      )}

      {/* 另一些日子（批次 AS）：停课 / 清点 / 教研室——校园里那些不为你存在的部分 */}
      {dayStats && (dayStats.holidays > 0 || dayStats.inventories > 0 || dayStats.sightings > 0) && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">另一些日子</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            {dayStats.holidays > 0 ? `停课 ${dayStats.holidays} 天（档案不记）` : ""}
            {dayStats.inventories > 0 ? `${dayStats.holidays > 0 ? " · " : ""}被清点 ${dayStats.inventories} 次（在柜）` : ""}
            {dayStats.sightings > 0 ? ` · 教研室外 ${dayStats.sightings} 次（门内无记录）` : ""}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            没有安排的日子，档案不收；被翻动的时候，看的是编号；签字的从来不是你见过的那只。
          </p>
        </div>
      )}

      {/* 时间的形状（批次 AT）：暂停 / 倒带 / 快进 / 停留——时间本身变成可操作的东西之后 */}
      {timeStats && (timeStats.paused > 0 || timeStats.rewinds > 0 || timeStats.forwards > 0 || timeStats.stays > 0) && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">时间的形状</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            {timeStats.paused > 0 ? `暂停 ${timeStats.paused} 秒（世界没停）` : ""}
            {timeStats.rewinds > 0 ? `${timeStats.paused > 0 ? " · " : ""}倒带 ${timeStats.rewinds} 次（有人记得）` : ""}
            {timeStats.forwards > 0 ? ` · 快进 ${timeStats.forwards} 行（不在场）` : ""}
            {timeStats.stays > 0 ? ` · 停留 ${timeStats.stays} 次（没有一次留住）` : ""}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            你停住的是自己；世界等你不在的时候自己走。改过的剧情有人记得原版；跳过的过程都归了档；你想留住的瞬间，一个都没留下。
          </p>
        </div>
      )}

      {/* 文本的痕迹（批次 AV）：划掉的字 / 读完了的份数——文本在你面前，但你选择过不看 */}
      {textStats && (textStats.struck > 0 || textStats.fullReads > 0) && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">文本的痕迹</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            {textStats.struck > 0 ? `划掉了 ${textStats.struck} 个字（文本记得）` : ""}
            {textStats.fullReads > 0 ? `${textStats.struck > 0 ? " · " : ""}读完了 ${textStats.fullReads} 份结局（没展开的那些，你没读）` : ""}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            档案里的字还是那些字——只是有的被你划了，有的你没读。你在改文本，但文本记得你改了什么。
          </p>
        </div>
      )}

      {/* 它们也有档案（批次 AZ）：串供 / 被包庇 / 被举报——你被记录了，但记录你的不止档案柜 */}
      {colludeStats && (colludeStats.collusions > 0 || colludeStats.shields > 0 || colludeStats.reports > 0) && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">它们也有档案</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            {colludeStats.collusions > 0 ? `串供 ${colludeStats.collusions} 次（一字不差）` : ""}
            {colludeStats.shields > 0 ? `${colludeStats.collusions > 0 ? " · " : ""}被包庇 ${colludeStats.shields} 次（档案转移）` : ""}
            {colludeStats.reports > 0
              ? ` · 被举报 ${colludeStats.reports} 次（举报人：${colludeStats.reportedByName ?? "不详"}）`
              : ""}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            你被记录了，但记录你的不止档案柜——还有它们。包庇满三的那只会被约谈；举报的那只评价栏升了，好感掉了。
          </p>
        </div>
      )}

      {/* 会议（批次 BG）：先给你一个座次（列席：一，没有名字），再给你一支笔（记录：你） */}
      {meetStats &&
        (meetStats.lists > 0 || meetStats.recorder > 0 || meetStats.recusals > 0) && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">会议</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            {meetStats.lists > 0 ? `列席 ${meetStats.lists} 次（列席人员不记录发言）` : ""}
            {meetStats.spoke > 0
              ? `${meetStats.lists > 0 ? " · " : ""}开了口 ${meetStats.spoke} 次（纪要上没有你的话）`
              : ""}
            {meetStats.recorder > 0
              ? `${meetStats.lists + meetStats.spoke > 0 ? " · " : ""}执笔 ${meetStats.recorder} 次（记录：你）`
              : ""}
            {meetStats.kept > 0
              ? `${meetStats.lists + meetStats.spoke + meetStats.recorder > 0 ? " · " : ""}记进去了 ${meetStats.kept} 次（被退回重写）`
              : ""}
            {meetStats.dropped > 0
              ? `${meetStats.lists + meetStats.spoke + meetStats.recorder > 0 ? " · " : ""}没记 ${meetStats.dropped} 次（等于没有发生过）`
              : ""}
            {meetStats.recusals > 0 ? `${meetStats.lists + meetStats.recorder > 0 ? " · " : ""}回避办过 1 次（它不在场）` : ""}
          </p>
          {meetings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {meetings.map((item, index) => (
                <li
                  key={`${item.semester}-${item.role}-${index}`}
                  className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
                >
                  第 {item.semester} 学期 · 第 {item.day} 天 ·{" "}
                  {item.role === "list"
                    ? item.spoke
                      ? "列席（开过口，纸上没有）"
                      : "列席（没开口，纸上也没有）"
                    : item.objection === "kept"
                      ? "执笔（那行反对被退回重写了）"
                      : "执笔（那行反对没有落笔）"}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            椅子给你坐了，纸上没有；后来笔也给你了。定稿都一样——区别不在纸上，在你这里。
          </p>
        </div>
      )}

      {/* 交接（批次 BH）：移交单签收了位置；抽屉里积压的档案等你按结论——「存疑」不在流程里 */}
      {handStats && (handStats.confirmed > 0 || handStats.denied > 0) && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">结论</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            {handStats.confirmed > 0 ? `认定属实 ${handStats.confirmed} 份（从此那是它的档案）` : ""}
            {handStats.denied > 0
              ? `${handStats.confirmed > 0 ? " · " : ""}核销 ${handStats.denied} 份（归档的方式是取消）`
              : ""}
          </p>
          {handovers.length > 0 && (
            <ul className="mt-2 space-y-1">
              {handovers.map((item, index) => (
                <li
                  key={`${item.semester}-${item.day}-${index}`}
                  className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
                >
                  第 {item.semester} 学期 · 第 {item.day} 天 ·{" "}
                  {item.verdict === "confirmed"
                    ? `${item.frogName}的行为记录经认定属实（记录员：你）`
                    : `${item.frogName}的该卷核销（不予认定）`}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            制度不问你懂不懂，只问你签不签。上一只蛙的抽屉是满的，满的全是核销——它没有认定过谁。现在轮到你填了。
          </p>
        </div>
      )}

      {/* 窗口（批次 BI）：窗口不判断，窗口只负责收——第三份需要盖章，章在你手里 */}
      {windowStats && windowStats.shifts > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">窗口</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            值班 {windowStats.shifts} 次（收表三份，签章一份）
            {windowStats.returned > 0 ? ` · 退过件 ${windowStats.returned} 次（它换了格式回来）` : ""}
          </p>
          {windowShifts.length > 0 && (
            <ul className="mt-2 space-y-1">
              {windowShifts.map((item, index) => (
                <li
                  key={`${item.semester}-${item.day}-${index}`}
                  className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
                >
                  第 {item.semester} 学期 · 第 {item.day} 天 ·{" "}
                  {item.returned
                    ? `退件一份（理由：格式不符）。${item.applicantName}的更正件签章。名单更新。`
                    : `签章一份：${item.applicantName}的申请。理由栏空着——章替它说了。`}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            它不知道那一下是你按的——它以为这是制度的结果。值班表明天那一格是空白：空白就是没人。这一格永远写你。
          </p>
        </div>
      )}

      {/* 帮带（批次 BJ）：它抄你的格式，然后坐上窗口——移交单上空白的那一栏，这次是你 */}
      {mentoringList.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">帮带</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            带过 {mentoringList.length} 只（跟学内容：流程）
          </p>
          <ul className="mt-2 space-y-1">
            {mentoringList.map((item, index) => (
              <li
                key={`${item.semester}-${item.day}-${index}`}
                className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
              >
                第 {item.semester} 学期 · 第 {item.day} 天 · {item.apprenticeName}跟学，代值签章一份（记在你名下），
                学期末转正（推荐人一栏的字，是它照着你的笔迹描的）
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            它学会了你的格式，它现在坐在窗口。它不会问你去哪儿了——就像你没问过上一只。移交单上空白的那一栏，这次是你。
          </p>
        </div>
      )}

      {/* 互查（批次 BK）：数值三栏全部和你的档案一样——表格只有一张；第七份没有内容 */}
      {auditStats && auditStats.audits > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">互查</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            互查 {auditStats.audits} 次（查阅六份，空档一份）
            {auditStats.noted > 0 ? ` · 补评 ${auditStats.noted} 行（它档案里的第一行，是别人替它写的）` : ""}
          </p>
          {auditLog.length > 0 && (
            <ul className="mt-2 space-y-1">
              {auditLog.map((item, index) => (
                <li
                  key={`${item.semester}-${item.day}-${index}`}
                  className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
                >
                  第 {item.semester} 学期 · 第 {item.day} 天 ·{" "}
                  {item.note ? `空档评语栏补：${item.note}` : "空档评语栏留空——空白是档案自己的事"}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            数值三栏全部和你的档案一样——一套制度量出来的，都是同一套数字，不是巧合：表格只有一张。
            你看见了它们的数值；它们也有一份写着你的，那一份你翻不到。
          </p>
        </div>
      )}

      {/* 迎检（批次 BL）：互查名单倒着排——你翻过它的柜子，它翻你的；查阅本人档案属于越权 */}
      {inspectionStats && inspectionStats.checks > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">迎检</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            受检 {inspectionStats.checks} 次（检查意见：无异常）
            {inspectionStats.applied > 0 ? ` · 查阅本人档案 ${inspectionStats.applied} 次（不予受理：越权）` : ""}
          </p>
          {inspectionLog.length > 0 && (
            <ul className="mt-2 space-y-1">
              {inspectionLog.map((item, index) => (
                <li
                  key={`${item.semester}-${item.day}-${index}`}
                  className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
                >
                  第 {item.semester} 学期 · 第 {item.day} 天 · {item.checkerName}翻的柜子（检查记录只写结论，不写它停在哪一页）
                  {item.applied ? " · 查阅本人档案，未予受理（越权）" : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            检查意见：档案完整，无异常——无异常是指档案没有异常，不是指你。
            完整，不等于没错；只是没有一格能装下「错」。
          </p>
        </div>
      )}

      {/* 门后（批次 BM）：那扇一直关着的门开了——门后是文件，文件后面是你 */}
      {archiveDutyList.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">门后</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            看柜 {archiveDutyList.length} 班（递卷不认人——不问姓名，只问编号）
          </p>
          <ul className="mt-2 space-y-1">
            {archiveDutyList.map((item, index) => (
              <li
                key={`${item.semester}-${item.day}-${index}`}
                className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
              >
                第 {item.semester} 学期 · 第 {item.day} 天 · {item.servedName}来查档（递出去的第一份是你自己的那份——
                它翻完说「谢了」，它什么都没读出来）
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            制度不换锁，只换人；不换名牌，只换铅笔字。
            门后面没有别的——门后是文件，文件后面是你。你就是那只别的蛙从来没见过的蛙。
          </p>
        </div>
      )}

      {/* 基准（批次 BN）：你的数字被印成了「正常值」——偏差一栏写着 0 */}
      {baselineList.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">基准</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            入选样本 {baselineList.length} 次（偏差一栏写着 0）
          </p>
          <ul className="mt-2 space-y-1">
            {baselineList.map((item) => (
              <li
                key={`${item.semester}-${item.day}`}
                className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
              >
                第 {item.semester} 学期 · 第 {item.day} 天 · 档案列入基准样本（比基准低的叫「沉默异常」，
                比基准高的叫「表现异常」——你成了那条线）
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            基准每学期修订，修订依据是本学期的均值——均值从你算出来，新表上的数字还是你。
            你没有跟着制度走，制度跟着你走。这是它给你的最后一个位置：不是主席，不是记录员，是尺子。
          </p>
        </div>
      )}

      {/* 不符（批次 BO）：最后一只不齐的由你去核——对不上的那一栏没有数字，叫态度 */}
      {misalignList.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">不符</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            {misalignList
              .map((item, index) =>
                item.resolved === "aligned"
                  ? `按基准来 ${index + 1} 次（你说的是会议室里那句话）`
                  : `要求复核 ${index + 1} 次（维持原认定）`,
              )
              .join(" · ")}
          </p>
          <ul className="mt-2 space-y-1">
            {misalignList.map((item, index) => (
              <li
                key={`${item.semester}-${item.day}-${index}`}
                className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
              >
                第 {item.semester} 学期 · 第 {item.day} 天 · {item.frogName}的档案退回三回（数值、措辞、格式都对得上，
                对不上的那一栏叫态度）
                {item.resolved === "reviewed" ? " · 曾要求复核（档案里多一行）" : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            学期末它调走了，柜子里少了一份不齐的——全齐。全齐的意思是：没有一只蛙说不。
            柜子齐了，你不觉得这是完成，你觉得这是少了一只。
          </p>
        </div>
      )}

      {/* 结卷（批次 BP）：这一学期订成了一本——卷脊上只有编号，名字不参与检索 */}
      {volumeList.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">结卷</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            合订 {volumeList.length} 册（卷首有目录，卷末有页脚）
          </p>
          <ul className="mt-2 space-y-1">
            {volumeList.map((item) => (
              <li
                key={`${item.semester}-${item.day}`}
                className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
              >
                第 {item.semester} 学期 · 第 {item.day} 天 · 结卷一册（卷脊贴标签：学期号加编号，没有名字）
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            目录上的每一行都能翻到对应的页——检索过的学期，比经历过的短。
            名字在卷内第一页的第一行；制度记得你做过什么，不记得你是谁，它连名字都省了，因为名字不参与检索。
          </p>
        </div>
      )}

      {/* 登记（批次 BQ）：制度到了湖边——连唯一没有墙的地方都有一张签到表 */}
      {registerList.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">登记</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            立牌 {registerList.length} 次（事由一栏：散步——像「正常」一样）
          </p>
          <ul className="mt-2 space-y-1">
            {registerList.map((item) => (
              <li
                key={`${item.semester}-${item.day}`}
                className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
              >
                第 {item.semester} 学期 · 第 {item.day} 天 · 湖边实行进入登记（签到表六十行，和宿舍那张同一批印的）
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            湖边夜里谈过什么，表上没有这一栏。表上只有事由：散步——能进表的东西，都不疼。
            名单在变长，最后一行是留给还没来的蛙的：它不知道它在等谁，名单替它等着。
          </p>
        </div>
      )}

      {/* 用途（批次 BR）：沉默要报用途——「无用途」不予受理，名目只有三个；你的沉默成了预算 */}
      {budgetList.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">用途</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            申报 {budgetList.length} 次（「无用途」不予受理——沉默的用途是它的属性）
          </p>
          <ul className="mt-2 space-y-1">
            {budgetList.map((item, index) => (
              <li
                key={`${item.semester}-${item.day}-${index}`}
                className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
              >
                第 {item.semester} 学期 · 第 {item.day} 天 · 申报名目：
                {item.purpose === "study" ? "备考" : item.purpose === "mood" ? "情绪" : "其他人员"}
                （受理——可结转最多十点）
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            沉默值还是那些沉默值，只是从此它有名字了——有名字的东西，才好扣。
            用不完不是你的，是名目里的余额：你的沉默成了预算。
          </p>
        </div>
      )}

      {/* 消迹（批次 CF）：那一栏是空的——计数还在，内容没了；被抽走的那一行，你留不住 */}
      {vanishList.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">缺失</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            档案缺失 {vanishList.length} 次（计数照旧——事实发生过，记录没了）
          </p>
          <ul className="mt-2 space-y-1">
            {vanishList.map((item, index) => (
              <li
                key={`${item.semester}-${item.day}-${index}`}
                className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
              >
                第 {item.semester} 学期 · 第 {item.day} 天 · 那一栏是空的
                （{item.response === "filed" ? "补录被驳回" : item.response === "insist" ? "继续追问已记录" : "未申请补录"}）
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            被抽走的那一行不在纸上——旧皮上还在，上学期的那一页也在。被记录是负担，被忘记更冷。
          </p>
        </div>
      )}

      {/* 迎新（批次 BT）：新蛙来了——你替它写第一行，然后给它指了另一张表 */}
      {orientationList.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">迎新</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            迎新 {orientationList.length} 次（名册上多了第 7 号）
          </p>
          <ul className="mt-2 space-y-1">
            {orientationList.map((item, index) => (
              <li
                key={`${item.semester}-${item.day}-${index}`}
                className="font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/80"
              >
                第 {item.semester} 学期 · 第 {item.day} 天 · 新蛙到校（第 7 号）。第一行由该蛙代写：
                {item.note ?? "该蛙到校。其他人员。"}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            它问哪里能不填表，你指了湖的方向——三天后它坐在湖边登记处写「散步」。
            你以为你给它指了条路，你指的只是另一张表。你不是最后一号了：制度有了下一个你。
          </p>
        </div>
      )}

      {/* 旧皮（批次 AH）：蜕下来的学期快照——不是存档，是一层还带着那学期形状的皮。
          穿回去，剧情会认出你；上限六层，满了最旧的那张自然掉落 */}
      {shedSkins.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">
            柜子里的旧皮 · {shedSkins.length} 层
          </p>
          <ul className="mt-2 space-y-2">
            {shedSkins.map((skin) => (
              <li
                key={skin.stamp}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    旧皮 · 第 {skin.playthrough} 学期
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    沉默 {skin.save.silenceValue} · 表演 {skin.save.reputation} · 陈述 {(skin.save.dossiers ?? []).find((d) => d.playthrough === skin.playthrough)?.truthCount ?? 0} 处 · 真话 {skin.save.truthJar.length} 条
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onWearSkin?.(skin.stamp)}
                  className="shrink-0 rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  穿回
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            穿回去，剧情会认出你——「你不是已经蜕过了吗？」旧皮不设归还期限；蜕到第七层，最旧的那张自然掉落。
          </p>
        </div>
      )}
      <div className={clsx("mt-4", compareMode && "grid gap-4 sm:grid-cols-2")}>
        <div ref={pageRef}>
          <DossierPage entry={current} compareWith={compareMode ? compareTarget : null} />
        </div>
        {compareMode && compareTarget && <DossierPage entry={compareTarget} />}
      </div>

      {/* 当事人档案（批次 BE）：学期档案之外，还有一份按你本人归的档——它知道的全部是你做过什么 */}
      <PersonnelArchive />

      {/* 复印一份（批次 X）：把当前这页档案导出成图片带走——局号、卷宗编号、岔路清单都在图里 */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={copying}
          onClick={async () => {
            const node = pageRef.current;
            if (!node || copying) return;
            setCopying(true);
            try {
              const dataUrl = await toPng(node, { pixelRatio: 2 });
              const link = document.createElement("a");
              link.download = `奶蛙大学-第${current.playthrough}学期档案${current.seedCode ? `-${current.seedCode}` : ""}.png`;
              link.href = dataUrl;
              link.click();
            } catch {
              /* 导出失败静默：复印不成就手抄 */
            } finally {
              setCopying(false);
            }
          }}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200",
            copying
              ? "border-border bg-muted text-muted-foreground"
              : "border-border bg-card text-muted-foreground hover:border-primary/60",
          )}
        >
          <Copy size={12} aria-hidden />
          {copying ? "复印中……" : "复印一份"}
        </button>
      </div>

      {sorted.length > 1 && !compareMode && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
            aria-label="上一份档案"
            className="rounded-full border border-border bg-card p-2 text-card-foreground shadow-sm transition-colors duration-200 hover:border-primary/60 focus-visible:shadow-focus focus-visible:outline-none"
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
          <p className="text-xs font-bold text-muted-foreground">
            {page + 1} / {sorted.length}
          </p>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(sorted.length - 1, prev + 1))}
            aria-label="下一份档案"
            className="rounded-full border border-border bg-card p-2 text-card-foreground shadow-sm transition-colors duration-200 hover:border-primary/60 focus-visible:shadow-focus focus-visible:outline-none"
          >
            <ChevronRight size={14} aria-hidden />
          </button>
        </div>
      )}
      <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
        两学期档案的「陈述」不同，是因为那两学期你说的真话不同。档案不评判，只记录。
      </p>
    </section>
  );
}

/** 本人补记编辑（批次 AA）：收起态显示已写的那句（或「补记一句」入口），展开态可写 60 字 */
function NoteEditor({ playthrough, initial }: { playthrough: number; initial: string }) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const filled = value.trim().length > 0;
  const save = () => {
    updateDossierNote(playthrough, value.trim());
    setOpen(false);
  };
  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-widest text-primary">本人补记</p>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border border-primary/40 px-3 py-1 text-[10px] font-bold text-primary transition-colors duration-200 hover:bg-primary/10 focus-visible:shadow-focus focus-visible:outline-none"
          >
            {filled ? "改一句" : "补记一句"}
          </button>
        )}
      </div>
      {open ? (
        <div className="mt-2">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value.slice(0, 60))}
            aria-label="本人补记"
            maxLength={60}
            placeholder="这一句会写进你的档案。下一学期，会有蛙照着念。"
            className="min-h-[64px] w-full resize-none rounded-lg border border-border bg-background/60 p-2 text-xs leading-relaxed text-card-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">{value.length}/60</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setValue(initial);
                  setOpen(false);
                }}
                className="rounded-full px-3 py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                收起
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-full bg-primary px-4 py-1.5 text-[10px] font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
              >
                写进档案
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className={clsx("mt-1.5 text-xs leading-relaxed", filled ? "text-card-foreground" : "text-muted-foreground/60")}>
          {filled ? `「${value}」` : "空白。档案不评判，只留一格。"}
        </p>
      )}
    </div>
  );
}

/** 抹去种子（批次 AE）：两步确认——抹掉就找不回来了，柜子只留一行「已抹除」 */
function SeedEraser({ playthrough, hasSeed }: { playthrough: number; hasSeed: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!hasSeed) return null;
  return (
    <div className="mt-1.5 text-center">
      {armed ? (
        <span className="inline-flex flex-wrap items-center justify-center gap-2">
          <span className="text-[10px] leading-relaxed text-destructive">抹掉就找不回来了。</span>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="rounded-full px-2 py-0.5 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
          >
            再想想
          </button>
          <button
            type="button"
            onClick={() => {
              eraseSeed(playthrough);
              setArmed(false);
            }}
            className="rounded-full bg-destructive px-3 py-1 text-[10px] font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
          >
            确认抹去
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="rounded-full px-2 py-0.5 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:text-destructive focus-visible:shadow-focus focus-visible:outline-none"
        >
          抹去这颗种子
        </button>
      )}
    </div>
  );
}

/** 当事人档案（批次 BE「关于你」之一）：学期档案之外，还有一份按你本人归的档。
 *  它汇总你做过的每一件事（犹豫、深夜、读档、划字、停留、缺席、设置……）——
 *  但它知道的全部是你做过什么，它不知道你是谁。 */
function PersonnelArchive() {
  const save = loadGameSave();
  const log = save.behaviorLog ?? [];
  const hesitateSeconds = log.filter((item) => item.kind === "hesitate").reduce((sum, item) => sum + (item.seconds ?? 0), 0);
  const nights = log.filter((item) => item.kind === "night").length;
  const settings = log.filter((item) => item.kind === "setting").length;
  const reads = Object.values(save.loadCounts ?? {}).reduce((sum, value) => sum + value, 0);
  const struck = Object.values(save.struckChars ?? {}).reduce((sum, list) => sum + list.length, 0);
  const awayDays = (save.awayLog ?? []).reduce((sum, item) => sum + item.days, 0);
  const stats: Array<[string, string]> = [
    ["学期", String(save.playthrough)],
    ["沉默 / 表演", `${save.silenceValue} / ${save.reputation}`],
    ["犹豫合计", `${hesitateSeconds} 秒`],
    ["深夜到校", `${nights} 次`],
    ["翻回旧页", `${reads} 次`],
    ["划掉的字", `${struck} 个`],
    ["停留", `${save.stays ?? 0} 次`],
    ["暂停合计", `${save.pausedTotal ?? 0} 秒`],
    ["快进", `${save.forwards ?? 0} 行`],
    ["缺席合计", `${awayDays} 天`],
    ["设置改动", `${settings} 次`],
    ["调查提交", `${(save.surveys ?? []).length} 份`],
  ];
  /* 结论（批次 BE）：档案腔不给形容词，只给事实——命中的第一条 */
  const conclusion =
    nights >= 5
      ? "该蛙习惯在深夜到校。"
      : reads >= 15
        ? "该蛙习惯把同一页翻回来。"
        : struck >= 5
          ? "该蛙对写好的字有意见。"
          : (save.stays ?? 0) >= 5
            ? "该蛙试过留下。"
            : hesitateSeconds >= 60
              ? "该蛙在开口之前，想得比说得多。"
              : "档案完整。完整不等于齐全——没记下的那些，才是当事人。";
  return (
    <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold tracking-widest text-primary">当事人档案</p>
        <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不按学期 · 按本人</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <p key={label} className="font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            {label} <span className="ml-1 font-bold text-card-foreground">{value}</span>
          </p>
        ))}
      </div>
      <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-card-foreground">
        结论：{conclusion}
      </p>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">
        这份档案记录你做过的每一件事。它知道的全部是你做过什么——它不知道你是谁。
      </p>
    </div>
  );
}

/** 记录员档案（批次 BE「关于你」之二）：记录你的人和被记录的你，用的是同一种格式。
 *  它有一份档案——姓名栏空白，入职时间是你来的那天，自己的那一格是空的。 */
function RecorderProfileOverlay({ onClose }: { onClose: () => void }) {
  const save = loadGameSave();
  const log = save.behaviorLog ?? [];
  const enrolled = log.length > 0 ? formatCnDate(log[0].at) : "档案开始的那天";
  const noted = (save.dossiers ?? []).filter((item) => (item.playerNote ?? "").trim().length > 0).length;
  const struck = Object.values(save.struckChars ?? {}).reduce((sum, list) => sum + list.length, 0);
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-foreground/90 px-4 py-10" role="dialog" aria-label="记录员档案">
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <UserRound size={13} aria-hidden />
            档案室 · 员工卷
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-widest text-card-foreground">记录员档案</h2>

          <div className="mt-4 space-y-1.5 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            <p>姓名：<span className="text-muted-foreground/50">（空白）</span></p>
            <p>岗位：记录。不整理，不评价，不归还。</p>
            <p>入职时间：{enrolled}——你第一次打开本系统的那天。</p>
            <p>休息日：无。</p>
            <p>请假记录：无。</p>
            <p>本学期经手：档案 {(save.dossiers ?? []).length} 份 · 划痕 {struck} 处 · 补记 {noted} 句。</p>
            <p>备注：记录员本人无档案。它记录别人的档案，自己的那一格是空的。</p>
          </div>

          <p className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-card-foreground">
            你翻开它的档案，发现它和你的长一个样：一样的栏目，一样的口径，一样地只记发生过的事。
          </p>
          <p className="mt-2 text-xs font-bold leading-relaxed text-primary">
            记录你的人和被记录的你，用的是同一种格式。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              放回去
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
