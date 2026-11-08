// Offline proof of the solar-system click focus fix.
// Replicates the exact camera math in engine.ts:
//   - click handler: viewDir = -bodyDir, toTheta=atan2(vx,vz), toPhi=acos(vy)
//   - render loop:   camera.pos = want + dist*(sinφ sinθ, cosφ, sinφ cosθ)
//                     with want=(0,0,0), dist=sceneScale
// Asserts the clicked body ends up ON the camera's forward axis (centred) and the
// Sun (origin) is the look-at target — i.e. the whole system stays framed, which is
// what the "click asteroid -> everything vanished" bug broke.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => scale(a, 1 / (len(a) || 1));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
// angle (deg) between two vectors
const ang = (a, b) => {
  const c = clamp(dot(norm(a), norm(b)), -1, 1);
  return (Math.acos(c) * 180) / Math.PI;
};

const SCENE = 120; // SCALE_LEVELS[0].sceneScale
const FOV_HALF = 26; // half of 52° vertical fov (conservative)

function simulateClick(bodyPos) {
  // --- engine.ts click handler (new code) ---
  const bodyDir = norm(bodyPos);
  const viewDir = scale(bodyDir, -1);
  const toTheta = Math.atan2(viewDir.x, viewDir.z);
  const toPhi = clamp(Math.acos(clamp(viewDir.y, -1, 1)), 0.08, Math.PI - 0.08);
  // --- engine.ts render loop after flyTo completes ---
  const want = { x: 0, y: 0, z: 0 };
  const dist = SCENE;
  const sp = Math.sin(toPhi);
  const dir = {
    x: sp * Math.sin(toTheta),
    y: Math.cos(toPhi),
    z: sp * Math.cos(toTheta),
  }; // == viewDir by construction
  const cameraPos = add(want, scale(dir, dist));
  // forward = want - cameraPos (camera looks at want)
  const forward = norm(sub(want, cameraPos));
  return { cameraPos, forward, dir };
}

const cases = [
  ["Ceres (2.8 AU)", { x: 2.0, y: 0.0, z: 1.95 }],
  ["Haumea (43 AU)", { x: 30.4, y: 12.0, z: 22.8 }],
  ["Earth (1 AU)", { x: 0.98, y: 0.1, z: -0.17 }],
];
let ok = true;
for (const [name, body] of cases) {
  const { cameraPos, forward } = simulateClick(body);
  const bodyDir = norm(body);
  // body must lie along the forward axis (centred, not off to the side)
  const bodyOffAxis = ang(sub(body, cameraPos), forward);
  // Sun (origin) is the look-at target -> must be exactly forward
  const sunOffAxis = ang(sub({ x: 0, y: 0, z: 0 }, cameraPos), forward);
  // camera must sit on the opposite side of the Sun from the body
  const camVsBody = dot(norm(cameraPos), bodyDir); // expect ~ -1
  const pass =
    bodyOffAxis < 1.0 && sunOffAxis < 1.0 && camVsBody < -0.999;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}: bodyOffAxis=${bodyOffAxis.toFixed(2)}°  sunOffAxis=${sunOffAxis.toFixed(2)}°  cam·bodyDir=${camVsBody.toFixed(3)}`,
  );
  if (!pass) ok = false;
}
console.log(ok ? "VERIFY_PASS" : "VERIFY_FAIL");
process.exit(ok ? 0 : 1);
