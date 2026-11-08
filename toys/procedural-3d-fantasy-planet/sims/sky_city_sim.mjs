// City geometry and camera journeys exercise the actual page, not a reimplementation. They do not
// judge artistic quality or performance; browser/cities.mjs covers normal WebGL and input wiring.
import { buildWorld } from './world.mjs';

const w = await buildWorld();
const { THREE, R, SEA, EYE, heightAt, scene, camera, state, skyCities, focusSkyCity, returnFromSkyCity,
  updateCamera, switchMode, teleportTo, mapAnchors, zoom } = w;
let pass = 0, fail = 0;
const ok = (label, condition, detail = '') => {
  if (condition) { pass++; console.log('  PASS ' + label + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
};
const travel = () => { for (let i = 0; i < 120 && state.transition; i++) updateCamera(1 / 60); };
const camLook = target => {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  return forward.dot(target.clone().sub(camera.position).normalize());
};

scene.updateMatrixWorld(true);
let minRadius = Infinity, invalid = 0, totalVertices = 0;
for (const city of skyCities) for (const mesh of city.meshes) {
  const p = mesh.geometry.attributes.position, v = new THREE.Vector3(); totalVertices += p.count;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    if (!Number.isFinite(v.x + v.y + v.z)) invalid++;
    else minRadius = Math.min(minRadius, v.length());
  }
}
ok('three detailed city models are physical, finite and above the two mirror bands',
  skyCities.length === 3 && skyCities.every(c => c.group.parent === scene && c.group.visible && c.meshes.length >= 4) &&
  invalid === 0 && minRadius > 9.4 && totalVertices > 30000,
  `${totalVertices} vertices; ${invalid} invalid; lowest radius ${minRadius.toFixed(3)}`);
const [vire, solen, kest] = skyCities;
ok('each city has its own architectural materials and structural components',
  vire.count.mirror >= 16 && vire.count.masonry >= 40 && solen.count.metal >= 60 && solen.count.light >= 60 &&
  kest.count.foliage >= 15 && kest.count.canvas === 3 && kest.count.masonry >= 50,
  `VIRE ${vire.count.mirror} mirror parts; SOLEN ${solen.count.metal} metal parts; KEST ${kest.count.foliage} canopies`);
const ringBefore = solen.movingRing.rotation.y;
w.advanceFrame(1);
ok('Solen breathes without removing its outer ring', solen.movingRing.visible && solen.movingRing.rotation.y !== ringBefore);

const initial = { position: camera.position.clone(), yaw: state.yaw, polar: state.polar, distance: state.distance };
ok('invalid city names do not start a camera trip', !focusSkyCity('NOT-A-CITY') && !state.skyFocus && !state.transition);
ok('choosing Vire starts a real orbit camera flight', focusSkyCity('VIRE') && state.mode === 'orbit' &&
  state.skyFocus?.city === vire && !!state.transition && skyCities.every(c => c.group.visible));
let minClearance = Infinity;
for (let i = 0; i < 120 && state.transition; i++) {
  updateCamera(1 / 60);
  const d = camera.position.clone().normalize();
  minClearance = Math.min(minClearance, camera.position.length() - R - Math.max(SEA, heightAt(d)));
}
const aim = new THREE.Vector3(0, .14, 0).applyQuaternion(vire.group.quaternion).add(vire.group.position);
ok('the flight arrives near the actual city without entering the planet', !state.transition &&
  Math.abs(camera.position.distanceTo(aim) - state.distance) < .02 && camLook(aim) > .999 && minClearance >= EYE * .89,
  `city distance ${camera.position.distanceTo(aim).toFixed(2)}, terrain clearance ${minClearance.toFixed(3)}`);
const beforeZoom = state.distance; zoom(.5); updateCamera(.2);
ok('city zoom approaches the existing model rather than replacing it', state.skyFocus?.city === vire &&
  state.distance < beforeZoom && state.distance >= 1.55 && skyCities.every(c => c.group.visible));
const beforeRotate = camera.position.clone(); state.yaw += .5; updateCamera(.3);
ok('city orbit rotates around the same world-space model', camera.position.distanceTo(beforeRotate) > .2 &&
  state.skyFocus.city === vire && camLook(aim) > .96);
ok('return begins a trip back to the previous planetary orbit', returnFromSkyCity() && !state.skyFocus && !!state.transition);
travel();
ok('return restores the original orbit position and controls', !state.transition && Math.abs(state.yaw - initial.yaw) < 1e-9 &&
  Math.abs(state.polar - initial.polar) < 1e-9 && Math.abs(state.distance - initial.distance) < 1e-9 &&
  camera.position.distanceTo(initial.position) < .02);

focusSkyCity('SOLEN'); travel();
state.distance = 8; state.polar = Math.PI - .13; updateCamera(3);
const belowCity = camera.position.clone().normalize();
ok('wide, low city orbit keeps the camera outside real terrain', camera.position.length() >=
  R + Math.max(SEA, heightAt(belowCity)) + EYE * .89);
focusSkyCity('KEST'); travel();
ok('switching cities keeps the original planet return point', state.skyFocus?.city === kest &&
  Math.abs(state.skyFocus.back.yaw - initial.yaw) < 1e-9);
switchMode(); travel();
ok('descent from a city leaves focus and lands on real ground', state.mode === 'ground' && !state.skyFocus && !state.transition &&
  Math.abs(state.radius - (R + Math.max(SEA, heightAt(state.direction)) + EYE)) < 1e-7);
const surfaceDirection = state.direction.clone();
ok('choosing a city from the surface takes the camera to orbit, not onto a city', focusSkyCity('SOLEN') && state.mode === 'orbit' &&
  state.skyFocus?.city === solen && state.direction.distanceTo(surfaceDirection) < 1e-8);
travel();
teleportTo(mapAnchors[1]); travel();
ok('a chart teleport from city focus clears it and lands at the selected anchor', state.mode === 'ground' && !state.skyFocus &&
  !state.transition && state.direction.distanceTo(mapAnchors[1].direction) < 1e-8);

const mobile = await buildWorld({ width: 320, height: 568, reducedMotion: true });
// The fixture restores Node's globals after construction; set them while exercising the live viewport.
const oldWidth = globalThis.innerWidth, oldHeight = globalThis.innerHeight;
globalThis.innerWidth = 320; globalThis.innerHeight = 568;
mobile.focusSkyCity('VIRE');
for (let i = 0; i < 40 && mobile.state.transition; i++) mobile.updateCamera(1 / 60);
mobile.scene.updateMatrixWorld(true); mobile.camera.updateMatrixWorld(true);
let visible = 0, all = 0;
for (const mesh of mobile.skyCities[0].meshes) {
  const p = mesh.geometry.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 12) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).project(mobile.camera); all++;
    if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) visible++;
  }
}
ok('portrait camera frames the full Vire model with reduced-motion flight', !mobile.state.transition &&
  mobile.state.distance === 4.7 && visible / all > .98,
  `${visible}/${all} sampled vertices inside the frustum`);
const reducedBefore = mobile.skyCities[1].movingRing.rotation.y;
mobile.advanceFrame(2); const reducedFirst = mobile.skyCities[1].movingRing.rotation.y;
mobile.advanceFrame(2); const reducedSecond = mobile.skyCities[1].movingRing.rotation.y;
ok('reduced motion retains the ring but keeps it still', mobile.skyCities[1].movingRing.visible &&
  reducedFirst === reducedSecond && (reducedBefore !== reducedFirst || reducedFirst === .2));
globalThis.innerWidth = oldWidth; globalThis.innerHeight = oldHeight;

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
