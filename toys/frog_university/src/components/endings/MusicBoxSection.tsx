/**
 * 结局图鉴 · 音乐鉴赏区块（批次 B1；批次 CY-15 基调试穿与播放计数；CY-16 搜曲/随机/最常听；CY-17 按场景分格；CY-24 弹法收集灯与总进度）
 * 曲目卡 = 曲名 + 情绪句 + 播放/停止，当前播放高亮；按生活场景分四格陈列（白天日常 / 社团活动 / 深夜怪谈 / 回忆告别）。
 * 基调片一行 = 给正在听的歌当场换乐队（与配乐菜单同一份设置，哪边换都算数）。
 * 不锁进度、边听边逛；离开图鉴页时由卸载清理自动停曲。
 */
import { useEffect, useMemo, useState } from "react";
import { Filter, Music, Pin, Play, Repeat, Search, Shuffle, SkipForward, Square } from "lucide-react";
import { clsx } from "clsx";
import {
  currentBgmId,
  getBgmFavorites,
  isEncoreUnlocked,
  getBgmKeynote,
  getBgmPlayCounts,
  getBgmVariantHeard,
  isHiddenBgmTrack,
  listBgmKeynotes,
  listBgmTracks,
  playBgm,
  setBgmKeynote,
  stopBgm,
  subscribeBgm,
  toggleBgmFavorite,
  type BgmGroupId,
  type BgmKeynoteId,
  type BgmTrackId,
  type BgmTrackMeta,
} from "@/lib/bgm";
import { RichText } from "@/components/common/RichText";
import { loadSettings, saveSettings } from "@/lib/gameSave";

type BoxTrack = BgmTrackMeta & { group: BgmGroupId };

/** 播放中的均衡器条：逐根错拍呼吸，纯 CSS 动画 */
const BAR_CLASSES = ["h-2", "h-4", "h-2.5", "h-3"];

const KEYNOTE_CHIPS = listBgmKeynotes();

/** 四格陈列（批次 CY-17）：按生活场景归类，不按情绪——怪谈歌也住在「深夜」里 */
/** 连播的每首停留时长（批次 CY-144）：一首约两分钟——短了像赶场，长了像占座 */
const BGM_ADVANCE_MS = 120_000;

const GROUP_META: Array<{ id: BgmGroupId; label: string; hint: string }> = [
  { id: "day", label: "白天日常", hint: "教室、食堂、公示栏——看得清的日子" },
  { id: "club", label: "社团活动", hint: "招新、草坪、风采大会——热闹是排练过的" },
  { id: "night", label: "深夜怪谈", hint: "楼道、断电、深夜窗口——别人都睡了之后" },
  { id: "memory", label: "回忆告别", hint: "回响、谢幕、散场——隔着一年想起来" },
];

