// Real-browser city inspection and navigation regression using the app's own state machines,
// DOM and WebGL. The scene is never masked or paused; this is not a performance or human review.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..'), threeRoot = path.resolve(here, '../node_modules/three');
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !fs.existsSync(executablePath)) throw new Error('Set CHROME_PATH to an installed Chromium/Chrome executable.');
if (!fs.existsSync(path.join(threeRoot, 'build/three.module.js'))) throw new Error('Run npm ci --prefix sims first.');
const timeout = Number(process.env.BROWSER_TIMEOUT_MS || 210000);
const scale = Number(process.env.BROWSER_SCALE || .5);
const args = process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [];
if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('CHROME_ARGS must be a JSON array.');
const imageDir = process.env.BROWSER_CITY_DIR;
if (imageDir) fs.mkdirSync(imageDir, { recursive: true });
let html = fs.readFileSync(process.env.BROWSER_PAGE_HTML || path.join(root, 'index.html'), 'utf8');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.174.0/';
if (html.split(cdn).length !== 3) throw new Error('Unexpected three.js imports.');
html = html.split(cdn).join('/__three/').replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>/g, '');
const anchor = '      window.aetheris={';
if (html.split(anchor).length !== 2) throw new Error('Cannot insert the test probe.');
html = html.replace(anchor, '      window.__cityProbe={THREE,scene,camera,state,skyCities};\n' + anchor);
const server = http.createServer((req, res) => {
  let url; try { url = new URL(req.url, 'http://127.0.0.1'); } catch (_) { res.writeHead(400).end(); return; }
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html); return; }
  if (!url.pathname.startsWith('/__three/')) { res.writeHead(404).end(); return; }
  let file; try { file = path.resolve(threeRoot, decodeURIComponent(url.pathname.slice('/__three/'.length))); }
  catch (_) { res.writeHead(400).end(); return; }
  if (!file.startsWith(threeRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); fs.createReadStream(file).pipe(res);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const url = 'http://127.0.0.1:' + server.address().port + '/';
const check = (name, condition, detail = '') => {
  if (!condition) throw new Error(name + (detail ? ' — ' + detail : ''));
  console.log('  PASS ' + name + (detail ? ' — ' + detail : ''));
};
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless: process.env.BROWSER_HEADLESS_SHELL === '1' ? 'shell' : true,
    args: ['--disable-dev-shm-usage', ...args], protocolTimeout: timeout });
  const page = await browser.newPage(), errors = [];
  const observe = tab => {
    tab.on('pageerror', error => errors.push(String(error)));
    tab.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  };
  observe(page);
  await page.setViewport({ width: 800, height: 500, deviceScaleFactor: scale });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__cityProbe)), { timeout, polling: 1000 });
  check('desktop WebGL world starts', await page.evaluate(() => window.aetherisStartup.ready && !window.aetherisStartup.error &&
    window.aetherisStartup.graphics?.webgl2));
  // Check the actual hit target rather than only its CSS visibility: the footer used to cover it
  // on shorter screens. All of these checks happen before a click or camera manipulation.
  for (const [width, height] of [[800, 500], [480, 270], [320, 480], [320, 568], [800, 500]]) {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    const guide = await page.evaluate(() => {
      const el = document.getElementById('skyCityGuide'), r = el.getBoundingClientRect();
      const descend = document.getElementById('descendButton'), d = descend.getBoundingClientRect();
      return { shown: getComputedStyle(el).visibility === 'visible', width: r.width, height: r.height,
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('#skyCityGuide') === el,
        descendHit: document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2)?.closest('#descendButton') === descend };
    });
    check(`${width}×${height}: both introductory controls receive input and the guide is touch-sized`, guide.shown &&
      guide.hit && guide.descendHit && guide.width >= 44 && guide.height >= 44 && guide.left >= 0 &&
      guide.right <= width && guide.top >= 0 && guide.bottom <= height, JSON.stringify(guide));
  }
  await page.click('#skyCityGuide');
  await page.waitForFunction(() => document.body.classList.contains('archive-open') && !!document.getElementById('skyCitySection'),
    { timeout, polling: 500 });
  check('the introductory guide opens the three-city archive section without scrolling the scene',
    await page.evaluate(() => document.getElementById('app').scrollLeft === 0 && document.getElementById('app').scrollTop === 0));
  async function choose(tab, id, touch = false) {
    if (!await tab.evaluate(() => document.body.classList.contains('archive-open'))) await tab.keyboard.press('o');
    await tab.waitForFunction(() => document.body.classList.contains('archive-open') &&
      document.getElementById('archive').getBoundingClientRect().right <= innerWidth + 1, { timeout, polling: 500 });
    const selector = `[data-city-view="${id}"]`;
    await tab.$eval(selector, el => {
      const body = document.getElementById('archiveBody'), r = el.getBoundingClientRect(), b = body.getBoundingClientRect();
      body.scrollTop += r.top - b.top - (body.clientHeight - r.height) / 2;
    });
    if (touch) await tab.tap(selector); else await tab.click(selector);
    await tab.waitForFunction(want => window.__cityProbe.state.skyFocus?.city.id === want &&
      !window.__cityProbe.state.transition, { timeout, polling: 500 }, id);
    // Camera arrival and the archive's CSS slide are independent; capture only once the panel
    // has actually moved off-screen, so a screenshot shows the unobstructed, normal city view.
    await tab.waitForFunction(() => !document.body.classList.contains('archive-open') &&
      document.getElementById('archive').getBoundingClientRect().left >= innerWidth - 1 &&
      document.getElementById('app').scrollLeft === 0 && document.getElementById('app').scrollTop === 0,
      { timeout, polling: 500 });
  }
  for (const id of ['VIRE', 'SOLEN', 'KEST']) {
    await choose(page, id);
    const frame = await page.evaluate(() => {
      const p = window.__cityProbe, city = p.state.skyFocus.city;
      p.scene.updateMatrixWorld(true); p.camera.updateMatrixWorld(true);
      const aim = new p.THREE.Vector3(0, .14, 0).applyQuaternion(city.group.quaternion).add(city.group.position);
      let inside = 0, samples = 0;
      for (const mesh of city.meshes) {
        const positions = mesh.geometry.attributes.position, v = new p.THREE.Vector3();
        for (let i = 0; i < positions.count; i += 16) {
          v.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(p.camera); samples++;
          if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) inside++;
        }
      }
      return { id: city.id, distance: p.camera.position.distanceTo(aim), inside, samples,
        allCitiesVisible: p.skyCities.every(c => c.group.visible && c.group.parent === p.scene),
        label: document.getElementById('skyCityName').textContent,
        returnShown: getComputedStyle(document.getElementById('skyCityView')).display !== 'none' };
    });
    check(`${id}: archive opens a close, fully framed view of the actual scene`, frame.id === id && frame.distance > 2.5 &&
      frame.distance < 3.5 && frame.inside / frame.samples > .96 && frame.allCitiesVisible && frame.returnShown &&
      frame.label.includes(id), JSON.stringify(frame));
    if (imageDir) await page.screenshot({ path: path.join(imageDir, `${id.toLowerCase()}-desktop.png`) });
    if (id === 'VIRE') {
      const before = await page.evaluate(() => ({ yaw: window.__cityProbe.state.yaw, distance: window.__cityProbe.state.distance }));
      await page.mouse.move(420, 250); await page.mouse.down(); await page.mouse.move(475, 260, { steps: 4 }); await page.mouse.up();
      await page.mouse.wheel({ deltaY: -180 });
      const after = await page.evaluate(() => ({ yaw: window.__cityProbe.state.yaw, distance: window.__cityProbe.state.distance,
        stillFocused: window.__cityProbe.state.skyFocus?.city.id }));
      check('real mouse drag and wheel orbit and zoom the same city', Math.abs(after.yaw - before.yaw) > .1 &&
        after.distance < before.distance && after.stillFocused === 'VIRE', JSON.stringify({ before, after }));
    }
  }
  await page.click('#skyCityReturn');
  await page.waitForFunction(() => !window.__cityProbe.state.skyFocus && !window.__cityProbe.state.transition,
    { timeout, polling: 500 });
  check('the visible return button restores the planet orbit', await page.evaluate(() => window.__cityProbe.state.mode === 'orbit' &&
    getComputedStyle(document.getElementById('skyCityView')).display === 'none'));
  await choose(page, 'SOLEN'); await page.keyboard.press('f');
  await page.waitForFunction(() => window.__cityProbe.state.mode === 'ground' && !window.__cityProbe.state.transition,
    { timeout, polling: 500 });
  check('F from a city descends to ground and leaves focus', await page.evaluate(() => !window.__cityProbe.state.skyFocus &&
    getComputedStyle(document.getElementById('skyCityView')).display === 'none'));
  await choose(page, 'KEST');
  check('choosing a city from the ground actually returns to orbit', await page.evaluate(() =>
    window.__cityProbe.state.mode === 'orbit' && window.__cityProbe.state.skyFocus?.city.id === 'KEST'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__cityProbe.state.skyFocus && !window.__cityProbe.state.transition,
    { timeout, polling: 500 });
  check('Escape returns to the planet from city focus', true);

  const mobile = await browser.newPage(); observe(mobile);
  await mobile.setViewport({ width: 320, height: 568, deviceScaleFactor: scale, hasTouch: true });
  await mobile.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await mobile.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__cityProbe)), { timeout, polling: 1000 });
  check('portrait touch WebGL world starts', await mobile.evaluate(() => window.aetherisStartup.ready &&
    !window.aetherisStartup.error && matchMedia('(pointer: coarse)').matches));
  const mobileGuide = await mobile.evaluate(() => {
    const el = document.getElementById('skyCityGuide'), r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, left: r.left, right: r.right, bottom: r.bottom,
      shown: getComputedStyle(el).visibility === 'visible',
      hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('#skyCityGuide') === el };
  });
  check('the introductory city guide fits a narrow touch screen', mobileGuide.shown && mobileGuide.hit && mobileGuide.width >= 44 && mobileGuide.height >= 44 &&
    mobileGuide.left >= 0 && mobileGuide.right <= 320 && mobileGuide.bottom <= 568, JSON.stringify(mobileGuide));
  await mobile.tap('#skyCityGuide');
  await mobile.waitForFunction(() => document.body.classList.contains('archive-open'), { timeout, polling: 500 });
  check('touching the guide opens the archive without scrolling the scene', await mobile.evaluate(() =>
    document.getElementById('app').scrollLeft === 0 && document.getElementById('app').scrollTop === 0));
  await choose(mobile, 'VIRE', true);
  const mobileInfo = await mobile.evaluate(() => {
    const p = window.__cityProbe, button = document.getElementById('skyCityReturn'), r = button.getBoundingClientRect();
    const city = p.skyCities[0]; p.scene.updateMatrixWorld(true); p.camera.updateMatrixWorld(true);
    let inside = 0, count = 0;
    for (const mesh of city.meshes) {
      const a = mesh.geometry.attributes.position, v = new p.THREE.Vector3();
      for (let i = 0; i < a.count; i += 16) {
        v.fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld).project(p.camera); count++;
        if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) inside++;
      }
    }
    return { height: r.height, left: r.left, right: r.right, top: r.top, distance: p.state.distance, inside, count,
      visible: getComputedStyle(document.getElementById('skyCityView')).display !== 'none' };
  });
  check('touch selection frames Vire and exposes a 44 px return target', mobileInfo.visible && mobileInfo.height >= 44 &&
    mobileInfo.left >= 0 && mobileInfo.right <= 320 && mobileInfo.distance === 4.7 && mobileInfo.inside / mobileInfo.count > .98,
    JSON.stringify(mobileInfo));
  if (imageDir) await mobile.screenshot({ path: path.join(imageDir, 'vire-mobile.png') });
  await mobile.setViewport({ width: 568, height: 320, deviceScaleFactor: scale, hasTouch: true });
  await mobile.waitForFunction(() => Math.abs(window.__cityProbe.state.distance - 3) < .02, { timeout, polling: 500 });
  await mobile.setViewport({ width: 320, height: 568, deviceScaleFactor: scale, hasTouch: true });
  await mobile.waitForFunction(() => Math.abs(window.__cityProbe.state.distance - 4.7) < .02, { timeout, polling: 500 });
  check('rotating the touch viewport keeps the focused city framed', true);
  await mobile.tap('#skyCityReturn');
  await mobile.waitForFunction(() => !window.__cityProbe.state.skyFocus && !window.__cityProbe.state.transition,
    { timeout, polling: 500 });
  check('touch return restores planet orbit', await mobile.evaluate(() => window.__cityProbe.state.mode === 'orbit'));
  check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\nCity navigation exercised in real Chromium; screenshots show normal frames, not human/device acceptance.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
