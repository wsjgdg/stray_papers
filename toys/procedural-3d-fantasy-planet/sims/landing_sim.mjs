// The first landing is a real place, not a map pin: build desktop and compact worlds, inspect the actual
// scene instances and collision boxes, re-scatter stones, switch modes as the page does and walk the court.
import { buildWorld } from './world.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';

for (const [label, viewport] of [['desktop', {}], ['compact', { width: 390, height: 844 }]]) {
  const w = await buildWorld(viewport);
  const { THREE, R, EYE, SEA, WALKER_RADIUS, landing, heightAt, settlementDirs, scene, provinceGeo,
    walkBoxes, hardProps, stoneSolids, bell, state, keys, seeded, dressStones, switchMode, physicsStep,
    updateBell, resetGroundMotion, overlapAt, fern, fernLandingExtent, dressFerns } = w;
  const site = settlementDirs.find(s => s.welcome);
  const nearest = settlementDirs.slice().sort((a, b) => a.dir.angleTo(landing) - b.dir.angleTo(landing))[0];
  const distance = site ? site.dir.angleTo(landing) * R : Infinity;
  ok(label + ': the actual first settlement is 260–380 mm from dry landing',
    !!site && nearest === site && distance >= .26 && distance <= .38 && heightAt(landing) > SEA + .02,
    'nearest centre ' + mm(distance) + ', landing height ' + mm(heightAt(landing)));
  if (!site?.court) {
    ok(label + ': an open court exists', false, 'no court was built');
    continue;
  }

  // Check the generated instance matrices, not just metadata or the settlement centre. A visible disc
  // on the ground at the centre and a ring of 16 further discs make this an actual court.
  const scenePositions = new Map(), matrix = new THREE.Matrix4();
  scene.traverse(obj => {
    if (!obj.isInstancedMesh || !obj.visible || !obj.parent?.visible) return;
    const key = Object.keys(provinceGeo).find(k => provinceGeo[k] === obj.geometry);
    if (!key) return;
    if (!scenePositions.has(key)) scenePositions.set(key, []);
    for (let i = 0; i < obj.count; i++) {
      obj.getMatrixAt(i, matrix);
      scenePositions.get(key).push(new THREE.Vector3().setFromMatrixPosition(matrix));
    }
  });
  const visible = piece => (scenePositions.get(piece.geo) || []).some(p => p.distanceTo(piece.origin) < .0001);
  const tiles = site.court.tiles;
  const centres = tiles.map(t => t.origin.clone().normalize().distanceTo(site.dir) * R);
  const centreTiles = centres.filter(d => d < .065).length;
  const maxGroundOffset = Math.max(...tiles.map(t => {
    const dir = t.origin.clone().normalize();
    return Math.abs(t.origin.length() - (R + heightAt(dir)));
  }));
  const tileMissing = tiles.filter(t => !visible(t)).length;
  ok(label + ': the court is drawn on the ground, not a fictitious centre',
    site.plan === 'open-court' && tiles.length >= 17 && Math.min(...centres) < .005 && centreTiles >= 17 &&
      maxGroundOffset < .004 && tileMissing === 0,
    tiles.length + ' drawn stone discs, ' + centreTiles + ' within 65 mm of the centre, worst ground offset ' +
      mm(maxGroundOffset) + ', ' + tileMissing + ' missing instances');

  const built = site.court.structures;
  const housePieces = built.filter(p => p.layer === 'house' && p.geo === 'wall');
  const towerPieces = built.filter(p => p.layer === 'landmark' && p.geo === 'tower');
  const houseBoxes = walkBoxes.filter(b => b.source?.site === site && b.layer === 'house');
  const towerBoxes = walkBoxes.filter(b => b.source?.site === site && b.layer === 'landmark' && b.geometry === 'tower');
  const plotMatches = site.court.plots.map(plot => {
    const sorted = houseBoxes.slice().sort((a, b) => a.dir.distanceTo(plot) - b.dir.distanceTo(plot));
    return sorted[0] && sorted[0].dir.distanceTo(plot) * R < .015 ? sorted[0] : null;
  });
  const missingBuilt = [...housePieces, ...towerPieces].filter(p => !visible(p)).length;
  ok(label + ': four drawn houses and a drawn lookout have their own solid walls',
    site.court.plots.length === 4 && housePieces.length === 4 && towerPieces.length === 1 &&
      houseBoxes.length === 4 && towerBoxes.length === 1 && plotMatches.every(Boolean) &&
      new Set(plotMatches).size === 4 && missingBuilt === 0,
    housePieces.length + ' house instances / ' + houseBoxes.length + ' wall boxes, ' + towerPieces.length +
      ' tower instance / ' + towerBoxes.length + ' box, ' + missingBuilt + ' missing scene instances');

  const clearance = () => {
    let best = Infinity, kind = '';
    for (const [name, list] of [['prop', hardProps], ['stone', stoneSolids], ['animal', bell]]) {
      for (const p of list) {
        const gap = landing.distanceTo(p.dir || p.pos) * R - (p.r === undefined ? p.hit.r : p.r);
        if (gap < best) { best = gap; kind = name; }
      }
    }
    for (const b of walkBoxes) {
      if (b.dir.dot(landing) < .9) continue;
      const off = b.dir.clone().sub(landing).multiplyScalar(R);
      const u = Math.abs(off.dot(b.ex)) - b.hx, v = Math.abs(off.dot(b.ez)) - b.hz;
      const gap = u < 0 && v < 0 ? Math.max(u, v) : Math.hypot(Math.max(0, u), Math.max(0, v));
      if (gap < best) { best = gap; kind = 'wall'; }
    }
    return { best, kind };
  };
  const initial = clearance(), samples = [initial];
  let closestTownStone = Infinity;
  const east = new THREE.Vector3(0, 1, 0).cross(landing).normalize();
  for (let i = 0; i < 3; i++) {
    const centre = landing.clone().addScaledVector(east, (i - 1) * .12).normalize();
    dressStones(centre, seeded(82341 + i));
    samples.push(clearance());
    for (const stone of stoneSolids) closestTownStone = Math.min(closestTownStone,
      stone.dir.distanceTo(site.dir) * R - stone.r - site.wr);
  }
  const worst = samples.reduce((a, b) => a.best < b.best ? a : b);
  ok(label + ': landing and the court stay clear when local stones are re-scattered',
    worst.best >= .12 * R && closestTownStone >= .025 - 1e-8,
    'initial nearest ' + initial.kind + ' edge ' + mm(initial.best) + '; worst after 3 re-dresses ' +
      mm(worst.best) + '; nearest stone outside town footprint ' + mm(closestTownStone));
  dressStones(landing, seeded(82341));

  // Ferns have no collider, but their real, broad fronds were blocking the whole first-person view.
  // Read the actual instance matrices and conservatively subtract the geometry's max-scaled sphere,
  // including after three re-dresses from different centres. Plants remain present outside the clearing.
  const fernEdge = () => {
    let closestEdge = Infinity;
    const position = new THREE.Vector3(), transform = new THREE.Matrix4();
    for (let i = 0; i < fern.count; i++) {
      fern.getMatrixAt(i, transform);
      position.setFromMatrixPosition(transform).normalize();
      closestEdge = Math.min(closestEdge, position.distanceTo(landing) * R - fernLandingExtent);
    }
    return { count: fern.count, edge: closestEdge };
  };
  const ferns = [fernEdge()];
  for (let i = 0; i < 3; i++) {
    const centre = landing.clone().addScaledVector(east, (i - 1) * .12).normalize();
    dressFerns(centre, seeded(9050 + i));
    ferns.push(fernEdge());
  }
  const nearestFern = Math.min(...ferns.map(sample => sample.edge));
  const fewestFerns = Math.min(...ferns.map(sample => sample.count));
  ok(label + ': visible fern fronds stay outside the landing clearing after re-dressing',
    Number.isFinite(fernLandingExtent) && fewestFerns > 0 && nearestFern >= .12 * R - 1e-6,
    'initial ' + ferns[0].count + ' real fern instances, fewest after 3 re-dresses ' + fewestFerns +
      '; conservative nearest frond edge ' + mm(nearestFern) + ' (clearing ' + mm(.12 * R) + ')');

  // Use the page's real orbit-to-ground transition, including its initial view direction, then the real
  // frame order (two 120 Hz physics steps and one 60 Hz herd update). No teleport to the court is involved.
  const wasOrbit = state.mode === 'orbit';
  switchMode();
  const forward = site.dir.clone().addScaledVector(state.direction, -site.dir.dot(state.direction)).normalize();
  const directionError = state.direction.distanceTo(landing) * R, heading = state.heading.dot(forward);
  ok(label + ': the default descent lands at the protected spot facing the court',
    wasOrbit && state.mode === 'ground' && directionError < .001 && heading > .999,
    'landing error ' + mm(directionError) + ', heading alignment ' + heading.toFixed(4));
  state.transition = null; // the real transition animates the camera, not the walker's position
  keys.add('KeyW');
  let closest = Infinity, wetFrames = 0, worstBump = 0, elapsed = 0;
  for (let f = 0; f < 60 * 6; f++) {
    physicsStep(1 / 120); physicsStep(1 / 120); updateBell(1 / 60, f / 60);
    closest = Math.min(closest, state.direction.distanceTo(site.dir) * R);
    if (state.water) wetFrames++;
    worstBump = Math.max(worstBump, state.bump || 0);
    elapsed = (f + 1) / 60;
    if (closest < .020) break;
  }
  keys.clear();
  ok(label + ': a person can walk from landing into the actual court',
    closest < .020 && wetFrames === 0 && worstBump < .02,
    'closest to centre ' + mm(closest) + ' in ' + elapsed.toFixed(2) + ' s; ' + wetFrames +
      ' wet frames, worst collision speed ' + mm(worstBump) + '/s');

  // Try the outside faces of each actual building from just beyond the walker radius. Require that at least
  // one clear, vertically relevant face per building can be reached and blocks the body without penetration.
  let touched = 0, worstPenetration = 0, worstContact = 0;
  for (const box of [...houseBoxes, ...towerBoxes]) {
    let met = false;
    for (const [axis, half] of [[box.ex, box.hx], [box.ez, box.hz]]) {
      for (const sign of [-1, 1]) {
        if (met) break;
        const start = box.dir.clone().addScaledVector(axis, sign * (half + .035) / R).normalize();
        const feet = R + heightAt(start);
        if (box.bottom > feet + .020 || box.top <= feet || overlapAt(start, feet) > 0) continue;
        state.direction.copy(start); state.radius = feet + EYE;
        state.heading.copy(axis).multiplyScalar(-sign);
        state.heading.addScaledVector(start, -state.heading.dot(start)).normalize();
        state.velocity = 0; state.grounded = true; state.water = false; state.swimBlend = 0;
        state.depth = 0; state.crouch = 0; state.ghost = false; resetGroundMotion();
        keys.add('KeyW');
        let minGap = Infinity, penetration = 0;
        for (let f = 0; f < 120; f++) {
          physicsStep(1 / 120);
          const off = box.dir.clone().sub(state.direction).multiplyScalar(R), ft = R + heightAt(state.direction);
          if (box.bottom > ft + .020 || box.top <= ft) continue;
          const gap = Math.max(Math.abs(off.dot(box.ex)) - box.hx, Math.abs(off.dot(box.ez)) - box.hz) - WALKER_RADIUS;
          minGap = Math.min(minGap, gap); penetration = Math.max(penetration, -gap);
        }
        keys.clear();
        worstPenetration = Math.max(worstPenetration, penetration);
        if (minGap < .002 && penetration < .001) {
          met = true; touched++;
          worstContact = Math.max(worstContact, minGap);
        }
      }
    }
  }
  ok(label + ': real movement meets every house and lookout without entering its wall',
    touched === 5 && worstPenetration < .001,
    touched + '/5 buildings contacted; widest contact gap ' + mm(worstContact) +
      ', worst penetration ' + mm(worstPenetration));
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
