// A1：本地来源校验（防跨站调用本机 API）。
// 背景：任意网页都能向 127.0.0.1:<port> 发请求，其中「简单请求」（GET、text/plain POST）
// 不受 CORS 预检限制，可命中本机接口；配合已存储的代理令牌存在组合利用面。
//
// 策略（保守，优先不破坏零配置体验）：
//  1. 不带 Origin（curl / 第三方 SDK / Prometheus 抓取 / Electron 内 fetch）→ 放行；
//  2. Sec-Fetch-Site: same-origin → 放行（就是自己）；
//  3. Origin 为 file:// 等 opaque（"null"）→ 放行（Electron 打包态）；
//  4. Origin 主机是回环地址（127.0.0.1 / localhost / ::1）→ 放行（开发态 5173 反代、Electron 主窗均属此类）；
//  5. ALLOWED_ORIGINS（逗号分隔）显式追加 → 放行；
//  6. 其余 → 403 并记录。
//
// 只挡「外部站点」这一最大面；同机不同端口之间不做细分，因为浏览器不允许页面伪造 Origin。
import type { NextFunction, Request, Response } from 'express';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function extraOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true; // 非浏览器客户端：无 Origin
  if (origin === 'null') return true; // file:// / opaque origin
  if (extraOrigins().includes(origin)) return true;
  try {
    return LOOPBACK_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false; // 解析不了的 Origin 一律拒绝
  }
}

export function guardLocalOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin as string | undefined;
  if (!origin || req.headers['sec-fetch-site'] === 'same-origin') {
    next();
    return;
  }
  if (isAllowedOrigin(origin)) {
    next();
    return;
  }
  res.status(403).json({
    error: `拒绝跨站请求：Origin ${origin} 不在白名单（可用 ALLOWED_ORIGINS 追加）`,
  });
}
