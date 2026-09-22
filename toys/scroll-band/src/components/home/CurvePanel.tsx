// 参数曲线编辑窗：把「在画布上画曲线」收敛到一个独立小窗，
// 四条轨道（音量/滤波/声像/混响）各自绘制「参数随时间的自动化曲线」，
// 避免与笔画/锚点的落笔操作混淆。底层仍走 scoreCanvas 的 type:"curve" 对象 + engine.setCanvasAuto 编译链，
// 已保存/分享的画布照常兼容。
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CURVE_PARAM_META,
  CURVE_PARAM_ORDER,
  type CanvasPt,
  type CurveParam,
} from "@/lib/canvas/scoreCanvas";

// 四个参数的「中性值」在归一化 Y 上的位置（与 audioEngine AUTO_NEUTRAL 对应）：
// 引擎按 v = 1 - y 取值，故 vol/cutoff 中性 v=1 → y=0（顶），pan 中性 v=0.5 → y=0.5（中），reverb 中性 v=0 → y=1（底）
const NEUTRAL_Y: Record<CurveParam, number> = {
  vol: 0,
  cutoff: 0,
  pan: 0.5,
  reverb: 1,
};
// 各参数纵向含义（y=0 顶 = 最大值，y=1 底 = 最小值）
const AXIS_LABEL: Record<CurveParam, { top: string; bottom: string }> = {
  vol: { top: "强", bottom: "弱" },
  cutoff: { top: "亮", bottom: "暗" },
  pan: { top: "右", bottom: "左" },
  reverb: { top: "湿", bottom: "干" },
};

const VB_W = 1000;
const VB_H = 120;

type Lanes = Record<CurveParam, CanvasPt[] | null>;

const EMPTY_LANES: Lanes = { vol: null, cutoff: null, pan: null, reverb: null };

