// 景点页真浏览器验证（CDP chrome/edge --headless --remote-debugging-port=9355）
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
const bad = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400) {
    const u = m.params.response.url;
    if (!u.includes("/api/weather")) bad.push(String(m.params.response.status) + " " + u.replace(BASE, "").slice(0, 90));
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
const shot = async (f) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  require("fs").writeFileSync(f, Buffer.from(r.result.data, "base64"));
};
const results = [];
const check = (name, ok, detail) => results.push((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));

await send("Page.navigate", { url: BASE + "/?" + SC });

const cardCount = await evUntil("document.querySelectorAll('main .grid > div').length");
check("home cards", !!cardCount, cardCount + " cards");

const IMG_STAT_JSON = "(async () => JSON.stringify((async () => { const imgs = [...document.querySelectorAll('main img')].slice(0, 40); await new Promise(r => setTimeout(r, 1500)); let ok = 0; for (const im of imgs) { if (im.complete && im.naturalWidth > 0) ok++; } return { ok, total: imgs.length }; })()))";
const imgStat = await evUntil(IMG_STAT_JSON);
let parsed = null;
try { parsed = JSON.parse(imgStat || "null"); } catch {}
check("card images loaded", !!parsed && parsed.ok > 0, parsed ? parsed.ok + "/" + parsed.total + " ok" : "none");

const hint = await ev("document.body.innerText.indexOf('1200') >= 0 || document.body.innerText.indexOf('27 城') >= 0");
check("unified library copy (r17+)", !!hint);

await ev("window.confirm = () => true");
const clicked = await ev("(() => { const chips = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '杭州'); if (!chips.length) return 'NO_CHIP'; chips[0].click(); return 'CLICKED'; })()");
await sleep(1200);
const afterCity = await ev("document.querySelectorAll('main .grid > div').length");
check("city filter chip", clicked === "CLICKED" && !!afterCity, "after click " + afterCity + " cards");

const imgStat2raw = await ev(IMG_STAT_JSON);
let parsed2 = null;
try { parsed2 = JSON.parse(imgStat2raw || "null"); } catch {}
check("filtered images loaded", !!parsed2 && parsed2.ok > 0, parsed2 ? parsed2.ok + "/" + parsed2.total + " ok" : "none");

const r1 = await ev("(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.indexOf('随便看看') >= 0); if (!b) return 'NO_BTN'; b.click(); return 'OK'; })()");
await sleep(900);
const t1 = (await ev("document.querySelector('[role=dialog] h2, [role=dialog] h3')?.textContent || ''")) || "";
await ev("document.querySelector('[role=dialog] button')?.click()");
await sleep(300);
const r2 = await ev("(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.indexOf('随便看看') >= 0); if (!b) return 'NO_BTN'; b.click(); return 'OK'; })()");
await sleep(900);
const t2 = (await ev("document.querySelector('[role=dialog] h2, [role=dialog] h3')?.textContent || ''")) || "";
check("random browse", r1 === "OK" && t1.length > 0, "picked: " + t1.slice(0, 14) + " / " + t2.slice(0, 14));

const dlgImgsRaw = await ev("JSON.stringify([...document.querySelectorAll('[role=dialog] img')].map(i => ({ s: i.src.slice(0, 70), ok: i.complete && i.naturalWidth > 0 })))");
let dlg = null;
try { dlg = JSON.parse(dlgImgsRaw || "null"); } catch {}
check("dialog images", !!dlg && dlg.length > 0, dlg ? dlg.filter((x) => x.ok).length + "/" + dlg.length + " loaded" + (dlg[0] ? " first: " + dlg[0].s : "") : "no dialog");

console.log(results.join("\n"));
console.log("\nnetwork >=400 (weather excluded): " + (bad.length ? bad.slice(0, 10).join(" | ") : "none"));
process.exit(0);
