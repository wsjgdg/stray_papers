// Optional end-to-end fauna smoke: real Chromium, WebGL and Web Audio, using the page's own animation
// loop. We place the player (not the animal) at a clear, measured encounter site so a test does not need
// minutes of walking. No fauna update, pose or sound function is invoked by the test itself.
// Like smoke.mjs, the page is an in-memory copy served with locked local three.js and no external fonts.
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
  width: Number(process.env.BROWSER_WIDTH || 480), height: Number(process.env.BROWSER_HEIGHT || 270),
  deviceScaleFactor: Number(process.env.BROWSER_SCALE || .5)
};
const timeout = Number(process.env.BROWSER_TIMEOUT_MS || 210000);
const observedFrames = Number(process.env.BROWSER_FAUNA_FRAMES || 30);
if (!Number.isInteger(observedFrames) || observedFrames < 8 || observedFrames > 120) {
  throw new Error('BROWSER_FAUNA_FRAMES must be an integer between 8 and 120.');
}
const extraArgs = process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [];
if (!Array.isArray(extraArgs) || extraArgs.some(arg => typeof arg !== 'string')) {
  throw new Error('CHROME_ARGS must be a JSON array of Chromium argument strings.');
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.174.0/';
if (html.split(cdn).length !== 3) throw new Error('Unexpected three.js imports; inspect the browser proxy mapping.');
html = html.split(cdn).join('/__three/');
html = html.replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>/g, '');
const anchor = '      window.aetheris={';
if (html.split(anchor).length !== 2) throw new Error('Cannot find the unique observability insertion point.');
html = html.replace(anchor,
  '      window.__faunaProbe={THREE,scene,camera,renderer,state,R,SEA,EYE,WALKER_RADIUS,heightAt,overlapAt,' +
  'bell,bellBodyMesh,bellLegMesh,hardProps,stoneSolids,grass,fern,flowers,groundPatch,groundPose,targetPosition,targetRotation,' +
  'clearInput,resetGroundMotion,getAudio:()=>audio};\n' + anchor);
const stepAnchor = 'physicsStep(1/120);physicsTime-=1/120;frameBump=Math.max(frameBump,state.bump);';
if (html.split(stepAnchor).length !== 2) throw new Error('Cannot find the unique physics substep.');
html = html.replace(stepAnchor, 'physicsStep(1/120);' +
  'if(window.__faunaWatch&&state.pushed>1e-8)window.__faunaWatch.pushSubsteps++;' +
  'physicsTime-=1/120;frameBump=Math.max(frameBump,state.bump);');
