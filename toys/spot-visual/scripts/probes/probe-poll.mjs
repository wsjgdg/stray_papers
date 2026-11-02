// probe10: poll activeView after real click — flip+revert vs never-flip
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.env.BASE || "http://127.0.0.1:3100";
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
  if (m.method === "Runtime.exceptionThrown") errs.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text).slice(0, 200));
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
  if (r.error || r.result?.exceptionDetails) return "EVAL_ERR:" + JSON.stringify(r.result?.exceptionDetails || r.error).slice(0, 200);
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
await sleep(3000);

// instrument: localStorage probe + click via real DOM dispatch, poll active button every 150ms
const timeline = await ev("(function(){ return new Promise((res) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('景点网络') && x.getBoundingClientRect().width > 0); if (!b) { res('NO_BTN'); return; } const samples = []; const t0 = performance.now(); const iv = setInterval(() => { const act = document.querySelector('button.bg-emerald-50'); samples.push(Math.round(performance.now() - t0) + ':' + (act ? act.textContent.trim().slice(0, 6) : 'none')); if (performance.now() - t0 > 3000) { clearInterval(iv); res(JSON.stringify(samples)); } }, 150); b.click(); }); })()");
console.log("timeline:", timeline);
console.log("exceptions:", errs.slice(0, 5));
const ls = await ev("(function(){ try { const n = localStorage.length; let total = 0; for (let i = 0; i < n; i++) { const k = localStorage.key(i); total += (localStorage.getItem(k) || '').length; } return JSON.stringify({ keys: n, totalChars: total }); } catch (e) { return 'LS_ERR: ' + String(e).slice(0, 100); } })()");
console.log("localStorage:", ls);
const net = await ev("(function(){ const t = document.body.innerText; return JSON.stringify({ hasNetCount: /(精选|全部) \\d+ 个景点/.test(t), active: (document.querySelector('button.bg-emerald-50') || {}).textContent }); })()");
console.log("final:", net);
