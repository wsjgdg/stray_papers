// probe8: bisect the bubble path — which ancestor stops the click?
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
out.bubblePath = await ev("(function(){ return new Promise((res) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('景点网络') && x.getBoundingClientRect().width > 0); if (!b) { res('NO_BTN'); return; } const chain = []; let el = b; while (el && el !== document) { chain.push(el); el = el.parentElement; } const seen = chain.map(() => false); const docs = [false, false]; const unsubs = chain.map((node, i) => { const h = () => { seen[i] = true; }; node.addEventListener('click', h, false); return () => node.removeEventListener('click', h); }); const d1 = () => { docs[0] = true; }; const d2 = () => { docs[1] = true; }; document.addEventListener('click', d1, false); window.addEventListener('click', d2, false); b.click(); setTimeout(() => { unsubs.forEach((u) => u()); document.removeEventListener('click', d1); window.removeEventListener('click', d2); const tags = chain.map((n, i) => (seen[i] ? 'Y ' : 'N ') + n.tagName + (typeof n.className === 'string' && n.className ? ' .' + n.className.split(' ').slice(0, 2).join('.') : '')); res(JSON.stringify({ reached: tags, document: docs[0], window: docs[1] })); }, 500); }); })()");
console.log(JSON.stringify(out, null, 2));