export function CurvePanel({
  onClose,
  initialLanes,
  setCurveForParam,
}: {
  onClose: () => void;
  initialLanes: Record<CurveParam, CanvasPt[] | null> | null;
  setCurveForParam: (param: CurveParam, pts: CanvasPt[] | null) => void;
}) {
  const [lanes, setLanes] = useState<Lanes>(() =>
    initialLanes
      ? {
          vol: initialLanes.vol,
          cutoff: initialLanes.cutoff,
          pan: initialLanes.pan,
          reverb: initialLanes.reverb,
        }
      : EMPTY_LANES,
  );
  const [draft, setDraft] = useState<{
    param: CurveParam;
    pts: CanvasPt[];
  } | null>(null);
  const drawingRef = useRef<{ param: CurveParam; pts: CanvasPt[] } | null>(
    null,
  );
  const svgRefs = useRef<Record<string, SVGSVGElement | null>>({});

  const toNorm = (param: CurveParam, clientX: number, clientY: number) => {
    const svg = svgRefs.current[param];
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    return { x, y };
  };

  const onDown =
    (param: CurveParam) => (e: ReactPointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const { x, y } = toNorm(param, e.clientX, e.clientY);
      // 曲线编译只取 x（时间）/ y（参数值），t 占位即可（与已存档/分享对象一致）
      const pts: CanvasPt[] = [{ x, y, t: 0 }];
      drawingRef.current = { param, pts };
      setDraft({ param, pts });
    };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drawingRef.current;
    if (!d) return;
    const { x, y } = toNorm(d.param, e.clientX, e.clientY);
    const last = d.pts[d.pts.length - 1];
    // 节流：与上一个点过近则跳过，避免点列过密
    if (last && Math.hypot(x - last.x, y - last.y) < 0.012) return;
    d.pts.push({ x, y, t: 0 });
    setDraft({ param: d.param, pts: d.pts.slice() });
  };

  const onUp = () => {
    const d = drawingRef.current;
    drawingRef.current = null;
    if (!d) return;
    if (d.pts.length >= 2) {
      setLanes((prev) => ({ ...prev, [d.param]: d.pts }));
      setCurveForParam(d.param, d.pts);
    }
    setDraft(null);
  };

  const clearLane = (param: CurveParam) => {
    setLanes((prev) => ({ ...prev, [param]: null }));
    setCurveForParam(param, null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="参数曲线编辑"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <div>
            <h2 className="font-mono text-sm">参数曲线</h2>
            <p className="text-xs text-muted-foreground">
              横轴＝时间，纵轴＝参数值。在每条轨道上拖动，画出该参数随时间的自动化曲线。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭参数曲线窗口"
            className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            关闭
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {CURVE_PARAM_ORDER.map((param) => {
            const meta = CURVE_PARAM_META[param];
            const pts = draft?.param === param ? draft.pts : lanes[param];
            const color = `hsl(${meta.hue} 85% 60%)`;
            const neutralY = NEUTRAL_Y[param];
            const ax = AXIS_LABEL[param];
            const linePts =
              pts && pts.length >= 2
                ? pts
                    .map(
                      (p) =>
                        `${(p.x * VB_W).toFixed(1)},${(p.y * VB_H).toFixed(1)}`,
                    )
                    .join(" ")
                : "";
            const hasCurve = !!pts && pts.length >= 2;
            return (
              <div
                key={param}
                className="mb-3 border border-border/70 bg-background/40 p-2"
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="font-mono text-sm">{meta.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {hasCurve ? "已绘制" : "空白"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => clearLane(param)}
                    disabled={!hasCurve}
                    className="border border-border px-2 py-0.5 text-xs hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
                  >
                    清除
                  </button>
                </div>
                <div className="relative">
                  <svg
                    ref={(el) => {
                      svgRefs.current[param] = el;
                    }}
                    viewBox={`0 0 ${VB_W} ${VB_H}`}
                    preserveAspectRatio="none"
                    className="h-24 w-full touch-none cursor-crosshair border border-border/50 bg-background/60"
                    onPointerDown={onDown(param)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerLeave={onUp}
                  >
                    {/* 纵向时间网格：每 1 拍一条（全宽 = 12 拍） */}
                    {Array.from({ length: 13 }).map((_, i) => (
                      <line
                        key={i}
                        x1={(i / 12) * VB_W}
                        y1={0}
                        x2={(i / 12) * VB_W}
                        y2={VB_H}
                        stroke="var(--border)"
                        strokeWidth={i % 4 === 0 ? 1 : 0.5}
                        opacity={i % 4 === 0 ? 0.6 : 0.3}
                      />
                    ))}
                    {/* 横向网格 */}
                    {[0.25, 0.5, 0.75].map((yy) => (
                      <line
                        key={yy}
                        x1={0}
                        y1={yy * VB_H}
                        x2={VB_W}
                        y2={yy * VB_H}
                        stroke="var(--border)"
                        strokeWidth={0.5}
                        opacity={0.3}
                      />
                    ))}
                    {/* 中性值虚线（无自动化时的基准位置） */}
                    <line
                      x1={0}
                      y1={neutralY * VB_H}
                      x2={VB_W}
                      y2={neutralY * VB_H}
                      stroke={color}
                      strokeWidth={1}
                      strokeDasharray="6 5"
                      opacity={0.5}
                    />
                    {/* 已绘制 / 正在绘制的曲线 */}
                    {linePts && (
                      <polyline
                        points={linePts}
                        fill="none"
                        stroke={color}
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                  <span className="pointer-events-none absolute left-1 top-0 text-[10px] text-muted-foreground">
                    {ax.top}
                  </span>
                  <span className="pointer-events-none absolute bottom-0 left-1 text-[10px] text-muted-foreground">
                    {ax.bottom}
                  </span>
                  {!hasCurve && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                      横着拖动画一条曲线
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          横轴满宽对应循环 12
          拍；只画一段则仅在那段区间内生效，其余时间保持中性值。曲线与画布乐句共享，可保存与分享。
        </footer>
      </div>
    </div>
  );
}
