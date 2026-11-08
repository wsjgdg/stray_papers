// Optional controlled sightline regression. Start at the real default landing in Chromium, plan a
// dry route to the nearest animal's initial site, and walk it with the page's own physics and live
// herd updates. The loop is stepped by the test, not played at real-time RAF speed. At each candidate
// stop we render the unmodified scene, including vegetation; a second, diagnostic-only render masks
// nearby animal instances to attribute pixels. The saved screenshot is always the unmasked render.
// This is neither a promise of the default view nor human visual or hardware-performance acceptance.
import { Buffer } from 'node:buffer';
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
const attempts = Number(process.env.BROWSER_SIGHTLINE_ATTEMPTS || 12);
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 12) {
  throw new Error('BROWSER_SIGHTLINE_ATTEMPTS must be an integer between 1 and 12.');
}
const collectAll = process.env.BROWSER_SIGHTLINE_ALL === '1';
const viewDir = process.env.BROWSER_SIGHTLINE_DIR;
if (viewDir) fs.mkdirSync(viewDir, { recursive: true });
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
  '      window.__sightline={THREE,scene,camera,renderer,state,R,SEA,landing,nearDirection,heightAt,overlapAt,' +
  'bell,bellBodyMesh,bellHeadMesh,bellLegMesh,BELL_LEGS,groundPose,targetPosition,targetRotation,' +
  'clearInput,joystick,physicsStep,updateBell,updateWorld,renderScene,requestGroundRefresh,advanceGroundRefresh,' +
  'groundJob,getBloom:()=>bloomOn};\n' + anchor);

