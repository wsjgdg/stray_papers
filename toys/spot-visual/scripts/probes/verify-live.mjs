import fs from 'fs';
const PORT = process.env.PORT || 9355;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'C:/Users/sibop/WorkBuddy/2026-10-23-15-42-22/spot-visual/submission/screenshots';
const BASE = process.env.BASE || 'https://huaxia-explore.app.workbuddy.host';
const SC = process.env.SC || 'sharecode=N25J3RDNKG';

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
const pending = new Map();
const bad = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    bad.push(`${m.params.response.status} ${m.params.response.url.replace(BASE, '').slice(0, 80)}`);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (me, p = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method: me, params: p }));
  return new Promise((r) => pending.set(mid, r));
};
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.error) return undefined;
  if (r.result?.exceptionDetails) return undefined;
  return r.result?.result?.value;
};
/** 反复求值直到返回真值，避免导航/水合竞态 */
const evUntil = async (expr, tries = 40, gap = 500) => {
  for (let i = 0; i < tries; i++) {
    const v = await ev(expr);
    if (v) return v;
    await sleep(gap);
  }
  return null;
};
const shot = async (f) => {
  const r = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 1440, height: 1180, scale: 1 },
    captureBeyondViewport: false,
  });
  fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
};
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const wheel = (x, y, d) =>
  send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: d, button: 'none' });

const MEASURE = `(function(){
  var c=document.querySelector('section canvas');
  if(!c) return null;
  var ctx=c.getContext('2d'); var W=c.width,H=c.height;
  var d=ctx.getImageData(0,0,W,H).data;
  var minX=W,minY=H,maxX=-1,maxY=-1;
  for(var y=0;y<H;y+=2)for(var x=0;x<W;x+=2){ if(d[(y*W+x)*4+3]>10){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;} }
  return maxX<0?null:{w:+((maxX-minX)/W).toFixed(3),h:+((maxY-minY)/H).toFixed(3)};
})()`;

const canvasRect = `(function(){
  var c=document.querySelector('section canvas');
  if(!c) return null;
  var r=c.getBoundingClientRect();
  if(!r.width || !r.height) return null;
  return {x:r.x,y:r.y,w:r.width,h:r.height};
})()`;

async function openProv(prov) {
  await send('Page.navigate', { url: `${BASE}/food?${SC}&prov=${encodeURIComponent(prov)}` });
  // 等 readyState 完成 + 地图 canvas 出现 + 城市清单渲染
  await evUntil(`document.readyState === 'complete' && document.querySelector('section canvas') ? 1 : 0`, 60, 500);
  await evUntil(`document.querySelectorAll('aside button[title]').length > 2 ? 1 : 0`, 60, 400);
  await sleep(1500);
}

async function gotoChip(name) {
  const chip = await ev(`(function(){
    var bs = Array.prototype.slice.call(document.querySelectorAll('aside button[title]'));
    for (var i=0;i<bs.length;i++) if (bs[i].innerText.trim() === ${JSON.stringify(name)}) {
      bs[i].scrollIntoView({block:'center'});
      var r = bs[i].getBoundingClientRect();
      return {x:r.x+r.width/2, y:r.y+r.height/2};
    }
    return null;
  })()`);
  if (!chip) return false;
  await click(chip.x, chip.y);
  await sleep(1200);
  return true;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1180, deviceScaleFactor: 1, mobile: false });

/* ───── 1. 缩放保持（四川 → 成都） ───── */
await openProv('四川');
let rect = await evUntil(canvasRect, 40, 500);
if (!rect) throw new Error('canvas rect unavailable');
const cx = rect.x + rect.w / 2;
const cy = rect.y + rect.h / 2;
const b0 = await evUntil(MEASURE, 20, 400);
await wheel(cx, cy, -320);
await sleep(400);
await wheel(cx, cy, -320);
await sleep(800);
const b1 = await ev(MEASURE);
const picked = await gotoChip('成都');
const b2 = await ev(MEASURE);
const kept = b1 && b2 && Math.abs(b2.w - b1.w) < 0.06 && Math.abs(b2.h - b1.h) < 0.06;
console.log(`[1] 缩放保持: 初始 ${b0?.w}x${b0?.h} → 放大 ${b1?.w}x${b1?.h} → 选成都(${picked}) ${b2?.w}x${b2?.h} => ${kept ? 'PASS' : 'FAIL'}`);

/* ───── 2. 口味卡面 ───── */
const card = await ev(`(function(){var f=document.querySelector('aside figure');return f?f.innerText.replace(/\\n/g,' | '):null;})()`);
console.log('[2] 右栏卡面:', card);

/* ───── 3. 口径（雷达图凭据）面板 ───── */
const basisBtn = await ev(`(function(){
  var bs=Array.prototype.slice.call(document.querySelectorAll('aside button'));
  for(var i=0;i<bs.length;i++) if(/依据|口径/.test(bs[i].innerText)){
    bs[i].scrollIntoView({block:'center'});
    var r=bs[i].getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,label:bs[i].innerText.trim()};
  }
  return null;
})()`);
let basisShown = false;
if (basisBtn) {
  await click(basisBtn.x, basisBtn.y);
  await sleep(700);
  basisShown = !!(await ev(`document.body.innerText.indexOf('6 个维度') >= 0 ? 1 : 0`));
}
console.log(`[3] 口径面板 (${basisBtn ? basisBtn.label : '未找到按钮'}): ${basisShown ? 'PASS' : 'FAIL'}`);

/* ───── 截图 02-food（先收起口径面板，保留地图 + 详情） ───── */
if (basisShown && basisBtn) {
  await click(basisBtn.x, basisBtn.y);
  await sleep(600);
}
await ev(`window.scrollTo(0,0)`);
await sleep(400);
await shot(`${OUT}/02-food.png`);
console.log('[4] 已截图 02-food.png');

/* ───── 5. 长菜名布局：吉林 → 四平 → 李连贵熏肉大饼 ───── */
await openProv('吉林');
const okSiPing = await ev(`(function(){
  var bs = Array.prototype.slice.call(document.querySelectorAll('aside button[title]'));
  for (var i=0;i<bs.length;i++) if (bs[i].innerText.trim()==='四平') return 1;
  return 0;
})()`);
await gotoChip('四平');
const longCard = await ev(`(function(){
  var f=document.querySelector('aside figure');
  if(!f) return null;
  var s=f.querySelector('figcaption span');
  var fs=s?parseFloat(getComputedStyle(s).fontSize):null;
  return {
    text: f.innerText.replace(/\\n/g,' | ').slice(0,80),
    name: s?s.innerText:null,
    fontSize: fs,
    overflow: s ? s.scrollWidth > s.clientWidth + 1 : null
  };
})()`);
console.log(`[5] 长名卡面 (四平 in list=${okSiPing}):`, JSON.stringify(longCard));
await shot(`${OUT}/_tmp-longname.png`);

/* ───── 6. 无异常请求 ───── */
console.log('[6] HTTP>=400:', bad.length ? [...new Set(bad)].slice(0, 6).join(' | ') : 'none');
ws.close();
