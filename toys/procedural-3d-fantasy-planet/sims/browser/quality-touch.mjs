// Touch-screen quality control regression. The real page starts and is tapped in orbit and after
// its actual descent; only the subsequent responsive-layout sweep pauses the animation, so that slow
// software renderers cannot change AUTO between assertions. Local three.js, no external fonts and
// emulated touch are not human, CDN, GPU or device acceptance; synthetic slow frames do not measure speed.
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
const scale = Number(process.env.BROWSER_SCALE || .5);
const timeout = Number(process.env.BROWSER_TIMEOUT_MS || 210000);
const extraArgs = process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [];
if (!Array.isArray(extraArgs) || extraArgs.some(arg => typeof arg !== 'string')) {
  throw new Error('CHROME_ARGS must be a JSON array of Chromium argument strings.');
}

let html = fs.readFileSync(process.env.BROWSER_PAGE_HTML || path.join(root, 'index.html'), 'utf8');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.174.0/';
if (html.split(cdn).length !== 3) throw new Error('Unexpected three.js imports; inspect the browser proxy mapping.');
html = html.split(cdn).join('/__three/');
html = html.replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>/g, '');
const anchor = '      window.aetheris={';
if (html.split(anchor).length !== 2) throw new Error('Cannot find the unique observability insertion point.');
html = html.replace(anchor,
  '      window.__touchQuality={renderer,quality,applyQuality,updateQuality,state};\n' + anchor);

