// Browser regression for the real codex and rendered wall geometry. The page's frame loop and
// scene stay intact; a synchronous controlled fixture restores camera and animal state immediately.
// This is not a visual acceptance test or a hardware-performance benchmark.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..'), threeRoot = path.resolve(here, '../node_modules/three');
const executablePath = process.env.CHROME_PATH, timeout = Number(process.env.BROWSER_TIMEOUT_MS || 210000);
if (!executablePath || !fs.existsSync(executablePath)) throw new Error('Set CHROME_PATH to an installed Chromium/Chrome executable.');
if (!fs.existsSync(path.join(threeRoot, 'build/three.module.js'))) throw new Error('Run npm ci --prefix sims first.');
const args = process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [];
if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('CHROME_ARGS must be a JSON array.');
let html = fs.readFileSync(process.env.BROWSER_PAGE_HTML || path.join(root, 'index.html'), 'utf8');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.174.0/', anchor = '      window.aetheris={';
if (html.split(cdn).length !== 3 || html.split(anchor).length !== 2) throw new Error('Unexpected page imports or test-probe anchor.');
html = html.split(cdn).join('/__three/').replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>/g, '');
html = html.replace(anchor, '      window.__occlusionProbe={THREE,R,SEA,EYE,landing,nearDirection,heightAt,scene,camera,state,' +
  'sightBuildingBatches,inSight,inSightCone,terrainBlocksSight,buildingsBlockSight,CODEX,codexScan,bell};\n' + anchor);
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
const check = (name, condition, detail = '') => {
  if (!condition) throw new Error(name + (detail ? ' — ' + detail : ''));
  console.log('  PASS ' + name + (detail ? ' — ' + detail : ''));
};
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless: process.env.BROWSER_HEADLESS_SHELL === '1' ? 'shell' : true,
    args: ['--disable-dev-shm-usage', ...args], protocolTimeout: timeout });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewport({ width: 480, height: 270, deviceScaleFactor: Number(process.env.BROWSER_SCALE || .5) });
  await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__occlusionProbe)), { timeout, polling: 1000 });
  check('the real WebGL2 page starts', await page.evaluate(() => window.aetherisStartup.ready &&
    !window.aetherisStartup.error && window.aetherisStartup.graphics?.webgl2));
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__occlusionProbe.state.mode === 'ground' &&
    !window.__occlusionProbe.state.transition, { timeout, polling: 1000 });
  check('the real F-key descent finishes without disabling the live scene', true);
  const result = await page.evaluate(() => {
    const p = window.__occlusionProbe, T = p.THREE, cameraSave = p.camera.position.clone();
    const codexSave = p.CODEX.map(entry => ({ seen: entry.seen, fresh: entry.fresh }));
    const savedBell = p.bell.slice(), animal = p.bell[0];
    const animalSave = { pos: animal.pos.clone(), world: animal.world.clone(), top: animal.hit.top };
    const result = {};
    try {
      p.scene.updateMatrixWorld(true);
      const batch = p.sightBuildingBatches.find(x => x.geoKey === 'wall');
      const matrix = new T.Matrix4(), pt = (x, y, z) => new T.Vector3(x, y, z).applyMatrix4(matrix);
      let found;
      for (let i = 0; i < batch.inst.count; i++) {
        batch.inst.getMatrixAt(i, matrix);
        const from = pt(-1.2, .5, 0), target = pt(1.2, .5, 0), clearFrom = pt(2, .5, 0);
        const forward = target.clone().sub(from).normalize(), clearForward = target.clone().sub(clearFrom).normalize();
        p.camera.position.copy(from);
        const blocked = p.inSightCone(target, from.clone().normalize(), forward, .34) &&
          !p.terrainBlocksSight(from, target) && p.buildingsBlockSight(from, target) &&
          !p.inSight(target, from.clone().normalize(), forward, .34);
        p.camera.position.copy(clearFrom);
        if (blocked && p.inSight(target, clearFrom.clone().normalize(), clearForward, .34)) {
          found = { from, target, clearFrom, forward, clearForward, index: i }; break;
        }
      }
      if (!found) throw new Error('No visible-side/blocked-side fixture for a rendered wall.');
      p.bell.splice(1); animal.pos.copy(found.target).normalize();
      animal.world.copy(found.target).addScaledVector(animal.pos, -.02); animal.hit.top = animal.world.length() + .04;
      const reset = () => { for (const e of p.CODEX) { e.seen = e.id !== 'bell'; e.fresh = false; } };
      reset(); p.camera.position.copy(found.from); p.codexScan(found.from.clone().normalize(), found.forward);
      result.wallBlocked = !p.CODEX.find(x => x.id === 'bell').seen;
      reset(); p.camera.position.copy(found.clearFrom); p.codexScan(found.clearFrom.clone().normalize(), found.clearForward);
      result.wallClear = p.CODEX.find(x => x.id === 'bell').seen; result.wallIndex = found.index;
      const dir = p.nearDirection(p.landing, 2.399963, .36), h = p.heightAt(dir);
      const end = p.nearDirection(dir, 0, .5 / p.R), endH = p.heightAt(end);
      const eye = dir.clone().multiplyScalar(p.R + h + p.EYE), target = end.clone().multiplyScalar(p.R + endH + .04);
      const high = end.clone().multiplyScalar(p.R + endH + .6);
      p.camera.position.copy(eye);
      result.ridgeBlocked = p.inSightCone(target, dir, target.clone().sub(eye).normalize(), 1.25) &&
        p.terrainBlocksSight(eye, target) && !p.inSight(target, dir, target.clone().sub(eye).normalize(), 1.25);
      result.highClear = p.inSight(high, dir, high.clone().sub(eye).normalize(), 1.25);
      const seaDir = p.nearDirection(p.landing, 0, .2), seaH = p.heightAt(seaDir);
      const underwater = seaDir.clone().multiplyScalar(p.R + seaH + .04), aboveWater = seaDir.clone().multiplyScalar(p.R + p.SEA + .04);
      p.camera.position.copy(underwater);
      result.waterClear = seaH < p.SEA - .09 && p.inSight(aboveWater, seaDir, aboveWater.clone().sub(underwater).normalize(), 1.25);
      result.instances = p.sightBuildingBatches.reduce((n, x) => n + x.inst.count, 0);
    } finally {
      animal.pos.copy(animalSave.pos); animal.world.copy(animalSave.world); animal.hit.top = animalSave.top;
      p.bell.splice(0, p.bell.length, ...savedBell); p.CODEX.forEach((entry, i) => Object.assign(entry, codexSave[i]));
      p.camera.position.copy(cameraSave);
    }
    return result;
  });
  check('the browser codex rejects the real wall-blocked animal and discovers it from the clear side',
    result.wallBlocked && result.wallClear, `wall ${result.wallIndex}, ${result.instances} actual instance bounds`);
  check('the browser uses the terrain ridge and still sees a clear high target', result.ridgeBlocked && result.highClear);
  check('the browser can look through water from underwater', result.waterClear);
  check('the page reports no JavaScript/WebGL console errors', !errors.length, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
