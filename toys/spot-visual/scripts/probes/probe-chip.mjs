// probe3: is ANY onClick working? chip toggle test + react root check
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.env.BASE || "http://127.0.0.1:3000";
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
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
    errs.push(m.params.type + ": " + m.params.args?.map((a) => a.value || a.description).join(" ").slice(0, 180));
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

await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/?" + SC });
await evUntil("document.querySelectorAll('main .grid > div').length");
await sleep(2000);

const out = {};
out.chipBefore = await ev("(function(){ const c = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('自然风光')); if (!c) return 'NO_CHIP'; return JSON.stringify({ cls: c.className.slice(0, 80), rect: (() => { const r = c.getBoundingClientRect(); return [r.x|0, r.y|0, r.width|0, r.height|0]; })() }); })()");

// real mouse click on the chip
const chip = JSON.parse(String(out.chipBefore || "{}").startsWith("NO") ? "{}" : out.chipBefore);
if (chip.rect) {
  const [cx, cy] = [chip.rect[0] + chip.rect[2] / 2, chip.rect[1] + chip.rect[3] / 2];
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 });
  await sleep(1500);
  out.chipAfter = await ev("(function(){ const c = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('自然风光')); return c ? c.className.slice(0, 80) : 'GONE'; })()");
  out.cardDelta = await ev("document.querySelectorAll('main .grid > div').length");
}
out.reactRoot = await ev("(function(){ const el = document.querySelector('body > div'); const keys = Object.keys(el || {}); return JSON.stringify({ divKeys: keys.filter(k => k.startsWith('__react') || k.startsWith('_react')).length, hasNext: !!window.next }); })()");
out.errors = errs.slice(0, 6);
console.log(JSON.stringify(out, null, 2));