// This test owns a loopback-only server; it never changes the user's 8080 preview.
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
const check = (name, condition, info = '') => {
  if (!condition) throw new Error(name + (info ? ' — ' + info : ''));
  console.log('  PASS ' + name + (info ? ' — ' + info : ''));
};
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless: process.env.BROWSER_HEADLESS_SHELL === '1' ? 'shell' : true,
    args: ['--disable-dev-shm-usage', ...extraArgs], protocolTimeout: timeout });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const viewport = (width, height) => ({ width, height, deviceScaleFactor: scale, hasTouch: true });
  await page.setViewport(viewport(320, 568));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__touchQuality)),
  { timeout, polling: 1000 });
  await page.evaluate(() => document.fonts.ready);
  const startup = await page.evaluate(() => ({ error: window.aetherisStartup.error || '',
    coarse: matchMedia('(pointer: coarse)').matches, gpu: window.aetherisStartup.graphics?.gpu,
    dmSansLoaded: [...document.fonts].some(font => font.family === 'DM Sans' && font.status === 'loaded') }));
  check('the real world started with emulated coarse touch', !startup.error && startup.coarse,
    startup.error || startup.gpu + '; DM Sans loaded: ' + startup.dmSansLoaded);

  // Capture the state synchronously after the app's own click handler: real AUTO may downgrade
  // between the click and a protocol read on a very slow renderer.
  await page.evaluate(() => {
    const button = document.getElementById('qualityStatus');
    window.__qualityClicks = [];
    button.addEventListener('click', () => {
      const p = window.__touchQuality, style = getComputedStyle(button, '::before');
      // Measure the longest rendered line with the same font and tracking; a pseudo-element itself
      // has no box API. This catches a label that fits the button's rectangle but spills out of it.
      const ruler = document.createElement('span');
      Object.assign(ruler.style, { position: 'fixed', visibility: 'hidden', whiteSpace: 'pre',
        fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
        fontStyle: style.fontStyle, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing });
      ruler.textContent = ['QUALITY', button.dataset.mobileMode, button.dataset.mobileTier].join('\n');
      document.body.appendChild(ruler);
      const labelWidth = ruler.getBoundingClientRect().width;
      ruler.remove();
      window.__qualityClicks.push({ mode: p.quality.mode, tier: p.quality.tier, text: button.textContent,
        mobileMode: button.dataset.mobileMode, mobileTier: button.dataset.mobileTier,
        labelWidth, contentWidth: button.clientWidth, aria: button.getAttribute('aria-label'), title: button.title,
        antialias: p.renderer.getContext().getContextAttributes()?.antialias ?? null });
    });
  });
  const buttonBox = async () => page.evaluate(() => {
    const b = document.getElementById('qualityStatus'), rect = b.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      hit: !!hit && (hit === b || b.contains(hit)), display: getComputedStyle(b).display,
      before: getComputedStyle(b, '::before').content };
  });
  const tapCycle = async label => {
    const b = await buttonBox();
    check(label + ': quality is visible, touch-sized and receives a tap',
      b.display !== 'none' && b.width >= 44 && b.height >= 44 && b.hit && b.before.includes('QUALITY'), JSON.stringify(b));
    const initialAA = await page.evaluate(() => window.__touchQuality.renderer.getContext().getContextAttributes()?.antialias ?? null);
    const before = await page.evaluate(() => window.__qualityClicks.length);
    for (const [mode, tier] of [['high', 0], ['balanced', 1], ['auto', 0]]) {
      await page.touchscreen.tap(b.left + b.width / 2, b.top + b.height / 2);
      const click = await page.evaluate(() => window.__qualityClicks.at(-1));
      const tierName = ['HIGH', 'BALANCED', 'SMOOTH'][tier], mobileMode = mode === 'auto' ? 'AUTO' : 'LOCKED';
      check(label + ': tap selects ' + mode, !!click && click.mode === mode && click.tier === tier &&
        click.mobileMode === mobileMode && click.mobileTier === tierName &&
        click.text === mobileMode + ' / ' + tierName && click.antialias === initialAA &&
        click.labelWidth <= click.contentWidth + .1 &&
        click.aria.includes('Render quality') && click.aria.includes('Antialiasing') &&
        click.title.includes('aa=on') && click.title.includes('aa=off'), JSON.stringify(click));
    }
    const count = await page.evaluate(() => window.__qualityClicks.length);
    check(label + ': each tap fired exactly once', count === before + 3, String(count - before));
  };
  await tapCycle('orbit');

  // Tap the actual on-screen view control, not a direct change to state, then exercise the quality
  // control again after the production transition has finished and the ground HUD is present.
  const switchBox = await page.$eval('#switchButton', element => {
    const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.touchscreen.tap(switchBox.x, switchBox.y);
  await page.waitForFunction(() => window.__touchQuality.state.mode === 'ground' && !window.__touchQuality.state.transition,
    { timeout, polling: 1000 });
  check('touching SWITCH VIEW completes the actual descent', true);
  await tapCycle('ground');
  if (process.env.BROWSER_SCREENSHOT) {
    await page.screenshot({ path: process.env.BROWSER_SCREENSHOT, captureBeyondViewport: false });
    console.log('  screenshot: ' + process.env.BROWSER_SCREENSHOT + ' (emulated touch, no human visual review)');
  }

  // Layout and event wiring, not frame-rate measurement: pause only for this sweep and feed AUTO a
  // synthetic delay below. The separate adaptive test covers the live animation loop.
  await page.evaluate(() => window.__touchQuality.renderer.setAnimationLoop(null));
  const widths = [320, 350, 360, 390, 420, 421, 480, 500, 501, 540, 541, 600, 760, 761, 1000];
  for (const width of widths) {
    await page.setViewport(viewport(width, width < 400 ? 568 : 844));
    const layout = await page.evaluate(() => {
      const shown = element => {
        const s = getComputedStyle(element), r = element.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };
      return [document.querySelector('.brand'), ...document.querySelectorAll('.top-actions > *')]
        .filter(shown).map(element => {
          const r = element.getBoundingClientRect();
          return { name: element.id || element.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
    });
    const outside = layout.filter(box => box.left < -.1 || box.right > width + .1);
    const overlaps = [];
    for (let i = 0; i < layout.length; i++) for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i], b = layout[j];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > .2 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .2) overlaps.push(a.name + '/' + b.name);
    }
    const box = await buttonBox();
    check(width + ' px: visible header controls fit without overlapping', !outside.length && !overlaps.length &&
      box.width >= 44 && box.height >= 44 && box.hit,
    outside.length || overlaps.length ? JSON.stringify({ outside, overlaps, layout }) : 'touch target ' + box.width + '×' + box.height);
    if ([320, 420, 421, 500, 501, 540, 541, 760, 761, 1000].includes(width)) {
      await page.evaluate(() => {
        const p = window.__touchQuality; p.quality.mode = 'auto'; p.quality.tier = 0; p.applyQuality();
      });
      await tapCycle(width + ' px');
    }
  }
  await page.setViewport(viewport(390, 844));
  await page.evaluate(() => {
    const p = window.__touchQuality; p.quality.mode = 'auto'; p.quality.tier = 0; p.applyQuality();
  });
  await page.keyboard.press('q');
  const keyedHigh = await page.evaluate(() => window.__touchQuality.quality.mode === 'high');
  await page.focus('#qualityStatus');
  const priorClicks = await page.evaluate(() => window.__qualityClicks.length);
  await page.keyboard.press('Enter');
  const enter = await page.evaluate(() => ({ mode: window.__touchQuality.quality.mode,
    clicks: window.__qualityClicks.length, focus: document.activeElement?.id }));
  await page.keyboard.press('q');
  const keyedAuto = await page.evaluate(() => window.__touchQuality.quality.mode === 'auto');
  check('Q and keyboard activation still operate the same narrow-screen button', keyedHigh && keyedAuto &&
    enter.mode === 'balanced' && enter.clicks === priorClicks + 1 && enter.focus === 'qualityStatus', JSON.stringify(enter));

  await page.evaluate(() => {
    const p = window.__touchQuality; p.quality.mode = 'auto'; p.quality.tier = 0; p.applyQuality();
    for (let i = 0; i < 20; i++) p.updateQuality(.2);
  });
  const automatic = await page.evaluate(() => {
    const p = window.__touchQuality, b = document.getElementById('qualityStatus');
    return { mode: p.quality.mode, tier: p.quality.tier, mobileMode: b.dataset.mobileMode,
      mobileTier: b.dataset.mobileTier, text: b.textContent, aria: b.getAttribute('aria-label'),
      before: getComputedStyle(b, '::before').content };
  });
  check('synthetic slow frames update both the accessible and compact AUTO / SMOOTH labels',
    automatic.mode === 'auto' && automatic.tier === 2 && automatic.mobileMode === 'AUTO' &&
    automatic.mobileTier === 'SMOOTH' && automatic.text === 'AUTO / SMOOTH' &&
    automatic.aria.includes('smooth') && automatic.before.includes('AUTO') && automatic.before.includes('SMOOTH'),
  JSON.stringify(automatic));
  check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\nTouch-quality smoke passed. Emulated touch/local three.js, not a hardware or human acceptance.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
