/**
 * 自定义启动服务：在 Next 前面加一层响应头收口。
 *
 * 只做一件事 —— 把「文档类响应」的 Cache-Control 强制改成 no-store。
 *
 * 为什么必须这么做：
 *   部署网关（EdgeOne + CloudStudio Gateway）会严格遵循源站的 s-maxage，
 *   而 Next 给预渲染页面默认发 `Cache-Control: s-maxage=31536000`，
 *   于是 CDN 会把某个 URL 的 HTML 缓存**一年**。
 *   每次重新发布都会重新生成 chunk 哈希，老 HTML 指向的 chunk 不复存在
 *   → 子资源 403 → 页面白屏，且这一年的缓存无法从应用侧清除。
 *
 * 静态资源（/_next/static）保持 immutable 不变，只收口文档与数据。
 */
import { createServer } from 'node:http';
import next from 'next';

const port = Number(process.env.PORT || 3000);
const app = next({ dev: false, dir: process.cwd() });
const handle = app.getRequestHandler();

const ASSET_RE = /\.(?:js|mjs|css|json|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|txt)$/i;
const UNCACHEABLE = 'no-store, max-age=0, must-revalidate';

await app.prepare();

createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  const isDocument = !path.startsWith('/_next/static/') && !ASSET_RE.test(path);

  if (isDocument) {
    // Next 内部会 setHeader('Cache-Control', ...)，这里吞掉它，换成 no-store
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => {
      if (String(name).toLowerCase() === 'cache-control') return res;
      return setHeader(name, value);
    };
    setHeader('Cache-Control', UNCACHEABLE);
  }

  handle(req, res);
}).listen(port, '0.0.0.0', () => {
  console.log(`[server] ready on 0.0.0.0:${port}`);
});
