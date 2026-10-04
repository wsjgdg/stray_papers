/**
 * 好感变化提示：选项生效后右上短促浮现（「抹抹 对你的好感 +3」），带关系升级标注。
 * 主角奶白自己的真话加分显示为「你对自己坦诚 +2」。
 */
import { Heart } from "lucide-react";
import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import { FROG_CHARACTERS } from "@/data/characters";
import { SELF_ID, type AffinityFlash } from "@/lib/affinity";

interface AffinityToastProps {
  flash: AffinityFlash | null;
}

export function AffinityToast({ flash }: AffinityToastProps) {
  if (!flash) return null;

  const charId = flash.charId;
  const isAll = charId === "all";
  const isSelf = charId === SELF_ID;
  const character = isAll ? null : FROG_CHARACTERS[charId];
  const Sprite = isAll ? null : FROG_BY_CHARACTER[charId];
  const positive = flash.delta > 0;
  const deltaText = positive ? `+${flash.delta}` : `${flash.delta}`;

  return (
    <div
      key={flash.stamp}
      role="status"
      className="pointer-events-none fixed right-4 top-20 z-40 flex animate-in items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur fade-in slide-in-from-top-2 duration-300"
    >
      {Sprite ? (
        <Sprite size={40} />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          四蛙
        </span>
      )}
      <div>
        <p className="flex items-center gap-1.5 text-sm font-bold text-card-foreground">
          <Heart size={14} className={positive ? "fill-primary text-primary" : "text-muted-foreground"} />
          {isSelf
            ? `你对自己坦诚 ${deltaText}`
            : `${character?.displayName ?? "大家"} 对你的好感 ${deltaText}`}
        </p>
        {flash.tierLabel && (
          <p className="mt-0.5 text-xs font-bold text-primary">关系升级：{flash.tierLabel}</p>
        )}
      </div>
    </div>
  );
}
