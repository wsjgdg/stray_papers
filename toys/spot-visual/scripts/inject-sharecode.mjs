/**
 * 部署门禁补丁：给 Next 产物里的静态资源 URL 补上 ?sharecode=
 *
 * 背景：本应用托管在带访问口令的网关后面（EdgeOne + CloudStudio Gateway），
 * 网关对**所有**路径都校验 ?sharecode=，包括 /_next/static/*.js|css。
 * 而 Next 生成的 <script src> / <link href> / flight 数据里都是裸路径，
 * 浏览器发起这些子资源请求时不带 query → 403 → 水合失败 → 白屏。
 *
 * 所以在构建产物上做一次幂等改写，让首屏所有子资源都带上口令。
 * 客户端运行时自己发的 fetch（/geo/*.json、/api/*）由
 * src/lib/share-link.ts 的 withSharecode() 负责。
 *
 * 注意：改了 .next/server/app 下的 HTML 还不够 —— Next 16 真正被服务的页面快照
 * 在 .next/server/route-cache/APP_PAGE 下的同名 HTML，漏了它线上仍会白屏。
 *
 * 口令来源：SHARECODE 环境变量，或下面的默认值（与已发布应用的分享码一致）。
 */
import fs from 'node:fs';
import path from 'node:path';

const SHARECODE = process.env.SHARECODE || 'N25J3RDNKG';
// 需要改写的产物（都在 .next/server 下）：
//   *.html          预渲染页面
//   route-cache/APP_PAGE/**/*.html  Next 16 的 ISR 路由缓存快照（真正被服务的那份）
//   *.rsc / segments/*.rsc          flight 载荷，客户端 prefetch / 动态导入用
//   *-manifest*.js / *.json         客户端引用清单
// .next/static 下的 chunk 本身不含 chunk 路径，无需改。
const SERVER_ROOT = path.resolve('.next/server');
const REWRITABLE = new Set(['.html', '.rsc', '.js', '.json']);
// /_next/static/xxx.js|css ，且后面还没有 sharecode 参数
const URL_RE = /(\/_next\/static\/[\w./-]+\.(?:js|css))(\?sharecode=[\w-]+)?/g;

function walk(dir) {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (REWRITABLE.has(path.extname(entry.name)) && !entry.name.endsWith('.map')) {
      out.push(full);
    }
  }
  return out;
}

let files = 0;
let urls = 0;
for (const file of walk(SERVER_ROOT)) {
  const html = fs.readFileSync(file, 'utf8');
  const next = html.replace(URL_RE, (full, url, existing) => {
    if (existing) return full; // 幂等：已经带过口令
    urls += 1;
    return `${url}?sharecode=${SHARECODE}`;
  });
  if (next !== html) {
    fs.writeFileSync(file, next);
    files += 1;
  }
}

console.log(`[sharecode] 改写 ${files} 个文件，共 ${urls} 个静态资源 URL 附加口令`);
