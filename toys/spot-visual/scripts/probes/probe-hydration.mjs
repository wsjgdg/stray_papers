// probe: console errors + hydration + click pipeline on dev:3000
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
const cons = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    cons.push(m.params.args?.map((a) => a.value || a.description).join(" ").slice(0, 200));
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

await send("Page.navigate", { url: BASE + "/?" + SC });
await evUntil("document.querySelectorAll('main .grid > div').length");
await sleep(3000);

const out = {};
out.consoleErrors = cons.slice(0, 5);
out.portal = await ev("!!document.querySelector('nextjs-portal')");
out.btnInfo = await ev("(function(){ const b = [...document.querySelectorAll('button, a')].find(x => x.textContent.includes('景点网络')); if (!b) return 'NO_BTN'; const r = b.getBoundingClientRect(); return JSON.stringify({ tag: b.tagName, rect: [r.x|0, r.y|0, r.width|0, r.height|0], disabled: b.disabled, pointerEvents: getComputedStyle(b).pointerEvents, inShadow: !b.isConnected ? 'detached' : 'ok' }); })()");
out.clickFired = await ev("(function(){ let fired = false; document.addEventListener('click', () => { fired = true; }, { capture: true, once: true }); const b = [...document.querySelectorAll('button, a')].find(x => x.textContent.includes('景点网络')); b && b.click(); return fired; })()");
await sleep(2000);
out.afterClickView = await ev("(function(){ const t = document.body.innerText; return JSON.stringify({ network: t.includes('个景点'), home: t.includes('随便看看'), active: document.querySelector('nav button.bg-emerald-50, nav a.bg-emerald-50')?.textContent?.trim() || 'none' }); })()");

console.log(JSON.stringify(out, null, 2));