// The isolated test server is not the user's live preview. Its three.js is the locked test dependency.
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
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__sightline)), { timeout, polling: 1000 });
  const startupError = await page.evaluate(() => window.aetherisStartup.error || '');
  check('the real page started', !startupError, startupError);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__sightline.state.mode === 'ground' &&
    !window.__sightline.state.transition, { timeout, polling: 500 });

  // Stop real-time rendering only after the actual F descent. From this position use the page's own
  // ground and collision queries to find a candidate grid path, then verify it by continuous physics.
  const plan = await page.evaluate(() => {
    const p = window.__sightline, s = p.state;
    p.renderer.setAnimationLoop(null);
    p.clearInput();
    if (p.getBloom()) throw new Error('Use a compact viewport (BROWSER_WIDTH below 760) for the pixel comparison.');
    const start = s.direction.clone();
    const closest = p.bell.map((animal, index) => ({ animal, index,
      edge: animal.pos.distanceTo(start) * p.R - animal.hit.r })).sort((a, b) => a.edge - b.edge)[0];
    if (!closest) throw new Error('No animals were generated.');
    const initial = closest.animal.pos.clone();
    const limit = 2.2, step = .030, side = Math.ceil(limit * 2 / step) + 1, mid = Math.floor(side / 2);
    const count = side * side, dirs = new Array(count), passable = new Uint8Array(count);
    const previous = new Int32Array(count).fill(-1), queue = new Int32Array(count);
    for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
      const dx = (x - mid) * step, dz = (z - mid) * step, distance = Math.hypot(dx, dz);
      if (distance > limit) continue;
      const id = z * side + x, dir = p.nearDirection(start, Math.atan2(dz, dx), distance / p.R);
      const h = p.heightAt(dir);
      dirs[id] = dir;
      if (h > p.SEA + .012 && p.overlapAt(dir, p.R + h) < 1e-8) passable[id] = 1;
    }
    const rootCell = mid * side + mid;
    let front = 0, back = 0;
    if (passable[rootCell]) { previous[rootCell] = rootCell; queue[back++] = rootCell; }
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (; front < back; front++) {
      const id = queue[front], x = id % side, z = Math.floor(id / side);
      for (const [dx, dz] of offsets) {
        const xx = x + dx, zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= side || zz >= side) continue;
        const next = zz * side + xx;
        if (!passable[next] || previous[next] !== -1 ||
            (dx && dz && (!passable[z * side + xx] || !passable[zz * side + x]))) continue;
        previous[next] = id; queue[back++] = next;
      }
    }
    let goal = -1, gap = Infinity;
    for (let i = 0; i < count; i++) if (previous[i] >= 0) {
      const distance = dirs[i].distanceTo(initial) * p.R;
      if (distance < gap) { gap = distance; goal = i; }
    }
    if (goal < 0 || gap > .10) throw new Error('No dry grid path within 100 mm of the initial animal site.');
    const path = [];
    for (let id = goal; id !== rootCell; id = previous[id]) path.push(dirs[id]);
    path.reverse();
    window.__sightlineRoute = { path, step, waypoint: 0, frames: 0, wet: 0,
      minDry: Infinity, stuck: false, lastProgress: 0 };
    p.joystick.y = -.20; // analogue walking input; animals remain free to move or flee
    return { landingGap: start.distanceTo(p.landing) * p.R, initialEdge: closest.edge,
      animal: closest.index, gridGap: gap, waypoints: path.length };
  });
  check('the route starts at the actual landing', plan.landingGap < .002,
    (plan.landingGap * 1000).toFixed(1) + ' mm from landing');
  check('a candidate dry route approaches an actual animal', plan.initialEdge < 1.6 && plan.waypoints > 0,
    'initial edge ' + (plan.initialEdge * 1000).toFixed(1) + ' mm; ' + plan.waypoints + ' waypoints');

  let image = '', observation = null, walk = null, best = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // 120 Hz is the production physics step. This controlled run also updates the live herd at each
    // step; it does not teleport either player or animals. It is not an ordinary real-time input run.
    walk = await page.evaluate(() => {
      const p = window.__sightline, r = window.__sightlineRoute, s = p.state;
      let found = null;
      for (let n = 0; n < 120 * 70 && r.waypoint < r.path.length; n++) {
        while (r.waypoint < r.path.length && s.direction.distanceTo(r.path[r.waypoint]) * p.R < r.step * .58) {
          r.waypoint++; r.lastProgress = r.frames;
        }
        if (r.waypoint >= r.path.length) break;
        const aim = r.path[r.waypoint], heading = aim.clone().addScaledVector(s.direction, -aim.dot(s.direction));
        if (heading.lengthSq() > 1e-12) s.heading.copy(heading.normalize());
        p.physicsStep(1 / 120); p.updateBell(1 / 120, r.frames / 120); r.frames++;
        r.wet += Number(s.water);
        r.minDry = Math.min(r.minDry, p.heightAt(s.direction) - p.SEA);
        if (r.frames - r.lastProgress > 120 * 5) { r.stuck = true; break; }
        if (r.frames % 45) continue;
        const nearby = p.bell.map((animal, index) => ({ animal, index,
          distance: s.direction.distanceTo(animal.pos) * p.R })).filter(a => a.distance < .35)
          .sort((a, b) => a.distance - b.distance);
        for (const candidate of nearby) {
          const eye = s.direction.clone().multiplyScalar(s.radius);
          const target = candidate.animal.world.clone().addScaledVector(candidate.animal.pos, .025);
          let clearance = Infinity;
          for (let i = 1; i < 20; i++) {
            const point = eye.clone().lerp(target, i / 20), radius = point.length();
            clearance = Math.min(clearance, radius - p.R - p.heightAt(point.normalize()));
          }
          // Terrain clearance is only a candidate filter, not a visibility assertion: foliage and
          // structures are accounted for by the actual WebGL image below.
          if (clearance > .002) {
            found = { index: candidate.index, distance: candidate.distance, clearance };
            break;
          }
        }
        if (found) break;
      }
      return { found, waypoint: r.waypoint, total: r.path.length, seconds: r.frames / 120,
        wet: r.wet, minDry: r.minDry, stuck: r.stuck };
    });
    if (!walk.found) break;

    observation = await page.evaluate(candidate => {
      const p = window.__sightline, s = p.state, d = p.bell[candidate.index];
      const eye = s.direction.clone().multiplyScalar(s.radius);
      const to = d.world.clone().addScaledVector(d.pos, .025).sub(eye), vertical = to.dot(s.direction);
      s.heading.copy(to).addScaledVector(s.direction, -vertical).normalize();
      s.pitch = Math.max(-1.2, Math.min(1.2,
        Math.atan2(vertical, to.clone().addScaledVector(s.direction, -vertical).length())));
      p.groundPose();
      p.camera.position.copy(p.targetPosition); p.camera.quaternion.copy(p.targetRotation);
      // Finish the page's normal local dressing at this position before sampling. No fern, grass,
      // structure or animal is removed from the image being assessed or saved.
      p.requestGroundRefresh(s.direction);
      let slices = 0;
      while (p.groundJob.active && slices++ < 1000) p.advanceGroundRefresh(5);
      if (p.groundJob.active) throw new Error('Ground dressing did not finish.');
      p.updateWorld(0); p.scene.updateMatrixWorld(true); p.camera.updateMatrixWorld(true);
      p.renderer.shadowMap.needsUpdate = true;
      p.renderScene();
      const canvas = p.renderer.domElement, gl = p.renderer.getContext();
      const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      const actual = new Uint8Array(width * height * 4), without = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, actual);
      const errorA = gl.getError(), screenshot = canvas.toDataURL('image/png');

      // Attribution only: mask instances whose feet are within 650 mm. Keep the already-rendered
      // shadow map and every other object unchanged. Restore all matrices immediately afterward.
      const near = p.bell.map((animal, index) => ({ index, distance: s.direction.distanceTo(animal.pos) * p.R }))
        .filter(animal => animal.distance < .65);
      const targets = near.flatMap(({ index }) => [[p.bellBodyMesh, index], [p.bellHeadMesh, index],
        ...p.BELL_LEGS.map((_, leg) => [p.bellLegMesh, index * p.BELL_LEGS.length + leg])]);
      const saved = [];
      for (const [mesh, index] of targets) {
        const matrix = new p.THREE.Matrix4();
        mesh.getMatrixAt(index, matrix); saved.push(matrix);
        mesh.setMatrixAt(index, new p.THREE.Matrix4().makeScale(0, 0, 0));
        mesh.instanceMatrix.needsUpdate = true;
      }
      p.renderer.shadowMap.needsUpdate = false;
      // Three's object-upload cache can still carry the preceding shadow frame. A second render
      // guarantees that changed instance buffers have reached WebGL before reading the diagnostic.
      p.renderScene(); p.renderScene();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, without);
      const errorB = gl.getError();
      targets.forEach(([mesh, index], i) => { mesh.setMatrixAt(index, saved[i]); mesh.instanceMatrix.needsUpdate = true; });
      p.renderScene(); p.renderScene();
      let pixels = 0;
      for (let i = 0; i < width * height; i++) {
        let difference = 0;
        for (let c = 0; c < 3; c++) difference = Math.max(difference, Math.abs(actual[i * 4 + c] - without[i * 4 + c]));
        if (difference >= 8) pixels++;
      }
      return { width, height, pixels, near: near.length, errorA, errorB, screenshot };
    }, walk.found);
    image = observation.screenshot;
    delete observation.screenshot;
    if (observation.errorA || observation.errorB) throw new Error('WebGL readPixels failed: ' + JSON.stringify(observation));
    const minimum = Math.max(20, Math.ceil(observation.width * observation.height * .001));
    console.log('  view ' + (attempt + 1) + ': ' + observation.pixels + ' attributable pixels from ' +
      observation.near + ' nearby animals; need ' + minimum);
    if (viewDir) {
      const file = path.join(viewDir, 'sightline-' + String(attempt + 1).padStart(2, '0') + '.png');
      fs.writeFileSync(file, Buffer.from(image.split(',')[1], 'base64'));
      console.log('  unmasked view: ' + file);
    }
    if (!best || observation.pixels > best.observation.pixels) best = { observation, image, attempt: attempt + 1 };
    if (!collectAll && observation.pixels >= minimum) break;
  }
  await page.evaluate(() => { window.__sightline.joystick.y = 0; });
  if (best) {
    observation = best.observation; image = best.image;
    if (collectAll) console.log('  most attributable pixels: view ' + best.attempt + ' (not a visual clarity score)');
  }
  if (process.env.BROWSER_SCREENSHOT && image) {
    fs.writeFileSync(process.env.BROWSER_SCREENSHOT, Buffer.from(image.split(',')[1], 'base64'));
    console.log('  unmasked canvas screenshot: ' + process.env.BROWSER_SCREENSHOT);
  }
  check('continuous physics followed a dry route', !!walk && walk.seconds > 0 && walk.wet === 0 &&
    walk.minDry > 0 && !walk.stuck,
  walk ? walk.seconds.toFixed(2) + ' simulated seconds; ' + walk.wet + ' wet steps; minimum ground above sea ' +
    (walk.minDry * 1000).toFixed(1) + ' mm' : 'no route was stepped');
  const minimum = observation ? Math.max(20, Math.ceil(observation.width * observation.height * .001)) : Infinity;
  check('the unmasked WebGL view contains nearby-animal pixels', !!best && !!observation &&
    observation.near > 0 && observation.pixels >= minimum,
  observation ? observation.pixels + '/' + (observation.width * observation.height) + ' pixels changed in the ' +
    'diagnostic comparison; ' + observation.near + ' animals within 650 mm' : 'no suitable view');
  check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\nSightline regression passed. The route was stepped by the test, not walked by a human; ' +
    'human visual/audio and real-device acceptance remain outstanding.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
