import type { useHome } from "@/pages/Home/useHome";

export function StageCanvas(p: ReturnType<typeof useHome>) {
  return (
    <canvas
      ref={p.canvasRef}
      role="img"
      aria-label="演奏画布：移动鼠标按当前音阶发出音高与光带粒子"
      className="absolute inset-0 block h-full w-full touch-none"
    />
  );
}
