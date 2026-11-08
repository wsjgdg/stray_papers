// probe12: enumerate event listeners on document/body/window via DOMDebugger
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
await send("DOM.enable");
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

const docNode = await send("DOM.getDocument", { depth: 1 });
const docId = docNode.result.root.nodeId;
const out = {};
for (const [label, obj, node] of [["window", { objectId: "window" }, null], ["document", null, docId], ["body", null, docId]]) {
  try {
    let params;
    if (obj) params = { objectId: (await send("Runtime.evaluate", { expression: "window" })).result.result.objectId };
    else params = { nodeId: node };
    const r = await send("DOMDebugger.getEventListeners", params);
    const ls = (r.result?.listeners || []).map((L) => L.type + (L.useCapture ? "(cap)" : "") + " line:" + (L.lineNumber ?? "?") + " " + String((L.handler?.description || "")).slice(0, 60));
    out[label] = ls;
  } catch (e) {
    out[label] = "ERR " + String(e).slice(0, 80);
  }
}
console.log(JSON.stringify(out, null, 2));
