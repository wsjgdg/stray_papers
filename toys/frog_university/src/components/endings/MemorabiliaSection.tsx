/**
 * 学期纪念册（批次 CY-37；CY-38 每页可存图）：每个学期结档（开新学期 / 冬眠 / 蜕皮）的瞬间自动收进一页——
 * 不用你记得，门槛替你记。数字分两种口径：本学期归本学期，累计归累计，页上分开写。
 * 「存成图」把这一页原样转成图片下载（导出钮本身不入画）。
 */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { BookOpenCheck, Heart, ImageDown } from "lucide-react";
import { clsx } from "clsx";
import { formatCnDate, getFreeLeaf, getFreeLeafSealStamp, getFreeLeafStamp, getMemoFavorites, getMemoNote, getMemoSeals, loadSettings, setFreeLeaf, setMemoNote, normalizeMemoNote, toggleFreeLeafSeal, toggleMemoFavorite, toggleMemoSeal, type SemesterMemo } from "@/lib/gameSave";
import { listBgmTracks } from "@/lib/bgm";
import { capturePng } from "@/lib/exportPng";
import { WeatherGlyph } from "@/components/common/WeatherGlyph";
import { WEATHER_META } from "@/lib/calendar";

interface MemorabiliaSectionProps {
  pages: SemesterMemo[];
  /** 已存出的纸（批次 CY-42）：出档登记簿，最近 20 笔 */
  exportLog?: Array<{ name: string; stamp: number }>;
  /** 今日新收（批次 CY-47 联动）：进柜时未签收的最新页时刻；这一页卡面盖「今日新收」，只活这一次 */
  newStamp?: number;
}

const TRACK_TITLES: Record<string, string> = {};
for (const track of listBgmTracks()) TRACK_TITLES[track.id] = track.title;

/** 一学期的判词：按数字挑最重的那句说 */
function memoFlavor(memo: SemesterMemo): string {
  if (memo.lines.length === 0 && memo.truths === 0 && memo.silence === 0) return "这一学期你几乎没动——柜子替你把空白也收下了。";
  if (memo.truths >= 8) return "这一学期你说了很多真话。罐子沉，心也沉。";
  if (memo.silence >= 15) return "这一学期你配合得漂亮。档案给了高分——这不一定算好消息。";
  if (memo.attention >= 8) return "这一学期你被盯上了。期末夜多出来的那场约谈，不是白来的。";
  if (memo.lines.length > 0) return `这一学期你走完了 ${memo.lines.length} 条线。散场的那几页，蛙替你合上了。`;
  return "这一学期不深不浅。纸够厚，记得住。";
}

/** 数字小格：标签 + 大数字 */
function StatCell({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <span className="rounded-xl border border-border bg-background/60 px-3 py-2.5 transition-colors duration-200 hover:border-primary/50" title={hint}>
      <span className="block text-[10px] font-bold text-muted-foreground">{label}</span>
      <span className="mt-1 block text-lg leading-tight font-black text-card-foreground">{value}</span>
    </span>
  );
}

