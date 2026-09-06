import path from "node:path";
import type { NextConfig } from "next";

// Pin the project root explicitly. Left to itself, Next walks up from cwd to
// find a lockfile and treats that directory as the workspace root. A stray
// package-lock.json higher up the tree (e.g. in the user's home folder) makes
// it pick the wrong root, which sends the standalone output to
// .next/standalone/<junk-path>/server.js instead of .next/standalone/server.js
// and breaks both the `build` copy step and the `start` script.
const projectRoot = path.join(process.cwd());

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
