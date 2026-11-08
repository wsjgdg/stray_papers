/**
 * 本地预览启动器：用**生产同款**入口（server.mjs，经 start-prod 判新旧）在 3100 端口起服务。
 *
 * 为什么不直接 `next start`：线上是 `npm start` → start-prod → server.mjs，
 * 它会接管 HTML 响应（no-store）并处理静态资源；直接 next start 出来的页面脚本标签
 * 与线上不一致，本地点不动（hydration 不生效），拿它验收会得出错误结论。
 *
 * 用法：npm run preview   → http://localhost:3100
 * 前提：已有构建（npm run build:deploy）。源码变了请先重跑构建，或直接用 npm run dev:iso 热更新。
 */
process.env.PORT = process.env.PORT || "3100";
// 严格模式：源码与构建戳不一致时**重新构建**，而不是拿旧预构建包糊弄自己
// （预览看到旧代码，比看不到更糟）。首次会慢 ~3 分钟，之后命中构建戳就是秒开。
process.env.PREBUILT_STRICT = process.env.PREBUILT_STRICT || "1";
await import("./start-prod.mjs");
