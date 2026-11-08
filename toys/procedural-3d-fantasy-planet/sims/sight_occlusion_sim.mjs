// Sight checks exercise the page's real terrain, building instance matrices, triangle raycasts and
// codex state. No scenery/collisions are hidden in the app; this bench is not a visual or speed test.
import { buildWorld } from './world.mjs';

const w = await buildWorld();
const { THREE, R, SEA, EYE, landing, heightAt, nearDirection, scene, camera, CODEX, codexScan, bell,
  sightBuildingBatches, inSight, inSightCone, terrainBlocksSight, buildingsBlockSight } = w;
let pass = 0, fail = 0;
const ok = (name, condition, detail = '') => {
  if (condition) { pass++; console.log('  PASS ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
};
const count = sightBuildingBatches.reduce((n, batch) => n + batch.inst.count, 0);
scene.updateMatrixWorld(true);
ok('the sight registry references the actual static rendered building instances', count > 4000 &&
  sightBuildingBatches.every(({ inst, bounds }) => inst.parent === scene && inst.visible &&
    bounds.length === inst.count * 4 && !inst.material.transparent), `${count} instances`);

// Find a real cottage wall and prove its actual triangles intersect the blocked ray. Choose another
// eye on the target's side so that a clear, in-range view of the identical target remains discoverable.
const wallBatch = sightBuildingBatches.find(batch => batch.geoKey === 'wall');
const matrix = new THREE.Matrix4(), point = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(matrix);
let fixture = null;
for (let i = 0; i < wallBatch.inst.count; i++) {
  wallBatch.inst.getMatrixAt(i, matrix);
  const from = point(-1.2, .5, 0), target = point(1.2, .5, 0), clearFrom = point(2, .5, 0);
  const forward = target.clone().sub(from).normalize(), clearForward = target.clone().sub(clearFrom).normalize();
  const ray = new THREE.Raycaster(from, forward, .003, from.distanceTo(target) - .003);
  const actualWall = new THREE.Mesh(wallBatch.inst.geometry, wallBatch.inst.material), hits = [];
  actualWall.matrixWorld.copy(matrix); actualWall.raycast(ray, hits);
  camera.position.copy(from);
  const blocked = hits.length && inSightCone(target, from.clone().normalize(), forward, .34) &&
    !terrainBlocksSight(from, target) && buildingsBlockSight(from, target) &&
    !inSight(target, from.clone().normalize(), forward, .34);
  camera.position.copy(clearFrom);
  const clear = inSight(target, clearFrom.clone().normalize(), clearForward, .34);
  if (blocked && clear) { fixture = { index: i, from, target, clearFrom, forward, clearForward, hits: hits.length }; break; }
}
ok('a real wall hides a target that is otherwise in range and in the view cone', !!fixture,
  fixture ? `wall ${fixture.index}, distance ${fixture.from.distanceTo(fixture.target).toFixed(4)}, triangle hits ${fixture.hits}` : 'no real wall fixture');
if (fixture) {
  camera.position.copy(fixture.clearFrom);
  ok('the same target is discoverable from the unobstructed side',
    inSight(fixture.target, fixture.clearFrom.clone().normalize(), fixture.clearForward, .34));
  // Move one genuine animal record in the fixture, then ask the actual scanner to discover it.
  // Restrict this controlled check to that animal; restore all records immediately afterward.
  const savedBell = bell.slice(), animal = bell[0], saved = { pos: animal.pos.clone(), world: animal.world.clone(), top: animal.hit.top };
  const priorCodex = CODEX.map(entry => ({ seen: entry.seen, fresh: entry.fresh }));
  bell.splice(1); animal.pos.copy(fixture.target).normalize();
  animal.world.copy(fixture.target).addScaledVector(animal.pos, -.02); animal.hit.top = animal.world.length() + .04;
  const reset = () => { for (const e of CODEX) { e.seen = e.id !== 'bell'; e.fresh = false; } };
  reset(); camera.position.copy(fixture.from); codexScan(fixture.from.clone().normalize(), fixture.forward);
  const unseen = !CODEX.find(entry => entry.id === 'bell').seen;
  reset(); camera.position.copy(fixture.clearFrom); codexScan(fixture.clearFrom.clone().normalize(), fixture.clearForward);
  const found = CODEX.find(entry => entry.id === 'bell').seen;
  ok('the actual codex withholds the blocked animal and discovers it from the clear side', unseen && found,
    `blocked=${unseen}, clear=${found}`);
  animal.pos.copy(saved.pos); animal.world.copy(saved.world); animal.hit.top = saved.top;
  bell.splice(0, bell.length, ...savedBell); CODEX.forEach((entry, i) => Object.assign(entry, priorCodex[i]));
}

// Locate a real terrain ridge with clear endpoints, then look at the same radial direction well above it.
let ridge = null;
for (let k = 0; k < 100 && !ridge; k++) {
  const dir = nearDirection(landing, k * 2.399963, (k % 8) * .24 + .12), h = heightAt(dir);
  if (h < SEA + .025) continue;
  for (let j = 0; j < 16 && !ridge; j++) for (const distance of [.25, .33, .5, .7, 1]) {
    const end = nearDirection(dir, j * Math.PI / 8, distance / R), endHeight = heightAt(end);
    if (endHeight < SEA + .005) continue;
    const from = dir.clone().multiplyScalar(R + h + EYE), target = end.clone().multiplyScalar(R + endHeight + .04);
    const high = end.clone().multiplyScalar(R + endHeight + .6);
    if (!terrainBlocksSight(from, target) || buildingsBlockSight(from, target) ||
        terrainBlocksSight(from, high) || buildingsBlockSight(from, high)) continue;
    camera.position.copy(from);
    const look = target.clone().sub(from).normalize(), highLook = high.clone().sub(from).normalize();
    if (inSightCone(target, dir, look, 1.25) && !inSight(target, dir, look, 1.25) && inSight(high, dir, highLook, 1.25))
      ridge = { from, target, high, k, j, distance };
    if (ridge) break;
  }
}
ok('the actual terrain blocks a target behind a ridge, but not one above it', !!ridge,
  ridge ? `seeded candidate ${ridge.k}/${ridge.j}, ${ridge.distance.toFixed(2)} arc distance` : 'no real ridge fixture');

// Water is translucent, and an underwater observer looking up should not have water treated as land.
let throughWater = null;
for (let k = 0; k < 800 && !throughWater; k++) {
  const dir = nearDirection(landing, k * 2.399963, .20 + (k % 20) * .13), h = heightAt(dir);
  if (h > SEA - .09) continue;
  const from = dir.clone().multiplyScalar(R + h + .04), target = dir.clone().multiplyScalar(R + SEA + .04);
  camera.position.copy(from);
  const forward = target.clone().sub(from).normalize();
  if (!terrainBlocksSight(from, target) && !buildingsBlockSight(from, target) && inSight(target, dir, forward, 1.25))
    throughWater = { depth: SEA - h, from, target };
}
ok('a clear underwater line can see through water rather than treating the sea surface as opaque', !!throughWater,
  throughWater ? `water depth ${throughWater.depth.toFixed(3)}` : 'no clear underwater fixture');

// Broad spheres are only a filter, not opaque collision proxies: a ray through the actual hole in a
// synthetic copy of the app's ring geometry must remain clear, and a ray through its metal must block.
const ring = new THREE.InstancedMesh(w.provinceGeo.ring, w.provinceMat.timber, 1);
const ringMatrix = new THREE.Matrix4().makeTranslation(0, 50, 0);
ring.setMatrixAt(0, ringMatrix); scene.add(ring); scene.updateMatrixWorld(true);
if (!ring.geometry.boundingSphere) ring.geometry.computeBoundingSphere();
const center = ring.geometry.boundingSphere.center.clone().applyMatrix4(ringMatrix);
const bounds = new Float32Array([center.x, center.y, center.z, ring.geometry.boundingSphere.radius + .00001]);
sightBuildingBatches.push({ inst: ring, bounds, geoKey: 'ring', matKey: 'timber' });
const line = x => [new THREE.Vector3(x, 49.5, .03), new THREE.Vector3(x, 50.5, .03)];
const hole = line(0), rim = line(1);
const holeBlocked = buildingsBlockSight(...hole), rimBlocked = buildingsBlockSight(...rim);
ok('a bounding sphere does not hide a view through the actual ring hole',
  !holeBlocked && rimBlocked, `hole blocked=${holeBlocked}, rim blocked=${rimBlocked}`);
sightBuildingBatches.pop(); scene.remove(ring);

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
