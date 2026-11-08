/**
 * 部署基路径（basename）—— 全站唯一的路径前缀来源。
 *
 * 之前这个文件叫 pb.ts，负责 VibeX 子路径（/app-preview/app-<32hex>/、/p/app-<32hex>/）
 * 与 PocketBase 代理的推导。本地化改造后平台层已全部移除，只保留 basename 这一件正事，
 * 并改为读 Vite 的 `import.meta.env.BASE_URL`：
 *
 * - dev / 根路径部署 → BASE_URL 为 "/"，basename 为 "/"
 * - 构建时 `vite build --base=/foo/` → BASE_URL 为 "/foo/"，basename 为 "/foo"
 *
 * 消费者：<BrowserRouter basename> 与 Service Worker 注册路径（src/App.tsx）。
 */

/** 归一成 React Router 要的 basename：以 "/" 开头、不以 "/" 结尾（根路径为 "/"） */
export function getBasename(): string {
  const base = import.meta.env.BASE_URL || "/"
  if (!base.startsWith("/")) return "/"
  const trimmed = base.replace(/\/+$/, "")
  return trimmed === "" ? "/" : trimmed
}

/** 带前缀的站内绝对路径：getBasename() + "/map" → "/map" 或 "/foo/map" */
export function withBasename(path: string): string {
  const base = getBasename()
  const suffix = path.startsWith("/") ? path : `/${path}`
  return base === "/" ? suffix : `${base}${suffix}`
}
