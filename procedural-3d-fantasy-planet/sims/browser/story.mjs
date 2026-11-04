// Controlled real-browser story regression. It uses the app's own state machines, DOM, WebGL and
// AudioContext; the scene is never hidden in the saved images. A temporary diagnostic mask attributes
// pixels, not performance. It does not replace a human visual/audio review or real-device testing.
import { Buffer } from 'node:buffer';
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
const imageDir = process.env.BROWSER_STORY_DIR;
if (imageDir) fs.mkdirSync(imageDir, { recursive: true });
let html = fs.readFileSync(process.env.BROWSER_PAGE_HTML || path.join(root, 'index.html'), 'utf8');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.174.0/';
if (html.split(cdn).length !== 3) throw new Error('Unexpected three.js imports.');
html = html.split(cdn).join('/__three/').replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>/g, '');
const anchor = '      window.aetheris={';
if (html.split(anchor).length !== 2) throw new Error('Cannot insert the test probe.');
html = html.replace(anchor, '      window.__storyProbe={THREE,scene,camera,renderer,state,R,SEA,WATER,EYE,SWIM_EYE,landing,' +
  'nearDirection,heightAt,groundRadius,overlapAt,landmarks,orbitPose,groundPose,targetPosition,targetRotation,updateCamera,updateWorld,renderScene,' +
  'clearInput,story,storyStage,recordDetune,STORY_KEY,storyMarkDirection,inquest,updateInquest,clearInquest,patrol,patrolWorld,' +
  'shelterRings,updateStoryAlert,INQUEST_SHELTER,eventState,triggerEvent,finishEvent,CODEX,codexScan,echoSites,echoes,updateEchoes,' +
  'trenchDirection,shadow,drowned,updateDrowned,updateAudioMix,skyCities,getAudio:()=>audio,setWorldMap,mapWorldDraw};\n' + anchor);