export function MusicBoxSection() {
  /* 曲目清单（批次 CY-25）：集齐弹法时隐藏安可曲会被广播「解锁出来」，所以清单要能刷新 */
  const [tracks, setTracks] = useState<BoxTrack[]>(() => listBgmTracks());
  const [playingId, setPlayingId] = useState<BgmTrackId | null>(() => currentBgmId());
  const [keynote, setKeynote] = useState(() => getBgmKeynote());
  const [plays, setPlays] = useState<Record<string, number>>(() => getBgmPlayCounts());
  /* 变奏收藏（批次 CY-24）：「曲目|基调」→ 听过次数；凡是真响过的组合（游戏里或图鉴里）都在账 */
  const [variants, setVariants] = useState<Record<string, number>>(() => getBgmVariantHeard());
  /* 搜曲（批次 CY-16）：曲名 / 氛围句 / 曲目 id 都算命中 */
  const [query, setQuery] = useState("");
  /* 只看缺的（批次 CY-26）：一键只留还没收齐弹法的歌 */
  const [onlyMissing, setOnlyMissing] = useState(false);
  /* 收藏置顶（批次 CY-33）：点图钉的歌从四个格子里收进顶上「我的常听」，再点放回 */
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() => getBgmFavorites());

  const toggleFavorite = (trackId: BgmTrackId) => {
    toggleBgmFavorite(trackId);
    setFavorites({ ...getBgmFavorites() });
  };
  /* 连播（批次 CY-144）：开着时，正在播的歌每两分钟自动换下一首——顺着当前列表走到头，再从第一首来 */
  const [autoAdvance, setAutoAdvance] = useState<boolean>(() => loadSettings().bgmAutoAdvance);
  const toggleAutoAdvance = () => {
    const next = !autoAdvance;
    saveSettings({ bgmAutoAdvance: next });
    setAutoAdvance(next);
  };

  /** 一首歌缺哪些弹法（批次 CY-26）：隐藏曲是奖励，永不记缺 */
  const missingKeysOf = (trackId: BgmTrackId): BgmKeynoteId[] => {
    if (isHiddenBgmTrack(trackId)) return [];
    const keys: BgmKeynoteId[] = trackId === "ending" ? ["milk"] : KEYNOTE_CHIPS.map((k) => k.id);
    return keys.filter((kid) => (variants[`${trackId}|${kid}`] ?? 0) <= 0);
  };

  /* 与 bgm 模块同步当前曲目（换曲 / 停曲 / 在别处开关 BGM 都会推过来）；顺带刷新播放计数与变奏账 */
  useEffect(
    () =>
      subscribeBgm(() => {
        setPlayingId(currentBgmId());
        setPlays(getBgmPlayCounts());
        setVariants(getBgmVariantHeard());
        setTracks(listBgmTracks()); /* 集齐那一刻，隐藏曲会出现在清单里 */
      }),
    [],
  );

  /* 点乐队小灯：当场给这首换这支乐队弹法（没在播就先起曲）；响过一笔就进账 */
  const playVariant = (trackId: BgmTrackId, kid: BgmKeynoteId) => {
    setBgmKeynote(kid);
    if (playingId !== trackId) playBgm(trackId);
    setKeynote(kid);
    setVariants(getBgmVariantHeard());
  };

  /* 变奏收集总数：每首 = 乐队数；结局曲锁死只有 1 种弹法；隐藏曲是奖励，不进分母 */
  const variantStat = useMemo(() => {
    let heard = 0;
    let total = 0;
    for (const t of tracks) {
      if (isHiddenBgmTrack(t.id)) continue;
      const keys: BgmKeynoteId[] = t.id === "ending" ? ["milk"] : KEYNOTE_CHIPS.map((k) => k.id);
      total += keys.length;
      for (const kid of keys) if ((variants[`${t.id}|${kid}`] ?? 0) > 0) heard += 1;
    }
    return { heard, total };
  }, [tracks, variants]);

  /* 离开图鉴页自动停曲：音乐不跟着玩家逛别的页面 */
  useEffect(() => () => stopBgm(), []);

  const toggle = (trackId: BgmTrackId) => {
    if (playingId === trackId) stopBgm();
    else playBgm(trackId);
  };

  /* 过滤后的曲卡列表（批次 CY-16；CY-26 叠加「只看缺的」） */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracks.filter((t) => {
      if (q && !(t.title.toLowerCase().includes(q) || t.mood.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)))
        return false;
      if (onlyMissing && missingKeysOf(t.id).length === 0) return false;
      return true;
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tracks, query, variants, onlyMissing]);

  /* 收藏置顶（批次 CY-33）：钉上的歌单列顶上，四格里不再重复 */
  const favoriteTracks = useMemo(
    () => filtered.filter((t) => favorites[t.id] === true),
    [filtered, favorites],
  );
  /* 连播的曲单（批次 CY-145）：当前列表里能播的那些——锁着的安可曲不进队 */
  const advancePool = useMemo(
    () => filtered.filter((t) => !isHiddenBgmTrack(t.id) || isEncoreUnlocked()),
    [filtered],
  );

  /* 跳下一首（批次 CY-145）：顺着曲单换下一首——连播定时走到下一首，和这颗按钮走的是同一条路；
     没在播不打扰安静，停了播就等下一次点歌 */
  const advanceNext = () => {
    const current = currentBgmId();
    if (!current || !loadSettings().bgmOn) return;
    const at = advancePool.findIndex((t) => t.id === current);
    const next = advancePool[(at + 1) % advancePool.length] ?? advancePool[0];
    if (next && next.id !== current) playBgm(next.id);
  };

  /* 连播推进（批次 CY-144）：每两分钟从曲单里换下一首；换歌那一刻起算新的一轮两分钟
     （playingId 在依赖里，换曲即重开计时） */
  useEffect(() => {
    if (!autoAdvance) return;
    const timer = window.setInterval(() => advanceNext(), BGM_ADVANCE_MS);
    return () => window.clearInterval(timer);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoAdvance, filtered, playingId]);


  /* 没收齐的歌数（批次 CY-26）：给「只看缺的」按钮挂角标 */
  const missingSongCount = useMemo(
    () => tracks.filter((t) => !isHiddenBgmTrack(t.id) && missingKeysOf(t.id).length > 0).length,
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [tracks, variants],
  );

  /* 本学期播出单（批次 CY-34）：真响过的歌给一张小报表——总点播数、响过几首、点播前三名（点击即播） */
  const airReport = useMemo(() => {
    const aired = tracks
      .map((t) => ({ track: t, times: plays[t.id] ?? 0 }))
      .filter((entry) => entry.times > 0)
      .sort((a, b) => b.times - a.times);
    const totalTimes = aired.reduce((sum, entry) => sum + entry.times, 0);
    return { totalTimes, airedCount: aired.length, top: aired.slice(0, 3) };
  }, [tracks, plays]);

  /* 听得最多的那首（次数 > 0 才算，并列取靠前） */
  const topId = useMemo(() => {
    let best: BgmTrackId | null = null;
    let bestN = 0;
    for (const t of tracks) {
      const n = plays[t.id] ?? 0;
      if (n > bestN) {
        best = t.id;
        bestN = n;
      }
    }
    return best;
  }, [tracks, plays]);

  /* 随机来一首：从当前筛选结果里抽（排除正在播的） */
  const shuffle = () => {
    const pool = filtered.filter((t) => t.id !== playingId);
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? filtered[0];
    if (pick) playBgm(pick.id);
  };

  /** 单曲卡（CY-17 起被四格分组复用；CY-24 起卡底带变奏收集灯条） */
  const card = (track: BoxTrack) => {
    const isPlaying = playingId === track.id;
    /* 隐藏曲（批次 CY-25）：它本身就是集齐的奖励，不再参与收集 */
    const hidden = isHiddenBgmTrack(track.id);
    /* 这首的弹法账：结局曲锁死，只有原乐队一种 */
    const variantKeys = track.id === "ending" ? KEYNOTE_CHIPS.filter((k) => k.id === "milk") : KEYNOTE_CHIPS;
    const heardOf = variantKeys.filter((k) => (variants[`${track.id}|${k.id}`] ?? 0) > 0).length;
    /* 收藏置顶（批次 CY-33）：图钉收进顶上「我的常听」 */
    const fav = favorites[track.id] === true;
    return (
      <div
        key={track.id}
        className={clsx(
          "group flex h-full flex-col overflow-hidden rounded-2xl border transition-all duration-200 hover:shadow-md",
          isPlaying ? "border-primary bg-primary/10 shadow-md" : "border-border bg-background/70 shadow-sm hover:bg-muted/40",
        )}
      >
      <button
        type="button"
        onClick={() => toggle(track.id)}
        aria-pressed={isPlaying}
        aria-label={isPlaying ? `停止播放 ${track.title}` : `播放 ${track.title}`}
        className={clsx(
          "flex flex-1 flex-col gap-2 p-4 text-left focus-visible:shadow-focus focus-visible:outline-none",
        )}
      >
        <div className="flex min-h-14 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={clsx("truncate text-sm font-bold", isPlaying ? "text-primary" : "text-card-foreground")}>
              {track.title}
              {hidden && (
                <span
                  className="ml-1.5 inline-flex items-center rounded-full bg-primary px-1.5 py-0.5 align-middle text-[10px] font-bold text-primary-foreground"
                  title="全部弹法集齐后亮出来的安可曲"
                >
                  隐藏曲
                </span>
              )}
              {topId === track.id && (
                <span
                  className="ml-1.5 inline-flex items-center rounded-full bg-primary px-1.5 py-0.5 align-middle text-[10px] font-bold text-primary-foreground"
                  title={`听得最多：已听 ${plays[track.id]} 次`}
                >
                  最常听
                </span>
              )}
            </p>
            <p
              className={clsx(
                "mt-1 text-xs font-bold uppercase tracking-widest",
                isPlaying ? "text-primary/80" : "text-muted-foreground/70",
              )}
            >
              {track.id}
            </p>
          </div>
          <span
            className={clsx(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
              isPlaying
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground group-hover:border-primary group-hover:text-primary",
            )}
          >
            {isPlaying ? <Square size={12} className="fill-current" aria-hidden /> : <Play size={12} className="ml-0.5" aria-hidden />}
          </span>
        </div>
        <RichText className="text-xs leading-relaxed text-muted-foreground" text={track.mood} />
        <div className="mt-auto flex h-4 items-end gap-1 pt-1">
          {isPlaying ? (
            <>
              {BAR_CLASSES.map((barClass, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={clsx("w-1 animate-pulse rounded-full bg-primary", barClass)}
                  style={{ animationDelay: `${i * 0.16}s` }}
                />
              ))}
              <span className="ml-1.5 self-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                播放中
              </span>
            </>
          ) : (
            <span className="text-xs font-bold text-muted-foreground/70">点一下试听</span>
          )}
          {(plays[track.id] ?? 0) > 0 && (
            <span
              className={clsx(
                "ml-auto self-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                isPlaying ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              已听 {plays[track.id]} 次
            </span>
          )}
        </div>
      </button>
        {/* 变奏收集灯条（批次 CY-24）：一支乐队一盏灯，真响过的才亮；点没亮的当场听一次就进账。
            隐藏曲（批次 CY-25）的卡底不放灯，写谢幕语 */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-4 py-2">
          {/* 收藏图钉（批次 CY-33）：钉上的歌单列顶上，四格里就不再重复出现 */}
          <button
            type="button"
            onClick={() => toggleFavorite(track.id)}
            aria-pressed={fav}
            aria-label={fav ? `取消收藏《${track.title}》` : `收藏《${track.title}》，置顶到常听`}
            title={fav ? "已收藏——住在顶上「我的常听」，再点放回原格" : "收藏——把这首置顶到「我的常听」"}
            className={clsx(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
              fav
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            <Pin size={11} className={fav ? "fill-current" : undefined} aria-hidden />
          </button>
          {hidden ? (
            <p className="text-[11px] font-bold leading-relaxed text-primary">
              全部 {variantStat.total} 种弹法都响过了——这首是剧场为你留的安可。
            </p>
          ) : (
            <>
          {variantKeys.map((k) => {
            const n = variants[`${track.id}|${k.id}`] ?? 0;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => playVariant(track.id, k.id)}
                aria-label={n > 0 ? `用「${k.label}」弹法播《${track.title}》` : `第一次听「${k.label}」弹法的《${track.title}》`}
                title={n > 0 ? `${k.label} · 已听 ${n} 次` : `${k.label} · 还没响过，点一下就听`}
                className={clsx(
                  "h-2.5 w-2.5 rounded-full transition-transform duration-200 hover:scale-125 focus-visible:shadow-focus focus-visible:outline-none",
                  n > 0 ? "bg-primary" : "border border-muted-foreground/50 bg-transparent hover:border-primary",
                )}
              />
            );
          })}
          <span className="ml-auto text-[10px] font-bold text-muted-foreground" title="同一首歌 × 每支乐队各算一种弹法，真响过的才算收到">
            弹法 {heardOf}/{variantKeys.length}
          </span>
              {/* 缺的弹法点名（批次 CY-26）：小灯对应乐队名，这里直接写出来不用猜 */}
              {variantKeys.length > 0 &&
                (variantKeys.length - heardOf === 0 ? (
                  <p className="w-full text-[10px] font-bold text-primary">这支曲子的弹法全收齐了。</p>
                ) : (
                  <p
                    className="w-full text-[10px] leading-relaxed text-muted-foreground"
                    title={`还缺：${variantKeys
                      .filter((k) => (variants[`${track.id}|${k.id}`] ?? 0) <= 0)
                      .map((k) => k.label)
                      .join(" · ")}`}
                  >
                    还缺：
                    {variantKeys
                      .filter((k) => (variants[`${track.id}|${k.id}`] ?? 0) <= 0)
                      .slice(0, 3)
                      .map((k) => k.label)
                      .join(" · ")}
                    {variantKeys.length - heardOf > 3 ? `…（共缺 ${variantKeys.length - heardOf} 种）` : ""}
                  </p>
                ))}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section aria-label="音乐鉴赏" className="anim-fade-up rounded-3xl border border-border bg-card p-6 shadow-md md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black tracking-tight text-card-foreground">
            <Music size={18} className="text-primary" aria-hidden />
            音乐鉴赏
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            校园里响过的配乐都在这里，按生活场景分了四个格子。点一首就能听，边看图鉴边听也行；离开这页，音乐会自己停下。
            同一首歌，八支乐队各有弹法——游戏里真响过的弹法会一盏盏亮进曲底的收集灯里，点小灯直接听那一种。
            <span className="font-bold text-primary">全部集齐的那天，曲库里会亮出一首从没出现过的安可。</span>
          </p>
          {/* 变奏收集进度（批次 CY-24）：全图鉴一共多少种弹法、已经收到多少 */}
          <div className="mt-3 flex items-center gap-2" title={`每首歌 × 每支乐队各算一种弹法（结局曲只有一种）；真响过的才算收到`}>
            <div className="h-1.5 w-36 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${variantStat.total === 0 ? 0 : Math.round((variantStat.heard / variantStat.total) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-bold text-card-foreground">
              弹法收集 {variantStat.heard} / {variantStat.total}
            </span>
          </div>
          {/* 本学期播出单（批次 CY-34）：响过的歌自己会排队——点前三名任意一首直接开听 */}
          {airReport.totalTimes > 0 && (
            <div
              className="mt-2.5 flex flex-wrap items-center gap-1.5"
              title="只算真正响过的：游戏里走到哪响到哪，图鉴里点一下也算"
            >
              <span className="text-xs font-bold text-muted-foreground">
                本学期共播 {airReport.totalTimes} 次 · 响过 {airReport.airedCount} 首
              </span>
              {airReport.top.map((entry, rank) => (
                <button
                  key={entry.track.id}
                  type="button"
                  onClick={() => playBgm(entry.track.id)}
                  title={`再来一遍《${entry.track.title}》——已播 ${entry.times} 次`}
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                    playingId === entry.track.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
                  )}
                >
                  {["冠", "亚", "季"][rank]}·{entry.track.title} {entry.times}次
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 搜曲 / 随机 / 计数（批次 CY-16） */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜曲"
              aria-label="按曲名或氛围句筛选曲目"
              className="w-36 rounded-full border border-border bg-background py-1.5 pl-7 pr-3 text-xs font-bold text-card-foreground placeholder:text-muted-foreground/60 focus-visible:shadow-focus focus-visible:outline-none sm:w-44"
            />
          </div>
          <button
            type="button"
            onClick={shuffle}
            disabled={filtered.length === 0}
            title="从当前列表里随机来一首"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Shuffle size={12} aria-hidden />
            随机来一首
          </button>
          {/* 连播（批次 CY-144）：开着时正在播的歌两分钟后自动换下一首——不开就一直单曲循环 */}
          <button
            type="button"
            onClick={toggleAutoAdvance}
            aria-pressed={autoAdvance}
            title={
              autoAdvance
                ? "连播开着——正在播的歌两分钟后自动换下一首，顺着列表走到头再从头来"
                : "开着它：正在播的歌每两分钟自动换下一首；不开就一直单曲循环"
            }
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
              autoAdvance
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-card-foreground",
            )}
          >
            <Repeat size={12} aria-hidden />
            连播 · 两分钟换一首
          </button>
          {/* 跳下一首（批次 CY-145）：不想等两分钟就当场翻页——连播开着才出现 */}
          {autoAdvance && (
            <button
              type="button"
              onClick={advanceNext}
              disabled={playingId === null || advancePool.length <= 1}
              title={
                playingId === null || advancePool.length <= 1
                  ? "先点一首歌，或让列表里多几首可换的"
                  : "不等两分钟，当场换下一首"
              }
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SkipForward size={12} aria-hidden />
              跳下一首
            </button>
          )}
          {/* 只看缺的（批次 CY-26）：只留弹法没收齐的歌，角标是没收齐的歌数 */}
          <button
            type="button"
            onClick={() => setOnlyMissing((prev) => !prev)}
            aria-pressed={onlyMissing}
            disabled={!onlyMissing && missingSongCount === 0}
            title={
              missingSongCount === 0
                ? "所有曲子的弹法都收齐了，没有可筛的"
                : `只看弹法没收齐的歌（还有 ${missingSongCount} 首缺）`
            }
            className={clsx(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
              onlyMissing
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-card-foreground",
            )}
          >
            <Filter size={12} aria-hidden />
            只看缺的
            {missingSongCount > 0 && (
              <span
                className={clsx(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  onlyMissing ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {missingSongCount}
              </span>
            )}
          </button>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
            {filtered.length === tracks.length ? `${tracks.length} 首` : `挑出 ${filtered.length} / ${tracks.length} 首`}
          </span>
        </div>
      </header>

      {/* 基调试穿（批次 CY-15）：点一片当场给正在听的歌换乐队，没在听就先选好后起曲生效 */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-bold text-muted-foreground">基调试穿</span>
        {KEYNOTE_CHIPS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKeynote(setBgmKeynote(k.id))}
            aria-pressed={keynote === k.id}
            title={k.blurb}
            className={clsx(
              "rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
              keynote === k.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* 四格陈列（批次 CY-17）：搜曲时只留有点中曲子的格子，空格子不占位 */}
      {filtered.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-xs font-bold text-muted-foreground">
          {onlyMissing && !query
            ? "没有一首歌还缺弹法——全部收齐了，去听那首安可吧。"
            : `没有对得上「${query}」的曲子——换个词试试，或者清空搜索框看全部。`}
        </p>
      )}
      {/* 收藏置顶（批次 CY-33）：钉上的歌住顶上这一格，四格只摆没钉的 */}
      {favoriteTracks.length > 0 && (
        <section className="mt-7">
          <h4 className="mb-3 flex flex-wrap items-center gap-2">
            <Pin size={14} className="text-primary" aria-hidden />
            <span className="text-sm font-bold text-card-foreground">我的常听 · 收藏置顶</span>
            <span className="text-xs text-muted-foreground">点曲卡下角的图钉收进来，再点一下放回原格</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              {favoriteTracks.length} 首
            </span>
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{favoriteTracks.map(card)}</div>
        </section>
      )}
      {GROUP_META.map((group) => {
        const inGroup = filtered.filter((t) => t.group === group.id && favorites[t.id] !== true);
        if (inGroup.length === 0) return null;
        return (
          <section key={group.id} className="mt-7">
            <h4 className="mb-3 flex flex-wrap items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/30" aria-hidden />
              <span className="text-sm font-bold text-card-foreground">{group.label}</span>
              <span className="text-xs text-muted-foreground">{group.hint}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {inGroup.length} 首
              </span>
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{inGroup.map(card)}</div>
          </section>
        );
      })}

      <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        配乐全部在本地现场合成，没有一段录音文件。校园里走到哪儿，曲子就跟到哪儿。
      </p>
    </section>
  );
}
