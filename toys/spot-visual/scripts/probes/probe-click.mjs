// probe2: enumerate nav candidates, real mouse click on VISIBLE button at 1440x900
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "http://127.0.0.1:3000";
const SC = "sharecode=N25J3RDNKG";

async function pickPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const l = await (await fetch("http://127.0.0.1:9355/json/list")).json();
      const p = l.find((t) => t.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error("NO PAGE");
}
const ws = new WebSocket(await pickPage());
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (me, p = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method: me, params: p }));
  return new Promise((r) => pending.set(mid, r));
};
await send("Page.enable");
await send("Runtime.enable");
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.error || r.result?.exceptionDetails) return "EVAL_ERR";
  return r.result?.result?.value;
};
const evUntil = async (expr, tries = 40, gap = 500) => {
  for (let i = 0; i < tries; i++) {
    const v = await ev(expr);
    if (v) return v;
    await sleep(gap);
  }
  return null;
};

// desktop viewport first
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/?" + SC });
await evUntil("document.querySelectorAll('main .grid > div').length");
await sleep(2000);

const cands = await ev("(function(){ return JSON.stringify([...document.querySelectorAll('button, a')].filter(x => x.textContent.includes('景点网络')).map((b, i) => { const r = b.getBoundingClientRect(); return { i, tag: b.tagName, rect: [r.x|0, r.y|0, r.width|0, r.height|0], vis: r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none' }; })); })()");
console.log("candidates:", cands);

// real mouse click on first visible candidate
const list = JSON.parse(String(cands || "[]"));
const vis = list.find((c) => c.vis);
if (!vis) {
  console.log("NO VISIBLE BUTTON");
  process.exit(1);
}
const [cx, cy] = [vis.rect[0] + vis.rect[2] / 2, vis.rect[1] + vis.rect[3] / 2];
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 });
console.log("clicked at", cx, cy);

const netState = await evUntil("(function(){ const t = document.body.innerText; const m = t.match(/(精选|全部) (\\d+) 个景点/); const canvas = document.querySelectorAll('canvas').length; return m && canvas > 0 ? JSON.stringify({ label: m[1], count: Number(m[2]), canvas }) : null; })()", 40, 1000);
console.log("network view after real click:", netState || "NOT RENDERED — active=" + String(await ev("document.querySelector('nav button.bg-emerald-50')?.textContent?.trim()")));
