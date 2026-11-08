const PORT = process.env.PORT || 9420;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'https://huaxia-explore.app.workbuddy.host';
const SC = process.env.SC || 'sharecode=N25J3RDNKG&v=3';

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
const bad = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
    return;
  }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    bad.push(`${m.params.response.status} ${m.params.response.url.replace(BASE, '').slice(0, 60)}`);
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
  return r.result?.result?.value;
};
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/?${SC}` });
await sleep(7000);

const state = async () =>
  ev(`JSON.stringify({
    path: location.pathname,
    q: location.search,
    canvas: document.querySelectorAll('canvas').length,
    h1: (document.querySelector('h1')||{}).innerText || null,
    cards: document.querySelectorAll('article, [data-spot]').length
  })`);
console.log('首屏:', await state());

async function clickNav(label) {
  const box = await ev(`(function(){
    var as = Array.prototype.slice.call(document.querySelectorAll('header a, header button'));
    for (var i=0;i<as.length;i++) if (as[i].innerText.indexOf(${JSON.stringify(label)}) >= 0) {
      var r = as[i].getBoundingClientRect();
      return {x:r.x+r.width/2, y:r.y+r.height/2, href: as[i].getAttribute('href')};
    }
    return null;
  })()`);
  if (!box) return null;
  await click(box.x, box.y);
  await sleep(2500);
  return { href: box.href, state: await state() };
}

for (const label of ['中国味道', '志愿探索', '景点览胜']) {
  const r = await clickNav(label);
  console.log(`点击「${label}」→`, r ? r.state : '未找到导航项');
}
console.log('HTTP>=400:', bad.length ? [...new Set(bad)].slice(0, 5).join(' | ') : 'none');
ws.close();
