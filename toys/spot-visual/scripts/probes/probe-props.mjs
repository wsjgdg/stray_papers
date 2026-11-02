// probe7: inspect reactProps.onClick; call it directly; observe store effect
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
await sleep(2000);

const out = {};
out.propsInfo = await ev("(function(){ const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('景点网络') && x.getBoundingClientRect().width > 0); const pk = Object.keys(b).find(k => k.startsWith('__reactProps')); if (!pk) return 'NO_PROPS'; const p = b[pk]; return JSON.stringify({ hasOnClick: typeof p.onClick, propKeys: Object.keys(p) }); })()");
out.directCall = await ev("(function(){ const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('景点网络') && x.getBoundingClientRect().width > 0); const pk = Object.keys(b).find(k => k.startsWith('__reactProps')); if (!pk || typeof b[pk].onClick !== 'function') return 'NO_ONCLICK'; try { b[pk].onClick({ preventDefault(){}, stopPropagation(){} }); return 'CALLED'; } catch (e) { return 'THREW: ' + String(e).slice(0, 150); } })()");
await sleep(1500);
out.afterDirect = await ev("(function(){ const active = document.querySelector('nav button.bg-emerald-50, button.bg-emerald-50'); const t = document.body.innerText; return JSON.stringify({ active: active ? active.textContent.trim().slice(0, 20) : 'none', hasNetCount: /(精选|全部) \\d+ 个景点/.test(t) }); })()");
console.log(JSON.stringify(out, null, 2));
