/**
 * 顶栏配乐菜单（批次 CY）：一颗音符按钮点开「基调抽屉」——
 * 上面是背景配乐开关，下面是八套基调（批次 CY-21 起）；换基调立刻给正在播的曲子换调（交叉淡入淡出，不掐断）。
 * 与音效开关完全独立；状态读写都走 bgm.ts（设置持久化 + 一秒兜底同步），本页无需外部 props。
 */
import { useEffect, useRef, useState } from "react";
import { Check, Music, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import {
  currentBgmId,
  getBgmKeynote,
  isBgmAutoKeynote,
  isBgmOn,
  listBgmKeynotes,
  listBgmTracks,
  recommendKeynote,
  reportBgmOfferRefusal,
  setBgmAutoKeynote,
  setBgmKeynote,
  setBgmOn,
  subscribeBgm,
  subscribeKeynoteFollow,
  subscribeKeynoteOffer,
  type BgmKeynoteReco,
  type BgmTrackId,
} from "@/lib/bgm";

const KEYNOTES_UI = listBgmKeynotes();
const TRACK_TITLES = listBgmTracks();

/** 当前在播曲目的标题与一句话氛围（没在播就都没有） */
function nowPlaying(): { title: string; mood: string } | null {
  const id = currentBgmId();
  if (!id) return null;
  const meta = TRACK_TITLES.find((t) => t.id === id);
  return meta ? { title: meta.title, mood: meta.mood } : null;
}

export function BgmKeynoteMenu() {
  const [open, setOpen] = useState(false);
  const [bgmOn, setOn] = useState(() => isBgmOn());
  const [keynote, setKey] = useState(() => getBgmKeynote());
  /* 随剧情自动推荐（批次 CY-12）：推荐角标 + 自动跟开关，打开抽屉时现算一次 */
  const [reco, setReco] = useState<BgmKeynoteReco | null>(null);
  const [autoFollow, setAuto] = useState(() => isBgmAutoKeynote());
  const wrapRef = useRef<HTMLDivElement>(null);
  /* 正在播放与自动换曲注释（批次 CY-13）：订阅引擎事件，菜单里实时显示 */
  const [now, setNow] = useState<{ title: string; mood: string } | null>(null);
  const [followNote, setFollowNote] = useState<string | null>(null);
  const followTimer = useRef<number | null>(null);
  /* 换曲报幕（批次 CY-14）：歌真换了一首时轻报一次新曲名（首次进页与停曲不报） */
  const [trackNote, setTrackNote] = useState<string | null>(null);
  const trackTimer = useRef<number | null>(null);
  const lastNotedId = useRef<BgmTrackId | null | undefined>(undefined);
  /* 坏天气上门推荐（批次 CY-18/19）：雨/雾/风都递卡片，12 秒不点自己收 */
  const [offer, setOffer] = useState<BgmKeynoteReco | null>(null);
  const offerTimer = useRef<number | null>(null);

  useEffect(
    () =>
      subscribeKeynoteOffer((reco) => {
        setOffer(reco);
        if (offerTimer.current) window.clearTimeout(offerTimer.current);
        offerTimer.current = window.setTimeout(() => setOffer(null), 12000);
      }),
    [],
  );

  useEffect(() => {
    const syncNow = (id: BgmTrackId | null) => {
      const np = nowPlaying();
      setNow(np);
      if (lastNotedId.current !== undefined && id && id !== lastNotedId.current && np) {
        setTrackNote(`《${np.title}》 · ${np.mood}`);
        if (trackTimer.current) window.clearTimeout(trackTimer.current);
        trackTimer.current = window.setTimeout(() => setTrackNote(null), 3400);
      }
      lastNotedId.current = id;
    };
    lastNotedId.current = currentBgmId();
    syncNow(currentBgmId());
    const offBgm = subscribeBgm(syncNow);
    const offFollow = subscribeKeynoteFollow((note) => {
      setFollowNote(`${note.reason}——已自动切至《${note.keynoteLabel}》`);
      setKey(getBgmKeynote());
      setReco(recommendKeynote());
      if (followTimer.current) window.clearTimeout(followTimer.current);
      followTimer.current = window.setTimeout(() => setFollowNote(null), 4200);
    });
    return () => {
      offBgm();
      offFollow();
      if (followTimer.current) window.clearTimeout(followTimer.current);
      if (trackTimer.current) window.clearTimeout(trackTimer.current);
    };
  }, []);

  /* 点抽屉外面就收起来 */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const toggleOpen = () => {
    setOpen((prev) => {
      /* 每次打开都从引擎拉一次最新状态（另一页可能刚换过） */
      if (!prev) {
        setOn(isBgmOn());
        setKey(getBgmKeynote());
        setReco(recommendKeynote());
        setAuto(isBgmAutoKeynote());
        setNow(nowPlaying());
      }
      return !prev;
    });
  };

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label="配乐基调菜单"
        title={bgmOn ? "配乐已开：点击换基调" : "配乐已关：点击打开配乐菜单"}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
      >
        <span className="relative inline-flex">
          <Music size={16} className={bgmOn ? "text-primary" : "text-muted-foreground"} aria-hidden />
          {!bgmOn && (
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-muted-foreground"
            />
          )}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-card p-3 shadow-lg">
          {/* 正在播放（批次 CY-13）：曲名 + 悬停看一句话氛围 */}
          {now && (
            <p className="flex items-center gap-1.5 pb-2 text-xs" title={now.mood}>
              <Music size={11} className="shrink-0 text-primary" aria-hidden />
              <span className="truncate font-bold text-card-foreground">正在播放《{now.title}》</span>
            </p>
          )}
          {/* 开关行：与原来的一键开关等价 */}
          <div className="flex items-center justify-between gap-2 pb-2">
            <span className="text-xs font-bold text-muted-foreground">背景配乐</span>
            <button
              type="button"
              onClick={() => setOn(setBgmOn(!isBgmOn()))}
              aria-pressed={bgmOn}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                bgmOn ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {bgmOn ? "开" : "关"}
            </button>
          </div>
          <div className="border-t border-border pt-2">
            <p className="px-1 pb-1 text-xs font-bold text-muted-foreground">配乐基调</p>
            {/* 随剧情推荐（批次 CY-12）：这个场面有一首更搭的歌时，先说一句给玩家听 */}
            {reco && (
              <p className="mb-1 flex items-center gap-1 px-1 text-[11px] font-bold text-primary">
                <Sparkles size={11} aria-hidden />
                {reco.reason}
              </p>
            )}
            <ul className="space-y-1">
              {KEYNOTES_UI.map((k) => {
                const activeKey = keynote === k.id;
                const recoHere = reco?.id === k.id;
                return (
                  <li key={k.id}>
                    <button
                      type="button"
                      onClick={() => setKey(setBgmKeynote(k.id))}
                      aria-pressed={activeKey}
                      className={clsx(
                        "flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                        activeKey ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-card-foreground">
                          {k.label}
                          {recoHere && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-bold text-primary">
                              <Sparkles size={9} aria-hidden />
                              更配这场
                            </span>
                          )}
                        </span>
                        <span className="block text-xs leading-relaxed text-muted-foreground">{k.blurb}</span>
                      </span>
                      {activeKey && <Check size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* 自动跟场面（批次 CY-12）：开了以后，基调跟着推荐自己换 */}
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
              <span
                className="text-xs font-bold text-muted-foreground"
                title="开了以后：场景和天气一变，基调自动跟着推荐换（怪谈换幽灵、温情换云田、雨天换黄昏……）。晴天日常不劝，保留你自己选的。"
              >
                自动跟场面
              </span>
              <button
                type="button"
                onClick={() => setAuto(setBgmAutoKeynote(!isBgmAutoKeynote()))}
                aria-pressed={autoFollow}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                  autoFollow ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {autoFollow ? "开" : "关"}
              </button>
            </div>
            <p className="px-1 pt-2 text-[11px] leading-relaxed text-muted-foreground">
              换基调就是换一首歌、换一支乐队：旋律、配器、快慢、回声厅堂整套跟着换。怪谈场面改唱幽灵那首，温情场面改唱摇篮曲；结局曲不随基调变——从头到尾同一首。开「自动跟场面」后，这些推荐会替你自动换。
            </p>
          </div>
        </div>
      )}
      {/* 坏天气上门推荐（批次 CY-18/19）：可点的换基调卡片，压住普通报幕 */}
      {offer && !open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-primary/40 bg-card p-3 shadow-lg">
          <p className="flex items-start gap-1 text-[11px] font-bold leading-relaxed text-primary">
            <Sparkles size={11} className="mt-0.5 shrink-0" aria-hidden />
            {offer.reason}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setKey(setBgmKeynote(offer.id));
                setOffer(null);
                if (offerTimer.current) window.clearTimeout(offerTimer.current);
              }}
              className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-bold text-primary transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none"
            >
              换到{KEYNOTES_UI.find((k) => k.id === offer.id)?.label ?? "专属基调"}
            </button>
            <button
              type="button"
              onClick={() => {
                reportBgmOfferRefusal(offer.weather); /* 挥手记账（批次 CY-20）：同一天气满三次就不再上门 */
                setOffer(null);
                if (offerTimer.current) window.clearTimeout(offerTimer.current);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted focus-visible:shadow-focus focus-visible:outline-none"
            >
              再听听
            </button>
          </div>
        </div>
      )}
      {/* 音符下的飘窗（批次 CY-13/14）：自动换基调的注释优先，其次换曲报幕；上门推荐时让位 */}
      {!offer && (followNote ?? trackNote) && !open && (
        <div className="pointer-events-none absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-primary/40 bg-card/95 px-3 py-2 text-[11px] font-bold leading-relaxed text-primary shadow-md backdrop-blur">
          <Sparkles size={11} className="mr-1 inline align-[-2px]" aria-hidden />
          {followNote ?? trackNote}
        </div>
      )}
    </div>
  );
}
