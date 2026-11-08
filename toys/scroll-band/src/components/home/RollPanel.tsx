import { useEffect, useRef, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";
import type { RollNote } from "@/lib/canvas/scoreCanvas";

// 钢琴卷帘：横轴时间、纵轴音高，音符是可拖拽方块。
// 点方块选中（Shift 加选）、空白拖=框选、选中整组批量拖（贴边时保持相对间距）；
// 右键菜单：删除 / 复制 / 量化（半拍、整拍）/ 变调（音阶±1级、八度±）；
// 底部力度条逐音竖直拖调力度；滚轮=纵向缩放音高区、Shift+滚轮=横向缩放时间、
// Ctrl+滚轮两轴同缩、拖顶部时间标尺/左侧音高标尺平移。
// 所有手势只在松手时提交一次；打开时整段编辑已入栈一步历史（Ctrl+Z 整段反悔）。

interface View {
  t0: number;
  t1: number;
  dLo: number;
  dHi: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function RollPanel(p: ReturnType<typeof useHome>) {
  const t = p.rollTarget;
  const loopBeats = t?.loopBeats ?? 4;
  const degs = t?.degs ?? 19;
  const octaveDegs = t?.octaveDegs ?? 5;

  const cardRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const rulerXRef = useRef<HTMLDivElement>(null);
  const rulerYRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<RollNote[]>([]);
  const [sel, setSel] = useState<Set<number>>(() => new Set());
  const [view, setView] = useState<View>({ t0: 0, t1: 4, dLo: 0, dHi: 19 });
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // pointerup 提交时 setDraft 尚未 flush，用 ref 拿最新草稿/选择/视口/尺寸
  const latestRef = useRef(draft);
  latestRef.current = draft;
  const selRef = useRef(sel);
  selRef.current = sel;
  const viewRef = useRef(view);
  viewRef.current = view;
  const dimsRef = useRef({ loopBeats, degs, octaveDegs });
  dimsRef.current = { loopBeats, degs, octaveDegs };

  const noteDragRef = useRef<{
    start: Map<number, { beat: number; deg: number }>;
    startBeat: number;
    startUnit: number;
    moved: boolean;
  } | null>(null);
  const marqRef = useRef<{
    fx0: number;
    fy0: number;
    fx1: number;
    fy1: number;
    cx0: number;
    cy0: number;
    moved: boolean;
    base: Set<number>;
  } | null>(null);
  const velRef = useRef<{ i: number; moved: boolean } | null>(null);
  const panRef = useRef<{ axis: "x" | "y"; px: number; py: number; t0: number; dLo: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 目标切换 → 重置草稿/选择/视口；同一目标提交回写 → 只重新对齐草稿、保留选择
  const prevIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = t?.id ?? null;
    const notes = t ? t.notes.map((n) => ({ ...n })) : [];
    setDraft(notes);
    if (prevIdRef.current !== id) {
      prevIdRef.current = id;
      setSel(new Set());
      setMenu(null);
      setMarquee(null);
      if (t) setView({ t0: 0, t1: t.loopBeats, dLo: 0, dHi: t.degs });
    } else {
      setSel((prev) => {
        const next = new Set<number>();
        prev.forEach((i) => {
          if (i < notes.length) next.add(i);
        });
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, t?.notes]);

  // 右键菜单开着时：点菜单外任意处 / Esc 关掉
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // 滚轮缩放：React 的 onWheel 是被动监听，preventDefault 必须原生注册
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const fx = clamp((e.clientX - r.left) / r.width, 0, 1);
      const fy = clamp((e.clientY - r.top) / r.height, 0, 1);
      const both = e.ctrlKey || e.metaKey;
      const horiz = e.shiftKey;
      const f = e.deltaY > 0 ? 1.18 : 0.85;
      setView((v) => {
        const lb = dimsRef.current.loopBeats;
        const dg = dimsRef.current.degs;
        let { t0, t1, dLo, dHi } = v;
        if (horiz || both) {
          const s = t1 - t0;
          const ns = clamp(s * f, 1, lb);
          const ta = t0 + fx * s;
          t0 = clamp(ta - fx * ns, 0, lb - ns);
          t1 = t0 + ns;
        }
        if (!horiz || both) {
          const s = dHi - dLo;
          const ns = clamp(s * f, 4, dg);
          const ua = dHi - fy * s;
          let hi = ua + fy * ns;
          let lo = hi - ns;
          if (lo < 0) {
            lo = 0;
            hi = ns;
          }
          if (hi > dg) {
            hi = dg;
            lo = dg - ns;
          }
          dLo = lo;
          dHi = hi;
        }
        return { t0, t1, dLo, dHi };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  if (!t) return null;

  const span = view.t1 - view.t0;
  const dSpan = view.dHi - view.dLo;

  const fracFrom = (e: { clientX: number; clientY: number }) => {
    const el = gridRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { fx: clamp((e.clientX - r.left) / r.width, 0, 1), fy: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };
  const posFromFrac = (fx: number, fy: number) => ({
    beatF: view.t0 + fx * span,
    unit: view.dHi - fy * dSpan, // 音高“度”：行 d 占 [d, d+1)
  });
  const snapBeat = (b: number) => clamp(Math.floor(b * 4) / 4, 0, loopBeats - 0.25);
  // 命中判定：方块占 [beat, beat+0.5) × [deg, deg+1)，允许少量边缘偏差
  const noteHit = (beatF: number, unit: number): number => {
    for (let i = draft.length - 1; i >= 0; i -= 1) {
      const n = draft[i];
      if (unit >= n.deg && unit < n.deg + 1 && beatF >= n.beat - 0.06 && beatF <= n.beat + 0.55) return i;
    }
    return -1;
  };

  // ---- 音符区手势：点选/加选、批量拖、框选、点空加音 ----
  const gridDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const f = fracFrom(e);
    if (!f) return;
    const { beatF, unit } = posFromFrac(f.fx, f.fy);
    const hit = noteHit(beatF, unit);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (hit >= 0) {
      let next = selRef.current;
      if (e.shiftKey) {
        next = new Set(next);
        if (next.has(hit)) next.delete(hit);
        else next.add(hit);
      } else if (!next.has(hit)) {
        next = new Set([hit]);
      }
      setSel(next);
      const start = new Map<number, { beat: number; deg: number }>();
      next.forEach((i) => {
        const n = draft[i];
        if (n) start.set(i, { beat: n.beat, deg: n.deg });
      });
      noteDragRef.current = { start, startBeat: beatF, startUnit: unit, moved: false };
      return;
    }
    // 空白：没拖动=点空加音；拖动=框选
    marqRef.current = {
      fx0: f.fx,
      fy0: f.fy,
      fx1: f.fx,
      fy1: f.fy,
      cx0: e.clientX,
      cy0: e.clientY,
      moved: false,
      base: e.shiftKey ? new Set(selRef.current) : new Set(),
    };
  };
  const gridMove = (e: React.PointerEvent) => {
    const nd = noteDragRef.current;
    if (nd) {
      const f = fracFrom(e);
      if (!f) return;
      const { beatF, unit } = posFromFrac(f.fx, f.fy);
      let dBeat = Math.round((beatF - nd.startBeat) * 4) / 4;
      let dDeg = Math.floor(unit - nd.startUnit);
      if (dBeat !== 0 || dDeg !== 0) nd.moved = true;
      // 整组贴边钳制：保持选中音符相对间距
      const ss = [...nd.start.values()];
      if (ss.length > 0) {
        const minB = Math.min(...ss.map((s) => s.beat));
        const maxB = Math.max(...ss.map((s) => s.beat));
        const minD = Math.min(...ss.map((s) => s.deg));
        const maxD = Math.max(...ss.map((s) => s.deg));
        dBeat = clamp(dBeat, -minB, loopBeats - 0.25 - maxB);
        dDeg = clamp(dDeg, -minD, degs - 1 - maxD);
      }
      setDraft((cur) =>
        cur.map((n, i) => {
          const s = nd.start.get(i);
          if (!s) return n;
          return { ...n, beat: s.beat + dBeat, deg: s.deg + dDeg };
        }),
      );
      return;
    }
    const mq = marqRef.current;
    if (mq) {
      if (!mq.moved && Math.hypot(e.clientX - mq.cx0, e.clientY - mq.cy0) < 5) return;
      mq.moved = true;
      const f = fracFrom(e);
      if (!f) return;
      mq.fx1 = f.fx;
      mq.fy1 = f.fy;
      setMarquee({ x0: mq.fx0, y0: mq.fy0, x1: f.fx, y1: f.fy });
    }
  };
  const gridUp = () => {
    const nd = noteDragRef.current;
    noteDragRef.current = null;
    if (nd) {
      if (nd.moved) p.onApplyRoll(latestRef.current);
      return;
    }
    const mq = marqRef.current;
    marqRef.current = null;
    if (!mq) return;
    if (!mq.moved) {
      // 点空处 = 加一个中力度音
      const { beatF, unit } = posFromFrac(mq.fx0, mq.fy0);
      const next = [...latestRef.current, { beat: snapBeat(beatF), deg: clamp(Math.floor(unit), 0, degs - 1), vel: 0.6 }];
      setDraft(next);
      setSel(new Set([next.length - 1]));
      p.onApplyRoll(next);
      return;
    }
    setMarquee(null);
    const bA = view.t0 + Math.min(mq.fx0, mq.fx1) * span;
    const bB = view.t0 + Math.max(mq.fx0, mq.fx1) * span;
    const uA = view.dHi - Math.max(mq.fy0, mq.fy1) * dSpan;
    const uB = view.dHi - Math.min(mq.fy0, mq.fy1) * dSpan;
    const next = new Set(mq.base);
    latestRef.current.forEach((n, i) => {
      if (n.beat < bB && n.beat + 0.5 > bA && n.deg < uB && n.deg + 1 > uA) next.add(i);
    });
    setSel(next);
  };
  const gridDbl = (e: React.MouseEvent) => {
    const f = fracFrom(e);
    if (!f) return;
    const { beatF, unit } = posFromFrac(f.fx, f.fy);
    const i = noteHit(beatF, unit);
    if (i < 0) return;
    commit(latestRef.current.filter((_, z) => z !== i), new Set());
  };

  // ---- 右键菜单：作用于一组选中（没选则作用于全部）----
  const commit = (next: RollNote[], nextSel: Set<number>) => {
    setDraft(next);
    setSel(nextSel);
    p.onApplyRoll(next);
  };
  const targetIdxs = (): number[] =>
    selRef.current.size > 0
      ? [...selRef.current]
          .filter((i) => i < latestRef.current.length)
          .sort((a, b) => a - b)
      : latestRef.current.map((_, i) => i);
  const actOnTarget = (fn: (notes: RollNote[], idxs: number[]) => void) => {
    const idxs = targetIdxs();
    const notes = latestRef.current.map((n) => ({ ...n }));
    fn(notes, idxs);
    const keep = new Set<number>();
    selRef.current.forEach((i) => {
      if (i < notes.length) keep.add(i);
    });
    commit(notes, keep);
  };
  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const f = fracFrom(e);
    if (f) {
      const { beatF, unit } = posFromFrac(f.fx, f.fy);
      const hit = noteHit(beatF, unit);
      if (hit >= 0 && !selRef.current.has(hit)) setSel(new Set([hit]));
    }
    setMenu({ x: Math.max(0, Math.min(r.width - 150, e.clientX - r.left)), y: Math.max(0, Math.min(r.height - 230, e.clientY - r.top)) });
  };

  const menuItems: { label: string; run: () => void }[] = [
    {
      label: "删除",
      run: () => {
        const idxs = new Set(targetIdxs());
        commit(latestRef.current.filter((_, i) => !idxs.has(i)), new Set());
      },
    },
    {
      label: "复制（后移 1 拍）",
      run: () => {
        const idxs = targetIdxs();
        const clones = idxs.map((i) => {
          const n = latestRef.current[i];
          return { beat: clamp(n.beat + 1, 0, loopBeats - 0.25), deg: n.deg, vel: n.vel };
        });
        const next = [...latestRef.current, ...clones];
        const selSet = new Set<number>();
        for (let k = next.length - clones.length; k < next.length; k += 1) selSet.add(k);
        commit(next, selSet);
      },
    },
    { label: "量化 · 半拍", run: () => actOnTarget((notes, idx) => idx.forEach((i) => { notes[i].beat = clamp(Math.round(notes[i].beat * 2) / 2, 0, loopBeats - 0.25); })) },
    { label: "量化 · 整拍", run: () => actOnTarget((notes, idx) => idx.forEach((i) => { notes[i].beat = clamp(Math.round(notes[i].beat), 0, Math.max(0, loopBeats - 1)); })) },
    { label: "变调 · 升一级", run: () => actOnTarget((notes, idx) => idx.forEach((i) => { notes[i].deg = clamp(notes[i].deg + 1, 0, degs - 1); })) },
    { label: "变调 · 降一级", run: () => actOnTarget((notes, idx) => idx.forEach((i) => { notes[i].deg = clamp(notes[i].deg - 1, 0, degs - 1); })) },
    { label: "变调 · 升八度", run: () => actOnTarget((notes, idx) => idx.forEach((i) => { notes[i].deg = clamp(notes[i].deg + octaveDegs, 0, degs - 1); })) },
    { label: "变调 · 降八度", run: () => actOnTarget((notes, idx) => idx.forEach((i) => { notes[i].deg = clamp(notes[i].deg - octaveDegs, 0, degs - 1); })) },
  ];

  // ---- 底部力度条：逐音竖直拖 ----
  const laneDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const el = laneRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    let best = -1;
    let bestD = 7;
    draft.forEach((n, i) => {
      const cx = ((n.beat - view.t0) / span) * r.width;
      const d = Math.abs(cx - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!selRef.current.has(best)) setSel(new Set([best]));
    velRef.current = { i: best, moved: false };
  };
  const laneMove = (e: React.PointerEvent) => {
    const vr = velRef.current;
    if (!vr) return;
    const el = laneRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = clamp(Math.round((1 - (e.clientY - r.top) / r.height) * 20) / 20, 0.05, 1);
    if (Math.abs((latestRef.current[vr.i]?.vel ?? 0) - v) > 1e-9) vr.moved = true;
    setDraft((cur) => cur.map((n, i) => (i === vr.i ? { ...n, vel: v } : n)));
  };
  const laneUp = () => {
    const vr = velRef.current;
    velRef.current = null;
    if (vr?.moved) p.onApplyRoll(latestRef.current);
  };

  // ---- 标尺平移：顶部横滚、左侧纵滚 ----
  const rulerDown = (axis: "x" | "y") => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { axis, px: e.clientX, py: e.clientY, t0: view.t0, dLo: view.dLo };
  };
  const rulerMove = (e: React.PointerEvent) => {
    const pr = panRef.current;
    if (!pr) return;
    const v = viewRef.current;
    if (pr.axis === "x") {
      const el = rulerXRef.current;
      if (!el) return;
      const s = v.t1 - v.t0;
      const dT = (-(e.clientX - pr.px) / el.getBoundingClientRect().width) * s;
      const t0 = clamp(pr.t0 + dT, 0, loopBeats - s);
      setView({ ...v, t0, t1: t0 + s });
    } else {
      const grid = gridRef.current;
      if (!grid) return;
      const s = v.dHi - v.dLo;
      const dD = ((e.clientY - pr.py) / grid.getBoundingClientRect().height) * s;
      const dLo = clamp(pr.dLo - dD, 0, degs - s);
      setView({ ...v, dLo, dHi: dLo + s });
    }
  };
  const rulerUp = () => {
    panRef.current = null;
  };

  // ---- 缩放按钮（视口中心为锚）----
  const zoomBtn = (axis: "x" | "y", f: number) => {
    setView((v) => {
      if (axis === "x") {
        const s = v.t1 - v.t0;
        const ns = clamp(s * f, 1, loopBeats);
        const mid = (v.t0 + v.t1) / 2;
        const t0 = clamp(mid - ns / 2, 0, loopBeats - ns);
        return { ...v, t0, t1: t0 + ns };
      }
      const s = v.dHi - v.dLo;
      const ns = clamp(s * f, 4, degs);
      const mid = (v.dLo + v.dHi) / 2;
      const dLo = clamp(mid - ns / 2, 0, degs - ns);
      return { ...v, dLo, dHi: dLo + ns };
    });
  };
  const fitView = () => setView({ t0: 0, t1: loopBeats, dLo: 0, dHi: degs });

  // ---- 渲染辅助 ----
  const xPct = (beat: number) => ((beat - view.t0) / span) * 100;
  const yPct = (deg: number) => ((deg - view.dLo) / dSpan) * 100;
  const tickStep = span <= 2 ? 0.5 : span <= 6 ? 1 : 2;
  const ticks: number[] = [];
  for (let b = Math.ceil(view.t0 / tickStep) * tickStep; b <= view.t1 + 1e-6; b += tickStep) ticks.push(Math.round(b * 4) / 4);
  const minorTicks: number[] = [];
  if (span <= 4) {
    for (let b = Math.ceil(view.t0 * 4) / 4; b <= view.t1 + 1e-6; b += 0.25) {
      const bb = Math.round(b * 4) / 4;
      if (Math.abs(bb / tickStep - Math.round(bb / tickStep)) > 1e-6) minorTicks.push(bb);
    }
  }
  const rows: number[] = [];
  for (let d = Math.max(0, Math.floor(view.dLo)); d <= Math.min(degs - 1, Math.ceil(view.dHi) - 1); d += 1) rows.push(d);

  const removeSel = () => {
    const idxs = new Set(sel);
    commit(latestRef.current.filter((_, i) => !idxs.has(i)), new Set());
  };

  return (
    <div
      ref={cardRef}
      className="fixed bottom-12 left-1/2 z-40 w-[min(94vw,780px)] -translate-x-1/2 border border-border bg-card p-4 text-card-foreground shadow-md"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-primary">钢琴卷帘 · {t.label}</span>
          <span className="text-muted-foreground">
            循环 {loopBeats} 拍 · {draft.length} 音
            {sel.size > 0 ? ` · 已选 ${sel.size}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={removeSel}
            disabled={sel.size === 0}
            aria-label="删除选中的音"
            className="border border-border px-2 py-0.5 text-muted-foreground hover:border-destructive/60 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
          >
            删选中
          </button>
          <button
            type="button"
            onClick={p.onResetRollToCurve}
            aria-label="清除卷帘编辑，回到笔画曲线"
            className="border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            回到笔迹
          </button>
          <button
            type="button"
            onClick={p.onCloseRoll}
            aria-label="关闭钢琴卷帘"
            className="border border-primary bg-primary px-2 py-0.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
          >
            完成
          </button>
        </div>
      </div>

      {/* 缩放条：横轴时间、纵轴音高两个方向独立缩放 */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-xs">
        <span className="text-muted-foreground">时间</span>
        <button type="button" aria-label="缩小时间视图" onClick={() => zoomBtn("x", 1.5)} className="border border-border px-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]">
          −
        </button>
        <button type="button" aria-label="放大时间视图" onClick={() => zoomBtn("x", 0.66)} className="border border-border px-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]">
          ＋
        </button>
        <span className="ml-2 text-muted-foreground">音高</span>
        <button type="button" aria-label="缩小音高视图" onClick={() => zoomBtn("y", 1.5)} className="border border-border px-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]">
          −
        </button>
        <button type="button" aria-label="放大音高视图" onClick={() => zoomBtn("y", 0.66)} className="border border-border px-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]">
          ＋
        </button>
        <button type="button" aria-label="恢复完整视图" onClick={fitView} className="ml-2 border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]">
          适应
        </button>
      </div>

      <div className="relative mt-2 grid select-none" style={{ gridTemplateColumns: "44px 1fr", gridTemplateRows: "16px auto 52px" }}>
        <div className="border border-border bg-card" />
        {/* 顶部时间标尺：左右拖 = 平移时间窗 */}
        <div
          ref={rulerXRef}
          className="relative touch-none cursor-ew-resize overflow-hidden border border-border bg-card"
          onPointerDown={rulerDown("x")}
          onPointerMove={rulerMove}
          onPointerUp={rulerUp}
          onPointerCancel={rulerUp}
          aria-label="时间标尺：左右拖动平移视图"
        >
          {ticks.map((b) => (
            <span key={`rx${b}`} className="absolute top-0 whitespace-nowrap font-mono text-[9px] leading-4 text-muted-foreground" style={{ left: `${xPct(b)}%` }}>
              {` ${Math.round(b * 2) / 2}`}
            </span>
          ))}
        </div>

        {/* 左侧音高标尺：上下拖 = 平移音高窗 */}
        <div
          ref={rulerYRef}
          className="relative touch-none cursor-ns-resize overflow-hidden border border-r-0 border-border bg-card"
          onPointerDown={rulerDown("y")}
          onPointerMove={rulerMove}
          onPointerUp={rulerUp}
          onPointerCancel={rulerUp}
          aria-label="音高标尺：上下拖动平移视图"
          style={{ height: "13rem" }}
        >
          {rows.map((d) => (
            <span key={`ry${d}`} className={`absolute left-1 w-full truncate font-mono text-[9px] leading-none text-muted-foreground ${d % 2 === 0 ? "" : "text-card-foreground/70"}`} style={{ bottom: `calc(${yPct(d)}% + 1px)` }}>
              {t.rowLabels[d]}
            </span>
          ))}
        </div>

        {/* 主网格 */}
        <div
          ref={gridRef}
          className="relative h-52 touch-none overflow-hidden border border-border bg-background"
          onPointerDown={gridDown}
          onPointerMove={gridMove}
          onPointerUp={gridUp}
          onPointerCancel={gridUp}
          onDoubleClick={gridDbl}
          onContextMenu={openMenu}
          aria-label={`${t.label}的钢琴卷帘：拖方块改音高与时间，空白拖框选，Shift 加选，右键菜单，点空处加音，双击删音，滚轮缩放`}
        >
          {rows.map((d) => (
            <div
              key={`row${d}`}
              className={`pointer-events-none absolute inset-x-0 border-t border-border/30 ${d % 2 === 0 ? "bg-primary/5" : ""}`}
              style={{ bottom: `${yPct(d)}%`, height: `${100 / dSpan}%` }}
            />
          ))}
          {minorTicks.map((b) => (
            <span key={`mn${b}`} className="pointer-events-none absolute inset-y-0 w-px bg-border/40" style={{ left: `${xPct(b)}%` }} />
          ))}
          {ticks.map((b) => (
            <span key={`tb${b}`} className="pointer-events-none absolute inset-y-0 w-px bg-border" style={{ left: `${xPct(b)}%` }} />
          ))}
          {draft.map((n, i) =>
            n.beat + 0.5 < view.t0 || n.beat > view.t1 || n.deg + 1 < view.dLo || n.deg > view.dHi ? null : (
              <div
                key={`${n.beat}-${n.deg}-${i}`}
                className={`pointer-events-none absolute rounded-sm border ${
                  sel.has(i) ? "border-primary bg-primary" : "border-primary/60 bg-primary/40"
                }`}
                style={{
                  left: `${xPct(n.beat)}%`,
                  bottom: `${yPct(n.deg)}%`,
                  width: `calc(${(0.5 / span) * 100}% - 2px)`,
                  height: `calc(${100 / dSpan}% - 2px)`,
                }}
              />
            ),
          )}
          {marquee && (
            <div
              className="pointer-events-none absolute border border-primary/70 bg-primary/10"
              style={{
                left: `${Math.min(marquee.x0, marquee.x1) * 100}%`,
                top: `${Math.min(marquee.y0, marquee.y1) * 100}%`,
                width: `${Math.abs(marquee.x1 - marquee.x0) * 100}%`,
                height: `${Math.abs(marquee.y1 - marquee.y0) * 100}%`,
              }}
            />
          )}
        </div>

        <div className="border border-border bg-card" />
        {/* 底部力度条：每个音符一根竖条，竖直拖 = 单独调力度 */}
        <div
          ref={laneRef}
          className="relative touch-none overflow-hidden border border-border bg-background"
          onPointerDown={laneDown}
          onPointerMove={laneMove}
          onPointerUp={laneUp}
          onPointerCancel={laneUp}
          aria-label="力度条：竖条代表每个音的力度，按住竖直拖单独调整"
        >
          <span className="absolute left-0 top-1/2 w-full border-t border-border/40" aria-hidden />
          <span className="pointer-events-none absolute left-1 top-0.5 font-mono text-[9px] text-muted-foreground">力度</span>
          {draft.map((n, i) => {
            if (n.beat + 0.5 < view.t0 || n.beat > view.t1) return null;
            return (
              <div
                key={`vel${i}`}
                className={`absolute w-[5px] rounded-sm ${sel.has(i) ? "bg-primary" : "bg-primary/40"}`}
                style={{ left: `calc(${xPct(n.beat)}% + 1px)`, bottom: 2, height: `calc(${n.vel * 100}% - 6px)` }}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-xs">
        <span className="text-muted-foreground">
          拖方块=移 · 空白拖=框选 · Shift 加选 · 右键菜单 · 双击删 · 点空处加 · 力度条逐音调 · 滚轮缩放音高 / Shift 滚轮缩放时间 · 拖标尺平移
        </span>
        <span className="text-muted-foreground">改动即时可听 · 拖动线本体会自动回到笔迹</span>
      </div>

      {menu && (
        <div ref={menuRef} className="absolute z-50 w-36 border border-border bg-card py-1 font-mono text-xs shadow-md" style={{ left: menu.x, top: menu.y }}>
          <div className="px-2 pb-1 text-[10px] text-muted-foreground">对 {targetIdxs().length} 个音</div>
          {menuItems.map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => {
                m.run();
                setMenu(null);
              }}
              className="block w-full px-2 py-1 text-left text-card-foreground hover:bg-primary/10 hover:text-primary"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
