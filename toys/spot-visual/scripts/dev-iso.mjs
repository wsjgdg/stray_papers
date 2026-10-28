#!/usr/bin/env node
/**
 * 隔离 distDir 的 dev 启动器：NEXT_DIST=.next-dev next dev -p 3000
 *
 * 为什么存在：next dev 与 next start / server.mjs 共用 .next 时，
 * dev 一启动就重写产物清单，正在运行的生产服务引用的 chunk 全部 500，
 * 页面 hydration 静默死亡（无报错、SSR 正常、点击无反应）。
 * 此前 2026-10-28 的「侧栏点击无反应」事故即此根因。
 */
import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const child = spawn("npx", ["next", "dev", "-p", "3000"], {
  stdio: "inherit",
  shell: isWin,
  env: { ...process.env, NEXT_DIST: ".next-dev" },
});
child.on("exit", (code) => process.exit(code ?? 0));
