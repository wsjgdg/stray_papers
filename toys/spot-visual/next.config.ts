import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev 与 prod 共用 .next 会互相覆盖：next dev 启动即重写产物清单，
  // 已启动的 next start / server.mjs 引用的 chunk 立刻 500（hydration 全灭）。
  // dev 侧用 NEXT_DIST=.next-dev 启动（见 dev 脚本），两套产物物理隔离。
  distDir: process.env.NEXT_DIST || ".next",
  // 类型检查从 next build 里拿出来，交给 npm run build 前置的 tsc --noEmit。
  // 原因：部署沙箱每次冷启动都要重新构建（上传的是源码，不含 .next），
  // next build 自带的那一遍 TS 检查约占 7s，把冷启动从 ~19s 推到 ~26s。
  // 本地 / CI 仍会跑 tsc（在 build 脚本里），门禁没丢。
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        // 年份命名的静态数据文件：1 小时缓存 + 后台重验证，
        // 重新部署（内容变化）最迟 1 小时后全量生效；HTML 由 server.mjs no-store 兜底
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
