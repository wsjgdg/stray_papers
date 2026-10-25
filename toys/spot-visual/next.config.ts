import type { NextConfig } from "next";


const nextConfig: NextConfig = {
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