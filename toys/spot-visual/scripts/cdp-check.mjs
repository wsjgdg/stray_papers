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
const logs = [];
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.method === "Runtime.exceptionThrown") {
    logs.push("EXCEPTION: " + (msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text));
  }
  if (msg.method === "Runtime.consoleAPICalled" && opt.log) {
    logs.push(
      "CONSOLE " + msg.params.type + ": " +
        (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "),
    );
  }
  if (msg.method === "Page.javascriptDialogOpening") {
    logs.push("DIALOG: " + (msg.params?.message || ""));
    // alert/confirm 不处理会阻塞渲染进程，后面的求值全部超时
    send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  }
  if (msg.method === "Network.loadingFailed" && opt.net) {
    logs.push(
      "NET_FAIL " + msg.params?.type + " " + (msg.params?.errorText || ""),
    );
  }
  if (msg.method === "Network.responseReceived" && opt.net) {
    const r = msg.params?.response;
    if (r && r.status >= 400) logs.push("HTTP " + r.status + " " + r.url);
  }
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
  if (opt.net) await send("Network.enable");
  // --geo=lat,lng[,accuracy] → 模拟 GPS，用来验收「定位」这种必须真定位的交互
  if (opt.geo) {
    const [latitude, longitude, accuracy = 30] = opt.geo
      .split(",")
      .map(Number);
    await send("Emulation.setGeolocationOverride", {
      latitude,
      longitude,
      accuracy,
    });
    await send("Browser.grantPermissions", {
      origin: new URL(url).origin,
      permissions: ["geolocation"],
    });
    // 顺手把权限写成「允许」，否则 Chromium 默认 prompt 会直接走 error 回调
    await send("Browser.setPermission", {
      origin: new URL(url).origin,
      permission: { name: "geolocation" },
      setting: "granted",
    }).catch(() => {});
  }
  await send("Page.navigate", { url });
  await sleep(waitMs);

  // --click=<按钮文字前缀>：用 CDP 派发**可信**鼠标事件。
  // 为什么不用 el.click()：程序化 click 在未水合时会静默失败，容易误判。
  // 注意：dev 模式（next dev + Turbopack）在无头 Edge 里**不会完成水合**，
  // 必须对生产构建（server.mjs / npm run preview）做交互验收。
  const doClick = async (text, byLabel = false) => {
    const sel = byLabel
      ? `document.querySelector('[aria-label=${JSON.stringify(text)}]')`
      : `[...document.querySelectorAll('button,a,[role=button]')].find(b=>(b.textContent||'').trim().startsWith(${JSON.stringify(text)}))`;
    const pos = await send("Runtime.evaluate", {
      expression: `(()=>{const el=${sel};if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
      returnByValue: true,
    });
    const p = pos.result.value;
    if (!p) throw new Error("找不到要点击的元素: " + text);
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        x: p.x,
        y: p.y,
        button: "left",
        clickCount: 1,
      });
    }
    await sleep(Number(opt.after || 1200));
  };

  if (opt.click) await doClick(opt.click);
  if (opt["click-label"]) await doClick(opt["click-label"], true);

  // --focus=<placeholder 片段> + --insert=<文本>：给搜索框输入（点开候选用）
  if (opt.focus) {
    const focused = await send("Runtime.evaluate", {
      expression: `(()=>{const el=[...document.querySelectorAll('input')].find(i=>(i.placeholder||'').includes(${JSON.stringify(opt.focus)}));if(!el)return false;el.focus();return true;})()`,
      returnByValue: true,
    });
    if (!focused.result.value)
      throw new Error("找不到输入框: " + opt.focus);
    if (opt.insert) {
      await send("Input.insertText", { text: opt.insert });
      await sleep(Number(opt.after || 1200));
    }
  }

  if (opt.click2) await doClick(opt.click2);
  if (opt.click3) await doClick(opt.click3);
  // --reload=毫秒：点完之后刷新一次，用来验证「状态是否被错误持久化」
  // （localStorage 在同一个 user-data-dir 里是保留的，等价于「用户下次打开」）
  if (opt.reload) {
    await send("Page.reload", { ignoreCache: false });
    await sleep(Number(opt.reload));
  }
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
  if (logs.length) console.error("--- page logs ---\n" + logs.join("\n"));
} finally {
  ws.close();
  child.kill();
  await sleep(300);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
