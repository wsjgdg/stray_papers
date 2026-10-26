import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
