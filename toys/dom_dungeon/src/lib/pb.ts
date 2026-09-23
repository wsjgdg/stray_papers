// 路由基址：本地直跑 / 任意静态托管都从根路径 "/" 提供。
// 原 VibeX 子路径部署前缀（app-preview / p/app-<32hex>）与 PocketBase 代理逻辑已移除。
export function getBasename(): string {
  return "/"
}
