import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Pin Turbopack's project root to this directory. Without this, Turbopack walks
  // up the tree for a lockfile, finds the stray package-lock.json in the user home
  // dir (C:\Users\sibop) — which is outside this Git repo — and emits:
  // "Next.js ignored package-lock.json ... outside the current Git repository".
  // The project uses bun (bun.lock), so we anchor the root explicitly here.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
