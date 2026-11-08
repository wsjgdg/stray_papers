const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 可选代理：设置 HTTP_PROXY / HTTPS_PROXY 时，所有 fetch 经代理（pkg 内置网络层不自动继承系统代理）
// Node18+ 把 undici 暴露为 global（globalThis.ProxyAgent / setGlobalDispatcher），无需 require
(function setupProxy() {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!proxy) return;
  try {
    const GA = globalThis as {
      ProxyAgent?: new (p: string) => unknown;
      setGlobalDispatcher?: (d: unknown) => void;
    };
    if (GA.ProxyAgent && GA.setGlobalDispatcher) {
      GA.setGlobalDispatcher(new GA.ProxyAgent(proxy));
    }
  } catch {
    /* 无代理则忽略，保持直连 */
  }
})();

export interface FetchResult {
  text: string;
  status: number;
  latencyMs: number;
}

export async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<FetchResult> {
  const { timeoutMs = 20000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(rest.headers || {}),
      },
      redirect: 'follow',
    });
    const text = await res.text();
    return { text, status: res.status, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { text, status } = await fetchText(url, init);
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
  return JSON.parse(text) as T;
}

export function perMillion(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n * 1_000_000;
}
