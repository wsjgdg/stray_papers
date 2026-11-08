import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  // Next 16 blocks cross-origin HMR by default. A local-first tool is often
  // opened via 127.0.0.1, localhost, or a LAN IP, so allow all of them —
  // otherwise the dev client runtime silently fails to attach and clicks do
  // nothing (the production build is unaffected).
  allowedDevOrigins: ["localhost", "127.0.0.1", "0.0.0.0", ".local"],
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
