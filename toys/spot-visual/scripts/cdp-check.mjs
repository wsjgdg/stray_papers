/**
 * 轻量 CDP 验收器：起一个 headless Edge，导航到 URL，跑一段 JS，把结果打出来。
 *
 * 为什么不用 curl：本项目大量页面是客户端渲染（排行榜、拨盘、地图），
 * curl 只能拿到空壳 HTML，看不到真实数值。这个脚本用真浏览器 + 真 React。
 *
 * 用法：
 *   node scripts/cdp-check.mjs <url> "<js 表达式>" [--wait=2500] [--shot=out.png]
 *
 * 例：
 *   node scripts/cdp-check.mjs "http://localhost:3000/ptsi?sharecode=N25J3RDNKG" \
 *     "Array.from(document.querySelectorAll('[data-rank-row]')).map(e=>e.innerText)"
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const url = args[0];
const expr = args[1] || "document.title";
const opt = Object.fromEntries(
  args
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "1"];
    }),
);
const waitMs = Number(opt.wait || 2500);

const EDGE_PATHS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const exe = EDGE_PATHS.find((p) => fs.existsSync(p));
if (!exe) throw new Error("找不到 msedge.exe");

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdp-"));
const port = 9333;
const child = spawn(
  exe,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--enable-unsafe-swiftshader",
    "--window-size=1280,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(200);
  }
  throw new Error("CDP 未就绪");
}

const ws = new WebSocket(await targetWs());
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url });
  await sleep(waitMs);
  const r = await send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    console.error("EVAL_ERROR:", JSON.stringify(r.exceptionDetails, null, 1));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(r.result.value, null, 1));
  }
  if (opt.shot) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(opt.shot, Buffer.from(shot.data, "base64"));
    console.error("screenshot:", opt.shot);
  }
} finally {
  ws.close();
  child.kill();
  await sleep(300);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
