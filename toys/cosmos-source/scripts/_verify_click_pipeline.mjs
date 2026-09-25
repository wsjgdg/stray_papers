// Offline replication of the cosmos click -> camera -> frame-loop pipeline.
// Goal: prove whether clicking Haumea (SYS node, ellip) or Ceres (asteroid ball)
// produces a FINITE camera + keeps the solar system on-screen after my 8e1925a fix.
// Mirrors src/lib/cosmos/math-utils.ts and the solar branch + frame-loop camera math
// in src/lib/cosmos/engine.ts.

const D2R = Math.PI / 180;

// --- rotMatrix / posAU (verbatim from math-utils.ts) ---
function rotMatrix(b) {
  return { Om: b.Om * D2R, i: b.i * D2R, w: b.w * D2R }; // we only need the composite below
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
  // apply R = Rz(Om)Rx(i)Rz(w)  to (a(cE-e), a*q*sE, 0)
  const x0 = b.a * (cE - b.e),
    y0 = b.a * b._q * sE,
    z0 = 0;
  // Rz(w): rotate (x0,y0) by w
  const cw = Math.cos(b.w * D2R),
    sw = Math.sin(b.w * D2R);
  const x1 = x0 * cw - y0 * sw,
    y1 = x0 * sw + y0 * cw,
    z1 = z0;
  // Rx(i): rotate (y1,z1) by i
  const ci = Math.cos(b.i * D2R),
    si = Math.sin(b.i * D2R);
  const x2 = x1,
    y2 = y1 * ci - z1 * si,
    z2 = y1 * si + z1 * ci;
  // Rz(Om): rotate (x2,y2) by Om
  const cO = Math.cos(b.Om * D2R),
    sO = Math.sin(b.Om * D2R);
  const x3 = x2 * cO - y2 * sO,
    y3 = x2 * sO + y2 * cO,
    z3 = z2;
  // engine returns (x, z, -y)
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

// Solar branch (post 8e1925a) for a body world-position = scalePos(posAU(body, t))
function simulateClick(body, real, simT) {
  const au = posAU(body, simT);
  if (!isFinite3(au)) return { err: "posAU NaN" };
  const bodyPos = scalePos(au, real);
  if (!isFinite3(bodyPos)) return { err: "scalePos NaN" };
  let bodyDir = { ...bodyPos };
  const len2 = bodyDir.x ** 2 + bodyDir.y ** 2 + bodyDir.z ** 2;
  if (len2 < 1e-9) bodyDir = { x: 0, y: 0, z: 1 };
  const L = Math.hypot(bodyDir.x, bodyDir.y, bodyDir.z);
  bodyDir = { x: bodyDir.x / L, y: bodyDir.y / L, z: bodyDir.z / L };
  // camera on opposite side of Sun: viewDir = -bodyDir
  const viewDir = { x: -bodyDir.x, y: -bodyDir.y, z: -bodyDir.z };
  const toTheta = Math.atan2(viewDir.x, viewDir.z);
  const toPhi = Math.max(
    0.08,
    Math.min(Math.PI - 0.08, Math.acos(Math.max(-1, Math.min(1, viewDir.y)))),
  );
  const want = { x: 0, y: 0, z: 0 };
  const wantDist = real ? 320 : SCENE_SCALE;
  return { toTheta, toPhi, want, wantDist, bodyPos, bodyDir };
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
  // forward
  const fwd = norm(sub(target, camPos));
  const up0 = { x: 0, y: 1, z: 0 };
  const right = norm(cross(fwd, up0));
  const up = cross(right, fwd);
  const d = sub(world, camPos);
  const x = dot(d, right);
  const y = dot(d, up);
  const z = dot(d, fwd); // depth along view (positive = in front)
  if (z <= 0) return { z, x: NaN, y: NaN };
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

function check(name, body, real, simT) {
  const click = simulateClick(body, real, simT);
  if (click.err) {
    console.log(`FAIL ${name}: ${click.err}`);
    return false;
  }
  const end = runFrames(click);
  if (end.err) {
    console.log(`FAIL ${name}: ${end.err}`);
    return false;
  }
  const camPos = {
    x:
      end.target.x +
      end.dist *
        Math.sin(Math.max(0.05, Math.min(Math.PI - 0.05, end.phi))) *
        Math.sin(end.theta),
    y:
      end.target.y +
      end.dist * Math.cos(Math.max(0.05, Math.min(Math.PI - 0.05, end.phi))),
    z:
      end.target.z +
      end.dist *
        Math.sin(Math.max(0.05, Math.min(Math.PI - 0.05, end.phi))) *
        Math.cos(end.theta),
  };
  // Project Sun (origin) and the clicked body
  const sun = projectToNDC({ x: 0, y: 0, z: 0 }, camPos, end.target);
  const bodyW = scalePos(posAU(body, simT), real);
  const bodyP = projectToNDC(bodyW, camPos, end.target);
  const onScreen = (p) =>
    Number.isFinite(p.ndcX) &&
    Number.isFinite(p.ndcY) &&
    Math.abs(p.ndcX) < 1.1 &&
    Math.abs(p.ndcY) < 1.1 &&
    p.z > 0;
  const ok = onScreen(sun) && onScreen(bodyP);
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name} (real=${real}): camPos=(${camPos.x.toFixed(1)},${camPos.y.toFixed(1)},${camPos.z.toFixed(1)}) dist=${end.dist.toFixed(1)}`,
  );
  console.log(
    `     sun ndc=(${sun.ndcX?.toFixed(2)},${sun.ndcY?.toFixed(2)}) z=${sun.z.toFixed(1)}  body ndc=(${bodyP.ndcX?.toFixed(2)},${bodyP.ndcY?.toFixed(2)}) z=${bodyP.z.toFixed(1)}`,
  );
  return ok;
}

const simT = (Date.now() - Date.UTC(2000, 0, 1)) / 86400000; // ~ arbitrary current-ish sim time
let pass = true;
pass = check("Haumea readable", HAUMEA, false, simT) && pass;
pass = check("Ceres  readable", CERES, false, simT) && pass;
pass = check("Haumea real   ", HAUMEA, true, simT) && pass;
pass = check("Ceres  real   ", CERES, true, simT) && pass;
console.log(
  pass
    ? "\nVERIFY_PASS: click pipeline finite + bodies on-screen"
    : "\nVERIFY_FAIL",
);
process.exit(pass ? 0 : 1);
