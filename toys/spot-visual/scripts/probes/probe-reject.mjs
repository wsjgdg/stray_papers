// probe5: capture unhandledrejection + full portal text + next internals
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

// install rejection + error traps BEFORE navigation via evaluateOnNewDocument
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__TRAPS = [];
    window.addEventListener('unhandledrejection', (e) => {
      window.__TRAPS.push('REJECTION: ' + String(e.reason && (e.reason.stack || e.reason.message || e.reason)).slice(0, 500));
    });
    window.addEventListener('error', (e) => {
      window.__TRAPS.push('ERROR: ' + String(e.error && (e.error.stack || e.error.message) || e.message).slice(0, 500));
    }, true);
  `,
});

await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: BASE + "/?" + SC });
await evUntil("document.querySelectorAll('main .grid > div').length");
await sleep(4000);

const out = { base: BASE };
out.traps = await ev("JSON.stringify((window.__TRAPS || []).slice(0, 8))");
out.nextF = await ev("(window.__next_f || []).length");
out.routerMounted = await ev("!!document.querySelector('[data-nextjs-router]') || typeof window.next?.router !== 'undefined'");
out.fiberOnBody = await ev("Object.keys(document.body).filter(k => k.startsWith('__react')).join(',') || 'none'");
out.htmlFiber = await ev("Object.keys(document.documentElement).filter(k => k.startsWith('__react')).join(',') || 'none'");
out.portalFull = await ev("(function(){ const p = document.querySelector('nextjs-portal'); if (!p || !p.shadowRoot) return 'no-shadow'; const txt = (p.shadowRoot.textContent || '').trim(); const dialog = p.shadowRoot.querySelector('[data-nextjs-dialog], .nextjs-toast, nextjs-portal-errors'); return dialog ? 'DIALOG: ' + (dialog.textContent || '').slice(0, 600) : 'no dialog, textLen=' + txt.length; })()");
console.log(JSON.stringify(out, null, 2));
