/**
 * 结局图鉴 · CG 画集区块（批次 B2）
 * 九张定格画面的收集册：未解锁给剪影 + 出处提示（哪条线），解锁后缩略画面 + 标题，
 * 点开全屏回看；进度 n/M 挂在标题旁。数据来自 CG_SCENES 注册表 + 存档里的 seenCg
 * （跨周目保留），解锁判断只读、不写存档、不解锁任何数值。
 */
import { useEffect, useMemo, useState } from "react";
import { Camera, Lock, X } from "lucide-react";
import { CgArt } from "@/components/play/CgArt";
import { CG_SCENES, cgSceneById, CG_SCENE_TOTAL, type CgSceneMeta } from "@/data/cg";
import { storylineById } from "@/data/storylines";
import { getCgSeen } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

/** 全屏回看：点缩略图打开，Esc / 关闭按钮 / 遮罩点击收起（内部展示态，不碰存档） */
function CgViewDialog({ scene, onClose }: { scene: CgSceneMeta; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-foreground/85 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div className="mx-auto flex min-h-full max-w-4xl items-start justify-center">
      <div
        className="nw-cg-in my-auto relative w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="aspect-[16/9] w-full">
          <CgArt id={scene.id} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border p-5">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-card-foreground">{scene.title}</h3>
            <RichText className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground" text={scene.subtitle} />
            <p className="mt-2 text-xs font-bold text-primary">
              出处 ·《{storylineById(scene.lineId)?.title ?? "未知"}》
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="收起这一页定格"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-colors duration-200 hover:bg-muted hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
          >
            <X size={15} aria-hidden />
            收起
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

export function CgGallerySection() {
  /** 存档里已展开过的 CG id（跨周目保留；挂载时读一次，图鉴页内没有 CG 触发点） */
  const [seenIds] = useState<string[]>(() => getCgSeen());
  const [openCgId, setOpenCgId] = useState<string | null>(null);

  const seenSet = useMemo(() => new Set(seenIds), [seenIds]);
  const collectedCount = CG_SCENES.filter((scene) => seenSet.has(scene.id)).length;
  const openScene = openCgId ? (cgSceneById(openCgId) ?? null) : null;

  return (
    <section
      aria-label="CG 画集"
      className="anim-fade-up rounded-3xl border border-border bg-card p-6 shadow-md md:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black tracking-tight text-card-foreground">
            <Camera size={18} className="text-primary" aria-hidden />
            CG 画集
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            剧情走到某个瞬间，会有一张定格拍下来。展开过才进画集；没展开的只留一个剪影和出处。
          </p>
        </div>
        <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
          {collectedCount}/{CG_SCENE_TOTAL}
        </span>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CG_SCENES.map((scene) => {
          const seen = seenSet.has(scene.id);
          const lineTitle = storylineById(scene.lineId)?.title ?? "未知";
          if (!seen) {
            return (
              <div
                key={scene.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-dashed border-border bg-background/60"
              >
                <div className="relative aspect-[16/9] w-full">
                  <CgArt id={scene.id} dim />
                  <div className="absolute inset-0 flex items-center justify-center bg-foreground/30">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-xs font-bold text-muted-foreground shadow-sm">
                      <Lock size={12} aria-hidden />
                      还没展开过
                    </span>
                  </div>
                </div>
                <div className="flex min-h-24 flex-1 flex-col gap-1 p-4">
                  <p className="text-sm font-bold text-muted-foreground">？？？？</p>
                  <p className="mt-auto text-xs font-bold text-muted-foreground/80">
                    出处 ·《{lineTitle}》
                  </p>
                </div>
              </div>
            );
          }
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => setOpenCgId(scene.id)}
              aria-label={`回看定格「${scene.title}」`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-background/70 text-left shadow-sm transition-all duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden">
                <CgArt id={scene.id} className="transition-transform duration-200 group-hover:scale-[1.03]" />
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-1 p-4">
                <RichText className="text-sm font-bold text-card-foreground" text={scene.title} />
                {/* 字幕（批次 CY-131）：那张定格的一行注脚——点开前就有，藏在图鉴里也读得下去 */}
                <RichText
                  className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/90"
                  text={scene.subtitle}
                />
                <p className="text-xs font-bold text-primary">
                  出处 ·《{lineTitle}》
                </p>
                <p className="mt-auto pt-1 text-xs text-muted-foreground group-hover:text-foreground">
                  点开全屏回看
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        定格都存在本地档案里：重开一学期也不会收回。第一次走到那句话，画面才会拍下来。
      </p>

      {openScene && <CgViewDialog scene={openScene} onClose={() => setOpenCgId(null)} />}
    </section>
  );
}
