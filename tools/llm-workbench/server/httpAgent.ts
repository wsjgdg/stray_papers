// B6：上游连接复用 —— 每厂商独立 undici Agent，开启 keep-alive 并限制单厂商并发连接数。
// 默认即优于「每次请求新建连接」：TLS/握手开销被摊薄，利于多 key 轮询与高并发转发。
// 调优（仅进程启动生效）：
//   PROXY_KEEPALIVE_MS —— keep-alive 复用窗口（默认 10000ms）
//   PROXY_MAX_SOCKETS  —— 单厂商最大并发 socket（默认 64）
import { Agent } from 'undici';

const KEEP_ALIVE_TIMEOUT = Number(process.env.PROXY_KEEPALIVE_MS ?? 10_000);
const MAX_SOCKETS = Number(process.env.PROXY_MAX_SOCKETS ?? 64);

const agents = new Map<string, Agent>();

/** 取（惰性创建并缓存）某厂商专用的连接池 dispatcher */
export function getDispatcher(providerId: string): Agent {
  let a = agents.get(providerId);
  if (!a) {
    a = new Agent({
      keepAliveTimeout: Number.isFinite(KEEP_ALIVE_TIMEOUT) ? KEEP_ALIVE_TIMEOUT : 10_000,
      connections: Number.isFinite(MAX_SOCKETS) && MAX_SOCKETS > 0 ? MAX_SOCKETS : 64,
      // 不在 Agent 层设过短 bodyTimeout：长流式响应由 proxy 自身的 AbortController(signal) 控制
    });
    agents.set(providerId, a);
  }
  return a;
}
