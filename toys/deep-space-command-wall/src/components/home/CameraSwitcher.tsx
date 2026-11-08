import type { ReplayCamId } from "@/pages/Home/useHome";

interface CameraSwitcherProps {
  cam: ReplayCamId;
  onSelect: (cam: ReplayCamId) => void;
}

const CAM_OPTIONS: { id: ReplayCamId; label: string; desc: string }[] = [
  { id: "cam1", label: "CAM-1", desc: "星野主视口" },
  { id: "cam2", label: "CAM-2", desc: "遥测仪表位" },
  { id: "cam3", label: "CAM-3", desc: "雷达链路位" },
  { id: "cam4", label: "CAM-4", desc: "事件日志位" },
];

/** 回放模式机位切换条：4 个等宽按钮, 当前机位高亮 */
export function CameraSwitcher({ cam, onSelect }: CameraSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="回放机位切换"
      className="mb-3 grid grid-cols-4 gap-2 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      {CAM_OPTIONS.map((option) => {
        const active = cam === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            aria-pressed={active}
            title={`切换到 ${option.label} ${option.desc}`}
            className={`flex flex-col items-center rounded-md border px-2 py-1.5 shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
              active
                ? "border-destructive bg-destructive/15 text-destructive"
                : "border-border bg-card text-muted-foreground hover:border-destructive/60 hover:text-destructive"
            }`}
          >
            <span className="font-mono text-xs font-bold tracking-widest">{option.label}</span>
            <span className="text-xs">{option.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