const server = http.createServer((req, res) => {
  let url; try { url = new URL(req.url, 'http://127.0.0.1'); } catch (_) { res.writeHead(400).end(); return; }
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html); return; }
  if (url.pathname === '/storage-helper') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<title>Storage event test</title>'); return; }
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
const saveDataURL = (name, data) => { if (imageDir) fs.writeFileSync(path.join(imageDir, name), Buffer.from(data.split(',')[1], 'base64')); };
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless: process.env.BROWSER_HEADLESS_SHELL === '1' ? 'shell' : true,
    args: ['--disable-dev-shm-usage', ...args], protocolTimeout: timeout });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: scale, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(() => {
    window.__storyAudioTargets = new WeakMap();
    const original = window.AudioParam.prototype.setTargetAtTime;
    window.AudioParam.prototype.setTargetAtTime = function (value, ...rest) {
      window.__storyAudioTargets.set(this, value); return original.call(this, value, ...rest);
    };
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__storyProbe)), { timeout, polling: 1000 });
  check('real WebGL2 world starts on an emulated touch viewport',
    await page.evaluate(() => window.aetherisStartup.ready && !window.aetherisStartup.error && window.aetherisStartup.graphics?.webgl2));
  const emptyLegend = await page.evaluate(() => ({ mark: getComputedStyle(document.getElementById('inquestLegend')).display,
    trench: getComputedStyle(document.getElementById('trenchLegend')).display }));
  check('story map legends are actually hidden before they exist', emptyLegend.mark === 'none' && emptyLegend.trench === 'none');
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__storyProbe.state.mode === 'ground' && !window.__storyProbe.state.transition,
    { timeout, polling: 1000 });
  check('the actual F-key descent finishes before the controlled fixture', true);

  // Re-create the app's initial orbit camera, then compare the complete scene with one city masked
  // at a time. The exported image always has all three cities present, and this is not a speed test.
  const cityFrame = await page.evaluate(() => {
    const p = window.__storyProbe, s = p.state;
    p.renderer.setAnimationLoop(null); p.clearInput();
    const portrait = window.innerWidth / window.innerHeight < .76;
    s.mode = 'orbit'; s.transition = null; s.yaw = .42; s.polar = 1.16; s.distance = portrait ? 20 : 14; s.composition = 0;
    p.updateCamera(0); p.orbitPose(); p.camera.position.copy(p.targetPosition); p.camera.quaternion.copy(p.targetRotation);
    p.camera.fov = portrait ? 61 : 50; p.camera.updateProjectionMatrix(); p.updateWorld(0);
    p.scene.updateMatrixWorld(true); p.camera.updateMatrixWorld(true);
    const gl = p.renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const actual = new Uint8Array(width * height * 4), reference = new Uint8Array(actual.length);
    p.renderScene(); p.renderScene(); const image = p.renderer.domElement.toDataURL('image/png');
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, actual);
    const counts = [];
    for (const city of p.skyCities) {
      city.group.visible = false; p.renderScene(); p.renderScene();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, reference);
      city.group.visible = true;
      let count = 0; for (let i = 0; i < width * height; i++) {
        if (Math.max(...[0, 1, 2].map(c => Math.abs(actual[i * 4 + c] - reference[i * 4 + c]))) >= 6) count++;
      }
      counts.push({ id: city.id, pixels: count });
    }
    p.renderScene();
    return { image, counts, glError: gl.getError(), width, height };
  });
  saveDataURL('cities.png', cityFrame.image);
  check('all three actual sky cities contribute pixels in the compact orbit view', cityFrame.glError === 0 &&
    cityFrame.counts.length === 3 && cityFrame.counts.every(c => c.pixels >= 5), JSON.stringify(cityFrame.counts));

  const setup = await page.evaluate(() => {
    const p = window.__storyProbe, s = p.state;
    // Stop only for reproducible controlled frame/pixel comparisons, not to mask slow gameplay.
    p.renderer.setAnimationLoop(null); p.clearInput();
    let site = null;
    for (let i = 0; i < 300 && !site; i++) {
      const dir = p.nearDirection(p.landing, i * 2.4, (.35 + (i % 8) * .04) / p.R);
      if (p.heightAt(dir) > p.SEA + .02 && p.landmarks.every(l => l.direction.distanceTo(dir) * p.R > p.INQUEST_SHELTER + .04) &&
          p.overlapAt(dir, p.R + p.heightAt(dir)) < 1e-8) site = dir;
    }
    if (!site) throw new Error('No exposed dry fixture.');
    s.mode = 'ground'; s.transition = null; s.direction.copy(site); s.radius = p.groundRadius(site) + p.EYE;
    s.water = false; s.submerged = false; s.grounded = true; s.speed = 0; p.clearInquest();
    p.triggerEvent('ley'); for (let i = 0; i < 910; i++) p.updateInquest(.1, true);
    if (p.inquest.phase !== 'warning') throw new Error('Expected a warning, got ' + p.inquest.phase);
    // Move within the real search area, then aim the existing first-person rig at the patrol.
    for (let i = 0; i < 16; i++) {
      const candidate = p.nearDirection(site, i * Math.PI / 8, .17 / p.R);
      if (p.heightAt(candidate) > p.SEA + .01 && p.overlapAt(candidate, p.R + p.heightAt(candidate)) < 1e-8) {
        s.direction.copy(candidate); s.radius = p.groundRadius(candidate) + p.EYE; break;
      }
    }
    p.updateInquest(.1, true); p.updateStoryAlert(0);
    const eye = s.direction.clone().multiplyScalar(s.radius), look = p.patrolWorld.clone().sub(eye);
    const vertical = look.dot(s.direction), horizontal = look.clone().addScaledVector(s.direction, -vertical);
    s.heading.copy(horizontal).normalize(); s.pitch = Math.atan2(vertical, horizontal.length());
    p.updateCamera(0); p.groundPose(); p.camera.position.copy(p.targetPosition); p.camera.quaternion.copy(p.targetRotation);
    p.camera.fov = 70; p.camera.updateProjectionMatrix(); p.updateWorld(0);
    p.scene.updateMatrixWorld(true); p.camera.updateMatrixWorld(true);
    const patrolEntry = p.CODEX.find(entry => entry.id === 'inquest');
    p.codexScan(s.direction, p.camera.getWorldDirection(new p.THREE.Vector3()));
    window.__fixtureSite = site.toArray();
    return { phase: p.inquest.phase, visible: p.patrol.visible, recognized: patrolEntry.seen,
      alert: document.getElementById('storyAlert').textContent,
      pitch: s.pitch, protected: p.landmarks.some(l => l.direction.distanceTo(s.direction) * p.R <= p.INQUEST_SHELTER) };
  });
  check('controlled operation produces a visible patrol and a readable warning',
    setup.phase === 'warning' && setup.visible && setup.alert.includes('巡管虫') && !setup.protected, JSON.stringify(setup));
  check('looking at the actual patrol discovers its archive entry', setup.recognized);

  // Render the complete scene, then mask only the patrol for attribution and restore it. The saved
  // image is always the original unmasked frame; no frame rate or performance claim is made.
  const patrolFrame = await page.evaluate(() => {
    const p = window.__storyProbe, gl = p.renderer.getContext();
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const a = new Uint8Array(width * height * 4), b = new Uint8Array(a.length);
    p.renderScene(); p.renderScene(); const image = p.renderer.domElement.toDataURL('image/png');
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, a);
    p.patrol.visible = false; p.renderScene(); p.renderScene(); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, b);
    p.patrol.visible = true; p.renderScene();
    let pixels = 0; for (let i = 0; i < width * height; i++) {
      if (Math.max(...[0, 1, 2].map(c => Math.abs(a[i * 4 + c] - b[i * 4 + c]))) >= 6) pixels++;
    }
    return { image, width, height, pixels, glError: gl.getError() };
  });
  saveDataURL('patrol.png', patrolFrame.image);
  check('the normal unmasked WebGL frame contains the patrol or its real light',
    patrolFrame.glError === 0 && patrolFrame.pixels >= 20, `${patrolFrame.pixels} changed pixels / ${patrolFrame.width * patrolFrame.height}`);

  const marked = await page.evaluate(() => {
    const p = window.__storyProbe, s = p.state, site = new p.THREE.Vector3().fromArray(window.__fixtureSite);
    s.direction.copy(site); s.radius = p.groundRadius(site) + p.EYE;
    for (let i = 0; i < 1500 && p.story.detections < 3; i++) p.updateInquest(.1, true);
    p.updateStoryAlert(0); p.setWorldMap(true); p.mapWorldDraw();
    const canvas = document.getElementById('worldMapCanvas'), ctx = canvas.getContext('2d');
    const withMark = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const saved = p.story.mark; p.story.mark = null; p.mapWorldDraw();
    const withoutMark = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    p.story.mark = saved; p.mapWorldDraw();
    let changed = 0; for (let i = 0; i < withMark.length; i += 4) {
      if (Math.max(Math.abs(withMark[i] - withoutMark[i]), Math.abs(withMark[i + 1] - withoutMark[i + 1]),
        Math.abs(withMark[i + 2] - withoutMark[i + 2])) >= 6) changed++;
    }
    const result = { detections: p.story.detections, mark: p.story.mark, changed,
      legend: getComputedStyle(document.getElementById('inquestLegend')).display, saved: localStorage.getItem(p.STORY_KEY) };
    p.setWorldMap(false); return result;
  });
  check('three real passes save and draw a distinct recorded mark on the chart',
    marked.detections === 3 && !!marked.mark && marked.changed >= 20 && marked.legend !== 'none' && JSON.parse(marked.saved).detections === 3,
  `chart pixels changed: ${marked.changed}`);

  // Stage one: point the first-person rig at a genuinely world-anchored night-water school.
  const echoFrame = await page.evaluate(() => {
    const p = window.__storyProbe, s = p.state;
    p.finishEvent(); for (let i = p.story.detunes; i < 20; i++) p.recordDetune();
    p.updateWorld(0);
    const index = p.echoSites.findIndex((_site, i) => {
      const matrix = new p.THREE.Matrix4(); p.echoes.getMatrixAt(i, matrix);
      return matrix.elements[0] ** 2 + matrix.elements[1] ** 2 + matrix.elements[2] ** 2 > .004;
    });
    if (index < 0) throw new Error('No visible night school.');
    const dir = p.echoSites[index].dir, viewer = p.nearDirection(dir, 0, .14 / p.R);
    s.direction.copy(viewer); s.radius = p.WATER + p.SWIM_EYE; s.water = true; s.submerged = false;
    const eye = viewer.clone().multiplyScalar(s.radius), look = dir.clone().multiplyScalar(p.WATER + .006).sub(eye);
    const vertical = look.dot(viewer), horizontal = look.clone().addScaledVector(viewer, -vertical);
    s.heading.copy(horizontal).normalize(); s.pitch = Math.atan2(vertical, horizontal.length());
    p.updateCamera(0); p.groundPose(); p.camera.position.copy(p.targetPosition); p.camera.quaternion.copy(p.targetRotation);
    p.camera.updateProjectionMatrix(); p.updateWorld(0); p.scene.updateMatrixWorld(true); p.camera.updateMatrixWorld(true);
    const gl = p.renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const a = new Uint8Array(width * height * 4), b = new Uint8Array(a.length);
    p.renderScene(); p.renderScene(); const image = p.renderer.domElement.toDataURL('image/png');
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, a);
    p.echoes.visible = false; p.renderScene(); p.renderScene(); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, b);
    p.echoes.visible = true; p.renderScene();
    let pixels = 0; for (let i = 0; i < width * height; i++) {
      if (Math.max(...[0, 1, 2].map(c => Math.abs(a[i * 4 + c] - b[i * 4 + c]))) >= 6) pixels++;
    }
    return { image, pixels, glError: gl.getError(), index };
  });
  saveDataURL('echoes.png', echoFrame.image);
  check('a real night-water view contains stage-one echo pixels', echoFrame.glError === 0 && echoFrame.pixels >= 20,
    `${echoFrame.pixels} attributable pixels, school ${echoFrame.index}`);

  await page.keyboard.press('m');
  const pulse = await page.evaluate(() => {
    const p = window.__storyProbe; for (let i = p.story.detunes; i < 50; i++) p.recordDetune();
    const audio = p.getAudio(); p.state.direction.copy(p.trenchDirection); p.updateAudioMix(0, true);
    const near = window.__storyAudioTargets.get(audio.drownedGain.gain);
    p.state.direction.copy(p.trenchDirection).negate(); p.updateAudioMix(0, true);
    return { state: audio.ctx.state, near, far: window.__storyAudioTargets.get(audio.drownedGain.gain), stage: p.storyStage() };
  });
  check('a real enabled AudioContext receives the near-trench pulse and fades it far away',
    pulse.state === 'running' && pulse.stage === 2 && pulse.near > 0 && pulse.far === 0, JSON.stringify(pulse));

  const shadowFrame = await page.evaluate(() => {
    const p = window.__storyProbe, s = p.state;
    for (let i = p.story.detunes; i < 100; i++) p.recordDetune();
    p.triggerEvent('veil'); p.eventState.time = 7;
    s.direction.copy(p.nearDirection(p.trenchDirection, 0, .70 / p.R)); s.radius = p.WATER + p.SWIM_EYE;
    s.water = true; s.submerged = false; p.updateDrowned(.1, true);
    const target = p.drowned.direction.clone().multiplyScalar(p.WATER + .75), eye = s.direction.clone().multiplyScalar(s.radius);
    const look = target.sub(eye), vertical = look.dot(s.direction), horizontal = look.clone().addScaledVector(s.direction, -vertical);
    s.heading.copy(horizontal).normalize(); s.pitch = Math.atan2(vertical, horizontal.length());
    p.updateCamera(0); p.groundPose(); p.camera.position.copy(p.targetPosition); p.camera.quaternion.copy(p.targetRotation);
    p.camera.updateProjectionMatrix(); p.updateWorld(0); p.scene.updateMatrixWorld(true); p.camera.updateMatrixWorld(true);
    const gl = p.renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const a = new Uint8Array(width * height * 4), b = new Uint8Array(a.length);
    p.renderScene(); p.renderScene(); const image = p.renderer.domElement.toDataURL('image/png');
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, a);
    p.shadow.visible = false; p.renderScene(); p.renderScene(); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, b);
    p.shadow.visible = true; p.renderScene();
    let pixels = 0; for (let i = 0; i < width * height; i++) {
      if (Math.max(...[0, 1, 2].map(c => Math.abs(a[i * 4 + c] - b[i * 4 + c]))) >= 6) pixels++;
    }
    return { image, pixels, glError: gl.getError(), active: p.drowned.active };
  });
  saveDataURL('drowned.png', shadowFrame.image);
  check('the stage-three veil draws a tangible Drowned shadow in a real sea view',
    shadowFrame.active && shadowFrame.glError === 0 && shadowFrame.pixels >= 20, `${shadowFrame.pixels} attributable pixels`);
  const persisted = await page.evaluate(() => localStorage.getItem(window.__storyProbe.STORY_KEY));
  await page.reload({ waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__storyProbe)), { timeout, polling: 1000 });
  const restored = await page.evaluate(() => ({ d: window.aetheris.diagnostics(), mark: window.__storyProbe.story.mark,
    legend: getComputedStyle(document.getElementById('inquestLegend')).display,
    trench: getComputedStyle(document.getElementById('trenchLegend')).display }));
  check('a real browser reload restores the signal, recorded mark and both legend items',
    restored.d.storyDetunes === 100 && restored.d.inquestDetections === 3 && restored.d.inquestMarked &&
    !!restored.mark && restored.legend !== 'none' && restored.trench !== 'none', JSON.stringify(restored.d));

  // A lightweight same-origin tab exercises real storage events without starting another world.
  const helper = await browser.newPage(); await helper.goto(url + 'storage-helper', { waitUntil: 'domcontentloaded', timeout });
  const key = await page.evaluate(() => window.__storyProbe.STORY_KEY);
  await helper.evaluate(keyName => localStorage.removeItem(keyName), key);
  await page.waitForFunction(() => window.aetheris.diagnostics().storyDetunes === 0 && !window.aetheris.diagnostics().inquestMarked,
    { timeout, polling: 500 });
  check('a reset from another tab propagates to the live world', true);
  await helper.evaluate((keyName, value) => localStorage.setItem(keyName, value), key, persisted);
  await page.waitForFunction(() => window.aetheris.diagnostics().storyDetunes === 100 && window.aetheris.diagnostics().inquestMarked,
    { timeout, polling: 500 });
  check('a valid save from another tab is reflected in the live world', true);
  await helper.evaluate(keyName => localStorage.setItem(keyName, '{broken'), key);
  await page.waitForFunction(() => window.aetheris.diagnostics().storyStorage === 'corrupt', { timeout, polling: 500 });
  const broken = await page.evaluate(() => window.aetheris.diagnostics());
  check('a corrupt incoming save is reported without erasing the live story', broken.storyDetunes === 100 && broken.inquestMarked);
  await helper.evaluate((keyName, value) => localStorage.setItem(keyName, value), key, persisted);
  await page.waitForFunction(() => window.aetheris.diagnostics().storyStorage === 'available', { timeout, polling: 500 });
  await helper.close();

  await page.keyboard.press('o');
  const panel = await page.evaluate(() => ({ open: document.getElementById('archive').getAttribute('aria-hidden') === 'false',
    progress: document.getElementById('storyProgress')?.textContent,
    storage: document.getElementById('storyStorage')?.textContent, cities: document.getElementById('archiveBody')?.textContent }));
  check('the real archive reports saved counts and local storage', panel.open && panel.progress.includes('100') &&
    panel.progress.includes('3 / 3') && panel.storage.includes('本地存储'), JSON.stringify({ open: panel.open, progress: panel.progress, storage: panel.storage }));
  check('the archive names and describes all three sky cities', ['VIRE', 'SOLEN', 'KEST'].every(id => panel.cities.includes(id)));
  await page.focus('.story-reset summary'); await page.keyboard.press('Space');
  const resetLayout = await page.evaluate(() => {
    const details = document.querySelector('.story-reset'), button = document.getElementById('storyReset');
    const r = button.getBoundingClientRect(), panelRect = document.getElementById('archive').getBoundingClientRect();
    return { open: details.open, height: r.height, left: r.left, right: r.right, panelLeft: panelRect.left, panelRight: panelRect.right };
  });
  check('keyboard Space opens the explicit reset disclosure and the touch target fits', resetLayout.open && resetLayout.height >= 44 &&
    resetLayout.left >= resetLayout.panelLeft && resetLayout.right <= resetLayout.panelRight, JSON.stringify(resetLayout));
  await page.tap('#storyReset');
  const reset = await page.evaluate(() => ({ d: window.aetheris.diagnostics(), key: localStorage.getItem(window.__storyProbe.STORY_KEY),
    progress: document.getElementById('storyProgress').textContent }));
  check('the emulated touch confirmation clears the saved story and refreshes the archive',
    reset.key === null && reset.d.storyDetunes === 0 && reset.d.inquestDetections === 0 && !reset.d.inquestMarked &&
    reset.progress.includes('累计错音 0'), JSON.stringify(reset.d));
  check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\nStory checked in controlled Chromium fixtures. Screenshots are unmasked; human/device visual and audio review remains open.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
