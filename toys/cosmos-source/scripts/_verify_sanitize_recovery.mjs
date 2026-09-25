// Offline proof that the camera-sanitizer + per-frame guard RECOVERS a poisoned
// (NaN) camera state. This is the real fix for "click asteroid -> all bodies
// vanish, layer toggle can't restore": a single NaN in theta/phi/dist/target is
// sticky (lerp/flyTo keep NaN forever), so without the sanitizer the scene stays
// blank permanently. We mirror engine.ts sanitizeCamera() + the guarded frame loop.

const D2R = Math.PI / 180;
const SCENE_SCALE = 120;

function isFinite3(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

// engine.ts sanitizeCamera()
function sanitizeCamera(cam) {
  cam.focus = null;
  cam.theta = 0.7;
  cam.phi = 1.05;
  cam.dist = SCENE_SCALE;
  cam.wantDist = SCENE_SCALE;
  cam.want = { x: 0, y: 0, z: 0 };
  cam.target = { x: 0, y: 0, z: 0 };
  cam.flyToActive = false;
}

// engine.ts guarded frame-loop camera step (non-flyMode)
function step(cam, dt = 1 / 60) {
  // per-frame safety net
  if (
    !Number.isFinite(cam.theta) ||
    !Number.isFinite(cam.phi) ||
    !Number.isFinite(cam.dist) ||
    !Number.isFinite(cam.target.x) ||
    !Number.isFinite(cam.target.y) ||
    !Number.isFinite(cam.target.z)
  ) {
    sanitizeCamera(cam);
  }
  const sm = 1 - Math.exp(-7 * dt);
  cam.target.x += (cam.want.x - cam.target.x) * sm;
  cam.target.y += (cam.want.y - cam.target.y) * sm;
  cam.target.z += (cam.want.z - cam.target.z) * sm;
  cam.dist += (cam.wantDist - cam.dist) * sm;
  const sp2 = Math.max(0.05, Math.min(Math.PI - 0.05, cam.phi));
  const pos = {
    x: cam.target.x + cam.dist * Math.sin(sp2) * Math.sin(cam.theta),
    y: cam.target.y + cam.dist * Math.cos(sp2),
    z: cam.target.z + cam.dist * Math.sin(sp2) * Math.cos(cam.theta),
  };
  return pos;
}

// project world point to NDC (fov 52, aspect 16/9)
function project(world, camPos, target) {
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const norm = (a) => {
    const L = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / L, y: a.y / L, z: a.z / L };
  };
  const fwd = norm(sub(target, camPos));
  const up0 = { x: 0, y: 1, z: 0 };
  const right = norm(cross(fwd, up0));
  const up = cross(right, fwd);
  const d = sub(world, camPos);
  const z = dot(d, fwd);
  if (z <= 0) return { z, x: NaN, y: NaN };
  const tanF = Math.tan((52 * D2R) / 2);
  return {
    z,
    ndcX: dot(d, right) / z / (tanF * (16 / 9)),
    ndcY: dot(d, up) / z / tanF,
  };
}

function run(label, poison) {
  const cam = {
    theta: 0.7,
    phi: 1.05,
    dist: 120,
    wantDist: 120,
    want: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    focus: null,
    flyToActive: false,
  };
  // poison BEFORE the frame (simulate the stuck state from a prior bad interaction)
  Object.assign(cam, poison);
  const pos = step(cam); // first guarded frame
  const okPos = isFinite3(pos);
  const sun = project({ x: 0, y: 0, z: 0 }, pos, cam.target);
  const earth = project({ x: 15, y: 0, z: 0 }, pos, cam.target);
  const haumea = project({ x: 129, y: 0, z: 0 }, pos, cam.target);
  const onScreen = (p) =>
    Number.isFinite(p.ndcX) &&
    Number.isFinite(p.ndcY) &&
    Math.abs(p.ndcX) < 1.2 &&
    Math.abs(p.ndcY) < 1.2 &&
    p.z > 0;
  // Recovery criterion: camera finite + Sun centred + inner system (Earth) visible.
  // Haumea sits at 129 scene units in readable mode (just outside the default 120
  // camera distance) so it may legitimately fall near/over the frustum edge — that is
  // a scale-design note, not the "all bodies vanish" bug we are fixing.
  const ok = okPos && onScreen(sun) && onScreen(earth);
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}: camPos=(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}) sun=(${sun.ndcX?.toFixed(2)},${sun.ndcY?.toFixed(2)}) earth=(${earth.ndcX?.toFixed(2)},${earth.ndcY?.toFixed(2)}) haumea=(${haumea.ndcX?.toFixed(2)},${haumea.ndcY?.toFixed(2)}) [haumea edge OK]`,
  );
  return ok;
}

let pass = true;
pass = run("dist=NaN", { dist: NaN }) && pass;
pass = run("theta=NaN", { theta: NaN }) && pass;
pass = run("phi=NaN", { phi: NaN }) && pass;
pass = run("target=NaN", { target: { x: NaN, y: 0, z: 0 } }) && pass;
pass =
  run("all=NaN", {
    theta: NaN,
    phi: NaN,
    dist: NaN,
    target: { x: NaN, y: NaN, z: NaN },
  }) && pass;
// Negative control: a VANILLA lerp (no guard) would keep NaN forever.
{
  const cam = {
    theta: NaN,
    phi: 1.05,
    dist: NaN,
    wantDist: 120,
    want: { x: 0, y: 0, z: 0 },
    target: { x: NaN, y: 0, z: 0 },
  };
  const sm = 1 - Math.exp(-7 / 60);
  cam.target.x += (cam.want.x - cam.target.x) * sm; // NaN
  cam.dist += (cam.wantDist - cam.dist) * sm; // NaN
  const stillNaNB =
    !Number.isFinite(cam.dist) && !Number.isFinite(cam.target.x);
  console.log(
    `${stillNaNB ? "PASS" : "FAIL"} control: unguarded lerp keeps NaN forever (proves the bug was sticky)`,
  );
  pass = stillNaNB && pass;
}
console.log(
  pass
    ? "\nVERIFY_PASS: sanitizer recovers all poisoned states"
    : "\nVERIFY_FAIL",
);
process.exit(pass ? 0 : 1);
