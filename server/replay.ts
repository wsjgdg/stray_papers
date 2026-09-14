// B4：请求重放 —— 用内存日志里存档的 method/path/body 经代理原路重发，结果与原始记录并排返回。
// 抽成独立模块（不依赖 index.ts）以便单测；proxyRequest 可注入，测试无需真启服务。
//
// 安全约束：
// - 请求体仅内存持有（metrics.reqBody），落盘 ndjson 前被剥离，因此历史日志不可重放；
// - 重放不携带任何原始鉴权头，一律使用「当前配置」里的 Key，避免重放泄漏旧凭据；
// - 响应体截断返回（默认 20KB），前端只做预览。
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { CallLog } from './metrics.js';
import { proxyRequest } from './proxy.js';

/** 重放响应体返回上限（字符）。超出截断并置 truncated=true */
export const REPLAY_MAX_BODY = 20_000;

/**
 * 重放用的最小 Response 捕获器 —— proxyRequest 只依赖 status/set/getHeader/json/send
 * 与少量流式 API；重放强制非流式，故流式分支不会被触发。
 */
export function makeCaptureResponse(): {
  res: Record<string, unknown>;
  result: () => { status: number; headers: Record<string, string>; body: string };
} {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = '';
  const res: Record<string, unknown> = {
    headersSent: false,
    destroyed: false,
    writableEnded: false,
    getHeader: (k: string) => headers[String(k).toLowerCase()],
    set: (k: string, v: unknown) => {
      headers[String(k).toLowerCase()] = String(v);
      return res;
    },
    status: (c: number) => {
      statusCode = c;
      return res;
    },
    json: (o: unknown) => {
      body = JSON.stringify(o);
      res['headersSent'] = true;
      res['writableEnded'] = true;
      return res;
    },
    send: (b: unknown) => {
      body = Buffer.isBuffer(b) ? b.toString('utf8') : String(b);
      res['headersSent'] = true;
      res['writableEnded'] = true;
      return res;
    },
    write: (c: unknown) => {
      body += Buffer.isBuffer(c) ? c.toString('utf8') : String(c);
      return true;
    },
    end: () => {
      res['writableEnded'] = true;
      return res;
    },
    writeHead: () => res,
    flushHeaders: () => undefined,
    on: () => res,
    once: () => res,
    off: () => res,
    removeListener: () => res,
  };
  return { res, result: () => ({ status: statusCode, headers, body }) };
}

export interface ReplayOriginal {
  status: number | null;
  latencyMs: number;
  costUsd: number;
  model: string;
  tag: string | null;
}

export interface ReplayDraft {
  status: number;
  latencyMs: number;
  cache: string | null;
  body: string;
  truncated: boolean;
}

export type ReplayOutcome =
  | { ok: true; original: ReplayOriginal; replay: ReplayDraft }
  | { ok: false; status: number; error: string };

/** 注入点：默认走真实代理；测试可传入桩函数 */
export type SendFn = (
  req: unknown,
  res: unknown,
  providerId: string,
  wildcard: string,
  search: string,
  opts: { requestId: string; chain?: boolean },
) => Promise<unknown>;

/**
 * 重放一条调用日志。
 * - log 为 null（requestId 不存在/已被环形缓冲淘汰）→ 404
 * - 无请求体存档（GET / 超大 / 历史落盘）→ 400
 * - 存档非法 JSON → 400
 * - 发送抛错 → 502
 */
export async function replayCall(
  log: CallLog | null,
  send: SendFn = proxyRequest as unknown as SendFn,
): Promise<ReplayOutcome> {
  if (!log) {
    return {
      ok: false,
      status: 404,
      error: '未找到该 requestId 对应的调用日志（可能已被环形缓冲淘汰）',
    };
  }
  if (!log.reqBody) {
    return {
      ok: false,
      status: 400,
      error: '该调用没有可用的请求体存档（GET 请求、超大请求或历史/落盘日志不可重放）',
    };
  }
  let body: unknown;
  try {
    body = JSON.parse(log.reqBody);
  } catch {
    return { ok: false, status: 400, error: '存档请求体不是合法 JSON，无法重放' };
  }
  // 强制非流式：重放用于对比结果，流式会引入 SSE 处理复杂度
  if (body && typeof body === 'object' && 'stream' in (body as Record<string, unknown>)) {
    (body as Record<string, unknown>).stream = false;
  }
  const capture = makeCaptureResponse();
  const fakeReq = {
    method: log.method,
    headers: {} as Record<string, unknown>,
    body,
    url: log.path || '/',
  };
  const wildcard = (log.path || '').replace(/^\//, '');
  const t0 = Date.now();
  try {
    await send(fakeReq, capture.res, log.provider, wildcard, '', { requestId: randomUUID() });
  } catch (e) {
    return { ok: false, status: 502, error: `重放失败: ${(e as Error).message}` };
  }
  const out = capture.result();
  const overLimit = out.body.length > REPLAY_MAX_BODY;
  return {
    ok: true,
    original: {
      status: log.status,
      latencyMs: log.latencyMs,
      costUsd: log.costUsd,
      model: log.model,
      tag: log.tag ?? null,
    },
    replay: {
      status: out.status,
      latencyMs: Date.now() - t0,
      cache: out.headers['x-cache'] ?? null,
      // 响应体可能很大：截断返回，前端只做预览
      body: overLimit ? `${out.body.slice(0, REPLAY_MAX_BODY)}\n…（已截断）` : out.body,
      truncated: overLimit,
    },
  };
}

/** 便于 index.ts 直接挂成 Express handler 时复用类型 */
export type ReplayReq = Request;
export type ReplayRes = Response;
