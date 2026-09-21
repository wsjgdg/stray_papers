import type { useHome } from "@/pages/Home/useHome";
import { SYNTH_TEMPLATES, type LfoTarget, type SynthPatch, type SynthWave } from "@/lib/audio/synthPatch";
import { usePanelEntrance } from "./usePanelMotion";

// 音色编辑器（简化合成器面板）：振荡器/滤波器/放大器/效果器/调制 五区，
// 样式对齐 MixPanel/听感 等 HUD 面板（border-border bg-card font-mono token 色）。
// 滑杆拖动 onSynthChange 实时灌引擎热更新——拧一下当场就听得见。
const WAVES: { id: SynthWave; label: string }[] = [
  { id: "sine", label: "正弦" },
  { id: "square", label: "方波" },
  { id: "sawtooth", label: "锯齿" },
  { id: "triangle", label: "三角" },
];

const LFO_TARGETS: { id: LfoTarget; label: string; hint: string }[] = [
  { id: "pitch", label: "音高", hint: "揉音（vibrato）" },
  { id: "filter", label: "滤波", hint: "明暗扫动" },
  { id: "vol", label: "音量", hint: "颤音（tremolo）" },
];

// 截止频率对数滑杆：0..100 位置 ↔ 80..12000Hz（低频段占更多格，手感对齐听觉）
const CUT_MIN = 80;
const CUT_MAX = 12000;
const cutToPos = (hz: number): number =>
  Math.round(100 * (Math.log(Math.min(CUT_MAX, Math.max(CUT_MIN, hz)) / CUT_MIN) / Math.log(CUT_MAX / CUT_MIN)));
const posToCut = (pos: number): number => CUT_MIN * Math.pow(CUT_MAX / CUT_MIN, Math.min(100, Math.max(0, pos)) / 100);

function Slider({
  label,
  hint,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-1.5 flex items-center gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">
        {label}
        {hint && <span className="text-muted-foreground/70"> {hint}</span>}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="w-14 shrink-0 text-right text-card-foreground">{display}</span>
    </label>
  );
}

function WavePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SynthWave;
  onChange: (w: SynthWave) => void;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      {WAVES.map((w) => (
        <button
          key={w.id}
          type="button"
          aria-pressed={w.id === value}
          onClick={() => onChange(w.id)}
          className={
            w.id === value
              ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
              : "border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          }
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="mt-4 border-b border-border pb-1 font-mono text-xs font-bold text-card-foreground">
      {children}
    </h3>
  );
}

export function SynthPanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  const patch = p.synthPatch;
  const set = <K extends keyof SynthPatch>(key: K, val: SynthPatch[K]): void => {
    p.onSynthChange({ ...patch, [key]: val });
  };
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={p.onCloseSynth}
    >
      <div
        data-panel-card
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto border border-border bg-card p-5 font-mono text-xs text-card-foreground shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-2xl font-bold">音色编辑器</h2>
          <span className="text-muted-foreground">拧一下 · 当场听见</span>
        </div>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          双振荡器 + 滤波 + 双包络 + 四条效果 + LFO，全在浏览器里合成。改动即时生效，
          存本地刷新还在；先挑个<span className="text-primary">起点模板</span>再细调最省事。
        </p>
        <div data-panel-item className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={p.onSynthAudition}
            className="border border-primary bg-primary px-3 py-1 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
          >
            ▶ 试听
          </button>
          <button
            type="button"
            onClick={p.onSynthReset}
            className="border border-border px-2 py-1 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            恢复出厂
          </button>
          <span className="ml-auto text-muted-foreground">起点</span>
          {SYNTH_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              title={tpl.desc}
              onClick={() => p.onSynthTemplate(tpl.id)}
              className="border border-border px-2 py-1 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              {tpl.name}
            </button>
          ))}
        </div>

        <SectionTitle>振荡器</SectionTitle>
        <WavePicker label="波形 A" value={patch.waveA} onChange={(w) => set("waveA", w)} />
        <WavePicker label="波形 B" value={patch.waveB} onChange={(w) => set("waveB", w)} />
        <Slider
          label="B 失谐"
          value={patch.detuneB}
          min={-50}
          max={50}
          step={1}
          display={`${patch.detuneB > 0 ? "+" : ""}${patch.detuneB}¢`}
          onChange={(v) => set("detuneB", v)}
        />
        <Slider
          label="八度"
          value={patch.octave}
          min={-2}
          max={2}
          step={1}
          display={`${patch.octave > 0 ? "+" : ""}${patch.octave}`}
          onChange={(v) => set("octave", v)}
        />

        <SectionTitle>滤波器</SectionTitle>
        <Slider
          label="截止"
          value={cutToPos(patch.cutoff)}
          min={0}
          max={100}
          step={1}
          display={`${Math.round(patch.cutoff)}Hz`}
          onChange={(v) => set("cutoff", Math.round(posToCut(v)))}
        />
        <Slider label="共振" value={patch.q} min={0.1} max={18} step={0.1} display={patch.q.toFixed(1)} onChange={(v) => set("q", v)} />
        <Slider label="起音" hint="F" value={patch.fA} min={0} max={1} step={0.01} display={`${patch.fA.toFixed(2)}s`} onChange={(v) => set("fA", v)} />
        <Slider label="衰减" hint="F" value={patch.fD} min={0} max={1} step={0.01} display={`${patch.fD.toFixed(2)}s`} onChange={(v) => set("fD", v)} />
        <Slider label="保持" hint="F" value={patch.fS} min={0} max={1} step={0.01} display={pct(patch.fS)} onChange={(v) => set("fS", v)} />
        <Slider label="释放" hint="F" value={patch.fR} min={0} max={2} step={0.01} display={`${patch.fR.toFixed(2)}s`} onChange={(v) => set("fR", v)} />

        <SectionTitle>放大器</SectionTitle>
        <Slider label="起音" hint="A" value={patch.aA} min={0} max={1} step={0.005} display={`${patch.aA.toFixed(3)}s`} onChange={(v) => set("aA", v)} />
        <Slider label="衰减" hint="A" value={patch.aD} min={0} max={1} step={0.01} display={`${patch.aD.toFixed(2)}s`} onChange={(v) => set("aD", v)} />
        <Slider label="保持" hint="A" value={patch.aS} min={0} max={1} step={0.01} display={pct(patch.aS)} onChange={(v) => set("aS", v)} />
        <Slider label="释放" hint="A" value={patch.aR} min={0} max={2} step={0.01} display={`${patch.aR.toFixed(2)}s`} onChange={(v) => set("aR", v)} />

        <SectionTitle>效果器 · 失真 → 合唱 → 延迟 → 混响</SectionTitle>
        <Slider label="失真" value={patch.drive} min={0} max={100} step={1} display={`${patch.drive}`} onChange={(v) => set("drive", v)} />
        <Slider label="失真混比" value={patch.distMix} min={0} max={1} step={0.01} display={pct(patch.distMix)} onChange={(v) => set("distMix", v)} />
        <Slider label="合唱速" value={patch.choRate} min={0.1} max={4} step={0.05} display={`${patch.choRate.toFixed(2)}Hz`} onChange={(v) => set("choRate", v)} />
        <Slider label="合唱深" value={patch.choDepth} min={0} max={100} step={1} display={`${patch.choDepth}`} onChange={(v) => set("choDepth", v)} />
        <Slider label="合唱混比" value={patch.choMix} min={0} max={1} step={0.01} display={pct(patch.choMix)} onChange={(v) => set("choMix", v)} />
        <Slider label="延迟时" value={patch.dlyTime} min={0.05} max={1} step={0.01} display={`${patch.dlyTime.toFixed(2)}s`} onChange={(v) => set("dlyTime", v)} />
        <Slider label="反馈" value={patch.dlyFb} min={0} max={0.85} step={0.01} display={pct(patch.dlyFb)} onChange={(v) => set("dlyFb", v)} />
        <Slider label="延迟混比" value={patch.dlyMix} min={0} max={1} step={0.01} display={pct(patch.dlyMix)} onChange={(v) => set("dlyMix", v)} />
        <Slider label="混响长" value={patch.revSize} min={0.5} max={4} step={0.1} display={`${patch.revSize.toFixed(1)}s`} onChange={(v) => set("revSize", v)} />
        <Slider label="混响混比" value={patch.revMix} min={0} max={1} step={0.01} display={pct(patch.revMix)} onChange={(v) => set("revMix", v)} />

        <SectionTitle>调制 LFO</SectionTitle>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-muted-foreground">目标</span>
          {LFO_TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={t.id === patch.lfoTarget}
              title={t.hint}
              onClick={() => set("lfoTarget", t.id)}
              className={
                t.id === patch.lfoTarget
                  ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                  : "border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {t.label}
            </button>
          ))}
          <span className="text-muted-foreground/70">
            {LFO_TARGETS.find((t) => t.id === patch.lfoTarget)?.hint}
          </span>
        </div>
        <Slider label="速率" value={patch.lfoRate} min={0.05} max={12} step={0.05} display={`${patch.lfoRate.toFixed(2)}Hz`} onChange={(v) => set("lfoRate", v)} />
        <Slider label="深度" value={patch.lfoDepth} min={0} max={100} step={1} display={`${patch.lfoDepth}`} onChange={(v) => set("lfoDepth", v)} />

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={p.onCloseSynth}
            className="border border-primary bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
          >
            完成
          </button>
          <span className="text-muted-foreground">
            改动即时生效并已存本地 · 切走预设音色再切回「自造」，参数都还在
          </span>
        </div>
      </div>
    </div>
  );
}
