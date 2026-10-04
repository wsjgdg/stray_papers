/**
 * 标题画面 Logic 层：存档探测 / 自动档「继续」/ 三主题切换 / 设置 / 新档确认 / 制作名单弹层 / 页面跳转
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  applyThemeToDocument,
  consumeCorruptSaveNotice,
  deleteSlot,
  getPlaythrough,
  hasExistingSave,
  isLongAbsent,
  loadGameSave,
  loadSettings,
  loadSlots,
  loadTheme,
  persistGameSave,
  persistTheme,
  markRecorderLine,
  recorderLineOf,
  resetGameSave,
  restoreSlot,
  saveSettings,
  totalEndingCount,
  type GameSettings,
  type SemesterMemo,
  type ThemeId,
  abscondCountOf,
  abscondSettledOf,
  markAbscond,
  settleAbscond,
  playerRenamedOf,
  getMemoSeals,
} from "@/lib/gameSave";
import { parseSeedCode } from "@/lib/seedCode";
import { isSoundOn, setSoundOn } from "@/lib/audio";
import { FROG_CAST } from "@/data/characters";
import { STORYLINES, storylineById } from "@/data/storylinesMeta";

export function useHome() {
  const navigate = useNavigate();
  const [activeTheme, setActiveTheme] = useState<ThemeId>("cream");
  const [hasSave, setHasSave] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [freshConfirmOpen, setFreshConfirmOpen] = useState(false);
  /* ---------- 不告而别（批次 CN）：直接关掉页面也算一次离校——攒到三次，开学弹说明 ---------- */
  const [abscondCount, setAbscondCount] = useState(0);
  const [abscondOpen, setAbscondOpen] = useState(false);
  /* ---------- 姓名（批次 CO）：学籍信息不全——有名字的才好被处理 ---------- */
  const [enrollFixOpen, setEnrollFixOpen] = useState(false);
  const [renamed, setRenamed] = useState(false);
  /* ---------- 存档损坏提示（优化批次）：清档重开不再静默——回到标题界面时如实告知 ---------- */
  const [corruptNoticeOpen, setCorruptNoticeOpen] = useState(false);
  /* ---------- 册子添了新页（批次 CY-47）：结档收页的瞬间，回到标题界面时柜子主动递一页 ---------- */
  const [newMemo, setNewMemo] = useState<SemesterMemo | null>(null);
  /* 对账摘要（批次 CY-51）：回执上带一句和上学期的涨跌——册里有上一页才比得了 */
  const [newMemoPrev, setNewMemoPrev] = useState<SemesterMemo | null>(null);
  /* 盖章页数（批次 CY-61）：回执顺带报一句册里已有几页盖着你自带的章 */
  const [newMemoSealedCount, setNewMemoSealedCount] = useState(0);
  useEffect(() => {
    const fresh = loadGameSave();
    /* 刚检出的损坏清档：弹一次《存档损坏说明》（原文副本已留在本地备查） */
    if (consumeCorruptSaveNotice()) setCorruptNoticeOpen(true);
    /* 册子里有没收过页：取最新一页递出（签收前每学期只递一次） */
    const settingsNow = loadSettings();
    if (settingsNow.memorabilia.length > 0) {
      const latest = settingsNow.memorabilia.reduce((a, b) => (b.stamp > a.stamp ? b : a));
      if (latest.stamp > settingsNow.lastSeenMemoStamp) {
        setNewMemo(latest);
        setNewMemoPrev(settingsNow.memorabilia.find((memo) => memo.semester === latest.semester - 1) ?? null);
        /* 册里盖过章的页数（含旧档没日期的章）：回执上提一嘴 */
        const seals = getMemoSeals();
        setNewMemoSealedCount(
          settingsNow.memorabilia.filter((memo) => seals[`${memo.semester}-${memo.stamp}`] !== undefined).length
        );
      }
    }
    const count = abscondCountOf(fresh);
    setAbscondCount(count);
    /* 攒到三次（或更多）：开学弹《离校情况说明》——每学期至多办一次（办过就不再弹） */
    if (count >= 3 && !abscondSettledOf(fresh)) setAbscondOpen(true);
    /* 学籍信息补全（批次 CO）：入学登记时没填名的，行政楼递一张表——补录不受理第二次 */
    const named = playerRenamedOf(fresh);
    setRenamed(named);
    if (!named && !(fresh.playerDisplayName ?? "").trim()) setEnrollFixOpen(true);
    /* pagehide：直接关掉页面/切走 —— 本会话推进过就记一次未办手续 */
    const onHide = () => markAbscond();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    return () => window.removeEventListener("pagehide", onHide);
  }, []);
  const [endingsBadge, setEndingsBadge] = useState("");
  /** 缺席提示（批次 AP）：现实时间 = 游戏时间——离校满三天，标题页多一行「许久未到校」 */
  const [absentLabel, setAbsentLabel] = useState("");
  /** 记录员的话（批次 AU）：档案腔之外的第一人称——第二学期起它只开口三次，之后把这一栏删了 */
  const [recorderLine, setRecorderLine] = useState("");
  /* 多周目继承：现在是第几个学期（旧存档缺字段按 1 处理） */
  const [playthrough, setPlaythrough] = useState(1);
  /* ---------- 系统层（galgame 外壳批次 A） ---------- */
  /** 自动档标签：有 auto 档时「继续」直接接着上次那一幕 */
  const [autoSlotLabel, setAutoSlotLabel] = useState("");
  const [saveLoadOpen, setSaveLoadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [soundOn, setSoundOnState] = useState(() => isSoundOn());

  useEffect(() => {
    const savedTheme = loadTheme();
    applyThemeToDocument(savedTheme);
    setActiveTheme(savedTheme);
    setHasSave(hasExistingSave());
    const fresh = loadGameSave();
    setPlaythrough(getPlaythrough(fresh));
    /* 记录员的话（批次 AU）：第二学期起它只开口三次——这一句落档，下一次它只会说下一句 */
    const line = recorderLineOf(fresh);
    if (line) {
      setRecorderLine(line);
      markRecorderLine();
    }
    /* 缺席提示（批次 AP）：离校满三天的档，标题页多一行——该蛙已许久未到校 */
    setAbsentLabel(
      hasExistingSave() && isLongAbsent(fresh)
        ? `该蛙已许久未到校。（${Math.max(3, Math.floor((Date.now() - fresh.updatedAt) / 86400000))} 天）`
        : "",
    );
    const collected = fresh.unlockedEndings.length;
    const total = totalEndingCount();
    setEndingsBadge(collected > 0 ? `${collected}/${total}` : "");
    setAutoSlotLabel(loadSlots().auto?.label ?? "");
  }, []);

  const switchTheme = useCallback((themeId: ThemeId) => {
    persistTheme(themeId);
    setActiveTheme(themeId);
  }, []);

  /** 「继续」：恢复自动档并跳到保存时所在的剧情线（线无效回地图） */
  const continueGame = useCallback(() => {
    const restored = restoreSlot("auto");
    if (!restored) {
      navigate("/map");
      return;
    }
    const meta = restored.lastLineId ? storylineById(restored.lastLineId) : undefined;
    navigate(meta ? `/play?line=${meta.id}` : "/map");
  }, [navigate]);

  const [seedInput, setSeedInput] = useState("");
  const [pendingSeed, setPendingSeed] = useState<number | null>(null);
  /** 混种谱系（批次 AM）：确认弹层暂存的父本/母本——混出来的种子在档案里留两行来历 */
  const [pendingParents, setPendingParents] = useState<[number, number] | null>(null);
  /** 开新学期：进度清零前把 auto 档一并清掉（手动档保留，图鉴不退）；
   *  带种子码时用玩家贴回来的那颗种子——重走某一局的世界（天气 / 脾气 / 深夜与日程顺序）；
   *  带谱系时是混出来的那一局（混种计数 +1，档案里记父本与母本） */
  const wipeAndStartFresh = useCallback(
    (seed?: number, parents?: [number, number]) => {
      deleteSlot("auto");
      const fresh = resetGameSave();
      if (seed !== undefined || parents) {
        persistGameSave({
          ...fresh,
          weatherSeed: (seed ?? fresh.weatherSeed) % 1000000,
          ...(parents ? { seedParents: parents, mixedSeeds: (fresh.mixedSeeds ?? 0) + 1 } : {}),
        });
      }
      navigate("/map");
    },
    [navigate],
  );

  const startNewGame = useCallback(() => {
    if (hasSave) {
      setFreshConfirmOpen(true);
      return;
    }
    wipeAndStartFresh();
  }, [hasSave, wipeAndStartFresh]);

  const startWithSeed = useCallback(
    (code: string, parents?: [number, number]): boolean => {
      const seed = parseSeedCode(code);
      if (seed === null) return false;
      if (hasSave) {
        setPendingSeed(seed);
        setPendingParents(parents ?? null);
        setFreshConfirmOpen(true);
        return true;
      }
      wipeAndStartFresh(seed, parents);
      return true;
    },
    [hasSave, wipeAndStartFresh],
  );

  const confirmNewGame = useCallback(() => {
    setFreshConfirmOpen(false);
    /* 确认弹层里贴了种子码就用它；没贴就重摇一颗（混种谱系跟种子一起带进去） */
    const code = parseSeedCode(seedInput);
    if (code !== null) {
      wipeAndStartFresh(code, pendingParents ?? undefined);
    } else {
      wipeAndStartFresh(pendingSeed ?? undefined, pendingParents ?? undefined);
    }
    setPendingSeed(null);
    setPendingParents(null);
    setSeedInput("");
  }, [pendingSeed, pendingParents, seedInput, wipeAndStartFresh]);

  const cancelNewGame = useCallback(() => setFreshConfirmOpen(false), []);

  /** 离校情况说明的三种说法（批次 CN）：补表销记录 / 下不为例照收 / 狡辩核为不实——最近一次说明落档 */
  const ackAbscond = useCallback((response: "settle" | "promise" | "claim") => {
    settleAbscond(response);
    if (response === "settle") setAbscondCount(0);
  }, []);
  const closeAbscond = useCallback(() => setAbscondOpen(false), []);

  /** 存档损坏说明：知道了就收起——本学期从空白页开始 */
  const closeCorruptNotice = useCallback(() => setCorruptNoticeOpen(false), []);

  /** 册子新页·签收：翻册子 = 签收 + 跳图鉴；先收起来 = 只签收，不弹第二次 */
  const openBookFromMemo = useCallback(() => {
    if (newMemo) saveSettings({ lastSeenMemoStamp: newMemo.stamp });
    setNewMemo(null);
    navigate("/endings");
  }, [newMemo, navigate]);
  const deferNewMemo = useCallback(() => {
    if (newMemo) saveSettings({ lastSeenMemoStamp: newMemo.stamp });
    setNewMemo(null);
  }, [newMemo]);

  /** 学籍信息补全（批次 CO）：填了就全系统带名；留空归档也算办过（不再弹） */
  const confirmEnrollFix = useCallback((name: string) => {
    if (name.trim().length > 0) setRenamed(true);
    setEnrollFixOpen(false);
  }, []);
  const closeEnrollFix = useCallback(() => setEnrollFixOpen(false), []);

  const goToMap = useCallback(() => navigate("/map"), [navigate]);

  const goToEndings = useCallback(() => navigate("/endings"), [navigate]);

  const openCredits = useCallback(() => setCreditsOpen(true), []);
  const closeCredits = useCallback(() => setCreditsOpen(false), []);

  const openSaveLoad = useCallback(() => setSaveLoadOpen(true), []);
  const closeSaveLoad = useCallback(() => setSaveLoadOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings(saveSettings(patch));
  }, []);

  const toggleSound = useCallback(() => setSoundOnState(setSoundOn(!isSoundOn())), []);

  return {
    activeTheme,
    switchTheme,
    hasSave,
    playthrough,
    absentLabel,
    recorderLine,
    startNewGame,
    startWithSeed,
    seedInput,
    onSeedInput: setSeedInput,
    confirmNewGame,
    cancelNewGame,
    freshConfirmOpen,
    continueGame,
    /* 不告而别（批次 CN）：直接关掉页面也算一次离校——攒到三次，开学弹说明 */
    abscondCount,
    abscondOpen,
    ackAbscond,
    closeAbscond,
    /* 姓名（批次 CO）：学籍信息不全——有名字的才好被处理 */
    enrollFixOpen,
    renamed,
    confirmEnrollFix,
    closeEnrollFix,
    /* 存档损坏提示（优化批次） */
    corruptNoticeOpen,
    closeCorruptNotice,
    /* 册子添了新页（批次 CY-47） */
    newMemo,
    newMemoPrev,
    newMemoSealedCount,
    openBookFromMemo,
    deferNewMemo,
    goToMap,
    goToEndings,
    endingsBadge,
    creditsOpen,
    openCredits,
    closeCredits,
    /* 系统层 */
    autoSlotLabel,
    canContinue: autoSlotLabel.length > 0,
    saveLoadOpen,
    openSaveLoad,
    closeSaveLoad,
    settingsOpen,
    openSettings,
    closeSettings,
    settings,
    updateSettings,
    soundOn,
    toggleSound,
    cast: FROG_CAST,
    storylines: STORYLINES,
  };
}
