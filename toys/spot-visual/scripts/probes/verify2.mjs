const PORT = process.env.PORT || 9440;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'https://huaxia-explore.app.workbuddy.host';
const SC = 'sharecode=N25J3RDNKG&v=4';

async function pickPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error('NO PAGE');
}
const ws = new WebSocket(await pickPage());
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (me, p = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method: me, params: p }));
  return new Promise((r) => pend.set(mid, r));
};
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const evUntil = async (x, tries = 40, gap = 400) => {
  for (let i = 0; i < tries; i++) {
    const v = await ev(x);
    if (v) return v;
    await sleep(gap);
  }
  return null;
};

const METRICS = `(function(){
  var a = document.querySelector('aside');
  if (!a) return null;
  var r = a.getBoundingClientRect();
  return {
    h: Math.round(r.height),
    top: Math.round(r.top),
    docH: document.documentElement.scrollHeight,
    title: (a.querySelector('h2')||{}).innerText || null,
    dish: (a.querySelector('figure figcaption span')||{}).innerText || null
  };
})()`;

async function openProv(prov) {
  await send('Page.navigate', { url: `${BASE}/food?${SC}&prov=${encodeURIComponent(prov)}` });
  await evUntil(`document.querySelectorAll('aside button[title]').length > 2 ? 1 : 0`, 50, 400);
  await sleep(1500);
}

async function pickCity(name) {
  const box = await ev(`(function(){
    var bs = Array.prototype.slice.call(document.querySelectorAll('aside button[title]'));
    for (var i=0;i<bs.length;i++) if (bs[i].innerText.trim() === ${JSON.stringify(name)}) {
      bs[i].scrollIntoView({block:'center'});
      var r = bs[i].getBoundingClientRect();
      return {x:r.x+r.width/2, y:r.y+r.height/2};
    }
    return null;
  })()`);
  if (!box) return null;
  await click(box.x, box.y);
  await sleep(900);
  return ev(METRICS);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1180, deviceScaleFactor: 1, mobile: false });

/* ── 1. 切换城市时右栏是否稳定 ── */
await openProv('四川');
const base = await ev(METRICS);
console.log('[基线]', JSON.stringify(base));
const seq = ['成都', '绵阳', '甘孜', '阿坝', '凉山'];
const rows = [];
for (const c of seq) {
  const m = await pickCity(c);
  rows.push({ city: c, ...m });
}
const hs = rows.map((r) => r.h);
const tops = rows.map((r) => r.top);
console.log('[切换序列]');
for (const r of rows) console.log(`  ${r.city}: h=${r.h} top=${r.top} dish=${r.dish}`);
console.log(
  `[稳定性] 高度 min=${Math.min(...hs)} max=${Math.max(...hs)} 波动=${Math.max(...hs) - Math.min(...hs)}px | ` +
    `top 波动=${Math.max(...tops) - Math.min(...tops)}px | 基线 h=${base.h}`,
);

/* ── 2. 依据面板内容（四川：无营养库条目） ── */
const basisBox = await ev(`(function(){
  var bs=Array.prototype.slice.call(document.querySelectorAll('aside button'));
  for(var i=0;i<bs.length;i++) if(/依据/.test(bs[i].innerText)){
    bs[i].scrollIntoView({block:'center'});
    var r=bs[i].getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2};
  }
  return null;
})()`);
if (basisBox) {
  await click(basisBox.x, basisBox.y);
  await sleep(600);
}
const panelText = await ev(`(function(){
  var a=document.querySelector('aside');
  var t=a.innerText;
  var i=t.indexOf('6 个维度');
  return i>=0 ? t.slice(i, i+700).replace(/\\n/g,' | ') : null;
})()`);
console.log('[依据面板·四川]', panelText);

/* ── 3. 营养库条目（北京烤鸭） ── */
await openProv('北京');
const bjBasis = await ev(`(function(){
  var bs=Array.prototype.slice.call(document.querySelectorAll('aside button'));
  for(var i=0;i<bs.length;i++) if(/依据/.test(bs[i].innerText)){ return 1; }
  return 0;
})()`);
if (bjBasis) {
  const box = await ev(`(function(){
    var bs=Array.prototype.slice.call(document.querySelectorAll('aside button'));
    for(var i=0;i<bs.length;i++) if(/依据/.test(bs[i].innerText)){
      bs[i].scrollIntoView({block:'center'});
      var r=bs[i].getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2};
    }
    return null;
  })()`);
  if (box) {
    await click(box.x, box.y);
    await sleep(600);
  }
}
const bjText = await ev(`(function(){
  var t=document.querySelector('aside').innerText;
  var i=t.indexOf('营养库有对应条目');
  return i>=0 ? t.slice(i, i+320).replace(/\\n/g,' | ') : null;
})()`);
console.log('[依据面板·北京烤鸭]', bjText);

ws.close();
