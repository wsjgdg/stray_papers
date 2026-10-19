// 拍照相册回看面板（从 RoverControl 拆出）：滤镜多选筛选 + 命名方案管理（套用/重命名/删除/存当前）+
// 单张删除 + 档案编号防伪校验演示 + 清单导出。筛选组合与方案经 localStorage 记忆（隐私模式静默降级）。
import { useState } from "react";
import { tokenHsl, tokenShiftHsl } from "@/lib/themeColors";
import { archiveCode, checkDigitOf, fmtOdo, fmtTs } from "@/components/home/rover/shared";

interface RoverAlbumPanelProps {
  /** 拍照相册（最新在前; 单张可删除, ts = 拍摄时刻毫秒） */
  photoLog?: { n: number; filter: number; x: number; y: number; ts: number }[];
  onRemovePhoto?: (n: number) => void;
  roverName: string;
  roverNameEn: string;
  /** 导出清单头部统计: 巡视里程（米）/ 当前电量（%）/ 板面积尘（%） */
  odoMeters: number;
  batteryPct: number;
  dustPct: number;
}

export function RoverAlbumPanel({
  photoLog,
  onRemovePhoto,
  roverName,
  roverNameEn,
  odoMeters,
  batteryPct,
  dustPct,
}: RoverAlbumPanelProps) {
  // 相册滤镜筛选（多选组合: 空数组 = 全部, 否则只看选中档位）——上次组合经 localStorage 记忆（隐私模式静默降级）
  const [albumFilter, setAlbumFilter] = useState<number[]>(() => {
    try {
      const raw = window.localStorage.getItem("rover-album-filter");
      if (!raw) return [];
      const arr = raw
        .split(",")
        .map(Number)
        .filter((v) => v >= 0 && v <= 3);
      return [...new Set(arr)];
    } catch {
      return [];
    }
  });
  const pickAlbumFilter = (v: number) => {
    setAlbumFilter((prev) => {
      // 「全部」清空组合; 档位点击切换选中（可多档叠加）
      const next = v === -1 ? [] : prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v];
      try {
        window.localStorage.setItem("rover-album-filter", next.join(","));
      } catch {
        // 存储不可用时仅本次会话生效
      }
      return next;
    });
  };
  // 档案编号校验演示：输入完整编号回车/点校验——校验位对得上绿 ✓ / 对不上红 ✗（格式不完整不判定）
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<"ok" | "bad" | null>(null);
  const runVerify = () => {
    const m = verifyInput.trim().toUpperCase().match(/^DS-([A-Z0-9]{7})-([A-Z0-9])$/);
    if (!m) {
      setVerifyResult(null);
      return;
    }
    setVerifyResult(checkDigitOf(m[1]) === m[2] ? "ok" : "bad");
  };
  // 筛选组合方案：把当前多选组合存成命名方案（最多 4 套, 相同组合不重复存）, localStorage 持久化
  const [filterPresets, setFilterPresets] = useState<{ name: string; filters: number[] }[]>(() => {
    try {
      const raw = window.localStorage.getItem("rover-album-presets");
      if (!raw) return [];
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(
          (p): p is { name: string; filters: number[] } =>
            !!p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string" && Array.isArray((p as { filters?: unknown }).filters),
        )
        .slice(0, 6);
    } catch {
      return [];
    }
  });
  const persistPresets = (next: { name: string; filters: number[] }[]) => {
    setFilterPresets(next);
    try {
      window.localStorage.setItem("rover-album-presets", JSON.stringify(next));
    } catch {
      // 存储不可用时仅本次会话生效
    }
  };
  const saveFilterPreset = () => {
    if (albumFilter.length === 0 || filterPresets.length >= 6) return;
    const dup = filterPresets.some(
      (p) => p.filters.length === albumFilter.length && p.filters.every((f) => albumFilter.includes(f)),
    );
    if (dup) return;
    // 默认名找不重复的序号（自定义名/删除后可能出现空洞）
    let n = filterPresets.length + 1;
    while (filterPresets.some((p) => p.name === `方案${n}`)) n++;
    persistPresets([...filterPresets, { name: `方案${n}`, filters: [...albumFilter].sort((a, b) => a - b) }]);
  };
  const applyFilterPreset = (filters: number[]) => {
    setAlbumFilter(filters);
    try {
      window.localStorage.setItem("rover-album-filter", filters.join(","));
    } catch {
      // 忽略
    }
  };
  const removeFilterPreset = (idx: number) => {
    // 保留各自名字（可能已被重命名）, 不强制重编号
    persistPresets(filterPresets.filter((_, i) => i !== idx));
  };
  // 方案重命名：双击方案名进入编辑（≤6 字, Enter/失焦提交, Esc 取消, 空名回落原名）
  const [renamingPreset, setRenamingPreset] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");
  // 方案 chip 档位色点：四档滤镜 → 四种 token 派生色（标准=主蓝 / 金色=亮金 / 冰蓝=偏青提亮 / 复古=暗金）
  const filterDot = (f: number) =>
    f === 0
      ? tokenHsl("--primary", 0.9)
      : f === 1
        ? tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.15 }, 0.95)
        : f === 2
          ? tokenShiftHsl("--primary", { hue: -28, sat: 0.6, light: 1.3 }, 0.9)
          : tokenShiftHsl("--primary", { hue: -168, sat: 0.4, light: 0.8 }, 0.9);
  const startRenamePreset = (idx: number) => {
    setRenamingPreset(idx);
    setRenameText(filterPresets[idx]?.name ?? "");
  };
  const commitRenamePreset = () => {
    if (renamingPreset === null) return;
    const idx = renamingPreset;
    setRenamingPreset(null);
    const prev = filterPresets[idx];
    if (!prev) return;
    const name = renameText.trim().slice(0, 6) || prev.name;
    if (name === prev.name) return;
    persistPresets(filterPresets.map((p, i) => (i === idx ? { ...p, name } : p)));
  };
  // 相册清单导出：纯前端 Blob 下载 txt（任务统计头 + 序号/滤镜/坐标明细）
  const exportAlbum = () => {
    const log = photoLog ?? [];
    const filterNames = ["标准", "金色纪念", "冰蓝", "复古"];
    const counts = [0, 0, 0, 0];
    log.forEach((ph) => {
      if (counts[ph.filter] !== undefined) counts[ph.filter] += 1;
    });
    const lines = [
      `${roverName} (${roverNameEn}) 任务相册清单`,
      `导出时间: ${fmtTs(Date.now())}`,
      `巡视里程: ${fmtOdo(odoMeters)} · 当前电量 ${batteryPct.toFixed(0)}% · 板面积尘 ${dustPct}%`,
      `共 ${log.length} 张 · 滤镜分布: ${filterNames.map((n, i) => `${n} ${counts[i]}`).join(" / ")}`,
      "每张照片附唯一档案编号（与分享卡片图右下角档案码同一体系; 末位为防伪校验位, 手抄错一位就对不上）",
      "────────────────────────",
      ...log.map(
        (ph) =>
          `#${String(ph.n).padStart(2, "0")} · ${fmtTs(ph.ts)} · 滤镜 ${filterNames[ph.filter] ?? "标准"} · 拍摄坐标 (${ph.x}, ${ph.y}) · 档案编号 ${archiveCode(ph.n, ph.ts)}`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rover-photo-album.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
                <div className="mt-1.5 max-h-24 overflow-y-auto rounded-md border border-border bg-background p-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-mono text-[9px] tracking-widest text-muted-foreground">📔 任务相册 · 已拍 {photoLog?.length ?? 0} 张（最多存 20）</p>
                    {(photoLog?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={exportAlbum}
                        aria-label="导出相册清单"
                        title="把相册清单导出为 txt 文本（序号/滤镜/坐标）"
                        className="shrink-0 rounded-sm border border-primary/50 bg-primary/10 px-1 font-mono text-[9px] font-bold text-primary transition hover:bg-primary/20"
                      >
                        ⬇ 导出清单
                      </button>
                    )}
                  </div>
                  {/* 滤镜分组筛选：全部 + 四档各带计数, 点击只看该滤镜的照片 */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {[
                      { v: -1, label: "全部" },
                      { v: 0, label: "标准" },
                      { v: 1, label: "金色" },
                      { v: 2, label: "冰蓝" },
                      { v: 3, label: "复古" },
                    ].map((f) => {
                      const cnt = f.v === -1 ? (photoLog?.length ?? 0) : (photoLog ?? []).filter((ph) => ph.filter === f.v).length;
                      const on = f.v === -1 ? albumFilter.length === 0 : albumFilter.includes(f.v);
                      return (
                        <button
                          key={f.v}
                          type="button"
                          onClick={() => pickAlbumFilter(f.v)}
                          aria-label={f.v === -1 ? `显示全部照片, 共 ${cnt} 张` : `${albumFilter.includes(f.v) ? "取消" : "叠加"}筛选${f.label}滤镜照片, 共 ${cnt} 张`}
                          aria-pressed={on}
                          title={f.v === -1 ? "只看全部（清空筛选组合）" : "点击叠加/取消这一档——可同时选多档组合筛选"}
                          className={`rounded-sm border px-1 font-mono text-[9px] font-bold tracking-widest transition ${
                            on
                              ? "border-primary bg-primary/25 text-primary"
                              : cnt === 0
                                ? "border-border text-muted-foreground/50"
                                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary"
                          }`}
                        >
                          {on && f.v !== -1 ? "✓ " : ""}
                          {f.label} {cnt}
                        </button>
                      );
                    })}
                  </div>
                  {/* 筛选方案行：已存组合一键套用/删除, 当前有组合且未满 4 套时可「+ 存当前」 */}
                  {(filterPresets.length > 0 || albumFilter.length > 0) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="font-mono text-[8px] tracking-widest text-muted-foreground">方案</span>
                      {filterPresets.map((p, i) => {
                        const on =
                          p.filters.length === albumFilter.length && p.filters.every((f) => albumFilter.includes(f));
                        return (
                          <span key={i} className="inline-flex items-center overflow-hidden rounded-sm border border-border">
                            {renamingPreset === i ? (
                              <input
                                type="text"
                                value={renameText}
                                autoFocus
                                onChange={(e) => setRenameText(e.target.value.slice(0, 6))}
                                onBlur={commitRenamePreset}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRenamePreset();
                                  if (e.key === "Escape") setRenamingPreset(null);
                                }}
                                aria-label={`重命名筛选方案 ${p.name}（最多 6 字, Enter 确认, Esc 取消）`}
                                className="w-14 bg-background px-1 py-0.5 font-mono text-[9px] font-bold text-primary outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => applyFilterPreset(p.filters)}
                                onDoubleClick={() => startRenamePreset(i)}
                                aria-label={`套用筛选方案 ${p.name}: ${p.filters.map((f) => ["标准", "金色", "冰蓝", "复古"][f]).join("+")}（双击重命名）`}
                                title={`点击套用（${p.filters.map((f) => ["标准", "金色", "冰蓝", "复古"][f]).join(" + ")}）· 双击重命名`}
                                className={`px-1 py-0.5 font-mono text-[9px] font-bold transition ${
                                  on ? "bg-primary/25 text-primary" : "bg-background text-muted-foreground hover:text-primary"
                                }`}
                              >
                                {/* 档位色点：不用看名字也知道这套方案含哪几档滤镜（悬停色点显示档位全名） */}
                                <span className="mr-1 inline-flex gap-px align-middle" aria-hidden="true">
                                  {p.filters.map((f) => (
                                    <span
                                      key={f}
                                      className="inline-block h-1 w-1 rounded-[1px]"
                                      style={{ background: filterDot(f) }}
                                      title={["标准", "金色纪念", "冰蓝", "复古"][f] ?? "标准"}
                                    />
                                  ))}
                                </span>
                                {p.name}·{p.filters.length}档
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeFilterPreset(i)}
                              aria-label={`删除筛选方案 ${p.name}`}
                              className="border-l border-border bg-background px-0.5 py-0.5 font-mono text-[9px] text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}
                      {albumFilter.length > 0 && filterPresets.length < 6 && (
                        <button
                          type="button"
                          onClick={saveFilterPreset}
                          aria-label="把当前筛选组合存为方案"
                          title="把当前选中的档位组合存成一套方案（最多 6 套, 相同组合不重复存）"
                          className="rounded-sm border border-dashed border-primary/50 px-1 py-0.5 font-mono text-[9px] font-bold text-primary transition hover:bg-primary/15"
                        >
                          + 存当前
                        </button>
                      )}
                    </div>
                  )}
                  {(photoLog ?? [])
                    .filter((ph) => albumFilter.length === 0 || albumFilter.includes(ph.filter))
                    .map((ph) => (
                    <p key={ph.n} className="flex items-center gap-1 font-mono text-[10px] text-card-foreground">
                      <span className="min-w-0 flex-1 truncate">
                        #{String(ph.n).padStart(2, "0")} · {["标准", "金色", "冰蓝", "复古"][ph.filter] ?? "标准"} · ({ph.x}, {ph.y}) · {fmtTs(ph.ts)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemovePhoto?.(ph.n)}
                        aria-label={`删除相册第 ${ph.n} 张照片`}
                        title="从相册删除这张（拍照累计数与成就不受影响）"
                        className="shrink-0 rounded-sm border border-border px-1 text-muted-foreground transition hover:border-destructive/60 hover:text-destructive"
                      >
                        ✕
                      </button>
                    </p>
                  ))}
                  {(photoLog?.length ?? 0) === 0 && <p className="text-[10px] text-muted-foreground">还没有照片——按「📷 拍照」留下第一张</p>}
                  {(photoLog?.length ?? 0) > 0 &&
                    (photoLog ?? []).filter((ph) => albumFilter.length === 0 || albumFilter.includes(ph.filter)).length === 0 && (
                      <p className="text-[10px] text-muted-foreground">这个筛选组合下还没有照片——点「全部」清空, 或增减档位再试试</p>
                    )}
                  {/* 档案编号校验演示：抄一个导出清单里的编号来验——校验位对得上绿 ✓ / 手抄错一位红 ✗ */}
                  {(photoLog?.length ?? 0) > 0 && (
                    <div className="mt-1 flex items-center gap-1 border-t border-border pt-1">
                      <span className="shrink-0 font-mono text-[8px] tracking-widest text-muted-foreground">校验</span>
                      <input
                        type="text"
                        value={verifyInput}
                        onChange={(e) => {
                          setVerifyInput(e.target.value.toUpperCase().slice(0, 14));
                          setVerifyResult(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") runVerify();
                        }}
                        placeholder="DS-XXXXXXX-C"
                        aria-label="输入档案编号验证防伪校验位（格式 DS-七位正文-一位校验位, 回车或点校验）"
                        title="把导出清单里的档案编号抄进来验一验——校验位对得上绿 ✓, 手抄错一位立刻红 ✗"
                        className="h-5 w-28 shrink-0 rounded-sm border border-border bg-background px-1 font-mono text-[9px] tracking-widest text-primary placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                      />
                      <button
                        type="button"
                        onClick={runVerify}
                        aria-label="校验档案编号"
                        className="shrink-0 rounded-sm border border-primary/50 bg-primary/10 px-1 py-0.5 font-mono text-[9px] font-bold text-primary transition hover:bg-primary/20"
                      >
                        校验
                      </button>
                      {verifyResult === "ok" && (
                        <span className="animate-in fade-in zoom-in-75 font-mono text-[9px] font-bold text-primary duration-300">✓ 校验通过</span>
                      )}
                      {verifyResult === "bad" && (
                        <span className="animate-pulse font-mono text-[9px] font-bold text-destructive">✗ 校验位不符 · 编号抄错了</span>
                      )}
                    </div>
                  )}
                </div>
  );
}
