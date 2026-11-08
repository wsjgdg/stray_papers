// probe11: after click, what does main render? any chunk load failures?
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
const fails = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400) {
    fails.push(m.params.response.status + " " + m.params.response.url.slice(0, 130));
  }
  if (m.method === "Network.loadingFailed" && !m.params.canceled) {
    fails.push("FAILED " + String(m.params.errorText).slice(0, 60));
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
await sleep(2500);

const clicked = await ev("(function(){ const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('景点网络') && x.getBoundingClientRect().width > 0); if (!b) return 'NO_BTN'; b.click(); return 'CLICKED'; })()");
await sleep(6000);

const out = { clicked };
out.mainText = await ev("(function(){ const m = document.querySelector('main'); return (m.innerText || '').slice(0, 400); })()");
out.canvas = await ev("document.querySelectorAll('main canvas').length");
out.headerLabel = await ev("(function(){ const h = document.querySelector('main h2'); return h ? h.textContent.trim() : 'none'; })()");
out.fails = fails.slice(0, 8);
console.log(JSON.stringify(out, null, 2));