const frameAnchor = '          updateCamera(dt,timestamp);updateWorld(dt);';
if (html.split(frameAnchor).length !== 2) throw new Error('Cannot find the unique real-frame insertion point.');
html = html.replace(frameAnchor, frameAnchor + `
          if(window.__faunaWatch){
            const w=window.__faunaWatch,d=bell[w.index];
            const body=new THREE.Matrix4(),leg=new THREE.Matrix4();
            bellBodyMesh.getMatrixAt(w.index,body);bellLegMesh.getMatrixAt(w.index*3,leg);
            const local=body.invert().multiply(leg),e=local.elements;
            camera.updateMatrixWorld();
            const projected=d.world.clone().addScaledVector(d.pos,.024).project(camera);
            w.samples.push({pos:d.pos.toArray(),player:state.direction.toArray(),phase:d.phase,
              legAngle:Math.atan2(e[6],e[5]),stride:d.stride,velocity:d.vel,awake:d.awake,
              projected:projected.toArray(),mode:d.mode,pushed:state.pushed,dt});
            // Finish on a real rendered frame, so even a very fast machine cannot race past the
            // observation window before Puppeteer has time to examine or optionally capture it.
            if(w.samples.length>=w.maxFrames)renderer.setAnimationLoop(null);
          }`);

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
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless: process.env.BROWSER_HEADLESS_SHELL === '1' ? 'shell' : true,
    args: ['--disable-dev-shm-usage', ...extraArgs], protocolTimeout: timeout });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Record the frequency scheduled for real oscillator starts; do not replace the audio graph.
  await page.evaluateOnNewDocument(() => {
    const scheduled = new WeakMap();
    const setValue = window.AudioParam.prototype.setValueAtTime;
    window.AudioParam.prototype.setValueAtTime = function (value, time) {
      if (!scheduled.has(this)) scheduled.set(this, value);
      return setValue.call(this, value, time);
    };
    const start = window.OscillatorNode.prototype.start;
    window.__faunaOscillators = [];
    window.OscillatorNode.prototype.start = function (...args) {
      window.__faunaOscillators.push({ frequency: scheduled.get(this.frequency) ?? this.frequency.value,
        at: this.context.currentTime });
      return start.apply(this, args);
    };
  });
  const check = (label, condition, info = '') => {
    if (!condition) throw new Error(label + (info ? ' — ' + info : ''));
    console.log('  PASS ' + label + (info ? ' — ' + info : ''));
  };
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  check('HTTP page is served', response?.status() === 200);
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__faunaProbe)),
  { timeout, polling: 1000 });
  const startup = await page.evaluate(() => ({ ready: window.aetherisStartup.ready,
    error: window.aetherisStartup.error, webgl2: window.aetherisStartup.graphics?.webgl2,
    build: window.aetheris?.diagnostics().build, animals: window.__faunaProbe?.bell.length }));
  check('real WebGL world and herd start without an application error',
    startup.ready && !startup.error && startup.webgl2 && startup.animals >= 24,
    startup.build + ', ' + startup.animals + ' animals');

  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__faunaProbe.state.mode === 'ground' &&
    !window.__faunaProbe.state.transition, { timeout, polling: 500 });
  await page.keyboard.press('m');
  await page.waitForFunction(() => window.__faunaProbe.getAudio()?.ctx.state === 'running' &&
    window.__faunaProbe.getAudio().master.gain.value > .5, { timeout, polling: 500 });
  check('real F and M keys arrive on the ground with sound enabled',
    await page.evaluate(() => document.getElementById('soundButton').getAttribute('aria-pressed') === 'true'));

  // Select the first dry, clear encounter where the actual 3D feet distance is below the animal's
  // 45 mm bolt trigger, but the walker's collision cylinder is outside all the other bodies.
  const encounter = await page.evaluate(maxFrames => {
    const p = window.__faunaProbe;
    let chosen = null;
    for (let i = 0; i < p.bell.length && !chosen; i++) {
      const d = p.bell[i];
      if (d.mode === 'flee') continue;
      const east = new p.THREE.Vector3(1, 0, 0).cross(d.pos);
      if (east.lengthSq() < 1e-10) east.set(0, 0, 1).cross(d.pos);
      east.normalize();
      const north = new p.THREE.Vector3().crossVectors(d.pos, east).normalize();
      for (let k = 0; k < 24; k++) {
        const angle = k * Math.PI / 12, distance = d.hit.r + p.WALKER_RADIUS + .004;
        const dir = d.pos.clone().addScaledVector(east, Math.cos(angle) * distance / p.R)
          .addScaledVector(north, Math.sin(angle) * distance / p.R).normalize();
        const h = p.heightAt(dir), feet = dir.clone().multiplyScalar(p.R + h);
        if (h <= p.SEA + .01 || Math.abs(h - p.heightAt(d.pos)) > .008 ||
            feet.distanceTo(d.world) >= .045 || p.overlapAt(dir, feet.length()) > 1e-8) continue;
        if (p.bell.some(other => other !== d && other.pos.distanceTo(dir) * p.R <
          other.hit.r + p.WALKER_RADIUS + .006)) continue;
        const away = d.pos.clone().sub(dir).addScaledVector(d.pos, -d.pos.dot(d.pos.clone().sub(dir))).normalize();
        const next = d.pos.clone().addScaledVector(away, .025 / p.R).normalize();
        if (p.heightAt(next) < p.SEA + .006) continue;
        if ([...p.hardProps, ...p.stoneSolids].some(post => post.dir.distanceTo(next) * p.R < post.r + d.hit.r + .004)) continue;
        if (p.bell.some(other => other !== d && other.pos.distanceTo(next) * p.R < other.hit.r + d.hit.r + .006)) continue;
        chosen = { index: i, dir, feetDistance: feet.distanceTo(d.world), gap: distance - d.hit.r - p.WALKER_RADIUS };
        break;
      }
    }
    if (!chosen) return null;
    const state = p.state, d = p.bell[chosen.index];
    p.clearInput(); p.resetGroundMotion();
    state.direction.copy(chosen.dir);
    state.radius = p.R + p.heightAt(chosen.dir) + p.EYE;
    state.feetRadius = p.R + p.heightAt(chosen.dir);
    state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
    state.velocity = 0; state.grounded = true; state.moveVelocity.set(0, 0, 0); state.ghost = false;
    // Aim at the animal's real body, not at the unit-sphere direction.
    const eye = chosen.dir.clone().multiplyScalar(state.radius);
    const toAnimal = d.world.clone().addScaledVector(d.pos, .024).sub(eye);
    const vertical = toAnimal.dot(chosen.dir);
    state.heading.copy(toAnimal).addScaledVector(chosen.dir, -vertical).normalize();
    state.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(vertical,
      toAnimal.clone().addScaledVector(chosen.dir, -vertical).length())));
    state.faceTarget = null;
    p.groundPose(); p.camera.position.copy(p.targetPosition); p.camera.quaternion.copy(p.targetRotation);
    window.__faunaWatch = { index: chosen.index, maxFrames, samples: [], pushSubsteps: 0,
      startAnimal: d.pos.toArray(), startPlayer: state.direction.toArray(), startPhase: d.phase,
      oscillatorMark: window.__faunaOscillators.length };
    return { index: chosen.index, feetDistance: chosen.feetDistance, collisionGap: chosen.gap,
      pitch: state.pitch };
  }, observedFrames);
  check('a real animal has a clear encounter site within its bolt trigger', !!encounter &&
    encounter.feetDistance < .045 && encounter.collisionGap > 0,
  encounter ? 'animal ' + encounter.index + ', feet distance ' + (encounter.feetDistance * 1000).toFixed(1) +
    ' mm, collision gap ' + (encounter.collisionGap * 1000).toFixed(1) + ' mm' : 'no valid site');

  await page.waitForFunction(() => window.__faunaWatch?.samples.length >= window.__faunaWatch?.maxFrames,
    { timeout, polling: 500 });
  const observation = await page.evaluate(() => {
    const w = window.__faunaWatch, R = window.__faunaProbe.R, samples = w.samples;
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * R;
    const angles = samples.map(s => s.legAngle);
    return { frames: samples.length, awake: samples.filter(s => s.awake).length,
      modes: [...new Set(samples.map(s => s.mode))],
      travel: Math.max(...samples.map(s => distance(s.pos, w.startAnimal))),
      playerDrift: Math.max(...samples.map(s => distance(s.player, w.startPlayer))),
      pushes: w.pushSubsteps,
      phase: Math.max(...samples.map(s => s.phase - w.startPhase)),
      legRange: Math.max(...angles) - Math.min(...angles),
      inFrustum: samples.filter(s => Math.abs(s.projected[0]) <= 1 && Math.abs(s.projected[1]) <= 1 &&
        s.projected[2] >= -1 && s.projected[2] <= 1).length,
      finalProjection: samples[samples.length - 1].projected,
      elapsed: samples.reduce((sum, s) => sum + s.dt, 0),
      oscillators: window.__faunaOscillators.slice(w.oscillatorMark) };
  });
  check('the page animation loop wakes and startles the animal', observation.awake > 0 &&
    observation.modes.includes('flee'), observation.frames + ' frames; modes ' + observation.modes.join(', ') +
    '; body centre in camera frustum on ' + observation.inFrustum + ' frames (occlusion not checked)');
  check('the animal moves and its actual instanced leg matrix swings', observation.travel > .003 &&
    observation.phase > .25 && observation.legRange > .05,
  (observation.travel * 1000).toFixed(1) + ' mm travel; phase ' + observation.phase.toFixed(2) +
    ' rad; leg swing range ' + observation.legRange.toFixed(2) + ' rad');
  check('the stationary walker is not shoved by the animal', observation.playerDrift < .002 && observation.pushes === 0,
    (observation.playerDrift * 1000).toFixed(2) + ' mm drift; ' + observation.pushes + ' push substeps');
  check('the natural startle schedules its real 172 Hz huff',
    observation.oscillators.some(s => Math.round(s.frequency) === 172),
    'new oscillator frequencies ' + observation.oscillators.map(s => s.frequency).join(', '));
  check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  if (process.env.BROWSER_FAUNA_RAYS === '1') {
    // Diagnostic only: CPU raycasting does not reproduce the vertex shader's near-camera shrink.
    const ray = await page.evaluate(() => {
      const p = window.__faunaProbe, d = p.bell[window.__faunaWatch.index];
      p.scene.updateMatrixWorld(true);
      const target = d.world.clone().addScaledVector(d.pos, .045), delta = target.clone().sub(p.camera.position);
      const cast = new p.THREE.Raycaster(p.camera.position, delta.clone().normalize(), 0, delta.length());
      cast.camera = p.camera; // Sprite.raycast needs the viewing camera even for a world-space ray.
      const visible = object => {
        for (let o = object; o; o = o.parent) if (!o.visible) return false;
        return true;
      };
      const label = object => object === p.fern ? 'fern' : object === p.grass ? 'grass' :
        object === p.flowers ? 'flowers' : object === p.groundPatch ? 'ground patch' :
        object === p.bellBodyMesh ? 'animal body' : object === p.bellLegMesh ? 'animal legs' :
        (object.name || object.type + '/' + object.geometry?.type + '/' + object.geometry?.attributes?.position?.count);
      return { distance: delta.length(), hits: cast.intersectObjects(p.scene.children, true)
        .filter(hit => hit.object.isMesh && visible(hit.object)).slice(0, 8)
        .map(hit => ({ name: label(hit.object), distance: hit.distance, instance: hit.instanceId })) };
    });
    console.log('  CPU line-of-sight diagnostic (shader deformation not applied): ' + JSON.stringify(ray));
  }
  if (process.env.BROWSER_SCREENSHOT) {
    await page.screenshot({ path: process.env.BROWSER_SCREENSHOT, captureBeyondViewport: false });
    console.log('  screenshot: ' + process.env.BROWSER_SCREENSHOT + ' (loop paused on the observed frame)');
  }
  console.log('\nFauna browser smoke passed. The player was placed near a herd; no human visual/audio acceptance.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
