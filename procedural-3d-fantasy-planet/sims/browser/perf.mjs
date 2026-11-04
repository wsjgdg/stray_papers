// Optional measurement, not a performance pass/fail. Run the real page and its normal renderer in
// Chromium, observe orbit frames, press F, then observe ground frames. The in-memory hook only times
// existing work; it does not change quality, geometry, input, or the number of renders. RAF intervals
// are not display-present timestamps, and a renderScene call's wall time is not completed GPU time.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const threeRoot = path.resolve(here, '../node_modules/three');
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error('Set CHROME_PATH to an installed Chromium/Chrome executable (no browser is bundled).');
}
if (!fs.existsSync(path.join(threeRoot, 'build/three.module.js'))) {
  throw new Error('Install the main test dependencies first: npm ci --prefix sims');
}
const viewport = {
  width: Number(process.env.BROWSER_WIDTH || 1024), height: Number(process.env.BROWSER_HEIGHT || 576),
  deviceScaleFactor: Number(process.env.BROWSER_SCALE || 1)
};
const timeout = Number(process.env.BROWSER_TIMEOUT_MS || 210000);
const orbitFrames = Number(process.env.BROWSER_PERF_ORBIT_FRAMES || 20);
const groundFrames = Number(process.env.BROWSER_PERF_GROUND_FRAMES || 30);
for (const [name, value] of [['BROWSER_PERF_ORBIT_FRAMES', orbitFrames], ['BROWSER_PERF_GROUND_FRAMES', groundFrames]]) {
  if (!Number.isInteger(value) || value < 4 || value > 300) throw new Error(name + ' must be an integer between 4 and 300.');
}
const extraArgs = process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [];
if (!Array.isArray(extraArgs) || extraArgs.some(arg => typeof arg !== 'string')) {
  throw new Error('CHROME_ARGS must be a JSON array of Chromium argument strings.');
}

const sourcePage = path.resolve(process.env.BROWSER_PAGE_HTML || path.join(root, 'index.html'));
if (process.env.BROWSER_PERF_OUTPUT) {
  const output = path.resolve(process.env.BROWSER_PERF_OUTPUT);
  if (output === sourcePage || (fs.existsSync(output) && fs.realpathSync(output) === fs.realpathSync(sourcePage))) {
    throw new Error('BROWSER_PERF_OUTPUT must not overwrite the source page.');
  }
}
let html = fs.readFileSync(sourcePage, 'utf8');
const sourceSha256 = createHash('sha256').update(html).digest('hex');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.174.0/';
if (html.split(cdn).length !== 3) throw new Error('Unexpected three.js imports; inspect the browser proxy mapping.');
html = html.split(cdn).join('/__three/');
html = html.replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>/g, '');
const anchor = '      window.aetheris={';
if (html.split(anchor).length !== 2) throw new Error('Cannot find the unique observability insertion point.');
html = html.replace(anchor, '      window.__renderBench={phase:"idle",orbit:[],ground:[],flightFrames:0,canvas:renderer.domElement};\n' + anchor);
const frameBlock = '          updateCamera(dt,timestamp);updateWorld(dt);\n' +
  '          // Re-center the walking patch over several frames instead of one long stall.\n' +
  '          advanceGroundRefresh(Math.min(2.6, Math.max(1.4, dt * 150)));\n' +
  '          updateQuality(raw);renderScene();';
if (html.split(frameBlock).length !== 2) throw new Error('Cannot find the unique render-loop timing points.');
html = html.replace(frameBlock, `          const bench=window.__renderBench, bt0=performance.now();
          updateCamera(dt,timestamp);const bt1=performance.now();updateWorld(dt);const bt2=performance.now();
          advanceGroundRefresh(Math.min(2.6, Math.max(1.4, dt * 150)));const bt3=performance.now();
          updateQuality(raw);const bt4=performance.now();renderScene();const bt5=performance.now();
          if(bench.phase!=="idle"){
            const sample={raw,at:bt5,camera:bt1-bt0,world:bt2-bt1,patch:bt3-bt2,quality:bt4-bt3,
              render:bt5-bt4,tier:quality.tier,pixelRatio:renderer.getPixelRatio(),bloom:bloomOn,
              calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
            if(bench.phase==="orbit"&&state.mode==="orbit"&&!state.transition&&bench.orbit.length<${orbitFrames})bench.orbit.push(sample);
            if(bench.phase==="descent"&&state.transition)bench.flightFrames++;
            if(bench.phase==="descent"&&state.mode==="ground"&&!state.transition&&bench.ground.length<${groundFrames})bench.ground.push(sample);
          }`);

