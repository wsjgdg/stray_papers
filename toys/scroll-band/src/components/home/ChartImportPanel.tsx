import { useMemo, useRef, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";
import {
  CHART_PRESETS,
  CHART_SHELF_MAX,
  clearCharts,
  deleteChart,
  isMidiChart,
  listCharts,
  parseChartText,
  saveChart,
  type StoredChart,
} from "@/lib/audio/chartImport";
import {
  buildMedley,
  parseMidiFile,
  scanMidiOob,
  seqToChartText,
  type OobMode,
} from "@/lib/audio/midiImport";
import { midiNoteName } from "@/lib/audio/pianoMap";
import { usePanelEntrance } from "./usePanelMotion";

// 自定义谱导入浮层：粘贴一拍一音的文本谱 → 本地解析校验 → 编译成追加关卡并直接开玩；
// 也可以直接挑 / 拖入 .mid 文件（只支持 Format 0/1 + PPQ，本地解析取旋律拍轴）——
// 有超音域音先弹「移调 / 删减 / 贴边」预览再处理；文本谱可复制 / 导出 .txt；
// 本地谱架分「♪ MIDI 谱 / 文本谱」两个标签页，各自独立列表、独立清空、各存 ≤8 份
export function ChartImportPanel(p: ReturnType<typeof useHome>) {
  const [charts, setCharts] = useState(() => listCharts());
  const [text, setText] = useState(charts[0]?.text ?? "");
  const [chartName, setChartName] = useState(charts[0]?.name ?? "");
  const [bpmStr, setBpmStr] = useState(charts[0] ? String(charts[0].bpm) : "100");
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  // 清空是两步确认（防误删），记录在哪个标签页武装着
  const [clearArmed, setClearArmed] = useState<"midi" | "text" | "">("");
  // 谱架标签页：♪ MIDI 谱 / 文本谱（有 MIDI 谱默认开 MIDI 页）
  const [tab, setTab] = useState<"midi" | "text">(() =>
    charts.some((c) => isMidiChart(c)) ? "midi" : "text",
  );
  // 串烧选曲模式：开启后点 ♪ 谱 chip 切换「进不进这串」，勾够 2 份才允许开打
  const [medMode, setMedMode] = useState(false);
  const [medSel, setMedSel] = useState<Set<string>>(new Set());
  // 串烧统一调性开关：以第一首为基准把各首整体移调对齐
  const [medUnify, setMedUnify] = useState(false);
  // .mid 域外音预览：解析统计后等待用户选处理策略，选完才开玩/进谱架
  const [pendingOob, setPendingOob] = useState<{
    entries: { buf: ArrayBuffer; fname: string }[];
    count: number;
    lo: number;
    hi: number;
    bads: string[];
  } | null>(null);
  // 重名选择：解析完成后若谱架里已有同名，弹「覆盖 / 各留一份」再落地
  const [pendingName, setPendingName] = useState<{
    items: { name: string; bpm: number; seq: [number, number][]; skipped: number }[];
    base: string[];
    bads: string[];
    collided: string[];
  } | null>(null);
  // 带精确拍轴的 MIDI 谱（≥2 份才值得出现「串烧」）
  const midiCharts = charts.filter((c) => isMidiChart(c));
  const textCharts = charts.filter((c) => !isMidiChart(c));
  // 音数统计（排序与 chip 标签共用）：♪ 谱直接数拍轴，文本谱现算
  const noteCount = (c: StoredChart) =>
    isMidiChart(c) ? c.seq?.length ?? 0 : parseChartText(c.text).seq.length;
  // 时长估算（悬停提示与开串预告共用）：末拍位置 ÷ 速度
  const fmtDur = (sec: number): string => {
    const s = Math.max(1, Math.round(sec));
    return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
  };
  const seqDur = (seq: [number, number][], bpm: number): number => {
    let maxBeat = 0;
    for (const [b] of seq) if (b > maxBeat) maxBeat = b;
    return (maxBeat * 60) / Math.max(40, bpm);
  };
  const chartDur = (c: StoredChart) =>
    seqDur(isMidiChart(c) ? c.seq ?? [] : parseChartText(c.text).seq, c.bpm);
  const savedLabel = (t: number) => {
    if (t < 1e8) return "更早存的";
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 存`;
  };
  // 串烧选曲中：先算好这一串的总时长，开串前就能预告「约 X 分 Y 秒」
  const medPreview =
    medMode && medSel.size >= 2
      ? buildMedley(
          midiCharts
            .filter((c) => medSel.has(c.name))
            .map((c) => ({ bpm: c.bpm, seq: c.seq ?? [] })),
          { unifyKey: medUnify },
        )
      : null;
  const medDur = medPreview ? seqDur(medPreview.seq, medPreview.bpm) : 0;
  // 谱架排序：最新在前 → 音多在前 → 音少在前 循环，选择记在本地
  const [sortMode, setSortMode] = useState<"new" | "many" | "few">(() => {
    try {
      const v = window.localStorage.getItem("so-charts-sort-v1");
      return v === "many" || v === "few" ? v : "new";
    } catch {
      return "new";
    }
  });
  const cycleSort = () =>
    setSortMode((s) => {
      const next = s === "new" ? "many" : s === "many" ? "few" : "new";
      try {
        window.localStorage.setItem("so-charts-sort-v1", next);
      } catch {
        /* 写失败 = 本会话内不持久 */
      }
      return next;
    });
  const SORT_LABEL = { new: "最新在前", many: "音多在前", few: "音少在前" } as const;
  // 谱架搜索：按谱名子串过滤；当前类没命中时提示另一边还有几份
  const [shelfQ, setShelfQ] = useState("");
  const qKey = shelfQ.trim().toLowerCase();
  const hitName = (c: StoredChart) => c.name.toLowerCase().includes(qKey);
  const shownCharts: StoredChart[] = (() => {
    const base = (tab === "midi" ? midiCharts : textCharts).filter((c) => !qKey || hitName(c));
    if (sortMode === "new") return base;
    return [...base].sort((a, z) =>
      sortMode === "many" ? noteCount(z) - noteCount(a) : noteCount(a) - noteCount(z),
    );
  })();
  const otherHits = qKey
    ? (tab === "midi" ? textCharts : midiCharts).filter(hitName).length
    : 0;
  const toggleMed = (name: string) =>
    setMedSel((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  const rootRef = usePanelEntrance<HTMLDivElement>();
  const fileRef = useRef<HTMLInputElement>(null);

  // 文本谱 / MIDI 草稿 → 剪贴板（分享、备份）
  const copyToClipboard = async (src: string, label: string) => {
    try {
      await navigator.clipboard.writeText(src);
      setWarn(`已复制${label}，可直接粘贴分享`);
      setError("");
    } catch {
      setError("复制失败——浏览器不允许访问剪贴板，可全选文本框内容手动复制");
    }
  };

  // 导出 .txt：编辑框内容补齐曲名/BPM 头行后落盘
  const exportTxt = () => {
    if (!text.trim()) {
      setError("文本框是空的，没什么可导出");
      return;
    }
    const hasName = /^\s*(?:曲名|曲|name|title)\s*:/im.test(text);
    const hasBpm = /^\s*(?:bpm|速度)\s*:\s*\d+/im.test(text);
    const body =
      (!hasName ? `曲名: ${chartName.trim() || "我的练习曲"}\n` : "") +
      (!hasBpm ? `BPM: ${bpmStr || "100"}\n` : "") +
      text;
    const safe = (chartName.trim() || "我的练习曲").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 24);
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safe}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    setWarn(`已导出 ${safe}.txt`);
  };

  // 用户选好域外策略（或本就没有域外音）后真正落地导入：
  // 逐份解析，成功的都自动存进谱架（带精确拍轴），第一份当场开玩；解析不了的跳过并报数
  // 落地存盘 + 开玩第一份；coll 非空 = 这批刚解决过重名（覆盖或另存新名）
  const commitMidi = (
    items: { name: string; bpm: number; seq: [number, number][]; skipped: number }[],
    baseNotes: string[],
    bads: string[],
    coll?: { collided: string[]; resolve: "over" | "new" },
  ) => {
    setPendingName(null);
    const rack = new Set(listCharts().filter((c) => isMidiChart(c)).map((c) => c.name));
    let unstored = 0;
    let skipped = 0;
    const renamed: string[] = [];
    const saved = items.map((it) => {
      skipped += it.skipped;
      let nm = it.name;
      // 另存新名：《X》满了就顺延《X·2》《X·3》，谁的谱都不顶掉
      if (coll?.resolve === "new" && rack.has(nm)) {
        let k = 2;
        while (rack.has(`${it.name}·${k}`)) k += 1;
        nm = `${it.name}·${k}`.slice(0, 24);
        renamed.push(nm);
      }
      rack.add(nm);
      if (!saveChart(nm, it.bpm, seqToChartText(nm, it.bpm, it.seq), it.seq)) unstored += 1;
      return { ...it, name: nm };
    });
    setCharts(listCharts());
    const first = saved[0];
    const notes: string[] = [`已导入 ${saved.length} 份进谱架，先开玩《${first.name}》`, ...baseNotes];
    if (saved.length > 1) notes.push("谱架里点 ♪ 开头的可换着玩");
    if (coll)
      notes.push(
        coll.resolve === "over"
          ? `同名覆写了谱架里 ${coll.collided.length} 份老谱`
          : `${coll.collided.length} 份同名各留一份：${renamed.map((n) => `《${n}》`).join("")}`,
      );
    if (unstored > 0) notes.push(`♪ MIDI 谱最多 ${CHART_SHELF_MAX} 份，有 ${unstored} 份没存上（本局仍可玩）`);
    if (bads.length > 0) notes.push(`${bads.length} 份没认出来：${bads[0]}`);
    setWarn(notes.join("；"));
    setError("");
    p.onStartCustomChart(first.name, first.bpm, first.seq);
  };

  // 用户选好域外策略（或本就没有域外音）后真正落地导入：
  // 逐份解析，撞见谱架重名先问一句「覆盖还是各留一份」，没撞名直接存盘开玩
  const finishMidiImport = (
    entries: { buf: ArrayBuffer; fname: string }[],
    mode: OobMode,
    oobCount: number,
    badNotes: string[],
  ) => {
    setPendingOob(null);
    const good: { name: string; bpm: number; seq: [number, number][]; skipped: number }[] = [];
    const bads = [...badNotes];
    for (const e of entries) {
      const parsed = parseMidiFile(e.buf, e.fname, mode);
      if (parsed.error) {
        bads.push(parsed.error);
        continue;
      }
      const nm = parsed.name.trim().slice(0, 20) || "导入谱";
      good.push({ name: nm, bpm: parsed.bpm, seq: parsed.seq, skipped: parsed.skipped });
    }
    if (good.length === 0) {
      setError(bads[0] ?? "这些 MIDI 都没能认出来");
      setWarn("");
      return;
    }
    const base: string[] = [];
    if (oobCount > 0)
      base.push(
        mode === "transpose"
          ? `${oobCount} 个超音域音已整曲移调进键盘范围`
          : mode === "clamp"
            ? `${oobCount} 个超音域音已就近贴到键盘边缘`
            : `${oobCount} 个超音域音已删减`,
      );
    const dupSkipped = good.reduce((a, r) => a + r.skipped, 0);
    if (dupSkipped > 0) base.push(`另有 ${dupSkipped} 个同拍重复或过密的音被合并`);
    const midiNames = new Set(listCharts().filter((c) => isMidiChart(c)).map((c) => c.name));
    const collided = [...new Set(good.map((r) => r.name).filter((n) => midiNames.has(n)))];
    if (collided.length > 0) {
      setPendingName({ items: good, base, bads, collided });
      return;
    }
    commitMidi(good, base, bads);
  };

  // .txt 拖入 = 直接载入编辑框（配合「导出 .txt」形成分享→续写闭环），不自动开玩
  const loadTxtFile = async (f: File) => {
    const body = (await f.text()).slice(0, 40000);
    setText(body);
    const nm = body.match(/^\s*(?:曲名|曲|name|title)\s*:\s*(.+)$/im);
    const bm = body.match(/^\s*(?:bpm|速度)\s*:\s*(\d{1,3})/im);
    setChartName(nm ? nm[1].trim().slice(0, 20) : f.name.replace(/\.[^.]+$/, "").slice(0, 20));
    if (bm) setBpmStr(bm[1]);
    setError("");
    setWarn(`已载入《${f.name}》到编辑框——可继续修改，再点「编译并开玩」`);
  };

  // 拖入/选择文件入口：.txt 载入编辑框；.mid 本地解析（不上传）拿域外统计，
  // 有域外音先弹预览让用户选策略，选完才开玩 / 进谱架
  // 谱架整架备份：全部乐谱存成一个 .json（♪ 谱带精确拍轴），换设备拖回来原样复活
  const exportShelf = () => {
    const all = listCharts();
    if (all.length === 0) {
      setError("谱架还是空的，先存一份谱再备份");
      return;
    }
    const blob = new Blob([JSON.stringify({ schema: 1, charts: all }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "谱架备份.json";
    a.click();
    URL.revokeObjectURL(a.href);
    const midi = all.filter(isMidiChart).length;
    setWarn(`已备份 ♪ 谱 ${midi} 份 + 文本谱 ${all.length - midi} 份`);
    setError("");
  };

  // 还原备份：逐条校验后存回谱架（同类型满员/坏条目跳过并报数），同名按覆写处理
  const restoreBackup = async (body: string) => {
    let items: unknown;
    try {
      const d = JSON.parse(body) as unknown;
      items = Array.isArray(d) ? d : (d as { charts?: unknown }).charts;
    } catch {
      setError("这份备份读不开——只认导出的「谱架备份.json」");
      return;
    }
    if (!Array.isArray(items)) {
      setError("这份备份里没有乐谱");
      return;
    }
    let restored = 0;
    let dropped = 0;
    let backMidi = 0;
    let backText = 0;
    for (const rawItem of items) {
      const it = rawItem as Partial<StoredChart>;
      const nm = typeof it?.name === "string" ? it.name.trim().slice(0, 20) : "";
      const txt = typeof it?.text === "string" ? it.text : "";
      const seq = Array.isArray(it?.seq)
        ? (it.seq.filter(
            (s) => Array.isArray(s) && typeof s[0] === "number" && typeof s[1] === "number",
          ) as [number, number][])
        : undefined;
      if (!nm || (!txt && (!seq || seq.length === 0))) {
        dropped += 1;
        continue;
      }
      const bpm = Math.min(240, Math.max(40, Math.round(Number(it?.bpm) || 100)));
      if (saveChart(nm, bpm, txt || seqToChartText(nm, bpm, seq ?? []), seq)) {
        restored += 1;
        // 记下各还原了多少，末尾把标签页停在还原较多的那一类
        if (seq && seq.length > 0) backMidi += 1;
        else backText += 1;
      } else dropped += 1;
    }
    setCharts(listCharts());
    if (restored > 0) setTab(backText > backMidi ? "text" : "midi");
    if (restored === 0) {
      setError(dropped > 0 ? "备份里的谱都没能还原——可能谱架已满或内容损坏" : "这份备份里没有可还原的谱");
      setWarn("");
      return;
    }
    setWarn(
      `已还原 ${restored} 份${dropped > 0 ? `；${dropped} 份没进（同类最多 ${CHART_SHELF_MAX} 份，可先删旧的再还原）` : ""}`,
    );
    setError("");
  };

  const importMidi = async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => /\.(mid|midi|txt|json)$/i.test(f.name));
    if (files.length === 0) {
      setError("只认 .mid / .midi / .txt / .json（谱架备份）文件");
      setWarn("");
      return;
    }
    const jsons = files.filter((f) => /\.json$/i.test(f.name));
    if (jsons.length > 0) await restoreBackup(await jsons[0].text());
    const txts = files.filter((f) => /\.txt$/i.test(f.name));
    const mids = files.filter((f) => /\.(mid|midi)$/i.test(f.name));
    if (txts.length > 0) await loadTxtFile(txts[0]);
    if (mids.length === 0) return;
    const entries: { buf: ArrayBuffer; fname: string }[] = [];
    const bads: string[] = [];
    let oobCount = 0;
    let lo = 127;
    let hi = 0;
    for (const f of mids) {
      if (f.size > 4 * 1024 * 1024) {
        bads.push(`「${f.name}」太大`);
        continue;
      }
      const fname = f.name.replace(/\.[^.]+$/, "");
      const buf = await f.arrayBuffer();
      const scan = scanMidiOob(buf, fname);
      if (scan.error) {
        bads.push(scan.error);
        continue;
      }
      entries.push({ buf, fname });
      oobCount += scan.oobCount;
      if (scan.lo < lo) lo = scan.lo;
      if (scan.hi > hi) hi = scan.hi;
    }
    if (entries.length === 0) {
      setError(bads[0] ?? "这些 MIDI 都没能认出来");
      setWarn("");
      return;
    }
    if (oobCount > 0) {
      // 先预览后处理：选完策略（一次选择应用到全部份）才开玩 / 进谱架
      setPendingOob({ entries, count: oobCount, lo, hi, bads });
      setError("");
      setWarn("");
      return;
    }
    void finishMidiImport(entries, "drop", 0, bads);
  };

  const submit = () => {
    const parsed = parseChartText(text);
    if (parsed.error) {
      setError(parsed.error);
      setWarn("");
      return;
    }
    // 表单字段优先于谱内头行
    const bpmNum = Math.min(240, Math.max(40, Math.round(Number(bpmStr) || parsed.bpm)));
    const finalName = chartName.trim() || parsed.name || "草稿";
    const notes: string[] = [];
    if (parsed.skipped > 0) {
      notes.push(`有 ${parsed.skipped} 个音超出可弹音域（C3–D6 白键及黑键），已自动跳过`);
    }
    const stored = saveChart(finalName, bpmNum, text);
    if (stored) setCharts(listCharts());
    else notes.push(`文本谱最多 ${CHART_SHELF_MAX} 份，本谱未留存——可先删一份再存`);
    setWarn(notes.join("；"));
    setError("");
    p.onStartCustomChart(finalName, bpmNum, parsed.seq);
  };

  // 实时解析：编辑框内容一变就重算，编辑时就看见音数/拍长/双音/越界跳过，不用点开玩才发现写错
  const live = useMemo(() => (text.trim() ? parseChartText(text) : null), [text]);
  const liveStats = useMemo(() => {
    if (!live || live.error || live.seq.length === 0) return null;
    let maxBeat = 0;
    let dual = 0;
    live.seq.forEach(([b], i) => {
      if (b > maxBeat) maxBeat = b;
      if (i > 0 && b === live.seq[i - 1][0]) dual += 1;
    });
    return { notes: live.seq.length, beats: Math.ceil(maxBeat) + 1, dual };
  }, [live]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={p.onCloseChartEditor}
    >
      <div
        data-panel-card
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto border border-border bg-card p-6 text-card-foreground shadow-md"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) void importMidi(e.dataTransfer.files);
        }}
      >
        <h2 className="font-mono text-2xl font-bold">导入谱面</h2>
        <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
          一拍一个音名，空格 / 换行 = 进一拍，<span className="text-primary">.</span> 休止一拍，
          <span className="text-primary">+E5</span> 与前一个音同拍（双音）；音名 = 字母 + #/b +
          八度（省略八度沿用上一个），可弹范围 C3–D6。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          spellCheck={false}
          aria-label="文本谱面内容"
          placeholder={"曲名: 我的练习曲\nBPM: 100\nC4 D4 E4 G4"}
          className="mt-3 w-full resize-none border border-border bg-background p-2 font-mono text-xs text-foreground focus-visible:shadow-[var(--focus-ring)]"
        />
        {live && (
          <div className="mt-1.5 font-mono text-xs" aria-live="polite">
            {live.error ? (
              <span className="text-muted-foreground">
                还没解析到有效音符——正文按一拍一个音名排开（如 <span className="text-primary">C4 D4 . E5</span>）
              </span>
            ) : (
              liveStats && (
                <span className="text-muted-foreground">
                  实时解析：<span className="text-primary">{liveStats.notes}</span> 音 · 约{" "}
                  {liveStats.beats} 拍{liveStats.dual > 0 ? ` · ${liveStats.dual} 个双音` : ""}
                  {live.skipped > 0 ? (
                    <>
                      {' '}
                      · <span className="text-primary">{live.skipped}</span> 个越界音会被跳过
                    </>
                  ) : (
                    ""
                  )}
                </span>
              )
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
          <label className="flex items-center gap-1 text-muted-foreground">
            曲名
            <input
              value={chartName}
              onChange={(e) => setChartName(e.target.value)}
              maxLength={20}
              aria-label="自定义谱曲名"
              placeholder="留空用谱内曲名行"
              className="w-28 border border-border bg-background px-1.5 py-0.5 text-foreground focus-visible:shadow-[var(--focus-ring)]"
            />
          </label>
          <label className="flex items-center gap-1 text-muted-foreground">
            BPM
            <input
              value={bpmStr}
              onChange={(e) => setBpmStr(e.target.value)}
              inputMode="numeric"
              aria-label="每分钟拍数"
              className="w-14 border border-border bg-background px-1.5 py-0.5 text-foreground focus-visible:shadow-[var(--focus-ring)]"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border border-dashed border-border px-3 py-2 font-mono text-xs">
          <span className="text-muted-foreground">
            有现成的 <span className="text-primary">.mid</span> 文件？点这里或直接拖进面板（可一次多份，导入即存谱架）；拖入 <span className="text-primary">.txt</span> 文本谱会直接载入编辑框续写——
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border border-primary px-2 py-0.5 text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
          >
            选 .mid 开玩
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".mid,.midi,.txt,.json"
            multiple
            className="hidden"
            aria-label="选择 MIDI / 文本谱 / 谱架备份文件（可多选）"
            onChange={(e) => {
              if (e.target.files?.length) void importMidi(e.target.files);
              e.target.value = "";
            }}
          />
          {charts.length === 0 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="从备份文件还原整个谱架"
              className="border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              ⬆ 从备份还原
            </button>
          )}
          <p className="w-full text-muted-foreground">
            支持范围：标准 MIDI Format 0 / 1 + PPQ 分辨率；不支持 SMPTE 时间码。有超音域音会先问你怎么处理。拖入「谱架备份.json」可整架还原。
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-xs" aria-label="内置模板">
          <span className="text-muted-foreground">模板：</span>
          {CHART_PRESETS.map((pt) => (
            <button
              key={pt.label}
              type="button"
              onClick={() => {
                setText(pt.text);
                setError("");
                setWarn("");
              }}
              className="border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              {pt.label}
            </button>
          ))}
        </div>
        {pendingOob && (
          <div
            role="alert"
            className="mt-2 border border-primary/60 px-3 py-2 font-mono text-xs"
            aria-label="超音域音处理选择"
          >
            <p className="text-muted-foreground">
              检测到 <span className="text-primary">{pendingOob.count}</span> 个音超出琴键范围（最低{" "}
              {midiNoteName(pendingOob.lo)} ~ 最高 {midiNoteName(pendingOob.hi)}），怎么处理？（
              {pendingOob.entries.length} 份共用这一次选择，选完才开玩）
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void finishMidiImport(pendingOob.entries, "transpose", pendingOob.count, pendingOob.bads)}
                className="border border-primary bg-primary px-2 py-0.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
              >
                移调整体入域
              </button>
              <button
                type="button"
                onClick={() => void finishMidiImport(pendingOob.entries, "drop", pendingOob.count, pendingOob.bads)}
                className="border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                删减域外音
              </button>
              <button
                type="button"
                onClick={() => void finishMidiImport(pendingOob.entries, "clamp", pendingOob.count, pendingOob.bads)}
                className="border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                保留贴边
              </button>
              <button
                type="button"
                onClick={() => setPendingOob(null)}
                className="px-1.5 py-0.5 text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                取消
              </button>
            </div>
          </div>
        )}
        {pendingName && (
          <div
            role="alert"
            className="mt-2 border border-primary/60 px-3 py-2 font-mono text-xs"
            aria-label="谱架重名处理选择"
          >
            <p className="text-muted-foreground">
              谱架里已有 <span className="text-primary">{pendingName.collided.length}</span> 份同名：
              {pendingName.collided.map((n) => `《${n}》`).join("")}——覆盖老谱，还是各留一份？
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  commitMidi(pendingName.items, pendingName.base, pendingName.bads, {
                    collided: pendingName.collided,
                    resolve: "over",
                  })
                }
                className="border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                覆盖老谱
              </button>
              <button
                type="button"
                onClick={() =>
                  commitMidi(pendingName.items, pendingName.base, pendingName.bads, {
                    collided: pendingName.collided,
                    resolve: "new",
                  })
                }
                className="border border-primary bg-primary px-2 py-0.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
              >
                各留一份（自动改名）
              </button>
              <button
                type="button"
                onClick={() => setPendingName(null)}
                className="px-1.5 py-0.5 text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                取消（不导入）
              </button>
            </div>
          </div>
        )}
        {charts.length > 0 && (
          <div className="mt-2 font-mono text-xs">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="谱架分类">
              {(
                [
                  { key: "midi" as const, label: `♪ MIDI 谱 ${midiCharts.length}` },
                  { key: "text" as const, label: `文本谱 ${textCharts.length}` },
                ]
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => {
                    setTab(t.key);
                    setClearArmed("");
                  }}
                  className={`border-b-2 px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                    tab === t.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-card-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                onClick={cycleSort}
                aria-label={`切换谱架排序，当前${SORT_LABEL[sortMode]}`}
                className="ml-auto border border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                ↕ {SORT_LABEL[sortMode]}
              </button>
              <button
                type="button"
                onClick={exportShelf}
                aria-label="把整个谱架备份成一个文件"
                className="border border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                ⬇ 备份
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="从备份文件还原整个谱架"
                className="border border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                ⬆ 还原
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                value={shelfQ}
                onChange={(e) => setShelfQ(e.target.value)}
                maxLength={20}
                placeholder="搜谱名…"
                aria-label="搜索谱架里的谱名"
                className="min-w-0 flex-1 border border-border bg-background px-1.5 py-0.5 text-muted-foreground placeholder:text-muted-foreground/70 focus-visible:shadow-[var(--focus-ring)]"
              />
              {shelfQ && (
                <button
                  type="button"
                  onClick={() => setShelfQ("")}
                  aria-label="清空搜索"
                  className="px-1.5 py-0.5 text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label="我的谱架">
              {shownCharts.length === 0 && (
                <span className="text-muted-foreground">
                  {qKey
                    ? `这一类没有名字带「${shelfQ.trim()}」的谱${otherHits > 0 ? `；另一边还有 ${otherHits} 份，切个标签页看看` : ""}`
                    : "这一类还没有谱。"}
                </span>
              )}
              {shownCharts.map((c) => {
                const isSeq = isMidiChart(c);
                const picked = medMode && isSeq && medSel.has(c.name);
                return (
                <span key={c.name} className={`inline-flex items-center border ${picked ? "border-primary" : "border-border"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      // 选曲模式里点 ♪ 谱 = 勾选进不进这串
                      if (medMode) {
                        if (isSeq) toggleMed(c.name);
                        return;
                      }
                      // MIDI 导入的谱带精确拍轴：点一下直接按原谱开玩；文本谱仍是载入可编辑
                      if (isSeq) {
                        p.onStartCustomChart(c.name, c.bpm, c.seq!);
                        return;
                      }
                      setText(c.text);
                      setChartName(c.name);
                      setBpmStr(String(c.bpm));
                      setError("");
                      setWarn("");
                    }}
                    aria-pressed={medMode && isSeq ? picked : undefined}
                    aria-label={
                      medMode && isSeq
                        ? picked
                          ? `把 ${c.name} 移出这串串烧`
                          : `把 ${c.name} 加进这串串烧`
                        : isSeq
                          ? `直接开玩 MIDI 谱面 ${c.name}，BPM ${c.bpm}`
                          : `载入谱面 ${c.name}，BPM ${c.bpm}`
                    }
                    title={`${fmtDur(chartDur(c))} · ${savedLabel(c.savedAt)}`}
                    className={`px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                      picked
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:border-primary/60 hover:text-primary"
                    }`}
                  >
                    {isSeq ? (picked ? "✓ " : "♪ ") : ""}
                    {c.name} · {c.bpm} · {noteCount(c)} 音
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void copyToClipboard(
                        isSeq ? seqToChartText(c.name, c.bpm, c.seq ?? []) : c.text,
                        `《${c.name}》的文本谱`,
                      )
                    }
                    aria-label={`复制 ${c.name} 的文本谱到剪贴板`}
                    className="border-l border-border px-1.5 py-0.5 text-muted-foreground hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const pubSeq = isSeq ? c.seq ?? [] : parseChartText(c.text).seq;
                      if (pubSeq.length === 0) {
                        setError(`《${c.name}》解析不出音符，发布不了`);
                        return;
                      }
                      p.onPublishCustomChart(c.name, c.bpm, pubSeq);
                    }}
                    aria-label={`把 ${c.name} 发布成全站自定义关卡`}
                    title="发布前会先弹出难度星级与曲名预览"
                    className="border-l border-border px-1.5 py-0.5 text-muted-foreground hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                  >
                    发布
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteChart(c.name, isSeq ? "midi" : "text");
                      setCharts(listCharts());
                      setMedSel((s) => {
                        const n = new Set(s);
                        n.delete(c.name);
                        return n;
                      });
                    }}
                    aria-label={`从谱架删除 ${c.name}`}
                    className="border-l border-border px-1.5 py-0.5 text-muted-foreground hover:text-destructive focus-visible:shadow-[var(--focus-ring)]"
                  >
                    ✕
                  </button>
                </span>
                );
              })}
              {tab === "midi" &&
                (medMode ? (
                  <>
                    <button
                      type="button"
                      disabled={medSel.size < 2}
                      onClick={() => {
                        const med = buildMedley(
                          midiCharts
                            .filter((c) => medSel.has(c.name))
                            .map((c) => ({ bpm: c.bpm, seq: c.seq ?? [] })),
                          { unifyKey: medUnify },
                        );
                        if (med) {
                          p.onStartCustomChart(
                            `串烧 · ${med.pieces} 首${medUnify && med.retuned > 0 ? " · 同调" : ""}`,
                            med.bpm,
                            med.seq,
                          );
                        }
                      }}
                      aria-label={`开串这 ${medSel.size} 首串烧${medUnify ? "（统一调性）" : ""}${medPreview ? `，约 ${fmtDur(medDur)}` : ""}`}
                      className="border border-primary bg-primary px-2 py-0.5 text-primary-foreground hover:bg-primary/90 disabled:border-border disabled:bg-transparent disabled:text-muted-foreground focus-visible:shadow-[var(--focus-ring)]"
                    >
                      ▶ 开串 {medSel.size} 首{medUnify ? " · 同调" : ""}
                      {medPreview ? ` · 约 ${fmtDur(medDur)}` : ""}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMedUnify((v) => !v)}
                      aria-pressed={medUnify}
                      aria-label="串烧时自动移调统一各首的调性"
                      className={`px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                        medUnify
                          ? "border border-primary bg-primary/10 text-primary"
                          : "border border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
                      }`}
                    >
                      统一调性 {medUnify ? "开" : "关"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMedMode(false);
                        setMedSel(new Set());
                      }}
                      aria-label="退出串烧选曲"
                      className="px-1.5 py-0.5 text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
                    >
                      退出选曲
                    </button>
                    <span className="text-muted-foreground">点 ♪ 谱勾选进这串（已勾 {medSel.size}）</span>
                  </>
                ) : (
                  midiCharts.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMedMode(true);
                        setMedSel(new Set(midiCharts.map((c) => c.name)));
                      }}
                      aria-label={`挑选 MIDI 谱串成一串连续开玩（默认全选 ${midiCharts.length} 首）`}
                      className="border border-primary px-2 py-0.5 text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
                    >
                      ▶ 串烧 {midiCharts.length} 首
                    </button>
                  )
                ))}
              {shownCharts.length > 0 &&
                (!clearArmed || clearArmed !== tab ? (
                  <button
                    type="button"
                    onClick={() => setClearArmed(tab)}
                    aria-label={`清空${tab === "midi" ? "♪ MIDI 谱" : "文本谱"}（需要再确认一次）`}
                    className="px-1.5 py-0.5 text-muted-foreground hover:text-destructive focus-visible:shadow-[var(--focus-ring)]"
                  >
                    清空
                  </button>
                ) : (
                  <span className="inline-flex items-center border border-destructive/60">
                    <button
                      type="button"
                      onClick={() => {
                        clearCharts(tab);
                        setCharts(listCharts());
                        setMedSel(new Set());
                        setClearArmed("");
                      }}
                      aria-label={`确认清空${tab === "midi" ? "♪ MIDI 谱" : "文本谱"}`}
                      className="px-2 py-0.5 text-destructive hover:bg-destructive/10 focus-visible:shadow-[var(--focus-ring)]"
                    >
                      确认清空
                    </button>
                    <button
                      type="button"
                      onClick={() => setClearArmed("")}
                      aria-label="取消清空"
                      className="border-l border-border px-1.5 py-0.5 text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
                    >
                      取消
                    </button>
                  </span>
                ))}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 font-mono text-xs text-destructive">
            {error}
          </p>
        )}
        {warn && <p className="mt-2 font-mono text-xs text-muted-foreground">{warn}</p>}
        <div className="mt-4 flex items-center gap-2 font-mono text-xs">
          <button
            type="button"
            onClick={submit}
            className="border border-primary bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
          >
            编译并开玩
          </button>
          <button
            type="button"
            onClick={() => void copyToClipboard(text, "文本谱")}
            className="border border-border px-3 py-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            复制文本谱
          </button>
          <button
            type="button"
            onClick={exportTxt}
            className="border border-border px-3 py-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            导出 .txt
          </button>
          <button
            type="button"
            onClick={p.onCloseChartEditor}
            className="border border-border px-3 py-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            关闭
          </button>
          <span className="text-muted-foreground">导入即玩 · 不计解锁与天梯</span>
        </div>
      </div>
    </div>
  );
}
