/* serve.mjs — 开发/预览用静态服务器（零依赖，只用 node 内建）。
 *
 * 为什么不用 `python3 -m http.server`：
 *   ① 它**不发 Cache-Control**，只给 Last-Modified ⟹ 浏览器按「10% 生命期」做启发式缓存，
 *      改完代码普通刷新经常还在跑旧 ES 模块（本页是 `type="module"`，模块缓存尤其顽固）；
 *   ② 它**没有热重载**，每次都要手动刷新；
 *   ③ 它默认绑 127.0.0.1（预览环境要求 0.0.0.0）。
 *
 * 本服务器：
 *   - 所有响应 `Cache-Control: no-store`（永远拿最新文件，不可能再看到旧模块）；
 *   - HTML 响应里注入 8 行热重载客户端（连 `/__reload` 的 SSE），文件一改就自动刷新；
 *   - `--bind 0.0.0.0` 默认；端口取 `PORT` 或 `--port`，缺省 8765；
 *   - 只读、防目录穿越；MIME 表覆盖 .mjs/.js/.css/.html/.json/.svg/.wasm。
 *
 * 用法：node scripts/serve.mjs [--port 8765] [--bind 0.0.0.0] [--no-reload]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const PORT = Number(argOf('port', process.env.PORT || 8765));
const BIND = argOf('bind', '0.0.0.0');
const RELOAD = !argv.includes('--no-reload');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/* 注入的构建横幅 + 热重载客户端。
   横幅存在的意义：它由**服务器**注入，所以只要它出现，就证明「这份 HTML 是新取到的」；
   如果用户看不到它，那就是 HTML 被缓存了（而不是功能没写）。 */
const buildStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const BUILD_BANNER = (stamp) => `
<div id="__serveBuild" data-build="${stamp}" style="position:fixed;right:10px;bottom:10px;z-index:99999;
  font:10.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#67e8f9;background:rgba(4,8,16,.72);
  border:1px solid rgba(103,232,249,.35);border-radius:6px;padding:3px 7px;pointer-events:none;
  letter-spacing:.04em">serve.mjs · ${stamp} · no-store</div>
<script>window.__serveBuild = ${JSON.stringify(stamp)};</script>`;

/* 注入的热重载客户端：SSE 断了会自己退避重连（EventSource 内建） */
const RELOAD_CLIENT = `
<script>
(() => {
  if (location.protocol === 'file:' || window.__hotReload) return;
  window.__hotReload = true;
  const es = new EventSource('/__reload');
  es.onmessage = () => location.reload();   /* 服务端已去抖，一次改动 = 一次刷新 */
  es.onerror = () => {};                     /* 断了 EventSource 会自己重连 */
})();
</script>`;

const clients = new Set();
const broadcast = () => {
  for (const res of clients){ try { res.write('data: reload\n\n'); } catch (_){ clients.delete(res); } }
};

if (RELOAD){
  let timer = null;
  const ping = () => { clearTimeout(timer); timer = setTimeout(broadcast, 120); };
  try {
    fs.watch(ROOT, { recursive: true }, (ev, file) => {
      if (!file) return;
      const f = String(file);
      /* 忽略构建产物写盘的抖动与 node_modules：只对源码/页面改动触发 */
      if (f.includes('node_modules') || f.includes('.git') || f.endsWith('~')) return;
      ping();                                 /* dist/ 重建也算改动：单文件版也要自动刷新 */
    });
  } catch (e){
    console.error('[serve] 热重载不可用（fs.watch recursive 失败）：' + e.message);
  }
}

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    ...headers,
  });
  res.end(body);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (url.pathname === '/__reload'){
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 500\n\n');
    clients.add(res);
    const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch (_){} }, 15000);
    req.on('close', () => { clearInterval(ka); clients.delete(res); });
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let abs = path.resolve(ROOT, '.' + rel);
  if (!abs.startsWith(ROOT)) return send(res, 403, 'forbidden');

  let st = null;
  try { st = fs.statSync(abs); } catch (_){ st = null; }
  if (st && st.isDirectory()){ abs = path.join(abs, 'index.html'); try { st = fs.statSync(abs); } catch (_){ st = null; } }
  if (!st || !st.isFile()) return send(res, 404, 'not found: ' + rel);

  const ext = path.extname(abs).toLowerCase();
  /* 请求日志：判断「用户浏览器到底取到了什么」的唯一硬证据 */
  if (ext === '.html' || ext === '.js' || ext === '.mjs' || ext === '.json'){
    const who = req.socket.remoteAddress || '-';
    const ua = String(req.headers['user-agent'] || '').slice(0, 24);
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${who} ${rel} ${ua}`);
  }
  const type = MIME[ext] || 'application/octet-stream';
  if (ext === '.html'){
    let html = fs.readFileSync(abs, 'utf8');
    const stamp = buildStamp();
    const inject = BUILD_BANNER(stamp) + (RELOAD ? RELOAD_CLIENT : '');
    html = html.includes('</body>')
      ? html.replace('</body>', inject + '\n</body>')
      : html + inject;
    return send(res, 200, html, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(html) });
  }
  const buf = fs.readFileSync(abs);
  return send(res, 200, buf, { 'Content-Type': type, 'Content-Length': buf.length });
});

server.listen(PORT, BIND, () => {
  console.log(`[serve] http://${BIND}:${PORT}/  root=${ROOT}`);
  console.log(`[serve] Cache-Control: no-store（不会再有旧模块）· 热重载 ${RELOAD ? '开' : '关'}`);
});
