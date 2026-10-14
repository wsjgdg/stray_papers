import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Pin Turbopack's project root to this directory so it doesn't walk upward and
  // pick up a stray package-lock.json in the user's home dir
  // (e.g. C:\Users\sibop\package-lock.json), which triggers:
  //   "Next.js ignored package-lock.json in C:\Users\sibop because it is outside
  //    the current Git repository".
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
