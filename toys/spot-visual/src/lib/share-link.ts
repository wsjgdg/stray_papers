// ════════════════════════════════════════════════════════════════════════
// 部署环境（WorkBuddy 应用网关）会对**所有路径**校验 ?sharecode=
// —— 包括 /_next/static/*、/geo/*.json、/api/* —— 缺失即返回 403。
// 因此前端在运行时发起的同源 fetch 必须把当前页面的 sharecode 带上，
// 否则线上会出现「页面能打开、接口与静态数据全 403」的静默失败
// （表现为地图下钻失败、实时搜索回退到内置数据）。
//
// 用法：fetch(withSharecode(`/geo/${adcode}.json`))
// ════════════════════════════════════════════════════════════════════════

/** 把当前页面的 sharecode 透传到同源请求；本地开发无该参数时原样返回 */
export function withSharecode(url: string): string {
  if (typeof window === 'undefined') return url;
  const sc = new URLSearchParams(window.location.search).get('sharecode');
  if (!sc) return url;
  const u = new URL(url, window.location.origin);
  u.searchParams.set('sharecode', sc);
  return `${u.pathname}${u.search}`;
}