// A loopback-only, isolated server keeps the user's 8080 preview untouched. It serves the page with
// locked local three.js, so it does not test availability of the production CDN or external fonts.
const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://127.0.0.1'); }
  catch (_) { res.writeHead(400).end(); return; }
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html); return;
  }
  if (!url.pathname.startsWith('/__three/')) { res.writeHead(404).end(); return; }
  let file;
  try { file = path.resolve(threeRoot, decodeURIComponent(url.pathname.slice('/__three/'.length))); }
  catch (_) { res.writeHead(400).end(); return; }
  if (!file.startsWith(threeRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const url = 'http://127.0.0.1:' + server.address().port + '/';
const median = values => {
  const sorted = values.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const percentile = (values, p) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};
const round = value => Number(value.toFixed(2));
const summarize = frames => {
  const milliseconds = frames.map(frame => frame.raw * 1000), render = frames.map(frame => frame.render);
  return {
    samples: frames.length,
    rafIntervalMs: { median: round(median(milliseconds)), p95: round(percentile(milliseconds, .95)),
      max: round(Math.max(...milliseconds)) },
    renderCallWallMs: { median: round(median(render)), p95: round(percentile(render, .95)),
      max: round(Math.max(...render)) },
    maxJsStageWallMs: {
      camera: round(Math.max(...frames.map(frame => frame.camera))),
      world: round(Math.max(...frames.map(frame => frame.world))),
      patch: round(Math.max(...frames.map(frame => frame.patch))),
      quality: round(Math.max(...frames.map(frame => frame.quality)))
    },
    tiers: frames.reduce((counts, frame) => {
      const tier = ['HIGH', 'BALANCED', 'SMOOTH'][frame.tier] || String(frame.tier);
      counts[tier] = (counts[tier] || 0) + 1; return counts;
    }, {}),
    pixelRatios: [...new Set(frames.map(frame => frame.pixelRatio))],
    bloomFrames: frames.filter(frame => frame.bloom).length,
    // Three's auto-reset can make these the last post-processing pass rather than all scene draws.
    lastRendererInfo: { calls: frames.at(-1).calls, triangles: frames.at(-1).triangles }
  };
};
const headless = process.env.BROWSER_HEADFUL === '1' ? false :
  process.env.BROWSER_HEADLESS_SHELL === '1' ? 'shell' : true;
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless,
    args: ['--disable-dev-shm-usage', ...extraArgs], protocolTimeout: timeout });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__renderBench)), { timeout, polling: 1000 });
  const startupError = await page.evaluate(() => window.aetherisStartup.error || '');
  if (startupError) throw new Error('Page startup failed: ' + startupError);
  console.log('Collecting ' + orbitFrames + ' orbit RAF intervals...');
  await page.evaluate(() => { window.__renderBench.phase = 'orbit'; });
  await page.waitForFunction(count => window.__renderBench.orbit.length >= count, { timeout, polling: 500 }, orbitFrames);
  await page.evaluate(() => { window.__renderBench.phase = 'descent'; window.__renderBench.keyAt = performance.now(); });
  console.log('Pressing F and collecting ' + groundFrames + ' ground RAF intervals...');
  await page.keyboard.press('f');
  await page.waitForFunction(count => window.__renderBench.ground.length >= count, { timeout, polling: 500 }, groundFrames);
  const result = await page.evaluate(() => {
    const bench = window.__renderBench;
    bench.phase = 'idle';
    return { orbit: bench.orbit, ground: bench.ground, flightFrames: bench.flightFrames,
      keyAt: bench.keyAt, graphics: window.aetherisStartup.graphics, diagnostics: window.aetheris.diagnostics(),
      visibility: document.visibilityState, canvas: { width: bench.canvas.width, height: bench.canvas.height } };
  });
  if (errors.length) throw new Error('Page or console errors: ' + errors.slice(0, 3).join(' | '));
  const report = {
    chromium: await browser.version(), browserMode: headless === false ? 'headful' : headless === 'shell' ? 'headless-shell' : 'headless',
    source: { file: sourcePage, sha256: sourceSha256 }, viewport, canvas: result.canvas,
    graphics: result.graphics, visibility: result.visibility, build: result.diagnostics.build,
    descent: { keyAtMs: result.keyAt, firstGroundRenderReturnSeconds: round((result.ground[0].at - result.keyAt) / 1000),
      flightFrames: result.flightFrames },
    orbit: summarize(result.orbit), ground: summarize(result.ground), finalDiagnostics: result.diagnostics,
    frameSampleUnits: { raw: 'seconds between RAF timestamps', at: 'milliseconds since page time origin',
      camera: 'milliseconds', world: 'milliseconds', patch: 'milliseconds', quality: 'milliseconds', render: 'milliseconds' }
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.BROWSER_PERF_OUTPUT) {
    fs.writeFileSync(process.env.BROWSER_PERF_OUTPUT,
      JSON.stringify({ ...report, frameSamples: { orbit: result.orbit, ground: result.ground } }, null, 2) + '\n');
    console.log('Saved summary and individual samples to ' + process.env.BROWSER_PERF_OUTPUT);
  }
  console.log('RAF intervals measure callback timing, not presented frames; render call wall time may include blocking and is not GPU completion.');
  console.log('Bloom may make renderer.info reflect only its last pass. Local three.js/no fonts is not CDN or human acceptance.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
