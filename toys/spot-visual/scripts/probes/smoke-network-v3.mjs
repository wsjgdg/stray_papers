// dev:3000 smoke — v3 drill-down network view + toolbar layout
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
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown")
    errors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text).slice(0, 120));
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
  if (r.error || r.result?.exceptionDetails) return undefined;
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
const results = [];
const check = (name, ok, detail) => results.push((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));

await send("Page.navigate", { url: BASE + "/?" + SC });

const cardCount = await evUntil("document.querySelectorAll('main .grid > div').length");
check("home cards", !!cardCount, cardCount + " cards");

const badge = await ev("document.body.innerText.match(/\\d{4,}/)?.[0] || 'none'");
check("library count >= 5900", Number(badge) >= 5900, "found " + badge);

// sidebar -> 景点网络
const nav = await ev("(() => { const b = [...document.querySelectorAll('button, a')].find(x => x.textContent.includes('景点网络')); if (!b) return 'NO_BTN'; b.click(); return 'CLICKED'; })()");
check("sidebar click switches view", nav === "CLICKED", String(nav));

const netState = await evUntil("(function(){ const t = document.body.innerText; const m = t.match(/(精选|全部) (\\d+) 个景点/); const canvas = document.querySelectorAll('canvas').length; return m && canvas > 0 ? JSON.stringify({ label: m[1], count: Number(m[2]), canvas }) : null; })()", 60, 1000);
let ns = {};
try { ns = JSON.parse(netState || "{}"); } catch {}
check("network view rendered", !!ns.count && ns.canvas > 0, netState || "timeout — innerText head: " + String(await ev("document.body.innerText.slice(0, 300)").catch?.(() => "") ?? ""));

// 全部 scope 切换（计数应跳到 ~5900）
const scopeBtn = await ev("(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '全部'); if (!b) return 'NO'; b.click(); return 'OK'; })()");
await sleep(3000);
const allCount = await evUntil("((document.body.innerText.match(/全部 (\\d+) 个景点/)||[])[1])", 30, 1000);
check("all scope count", scopeBtn === "OK" && Number(allCount) >= 5900, "count=" + allCount + " btn=" + scopeBtn);

check("no runtime exceptions", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