/** 年度台账（批次 CY-62）：册子跨了两个年头以上才亮出来——按自然年对一行账，出图带头 */
function YearlyLedger({
  pages,
  favorites,
  seals,
  onJumpToYear,
}: {
  pages: SemesterMemo[];
  favorites: Record<string, boolean>;
  seals: Record<string, number>;
  onJumpToYear: (year: number) => void;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [ledgerExport, setLedgerExport] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const years = Array.from(new Set(pages.map((memo) => `${new Date(memo.stamp).getFullYear()}`))).sort();
  if (years.length < 2) return null;

  const exportLedger = async () => {
    const node = sheetRef.current;
    if (!node || ledgerExport === "busy") return;
    setLedgerExport("busy");
    const ok = await capturePng(node, "奶蛙大学·年度台账.png");
    setLedgerExport(ok ? "done" : "failed");
    window.setTimeout(() => setLedgerExport("idle"), ok ? 2000 : 2500);
  };

  return (
    <div ref={sheetRef} className="rounded-2xl border border-border bg-background/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground">年度台账 · 按年对账</p>
        {/* 台账单存（批次 CY-66）：和折线页同款——这一页也能单独出门 */}
        <button
          type="button"
          data-export-ui="1"
          onClick={exportLedger}
          disabled={ledgerExport === "busy"}
          title="把这一页年度账单独存成图"
          className={clsx(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
            ledgerExport === "done"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <ImageDown size={10} aria-hidden />
          {ledgerExport === "busy" ? "正在画…" : ledgerExport === "done" ? "存好了" : ledgerExport === "failed" ? "这台设备不让存" : "存成图"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {years.map((year) => {
          const group = pages.filter((memo) => `${new Date(memo.stamp).getFullYear()}` === year);
          const yearTruths = group.reduce((sum, memo) => sum + memo.truths, 0);
          const yearSilence = group.reduce((sum, memo) => sum + memo.silence, 0);
          const yearHearts = group.filter((memo) => favorites[`${memo.semester}-${memo.stamp}`]).length;
          const yearSeals = group.filter((memo) => seals[`${memo.semester}-${memo.stamp}`] !== undefined).length;
          /* 常年景（批次 CY-64）：那年结档的日子最常是哪种天——出现两次以上才敢下这个断语，老页没记天气就不凑 */
          const weatherCounts = new Map<string, number>();
          for (const memo of group) {
            if (memo.weather) weatherCounts.set(memo.weather, (weatherCounts.get(memo.weather) ?? 0) + 1);
          }
          let yearWeather = "";
          let weatherMax = 1;
          weatherCounts.forEach((count, label) => {
            if (count > weatherMax) {
              yearWeather = label;
              weatherMax = count;
            }
          });
          /* 常走线（批次 CY-65）：那年哪条线走完的次数最多——同样两次以上才算话，只走过一遍的不算断语 */
          const lineCounts = new Map<string, number>();
          for (const memo of group) {
            for (const title of memo.lines) lineCounts.set(title, (lineCounts.get(title) ?? 0) + 1);
          }
          let yearLine = "";
          let yearLineCount = 1;
          lineCounts.forEach((count, title) => {
            if (count > yearLineCount) {
              yearLine = title;
              yearLineCount = count;
            }
          });
          return (
            <button
              key={year}
              type="button"
              data-export-ui="1"
              onClick={() => onJumpToYear(Number(year))}
              title={`跳到 ${year} 年第一页｜${year} 年：结档 ${group.length} 页，说了 ${yearTruths} 句真话，沉默 ${yearSilence} 回${yearHearts > 0 ? `，按心 ${yearHearts} 页` : ""}${yearSeals > 0 ? `，盖章 ${yearSeals} 页` : ""}${yearWeather ? `，那年多半是${yearWeather}的天` : ""}${yearLine ? `，最常走完《${yearLine}》` : ""}`}
              className="rounded-xl border border-border bg-card px-3 py-2 text-left text-[10px] leading-relaxed text-muted-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:text-primary hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
            >
              <span className="block text-xs font-bold text-card-foreground">{year} 年 ↓</span>
              {group.length} 页结档 · 真话 {yearTruths} · 沉默 {yearSilence}
              {yearHearts > 0 && <span className="text-primary"> · 按心 {yearHearts}</span>}
              {yearSeals > 0 && <> · 盖章 {yearSeals}</>}
              {yearWeather && (
                <span className="block">
                  那年多半是
                  <WeatherGlyph label={yearWeather} size={9} />
                  {yearWeather}的天
                </span>
              )}
              {yearLine && (
                <span className="block">最常走完的是《{yearLine}》（{yearLineCount} 回）</span>
              )}
            </button>
          );
        })}
      </div>
      {/* 出图即盖（批次 CY-67）：台账页出图带朱印——单存、整存都带 */}
      <SelfSeal />
    </div>
  );
}

/** 册子封面页（批次 CY-44）：整本装订的第一页——学期数、日期跨度、合计数字都印在封面上，出图带头 */
function CoverSheet({ pages, favoriteCount, sealCount, exportCount }: { pages: SemesterMemo[]; favoriteCount: number; sealCount: number; exportCount: number }) {
  const newest = pages[0];
  const oldest = pages[pages.length - 1];
  const totalTruths = pages.reduce((sum, memo) => sum + memo.truths, 0);
  const totalSilences = pages.reduce((sum, memo) => sum + memo.silence, 0);
  return (
    <div className="rounded-3xl border border-border bg-background/80 p-8 text-center shadow-sm">
      <p className="text-[10px] font-bold tracking-widest text-muted-foreground">奶蛙大学 · 档案室 编</p>
      <h4 className="mt-3 text-3xl font-black tracking-tight text-card-foreground">学期纪念册</h4>
      <p className="mt-2.5 text-sm font-bold text-primary">
        共 {pages.length} 页 · 第 {oldest.semester} 学期起至第 {newest.semester} 学期
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {formatCnDate(oldest.stamp)} 结档 至 {formatCnDate(newest.stamp)} 结档
        {/* 跨年头（批次 CY-62）：册子跨了两个自然年以上才写这半句 */}
        {new Set(pages.map((memo) => new Date(memo.stamp).getFullYear())).size >= 2 &&
          ` · 跨了 ${new Set(pages.map((memo) => new Date(memo.stamp).getFullYear())).size} 个年头`}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <StatCell label="全册真话合计" value={totalTruths} hint="所有结档页写下的好感点数总和" />
        <StatCell label="全册沉默合计" value={totalSilences} hint="各学期结档时沉默值的总和" />
        <StatCell label="图鉴累计" value={newest.endings} hint="最近一次结档那一刻图鉴收过的结局数" />
      </div>
      {favoriteCount > 0 && (
        <p className="mt-3 flex items-center justify-center gap-1 text-[11px] font-bold text-primary">
          <Heart size={11} className="fill-current" aria-hidden />
          有 {favoriteCount} 页被你按过心
        </p>
      )}
      {sealCount > 0 && (
        <p className="mt-1 text-center text-[10px] font-bold text-muted-foreground">
          另有 {sealCount} 页盖着你自带的章
        </p>
      )}
      {/* 出档数（批次 CY-65）：登记簿上从册子里誊出过几张图，封面就报几个墨点 */}
      {exportCount > 0 && (
        <p className="mt-1 text-center text-[10px] font-bold text-muted-foreground">
          已有 {exportCount} 张图从这里出了门
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">你不用记得，门槛替你记。</p>
      {/* 出图即盖（批次 CY-67）：封面出图带朱印——编印落款，右下角见章 */}
      <SelfSeal />
    </div>
  );
}

/** 趋势点（批次 CY-51）：点上有名有数，悬停即报 */
interface TrendPoint {
  label: string;
  value: number;
}

/** 一条趋势线（批次 CY-50；CY-51 每点可悬停看数）：一学期一个点，折成小图——不装图表库，一根 polyline 够了 */
function Sparkline({ label, values, inkClass }: { label: string; values: TrendPoint[]; inkClass: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values.map((point) => point.value), 1);
  const coords = values.map((point, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 26 - (point.value / max) * 22;
    return { x, y, ...point };
  });
  const points = coords.map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(" ");
  const last = values[values.length - 1].value;
  const first = values[0].value;
  return (
    <div className={clsx("rounded-xl border border-border bg-background/60 px-3 py-2", inkClass)}>
      <span className="flex items-baseline justify-between">
        <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
        <span className="text-xs font-bold text-card-foreground">
          {last}
          <span className="ml-1 text-[10px] font-bold">（{deltaLabel(last - first)}）</span>
        </span>
      </span>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={clsx("mt-1 h-8 w-full", inkClass)} aria-hidden>
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 每学期一个点：悬停报「第 N 学期 · 数值」（浏览器原生 tooltip） */}
        {coords.map((coord) => (
          <circle key={coord.label} cx={coord.x} cy={coord.y} r="1.6" fill="currentColor">
            <title>{`${coord.label} · ${coord.value}`}</title>
          </circle>
        ))}
      </svg>
      <span className="block text-center text-[9px] text-muted-foreground">
        共 {values.length} 个学期 · 从左到右
      </span>
    </div>
  );
}

/** 学期趋势（批次 CY-50；CY-52 可单独存图）：三个口径各一条线——这只蛙越念越敢说，还是越念越会配合 */
function TrendStrip({ pages }: { pages: SemesterMemo[] }) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [trendExport, setTrendExport] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const asc = [...pages].sort((a, b) => a.semester - b.semester);
  if (asc.length < 2) return null;

  const exportTrend = async () => {
    const node = sheetRef.current;
    if (!node || trendExport === "busy") return;
    setTrendExport("busy");
    const ok = await capturePng(node, "奶蛙大学·学期趋势.png");
    setTrendExport(ok ? "done" : "failed");
    window.setTimeout(() => setTrendExport("idle"), ok ? 2000 : 2500);
  };

  return (
    <div ref={sheetRef} className="rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground">学期趋势 · 一条线一学期</p>
        <button
          type="button"
          data-export-ui="1"
          onClick={exportTrend}
          disabled={trendExport === "busy"}
          title="把这一页折线单独存成图"
          className={clsx(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
            trendExport === "done"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <ImageDown size={10} aria-hidden />
          {trendExport === "busy" ? "正在画…" : trendExport === "done" ? "存好了" : trendExport === "failed" ? "这台设备不让存" : "存成图"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Sparkline
          label="本学期真话"
          values={asc.map((memo) => ({ label: `第 ${memo.semester} 学期`, value: memo.truths }))}
          inkClass="text-primary"
        />
        <Sparkline
          label="本学期沉默"
          values={asc.map((memo) => ({ label: `第 ${memo.semester} 学期`, value: memo.silence }))}
          inkClass="text-muted-foreground"
        />
        <Sparkline
          label="图鉴累计"
          values={asc.map((memo) => ({ label: `第 ${memo.semester} 学期`, value: memo.endings }))}
          inkClass="text-card-foreground"
        />
        {/* 第四条线（批次 CY-54）：被盯上的笔数——真话的代价也在册 */}
        <Sparkline
          label="本学期被注意"
          values={asc.map((memo) => ({ label: `第 ${memo.semester} 学期`, value: memo.attention }))}
          inkClass="text-muted-foreground"
        />
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        线往哪边走，档案不评——它只是把每学期落笔的位置连了起来。
      </p>
      {/* 出图即盖（批次 CY-67）：折线页也补上蛙校朱印，单存、整存都带 */}
      <SelfSeal />
    </div>
  );
}

/** 自带朱印（批次 CY-59；CY-60 推广到学期页并记时刻）：章入画，随存图出门 */
function SelfSeal({ at }: { at?: number }) {
  return (
    <div className="mt-3 flex items-end justify-end gap-2">
      {at !== undefined && at > 0 && (
        <span className="text-[9px] text-muted-foreground">{formatCnDate(at)} 盖讫</span>
      )}
      <span
        aria-hidden
        className="-rotate-6 rounded-md border-2 border-primary/80 px-2 py-1 text-center text-[10px] font-bold leading-tight text-primary opacity-90"
      >
        奶蛙
        <br />
        大学
      </span>
    </div>
  );
}

/** 拼长图用的年份分隔条（批次 CY-57/58）：与册内分隔同款观感，DOM 手搭、类名走 token */
function makeYearDivider(year: number): HTMLElement {
  const line = document.createElement("p");
  line.className = "flex items-center gap-3 py-1 text-center text-[10px] font-bold tracking-widest text-muted-foreground";
  const first = document.createElement("span");
  first.className = "h-px flex-1 bg-border";
  const label = document.createElement("span");
  label.textContent = `${year} 年 · 结档`;
  const last = document.createElement("span");
  last.className = "h-px flex-1 bg-border";
  line.append(first, label, last);
  return line;
}

/** 册尾空白页（批次 CY-54）：不属任何学期的那一页——没有栏目、没有口径，笔归你自己；空页存图也是它的权利 */
function FreeLeafSheet() {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState(() => getFreeLeaf());
  const [stamp, setStamp] = useState(() => getFreeLeafStamp());
  /* 自盖蛙校印（批次 CY-59；CY-60 记盖讫时刻）：章入画——随这一页的存图一起出门 */
  const [sealed, setSealed] = useState(() => loadSettings().freeLeafSeal);
  const [sealAt, setSealAt] = useState(() => getFreeLeafSealStamp());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [leafExport, setLeafExport] = useState<"idle" | "busy" | "done" | "failed">("idle");

  const saveLeaf = () => {
    setFreeLeaf(draft);
    setText(getFreeLeaf());
    setDraft(getFreeLeaf());
    setStamp(getFreeLeafStamp());
    setEditing(false);
  };
  const eraseLeaf = () => {
    setFreeLeaf("");
    setText("");
    setDraft("");
    setStamp(getFreeLeafStamp());
    setEditing(false);
  };
  const exportLeaf = async () => {
    const node = sheetRef.current;
    if (!node || leafExport === "busy") return;
    setLeafExport("busy");
    const ok = await capturePng(node, "奶蛙大学·空白页.png");
    setLeafExport(ok ? "done" : "failed");
    window.setTimeout(() => setLeafExport("idle"), ok ? 2000 : 2500);
  };

  return (
    <div ref={sheetRef} className="rounded-2xl border border-dashed border-border bg-background/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-card-foreground">空白页 · 留给你自己</h4>
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-export-ui="1"
            onClick={exportLeaf}
            disabled={leafExport === "busy"}
            title="这一页单独存成图——空着也能存"
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
              leafExport === "done"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            <ImageDown size={10} aria-hidden />
            {leafExport === "busy" ? "正在画…" : leafExport === "done" ? "存好了" : leafExport === "failed" ? "这台设备不让存" : "存成图"}
          </button>
          {!editing && (
            <button
              type="button"
              data-export-ui="1"
              onClick={() => {
                setDraft(text);
                setEditing(true);
              }}
              title={text ? "接着这一页写" : "这一页的笔归你"}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
            >
              {text ? "再写一笔" : "写一笔"}
            </button>
          )}
          <button
            type="button"
            data-export-ui="1"
            onClick={() => {
              setSealed(toggleFreeLeafSeal());
              setSealAt(getFreeLeafSealStamp());
            }}
            aria-pressed={sealed}
            title={sealed ? "这枚章是自己刻的——不想盖了可以取掉" : "给这一页自盖一枚蛙校朱印，随存图一起出门"}
            className={clsx(
              "rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
              sealed
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            {sealed ? "印章取掉" : "盖蛙校印"}
          </button>
        </span>
      </div>
      {text ? (
        <p className="mt-2 text-xs leading-relaxed text-card-foreground">
          {text.split("\n").map((line, lineIndex) => (
            <span key={`leaf-${lineIndex}`} className="block">
              {line}
            </span>
          ))}
          <span className="mt-1 block text-[10px] text-muted-foreground">
            —— 落款：你自己{stamp > 0 ? ` · ${formatCnDate(stamp)}` : ""}
          </span>
        </p>
      ) : (
        !editing && (
          <p data-export-ui="1" className="mt-2 text-xs leading-relaxed text-muted-foreground">
            （这一页还空着。想写的时候再写——空着存出去，也算你的一页。）
          </p>
        )
      )}
      {editing && (
        <span data-export-ui="1" className="mt-2 flex w-full flex-col gap-2">
          <textarea
            value={draft}
            rows={3}
            maxLength={246}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="没有栏目，没有口径——最多六行"
            className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-card-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
          />
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveLeaf}
              disabled={draft.trim().length === 0}
              className="rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary transition-colors duration-200 disabled:cursor-not-allowed disabled:border-border disabled:bg-card disabled:text-muted-foreground focus-visible:shadow-focus focus-visible:outline-none"
            >
              落笔
            </button>
            {text && (
              <button
                type="button"
                onClick={eraseLeaf}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
              >
                擦回空白
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
            >
              算了
            </button>
          </span>
        </span>
      )}
      {/* 自盖朱印（批次 CY-59；CY-60 带盖讫日期）：章入画，随这一页的存图一起出门 */}
      {sealed && <SelfSeal at={sealAt} />}
    </div>
  );
}

/** 纸类（批次 CY-53）：登记簿分格——柜上哪类纸出门多，一眼数得清 */
function paperKind(name: string): string {
  if (name.includes("结局")) return "结局档案";
  if (name.includes("趋势")) return "学期趋势";
  if (name.includes("手迹")) return "页边手迹";
  if (name.includes("收集统计")) return "收集统计";
  if (name.includes("纪念册")) return "学期纪念册";
  return "散页";
}

/** 涨跌口径（批次 CY-49）：对齐上学期——档案不说漂亮话，只报数 */
function deltaLabel(diff: number): string {
  if (diff === 0) return "持平";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

/** 涨跌小箭头（批次 CY-52）：▲▼配主色/灰——方向一眼可读，好坏留给判词说 */
function DeltaTag({ diff }: { diff: number }) {
  if (diff === 0) return <span className="font-bold text-muted-foreground">— 持平</span>;
  return (
    <span className={clsx("font-bold", diff > 0 ? "text-primary" : "text-muted-foreground")}>
      {diff > 0 ? `▲ +${diff}` : `▼ ${diff}`}
    </span>
  );
}

/** 一页纪念册：自带导出钮（钮不入画）与导出状态 */
function MemorabiliaCard({
  memo,
  pageNumber,
  pageCount,
  favorited,
  onToggleFavorite,
  registerNode,
  isNew,
  prev,
  sealedAt,
  onToggleSeal,
  crowns,
}: {
  memo: SemesterMemo;
  pageNumber: number;
  pageCount: number;
  favorited: boolean;
  onToggleFavorite: (memoKey: string) => void;
  registerNode: (memoKey: string, node: HTMLElement | null) => void;
  isNew: boolean;
  prev: SemesterMemo | null;
  sealedAt: number;
  onToggleSeal: (memoKey: string) => void;
  /** 全册之最（批次 CY-73）：某一学期独占鳌头的口径——并列不下断语，章上见 */
  crowns: string[];
}) {
  /* 盖讫时刻 >=0 = 盖着（0 = 旧档盖过没日期）；-1 = 没盖 */
  const sealed = sealedAt >= 0;
  const nodeRef = useRef<HTMLElement | null>(null);
  const [exportState, setExportState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  /* 补一笔（批次 CY-43）：这回执笔的不是档案——你写的字印在页上，「存成图」一起带走 */
  const memoKey = `${memo.semester}-${memo.stamp}`;
  const [note, setNote] = useState(() => getMemoNote(memoKey));
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note);

  const saveNote = () => {
    const trimmed = normalizeMemoNote(noteDraft);
    setMemoNote(memoKey, trimmed);
    setNote(trimmed);
    setNoteEditing(false);
  };
  const eraseNote = () => {
    setMemoNote(memoKey, "");
    setNote("");
    setNoteEditing(false);
  };

  /* 存成图（批次 CY-38）：卡面是半透明，导出垫一层实色主题底还原屏上看到的样子 */
  const exportPng = async () => {
    const node = nodeRef.current;
    if (!node || exportState === "busy") return;
    setExportState("busy");
    const ok = await capturePng(node, `奶蛙大学·第${memo.semester}学期纪念册.png`);
    setExportState(ok ? "done" : "failed");
    window.setTimeout(() => setExportState("idle"), ok ? 2000 : 2500);
  };

  return (
    <article
      ref={(node) => {
        nodeRef.current = node;
        registerNode(memoKey, node);
      }}
      className={clsx(
        "rounded-2xl border bg-background/70 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        favorited ? "border-primary/60" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold text-card-foreground">
          第 {memo.semester} 学期 · 离校纪念册
          {/* 今日新收（批次 CY-47 联动）：进柜没签收的一页盖新章——只活这一次进柜 */}
          {isNew && (
            <span className="ml-2 inline-flex items-center rounded-full border border-primary bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-bold text-primary">
              今日新收
            </span>
          )}
          {/* 按过心的页：章印在纸面上，出图一起带走 */}
          {favorited && (
            <span className="ml-2 inline-flex items-center gap-0.5 align-middle text-[10px] font-bold text-primary">
              <Heart size={10} className="fill-current" aria-hidden />
              本册最爱
            </span>
          )}
          {/* 全册之最（批次 CY-73）：独占鳌头的口径才评——并列不评、零不评，评了就在纸面上 */}
          {crowns.map((crown) => (
            <span
              key={crown}
              className="ml-2 inline-flex items-center rounded-full border border-primary/50 px-1.5 py-0.5 align-middle text-[9px] font-bold text-primary"
            >
              {crown}
            </span>
          ))}
        </h4>
        <span className="flex items-center gap-2">
          <button
            type="button"
            data-export-ui="1"
            onClick={() => onToggleSeal(memoKey)}
            aria-pressed={sealed}
            title={sealed ? "这枚章是自己刻的——不想盖了可以取掉" : "给这一页自盖一枚蛙校朱印，随存图一起出门"}
            className={clsx(
              "rounded-full border px-2 py-1 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
              sealed
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            {sealed ? "印章取掉" : "盖蛙校印"}
          </button>
          <button
            type="button"
            data-export-ui="1"
            onClick={() => onToggleFavorite(memoKey)}
            title={favorited ? "取心——这一页不再标了" : "按心——标记这一页是你常翻的"}
            aria-pressed={favorited}
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
              favorited
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            <Heart size={10} className={favorited ? "fill-current" : ""} aria-hidden />
            {favorited ? "已按心" : "按心"}
          </button>
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground" aria-label={`第 ${pageNumber} 页，共 ${pageCount} 页`}>
            第 {pageNumber} / {pageCount} 页
          </span>
          <span
            className="text-[10px] font-bold text-muted-foreground"
            title={memo.weather ? `那日${memo.weather}——${Object.values(WEATHER_META).find((entry) => entry.label === memo.weather)?.hint ?? "档案只记了字面"}` : undefined}
          >
            结档于 {formatCnDate(memo.stamp)}
            {/* 结档那天的天气（批次 CY-56；CY-58 配图标；CY-68 悬停报那天的话）：按学期种子推得，旧页没这栏就不写 */}
            {memo.weather && (
              <>
                {" · 那日"}
                <WeatherGlyph label={memo.weather} />
                {memo.weather}
              </>
            )}
          </span>
          <button
            type="button"
            data-export-ui="1"
            onClick={exportPng}
            disabled={exportState === "busy"}
            title="把这一页存成图片，发去哪都行"
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
              exportState === "done"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            <ImageDown size={10} aria-hidden />
            {exportState === "busy" ? "正在画…" : exportState === "done" ? "存好了" : exportState === "failed" ? "这台设备不让存" : "存成图"}
          </button>
        </span>
      </header>
      <p className="mt-1.5 text-xs leading-relaxed text-primary">{memoFlavor(memo)}</p>
      {memo.lines.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          走完的线：{memo.lines.map((title) => `《${title}》`).join("、")}
        </p>
      )}
      {note && (
        <p className="mt-2 text-xs italic leading-relaxed text-card-foreground">
          {note.split("\n").map((line, lineIndex, lines) => (
            <span key={`${memoKey}-note-${lineIndex}`} className="block">
              {lineIndex === 0 ? "「" : ""}
              {line}
              {lineIndex === lines.length - 1 ? "」" : ""}
            </span>
          ))}
          <span className="ml-1 not-italic text-[10px] text-muted-foreground">—— 你自己写的</span>
        </p>
      )}
      <span className="mt-2 flex flex-wrap items-center gap-2">
        {!noteEditing ? (
          <button
            type="button"
            data-export-ui="1"
            onClick={() => {
              setNoteDraft(note);
              setNoteEditing(true);
            }}
            title={note ? "改写你补的那一笔" : "这一页归你写——写完随整页一起出图"}
            className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
          >
            {note ? "改一笔" : "补一笔"}
          </button>
        ) : (
          <span data-export-ui="1" className="flex w-full flex-wrap items-center gap-2">
            <textarea
              value={noteDraft}
              rows={2}
              maxLength={124}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="给这一学期留一句话——最多三行"
              className="min-w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-card-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={saveNote}
              disabled={normalizeMemoNote(noteDraft) === note}
              className="rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary transition-colors duration-200 disabled:cursor-not-allowed disabled:border-border disabled:bg-card disabled:text-muted-foreground focus-visible:shadow-focus focus-visible:outline-none"
            >
              写进册子
            </button>
            {note && (
              <button
                type="button"
                onClick={eraseNote}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
              >
                擦掉
              </button>
            )}
            <button
              type="button"
              onClick={() => setNoteEditing(false)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
            >
              算了
            </button>
          </span>
        )}
      </span>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <StatCell label="本学期真话" value={memo.truths} hint="本学期攒下的好感点数" />
        <StatCell label="本学期沉默" value={memo.silence} hint="结档时的沉默值终值" />
        <StatCell label="本学期印象分" value={memo.reputation} hint="表演换来的分数" />
        <StatCell label="被注意" value={memo.attention} hint="说真话被记下笔数的总量" />
        <StatCell label="图鉴累计" value={memo.endings} hint="结档那一刻图鉴收过的结局数" />
        <StatCell label="真话罐累计" value={memo.jar} hint="说出口过的真话总句数" />
        <StatCell label="深夜累计" value={memo.nights} hint="经历过的深夜事件总段数" />
        <StatCell label="钉心" value={memo.pins} hint="结档时钉过心的结局页数" />
        <StatCell label="手迹" value={memo.notes} hint="结档时写过的页边批注行数" />
        {memo.topTrack && TRACK_TITLES[memo.topTrack] && (
          <StatCell label="最常听" value={TRACK_TITLES[memo.topTrack]} hint="结档时播出次数最多的那首配乐" />
        )}
      </div>
      {/* 和上学期对个账（批次 CY-49；CY-52 配箭头）：册子里有上一页才比得了；数字入画，出图一起带走 */}
      {prev && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px] leading-relaxed text-muted-foreground">
          <span>和上学期对账：</span>
          <span>真话 <DeltaTag diff={memo.truths - prev.truths} /></span>
          <span>沉默 <DeltaTag diff={memo.silence - prev.silence} /></span>
          <span>被注意 <DeltaTag diff={memo.attention - prev.attention} /></span>
          <span>图鉴累计 <DeltaTag diff={memo.endings - prev.endings} /></span>
          <span>真话罐累计 <DeltaTag diff={memo.jar - prev.jar} /></span>
        </p>
      )}
      {/* 那日天气备忘录（批次 CY-69）：档案室在那天写的小注——以前只悬停看得到，现在印在页上，出图一起带走 */}
      {(() => {
        const meta = memo.weather ? Object.values(WEATHER_META).find((entry) => entry.label === memo.weather) : undefined;
        if (!meta) return null;
        return (
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            <WeatherGlyph label={meta.label} size={10} />
            {` 那日${meta.label}——${meta.hint}`}
          </p>
        );
      })()}
      {/* 学期页自带朱印（批次 CY-60；CY-61 带盖讫日期，旧档没日期就不写）：章入画，随这页的单页 / 打包 / 长图一起出门 */}
      {sealed && <SelfSeal at={sealedAt} />}
    </article>
  );
}

export function MemorabiliaSection({ pages, exportLog = [], newStamp = 0 }: MemorabiliaSectionProps) {
  /* 整本存图（批次 CY-39）：一册一张长图，导出钮不入画 */
  const bookRef = useRef<HTMLDivElement | null>(null);
  const [bookExport, setBookExport] = useState<"idle" | "busy" | "done" | "failed">("idle");
  /* 钉心（批次 CY-45）：册子里常翻的那几页，心按在页上、封面合计 */
  const [memoFavorites, setMemoFavorites] = useState<Record<string, boolean>>(() => getMemoFavorites());
  /* 只看钉过心的（批次 CY-56）：翻册子也能只翻那几页——整本存图存的也就是这几页 */
  const [favsOnly, setFavsOnly] = useState(false);
  /* 学期页自盖章（批次 CY-60；CY-61 值 = 盖讫时刻）：章按页盖，随各页存图出门 */
  const [memoSeals, setMemoSeals] = useState<Record<string, number>>(() => getMemoSeals());
  const toggleMemoSealFor = (memoKey: string) => {
    toggleMemoSeal(memoKey);
    setMemoSeals(getMemoSeals());
  };
  const toggleMemoFav = (memoKey: string) => {
    toggleMemoFavorite(memoKey);
    setMemoFavorites(getMemoFavorites());
  };
  /* 目录跟读（批次 CY-71）：滚到哪页，目录里那枚学期号就亮——借卡片节点登记簿定位，滚动节流一帧 */
  const [activeMemo, setActiveMemo] = useState("");
  /* 目录自转（批次 CY-72）：目录改成一行横滚带——亮的那枚自己滚到看得见的地方，绝不动整页的滚动条 */
  const navRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!activeMemo) return;
    const nav = navRef.current;
    const chip = chipRefs.current.get(activeMemo);
    if (!nav || !chip) return;
    nav.scrollTo({
      left: chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2,
      behavior: "smooth",
    });
  }, [activeMemo]);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        let current = "";
        cardNodes.current.forEach((node, key) => {
          if (node.getBoundingClientRect().top <= window.innerHeight * 0.4) current = key;
        });
        setActiveMemo((prev) => (prev === current ? prev : current));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);
  /* 页码索引跳页（批次 CY-70）：借卡片节点登记簿直达那页；被「只看钉过心的」滤掉时先放宽再跳 */
  const jumpToPage = (memoKey: string) => {
    const go = () => {
      const node = cardNodes.current.get(memoKey);
      if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
      return node !== undefined;
    };
    if (go()) return;
    setFavsOnly(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(go);
    });
  };
  /* 全册之最（批次 CY-73）：某一口径全册唯一最高才评——并列不评、零不评，两页并列就让两页都安静 */
  const crownsOf = (memo: SemesterMemo): string[] => {
    if (ordered.length < 2) return [];
    const crowns: string[] = [];
    const pick = (get: (candidate: SemesterMemo) => number, label: string) => {
      const values = ordered.map(get);
      const max = Math.max(...values);
      if (max <= 0) return;
      if (values.filter((value) => value === max).length !== 1) return;
      if (get(memo) === max) crowns.push(label);
    };
    pick((candidate) => candidate.truths, "全册真话之最");
    pick((candidate) => candidate.silence, "全册沉默之最");
    pick((candidate) => candidate.attention, "全册最被盯");
    return crowns;
  };
  /* 登记簿摊开（批次 CY-69）：平时只留最近 8 笔，全量登记簿（20 笔）点一下就摊开 */
  const [ledgerAll, setLedgerAll] = useState(false);
  /* 年度台账点卡跳年（批次 CY-63）：正文里有那年就滚到年行；被「只看钉过心的」滤掉了就先放宽再跳 */
  const jumpToYear = (year: number) => {
    const go = () => {
      const anchor = document.getElementById(`memo-year-${year}`);
      if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
      return anchor !== null;
    };
    if (go()) return;
    setFavsOnly(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(go);
    });
  };
  /* 按心页打包存图（批次 CY-46）：卡片节点登记在册，逐张誊出（间隔防下载拥塞） */
  const cardNodes = useRef(new Map<string, HTMLElement>());
  const registerNode = useCallback((memoKey: string, node: HTMLElement | null) => {
    if (node) cardNodes.current.set(memoKey, node);
    else cardNodes.current.delete(memoKey);
  }, []);
  const [heartExport, setHeartExport] = useState<"idle" | "busy" | "done" | "failed">("idle");
  /* 按心页拼长图（批次 CY-57）：屏幕外誊一份克隆册页，一次拍成一张长条 */
  const [longExport, setLongExport] = useState<"idle" | "busy" | "done" | "failed">("idle");
  /* 全册逐页打包（批次 CY-141）：每一页都单独誊一张——按心页只誊按过心的，这里把整册都誊出去 */
  const [allExport, setAllExport] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const exportAllPages = async () => {
    if (allExport === "busy" || ordered.length === 0) return;
    setAllExport("busy");
    let allOk = true;
    for (let i = 0; i < ordered.length; i += 1) {
      const memo = ordered[i];
      const node = cardNodes.current.get(`${memo.semester}-${memo.stamp}`);
      if (!node) {
        allOk = false;
        continue;
      }
      const ok = await capturePng(node, `奶蛙大学·第${memo.semester}学期纪念册.png`);
      if (!ok) allOk = false;
      /* 页与页之间歇一笔，防下载拥塞 */
      if (i < ordered.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    setAllExport(allOk ? "done" : "failed");
    window.setTimeout(() => setAllExport("idle"), allOk ? 2000 : 2500);
  };

  /* 纪念册可以还空着，但登记本上已有出档记录时柜子照样开（批次 CY-42） */
  if (pages.length === 0 && exportLog.length === 0) return null;
  const ordered = [...pages].sort((a, b) => b.stamp - a.stamp);
  const favoritedMemos = ordered.filter((memo) => memoFavorites[`${memo.semester}-${memo.stamp}`]);
  const favoriteCount = favoritedMemos.length;
  const shown = favsOnly && favoriteCount > 0 ? favoritedMemos : ordered;

  const exportHearts = async () => {
    if (heartExport === "busy" || favoritedMemos.length === 0) return;
    setHeartExport("busy");
    let allOk = true;
    for (let i = 0; i < favoritedMemos.length; i += 1) {
      const memo = favoritedMemos[i];
      const node = cardNodes.current.get(`${memo.semester}-${memo.stamp}`);
      if (!node) {
        allOk = false;
        continue;
      }
      const ok = await capturePng(node, `奶蛙大学·第${memo.semester}学期纪念册.png`);
      if (!ok) allOk = false;
      /* 张与张之间歇一笔，防下载拥塞 */
      if (i < favoritedMemos.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    setHeartExport(allOk ? "done" : "failed");
    window.setTimeout(() => setHeartExport("idle"), allOk ? 2000 : 2500);
  };

  /* 拼长图（批次 CY-57）：把按心的几页原样誊到屏幕外的一只临时册夹，一次拍完即拆 */
  const exportHeartLong = async () => {
    if (longExport === "busy" || favoritedMemos.length === 0) return;
    setLongExport("busy");
    const holder = document.createElement("div");
    holder.className = "flex flex-col gap-4 bg-card p-6";
    holder.style.position = "fixed";
    holder.style.left = "-10000px";
    holder.style.top = "0";
    holder.style.width = "720px";
    document.body.appendChild(holder);
    let allOk = true;
    try {
      let prevYear = 0;
      for (const memo of favoritedMemos) {
        const node = cardNodes.current.get(`${memo.semester}-${memo.stamp}`);
        if (!node) {
          allOk = false;
          continue;
        }
        /* 页间年份分隔（批次 CY-58）：与册内同款——跨年先立一条 */
        const year = new Date(memo.stamp).getFullYear();
        if (prevYear !== 0 && year !== prevYear) holder.appendChild(makeYearDivider(year));
        prevYear = year;
        holder.appendChild(node.cloneNode(true));
      }
      const ok = await capturePng(holder, `奶蛙大学·按心的${favoritedMemos.length}页-长图.png`);
      if (!ok) allOk = false;
    } catch {
      allOk = false;
    } finally {
      holder.remove();
    }
    setLongExport(allOk ? "done" : "failed");
    window.setTimeout(() => setLongExport("idle"), allOk ? 2000 : 2500);
  };

  const exportBook = async () => {
    const node = bookRef.current;
    if (!node || bookExport === "busy") return;
    setBookExport("busy");
    const ok = await capturePng(node, `奶蛙大学·学期纪念册-全${ordered.length}页.png`);
    setBookExport(ok ? "done" : "failed");
    window.setTimeout(() => setBookExport("idle"), ok ? 2000 : 2500);
  };

  return (
    <section aria-label="学期纪念册" className="anim-fade-up rounded-3xl border border-border bg-card p-6 shadow-md md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black tracking-tight text-card-foreground">
            <BookOpenCheck size={20} className="text-primary" aria-hidden />
            学期纪念册
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            每一个学期结档的瞬间——开新学期、冬眠、蜕皮，都算——这一柜会自动收进一页。你不用记得，门槛替你记。
            每一页都可以「存成图」，整本也可以；每一页还可以补一笔——你写的字印在页上，跟纸一起带走。
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {/* 只看钉过心的（批次 CY-56）：正文只翻那几页，页码仍按整册编 */}
          {favoriteCount > 0 && (
            <button
              type="button"
              onClick={() => setFavsOnly((prev) => !prev)}
              title={favsOnly ? "回到整册翻" : "正文只翻按过心的几页——整本存图存的也就是这几页"}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                favsOnly
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              只看钉过心的 {favoriteCount} 页
            </button>
          )}
          {/* 按心页打包（批次 CY-46；CY-57 加拼长图）：逐张誊出，或原样誊成一张长条 */}
          {favoriteCount > 0 && (
            <>
            <button
              type="button"
              data-export-ui="1"
              onClick={exportHearts}
              disabled={heartExport === "busy"}
              title={`把按过心的 ${favoriteCount} 页逐张存成图`}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
                heartExport === "done"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <Heart size={11} className={heartExport === "done" ? "fill-current" : ""} aria-hidden />
              {heartExport === "busy"
                ? `正在誊 ${favoriteCount} 页…`
                : heartExport === "done"
                  ? "按心的都存好了"
                  : heartExport === "failed"
                    ? "有几页没誊出去"
                    : `按心的 ${favoriteCount} 页打包存图`}
            </button>
            <button
              type="button"
              data-export-ui="1"
              onClick={exportHeartLong}
              disabled={longExport === "busy"}
              title={`把按过心的 ${favoriteCount} 页原样誊进一张长图`}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
                longExport === "done"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <ImageDown size={11} aria-hidden />
              {longExport === "busy"
                ? "正在拼长图…"
                : longExport === "done"
                  ? "长图拼好了"
                  : longExport === "failed"
                    ? "这台设备不让拼"
                    : "拼成一张长图"}
            </button>
            </>
          )}
          {/* 全册逐页打包（批次 CY-141）：整册视图才亮——只看钉心时另一页不在册面上 */}
          {!favsOnly && ordered.length > 0 && (
            <button
              type="button"
              data-export-ui="1"
              onClick={exportAllPages}
              disabled={allExport === "busy"}
              title={`把整册 ${ordered.length} 页逐张存成图`}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
                allExport === "done"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <ImageDown size={11} aria-hidden />
              {allExport === "busy"
                ? `正在誊 ${ordered.length} 页…`
                : allExport === "done"
                  ? "全册都存好了"
                  : allExport === "failed"
                    ? "有几页没誊出去"
                    : `全册 ${ordered.length} 页打包存图`}
            </button>
          )}
          <button
            type="button"
            data-export-ui="1"
            onClick={exportBook}
            disabled={bookExport === "busy" || ordered.length === 0}
            title="整册存成一张长图"
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
              bookExport === "done"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            <ImageDown size={11} aria-hidden />
            {bookExport === "busy" ? "正在画整本…" : bookExport === "done" ? "整本存好了" : bookExport === "failed" ? "这台设备不让存" : "整本存成图"}
          </button>
        </span>
      </div>
      {/* 页码索引（批次 CY-70；CY-72 改横滚带、亮签自转）：四页以上才值得有目录——点学期号直达那页；虚线签表示那页正被「只看钉过心的」藏着 */}
      {ordered.length >= 4 && (
        <nav aria-label="学期页码索引" className="mt-4 flex items-center gap-2">
          <span className="shrink-0 text-[10px] font-bold tracking-widest text-muted-foreground">目录</span>
          <div ref={navRef} className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* 回册顶（批次 CY-72）：目录带子开头挂一枚——翻累了点它回到封面 */}
            <button
              type="button"
              onClick={() => bookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              title="回到册子最上面"
              className="shrink-0 whitespace-nowrap rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
            >
              册顶
            </button>
            {[...ordered]
              .sort((a, b) => a.semester - b.semester)
              .map((memo) => {
                const memoKey = `${memo.semester}-${memo.stamp}`;
                const hidden = favsOnly && !memoFavorites[memoKey];
                return (
                  <button
                    key={memoKey}
                    type="button"
                    ref={(node) => {
                      if (node) chipRefs.current.set(memoKey, node);
                      else chipRefs.current.delete(memoKey);
                    }}
                    onClick={() => jumpToPage(memoKey)}
                    title={`跳到第 ${memo.semester} 学期那页${hidden ? "（正被「只看钉过心的」藏着，点了会先放宽）" : ""}`}
                    className={clsx(
                      "shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                      hidden
                        ? "border-dashed border-border text-muted-foreground/60"
                        : activeMemo === memoKey
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary",
                    )}
                  >
                    {memoFavorites[memoKey] && (
                      <Heart size={8} className="mr-0.5 inline fill-current" aria-hidden />
                    )}
                    第 {memo.semester} 学期
                  </button>
                );
              })}
          </div>
        </nav>
      )}
      {ordered.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-border bg-background/50 p-4 text-xs leading-relaxed text-muted-foreground">
          册子还空着——还没有一个学期结档。但下面这些纸已经出了门，柜子在登记簿上替你留了墨点。
        </p>
      ) : (
        <div ref={bookRef} className="mt-5 flex flex-col gap-4">
          <CoverSheet
            pages={ordered}
            exportCount={exportLog.length}
            favoriteCount={favoriteCount}
            sealCount={ordered.filter((memo) => memoSeals[`${memo.semester}-${memo.stamp}`] !== undefined).length}
          />
          {/* 学期趋势（批次 CY-50）：封面之后、正文之前的一页折线——两个学期以上才画 */}
          <TrendStrip pages={ordered} />
          {/* 年度台账（批次 CY-62；CY-63 点卡跳到那年第一页）：按自然年对账——跨了两个年头以上才亮 */}
          <YearlyLedger pages={ordered} favorites={memoFavorites} seals={memoSeals} onJumpToYear={jumpToYear} />
          {shown.map((memo, index) => {
            /* 年份分隔（批次 CY-55）：和上一张卡不同年就先立一行——哪年结的档，纸上看年份 */
            const year = new Date(memo.stamp).getFullYear();
            const prevYear = index > 0 ? new Date(shown[index - 1].stamp).getFullYear() : year + 1;
            return (
              <Fragment key={`${memo.semester}-${memo.stamp}`}>
                {year !== prevYear && (
                  <p id={`memo-year-${year}`} className="flex scroll-mt-24 items-center gap-3 py-1 text-center text-[10px] font-bold tracking-widest text-muted-foreground" aria-label={`${year} 年结档`}>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                    {year} 年 · 结档
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </p>
                )}
                <MemorabiliaCard
                  memo={memo}
                  prev={ordered.find((candidate) => candidate.semester === memo.semester - 1) ?? null}
                  pageNumber={ordered.indexOf(memo) + 1}
                  pageCount={ordered.length}
                  favorited={!!memoFavorites[`${memo.semester}-${memo.stamp}`]}
                  onToggleFavorite={toggleMemoFav}
                  registerNode={registerNode}
                  isNew={newStamp > 0 && memo.stamp === newStamp}
                  sealedAt={memoSeals[`${memo.semester}-${memo.stamp}`] ?? -1}
                  onToggleSeal={toggleMemoSealFor}
                  crowns={crownsOf(memo)}
                />
              </Fragment>
            );
          })}
          {/* 册尾空白页（批次 CY-54）：正文之后的一页，笔归玩家自己 */}
          <FreeLeafSheet />
        </div>
      )}
      {/* 出档登记簿（批次 CY-42；CY-53 按纸类分格）：纸出了门，柜上留一笔——册子没页时这一格就是柜子的全部 */}
      {exportLog.length > 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-background/50 p-3.5">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">
            出档登记 · 最近 {Math.min(exportLog.length, ledgerAll ? 20 : 8)} 笔 · 按出档日子分格
          </p>
          {(() => {
            /* 按日分格（批次 CY-68）：哪天誊了几张各占一格——纸类退成条目上的小签 */
            const recent = [...exportLog].reverse().slice(0, ledgerAll ? 20 : 8);
            const dayOrder: string[] = [];
            const dayGroups = new Map<string, typeof recent>();
            for (const entry of recent) {
              const day = formatCnDate(entry.stamp);
              if (!dayGroups.has(day)) {
                dayGroups.set(day, []);
                dayOrder.push(day);
              }
              dayGroups.get(day)!.push(entry);
            }
            return dayOrder.map((day) => (
              <div key={day} className="mt-2 first:mt-2">
                <p className="text-[9px] font-bold tracking-widest text-muted-foreground">
                  {day} · {dayGroups.get(day)!.length} 张誊出
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {dayGroups.get(day)!.map((entry, index) => (
                    <li key={`${entry.stamp}-${index}`} className="flex items-baseline justify-between gap-3 text-[11px]">
                      <span className="min-w-0 truncate text-card-foreground">{entry.name.replace(/^奶蛙大学·/, "").replace(/\.png$/, "")}</span>
                      <span className="shrink-0 rounded-full border border-border px-1.5 text-[9px] font-bold text-muted-foreground">{paperKind(entry.name)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ));
          })()}
          {/* 摊开更早的笔（批次 CY-69）：登记簿满 8 笔才值得多这一下 */}
          {exportLog.length > 8 && (
            <button
              type="button"
              onClick={() => setLedgerAll((prev) => !prev)}
              className="mt-2 w-full rounded-full border border-border bg-card py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
            >
              {ledgerAll ? "收拢，只看最近 8 笔" : `摊开更早的 ${Math.min(exportLog.length, 20) - 8} 笔`}
            </button>
          )}
        </div>
      )}
      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        册子存最近十二页。更早的那些学期，档案柜记得，这一柜放不下。
      </p>
    </section>
  );
}
