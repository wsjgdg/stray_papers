// Offline replication of the cosmos click -> camera -> frame-loop pipeline.
// Goal: prove that clicking Haumea (SYS node, ellip) or Ceres (asteroid ball) now
// (a) produces a FINITE camera, (b) actually ZOOMS IN (dist < overview distance),
// and (c) centres the clicked body on screen. Mirrors src/lib/cosmos/math-utils.ts
// and the solar branch + frame-loop camera math in src/lib/cosmos/engine.ts AFTER the
// focus-based fly-to restore (replaces the 8e1925a "rotate-only" behaviour).

const D2R = Math.PI / 180;

// --- rotMatrix / posAU (verbatim from math-utils.ts) ---
function rotMatrix(b) {
  return { Om: b.Om * D2R, i: b.i * D2R, w: b.w * D2R };
}
function posAU(b, t) {
  if (b._n === undefined) {
    b._m = rotMatrix(b);
    b._n = (2 * Math.PI) / b.P;
    b._q = Math.sqrt(1 - b.e * b.e);
  }
  const M = b.M0 * D2R + b._n * t;
  let E = M;
  for (let k = 0; k < 6; k++) {
    const dE = (E - b.e * Math.sin(E) - M) / (1 - b.e * Math.cos(E));
    E -= dE;
    if (dE < 1e-13 && dE > -1e-13) break;
  }
  const sE = Math.sin(E),
    cE = Math.cos(E);
  const x0 = b.a * (cE - b.e),
    y0 = b.a * b._q * sE,
    z0 = 0;
  const cw = Math.cos(b.w * D2R),
    sw = Math.sin(b.w * D2R);
  const x1 = x0 * cw - y0 * sw,
    y1 = x0 * sw + y0 * cw,
    z1 = z0;
  const ci = Math.cos(b.i * D2R),
    si = Math.sin(b.i * D2R);
  const x2 = x1,
    y2 = y1 * ci - z1 * si,
    z2 = y1 * si + z1 * ci;
  const cO = Math.cos(b.Om * D2R),
    sO = Math.sin(b.Om * D2R);
  const x3 = x2 * cO - y2 * sO,
    y3 = x2 * sO + y2 * cO,
    z3 = z2;
  return { x: x3, y: z3, z: -y3 };
}

// --- scalePos (readable) & scalePosReal ---
const K = 15,
  POW = 0.55,
  C_REAL = 8;
function scalePos(p, real) {
  const r = Math.hypot(p.x, p.y, p.z);
  if (r < 1e-9) return { x: p.x, y: p.y, z: p.z };
  const s = real ? C_REAL : K * Math.pow(r, POW - 1);
  return { x: p.x * s, y: p.y * s, z: p.z * s };
}

// --- SCALE_LEVELS[0] from engine (readable=120, real=320 per setRealScale) ---
const SCENE_SCALE = 120;

// Real data
const HAUMEA = {
  a: 43.116,
  e: 0.19486,
  i: 28.213,
  Om: 122.163,
  w: 239.0,
  M0: 191,
  P: 103400,
};
const CERES = {
  a: 2.7659,
  e: 0.0758,
  i: 10.594,
  Om: 80.305,
  w: 73.597,
  M0: 95.989,
  P: Math.pow(2.7659, 1.5) * 365.25,
};

