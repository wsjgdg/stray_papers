// probe4: script/chunk loading + nextjs-portal shadow errors
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
const bad4xx = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400) {
    bad4xx.push(m.params.response.status + " " + m.params.response.url.slice(0, 120));
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (me, p = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method: me, params: p }));
  return new Promise((r) => pending.set(mid, r));
};
await send("Page.enable");
await send("Network.enable");
await send("Runtime.enable");
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.error || r.result?.exceptionDetails) return "EVAL_ERR:" + JSON.stringify(r.result?.exceptionDetails || r.error).slice(0, 300);
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

const out = { base: BASE };
out.bad4xx = bad4xx.slice(0, 10);
out.scripts = await ev("(function(){ const s = [...document.querySelectorAll('script')]; return JSON.stringify({ total: s.length, withSrc: s.filter(x => x.src).length, sample: s.filter(x => x.src).slice(0, 5).map(x => x.src.split('/').pop().slice(0, 60)) }); })()");
out.fiberKeys = await ev("(function(){ const all = document.querySelectorAll('*'); let withFiber = 0; for (let i = 0; i < Math.min(all.length, 500); i++) { if (Object.keys(all[i]).some(k => k.startsWith('__reactFiber'))) { withFiber++; break; } } return withFiber; })()");
out.portalShadow = await ev("(function(){ const p = document.querySelector('nextjs-portal'); if (!p || !p.shadowRoot) return 'no-portal-shadow'; const t = p.shadowRoot.textContent || ''; return t.slice(0, 500) || 'empty'; })()");
out.readyState = await ev("document.readyState");
console.log(JSON.stringify(out, null, 2));