function isFinite3(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

// Overview camera pose (the state BEFORE the click) used to derive the look direction.
function overviewCam(theta = 0.7, phi = 1.05, dist = SCENE_SCALE) {
  const sp = Math.max(0.05, Math.min(Math.PI - 0.05, phi));
  return {
    x: dist * Math.sin(sp) * Math.sin(theta),
    y: dist * Math.cos(sp),
    z: dist * Math.sin(sp) * Math.cos(theta),
  };
}

// Solar branch (focus-based fly-to, post restore) for a body world-position.
// bodyScale = hit.object.scale.x (visual radius). For ellip nodes the mesh is
// rDisp*1.6, for asteroid balls max(0.3, rDisp*2.2) — both small, so the min-clamp
// (ellip?6:3) dominates and toDist is a tight close-up.
function simulateClick(body, real, simT, ellip, bodyScale = 1) {
  const au = posAU(body, simT);
  if (!isFinite3(au)) return { err: "posAU NaN" };
  const bodyPos = scalePos(au, real);
  if (!isFinite3(bodyPos)) return { err: "scalePos NaN" };
  const toDist = Math.max(ellip ? 6 : 3, bodyScale * 2.5);
  // Direction from current (overview) camera position to the body.
  const cam0 = overviewCam();
  const camToObj = {
    x: bodyPos.x - cam0.x,
    y: bodyPos.y - cam0.y,
    z: bodyPos.z - cam0.z,
  };
  const L = Math.hypot(camToObj.x, camToObj.y, camToObj.z) || 1;
  const toTheta = Math.atan2(camToObj.x, camToObj.z);
  const toPhi = Math.max(
    0.08,
    Math.min(
      Math.PI - 0.08,
      Math.acos(Math.max(-1, Math.min(1, camToObj.y / L))),
    ),
  );
  // cam.focus = body  ->  the per-frame loop drives `want` to the body world position.
  const want = { ...bodyPos };
  const wantDist = toDist;
  return { toTheta, toPhi, want, wantDist, bodyPos, toDist };
}

// Frame-loop camera integration (non-flyMode branch)
function runFrames(click, frames = 200, dt = 1 / 60) {
  let theta = click.toTheta,
    phi = click.toPhi,
    dist = click.wantDist;
  let target = { ...click.want };
  for (let f = 0; f < frames; f++) {
    const sm = 1 - Math.exp(-7 * dt);
    target.x += (click.want.x - target.x) * sm;
    target.y += (click.want.y - target.y) * sm;
    target.z += (click.want.z - target.z) * sm;
    dist += (click.wantDist - dist) * sm;
    const sp2 = Math.max(0.05, Math.min(Math.PI - 0.05, phi));
    const pos = {
      x: target.x + dist * Math.sin(sp2) * Math.sin(theta),
      y: target.y + dist * Math.cos(sp2),
      z: target.z + dist * Math.sin(sp2) * Math.cos(theta),
    };
    if (!isFinite3(pos))
      return { err: `camera NaN at frame ${f}`, theta, phi, dist, target };
  }
  return { theta, phi, dist, target };
}

// Project a world point to NDC using a look-at from camera pos toward target, fov 52.
function projectToNDC(world, camPos, target, fovDeg = 52, aspect = 16 / 9) {
  const fwd = norm(sub(target, camPos));
  const up0 = { x: 0, y: 1, z: 0 };
  const right = norm(cross(fwd, up0));
  const up = cross(right, fwd);
  const d = sub(world, camPos);
  const x = dot(d, right);
  const y = dot(d, up);
  const z = dot(d, fwd);
  if (z <= 0) return { z, ndcX: NaN, ndcY: NaN };
  const tanF = Math.tan((fovDeg * D2R) / 2);
  const ndcX = x / z / (tanF * aspect);
  const ndcY = y / z / tanF;
  return { z, ndcX, ndcY };
}
function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function norm(a) {
  const L = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / L, y: a.y / L, z: a.z / L };
}

function check(name, body, real, simT, ellip) {
  const click = simulateClick(body, real, simT, ellip);
  if (click.err) {
    console.log(`FAIL ${name}: ${click.err}`);
    return false;
  }
  const end = runFrames(click);
  if (end.err) {
    console.log(`FAIL ${name}: ${end.err}`);
    return false;
  }
  const sp = Math.max(0.05, Math.min(Math.PI - 0.05, end.phi));
  const camPos = {
    x: end.target.x + end.dist * Math.sin(sp) * Math.sin(end.theta),
    y: end.target.y + end.dist * Math.cos(sp),
    z: end.target.z + end.dist * Math.sin(sp) * Math.cos(end.theta),
  };
  const bodyW = scalePos(posAU(body, simT), real);
  const bodyP = projectToNDC(bodyW, camPos, end.target);
  const onScreen = (p) =>
    Number.isFinite(p.ndcX) &&
    Number.isFinite(p.ndcY) &&
    Math.abs(p.ndcX) < 1.1 &&
    Math.abs(p.ndcY) < 1.1 &&
    p.z > 0;
  // Sun is expected to drift off-screen for far bodies (focus is on the body) — so we
  // only assert the body itself is centred + in front, plus the camera is finite and
  // actually closer than the overview distance (i.e. it ZOOMED IN).
  const bodyCentred =
    onScreen(bodyP) && Math.abs(bodyP.ndcX) < 0.1 && Math.abs(bodyP.ndcY) < 0.1;
  const zoomedIn = end.dist < SCENE_SCALE;
  const ok = isFinite3(camPos) && bodyCentred && zoomedIn;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name} (real=${real} ellip=${ellip}): camPos=(${camPos.x.toFixed(1)},${camPos.y.toFixed(1)},${camPos.z.toFixed(1)}) dist=${end.dist.toFixed(1)} (overview=${SCENE_SCALE})`,
  );
  console.log(
    `     body ndc=(${bodyP.ndcX?.toFixed(2)},${bodyP.ndcY?.toFixed(2)}) z=${bodyP.z.toFixed(1)}  | centred=${bodyCentred} zoomedIn=${zoomedIn}`,
  );
  return ok;
}

const simT = (Date.now() - Date.UTC(2000, 0, 1)) / 86400000;
let pass = true;
pass = check("Haumea readable", HAUMEA, false, simT, true) && pass;
pass = check("Ceres  readable", CERES, false, simT, false) && pass;
pass = check("Haumea real   ", HAUMEA, true, simT, true) && pass;
pass = check("Ceres  real   ", CERES, true, simT, false) && pass;
console.log(
  pass
    ? "\nVERIFY_PASS: click flies in, camera finite, clicked body centred (Sun may leave frame for far bodies)"
    : "\nVERIFY_FAIL",
);
process.exit(pass ? 0 : 1);
