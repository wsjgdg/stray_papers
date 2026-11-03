// The world itself, not the things in it: is the planet the same planet twice, is every number in it a
// number, do the five colour plates hold their own ground, and is the spot you land on dry.
//
// The other suites ask what the walker can do here. This one asks whether "here" is well formed — which is
// the class of bug that is invisible until it isn't: one NaN in a vertex buffer takes the whole mesh off the
// screen without a console line, and a build that differs from itself is how `-65` shipped a collision list
// that disagreed with the houses that were drawn.
import { buildWorld } from './world.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';

const world = await buildWorld();
const { THREE, R, SEA, MAX_DIVE, heightAt, biomeAt, provinceAt, landing, scene, hardProps, stoneSolids,
  walkBoxes, floraHard, bell, reefs, settlementDirs, landmarks, groundStones } = world;

// A fingerprint of everything the build decided, so two builds can be compared without guessing which of
// forty lists moved.
function fingerprint(w) {
  const dirs = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 512; i++) {
    const y = 1 - (i + .5) * 2 / 512, a = i * golden, r = Math.sqrt(1 - y * y);
    dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const sum = list => list.reduce((s, v) => s + v, 0);
  return {
    props: w.hardProps.length,
    propR: sum(w.hardProps.map(p => p.r)),
    stones: w.stoneSolids.length,
    stoneR: sum(w.stoneSolids.map(p => p.r)),
    boxes: w.walkBoxes.length,
    boxW: sum(w.walkBoxes.map(b => b.hx + b.hz + (b.top - b.bottom))),
    flora: w.floraHard.length,
    floraR: sum(w.floraHard.map(p => p.r || 0)),
    grounds: w.groundStones.length,
    bells: w.bell ? 1 : 0,
    reefs: w.reefs.length,
    reefR: sum(w.reefs.map(p => p.r || 0)),
    settlements: w.settlementDirs.length,
    landmarks: w.landmarks.length,
    heights: dirs.map(d => w.heightAt(d)),
    provinces: dirs.map(d => w.provinceAt(d)).join(',')
  };
}

const first = fingerprint(world);
const again = await buildWorld();
const second = fingerprint(again);
{
  // The `-65` bug was exactly this: a second build of the same seeds came out different, because something
  // in the build read a value another part of the build had already moved. Everything the seed decides has
  // to come out identical, or the bench is testing a world the player never gets.
  let worst = 0, where = '';
  for (const key of Object.keys(first)) {
    const a = first[key], b = second[key];
    if (typeof a === 'number') {
      const d = Math.abs(a - b);
      if (d > worst) { worst = d; where = key; }
    } else if (Array.isArray(a)) {
      for (let i = 0; i < a.length; i++) {
        const dd = typeof a[i] === 'number' ? Math.abs(a[i] - b[i]) : (a[i] === b[i] ? 0 : Infinity);
        if (dd > worst) { worst = dd; where = key + '[' + i + ']'; }
      }
    } else if (a !== b) { worst = Infinity; where = key; }
  }
  ok('two builds of the same seed are the same world', worst === 0,
    'counts of props, walls, flora, reefs, settlements and the height at 512 latitudes all identical between ' +
    'two whole builds; worst disagreement ' + (worst === 0 ? 'none' : worst + (where ? ' at ' + where : '')) +
    ' (' + first.props + ' props, ' + first.boxes + ' walls, ' + first.flora + ' plants, ' + first.reefs +
    ' reefs, ' + first.settlements + ' settlements)');
}

// ---- nothing in the vertex buffers is not a number -------------------------------------------------------
{
  let meshes = 0, vertices = 0, bad = 0, badWhere = '';
  const badAttr = [];
  scene.traverse(obj => {
    const geo = obj.geometry;
    if (!geo || !geo.attributes) return;
    meshes++;
    for (const [name, attr] of Object.entries(geo.attributes)) {
      if (!attr || !attr.array) continue;
      vertices += attr.count || 0;
      const arr = attr.array;
      for (let i = 0; i < arr.length; i++) {
        if (!Number.isFinite(arr[i])) {
          bad++; if (!badWhere) badWhere = (obj.name || obj.type) + '.' + name;
          break;
        }
      }
    }
    if (obj.isInstancedMesh) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, m);
        if (m.elements.some(e => !Number.isFinite(e))) { bad++; if (!badWhere) badWhere = obj.name + '.instanceMatrix'; break; }
      }
    }
  });
  ok('every vertex, normal, uv and instance matrix in the scene is finite', bad === 0,
    meshes + ' meshes, ' + vertices.toLocaleString('en-US') + ' attribute entries scanned' +
    (bad ? '; first bad one at ' + badWhere : ''));
}

// ---- and everything drawn stands on the shell ------------------------------------------------------------
{
  // A placement is a *direction* the builders use as a stand-in for a point on the ground, so the two things
  // worth checking are that it really is a unit direction (a stray multiply by R turns every dot product in
  // the build into a comparison against R² and quietly moves everything) and that the point it names is on the
  // planet's skin rather than out in space or down past the sea floor.
  let outside = 0, worstOver = 0, worstUnder = 0, wrongLength = 0, worstLength = 0, checked = 0;
  const test = (item, key) => {
    const d = item[key];
    // Bells keep theirs as a plain [x, y, z]; everything else as a Vector3.
    // A Vector3 answers length(); bells keep plain [x, y, z] arrays; two of the lists keep typed arrays.
    const len = !d ? NaN : typeof d.length === 'function' ? d.length()
      : typeof d.length === 'number' ? Math.hypot(d[0], d[1], d[2])
      : Math.hypot(d.x, d.y, d.z);
    if (!(len > 0)) { outside++; return; }
    checked++;
    if (Math.abs(len - 1) > 1e-6) { wrongLength++; worstLength = Math.max(worstLength, Math.abs(len - 1)); }
    // The shell is not a narrow band: the sea floor is 477 mm under the datum and the highest peak is 1.46
    // units over it. A placement may also sit on top of something, so it is given a hand's width of headroom.
    const r = len * R;
    const over = r - (R + 1.60), under = (R + SEA - .52) - r;
    if (over > 0) { outside++; worstOver = Math.max(worstOver, over); }
    if (under > 0) { outside++; worstUnder = Math.max(worstUnder, under); }
  };
  for (const list of [hardProps, stoneSolids, floraHard]) for (const item of list) test(item, 'dir');
  // A reef's `dir` is only filled in by the first update; `home` is where it was built, and it stays put.
  for (const item of reefs) test(item, 'home');
  for (const item of landmarks) test(item, 'direction');
  for (const box of walkBoxes) test(box, 'dir');
  for (const bird of bell) test(bird, 'center');
  ok('every prop, plant, wall, reef, bell and landmark sits on the one sphere', outside === 0 && wrongLength === 0,
    checked.toLocaleString('en-US') + ' placements; ' + wrongLength + ' were not unit directions (worst off by ' +
    worstLength.toExponential(1) + '), ' + outside + ' fell outside the shell (highest ' + mm(worstOver) +
    ' over the tallest peak allowed, ' + mm(worstUnder) + ' below the deepest seabed)');
}

// ---- the ground ----------------------------------------------------------------------------------------
{
  const N = 20000;
  let min = Infinity, max = -Infinity, land = 0, bad = 0;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + .5) * 2 / N, a = i * golden, r = Math.sqrt(1 - y * y);
    const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const h = heightAt(d);
    if (!Number.isFinite(h)) { bad++; continue; }
    if (h > SEA) land++;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const share = land / N * 100;
  // The numbers are the world's, not a target: 43% of this planet is above the waterline, the deepest trench
  // is 477 mm under the datum and the highest peak is 1456 mm over it. What is being asked is that they are
  // *numbers* and that they stay inside the shell the collision and the water are built for.
  ok('the ground is a finite number in every direction, and stays inside the shell the physics assumes',
    bad === 0 && min > SEA - .52 && max < 1.60 && share > 10 && share < 60,
    N.toLocaleString('en-US') + ' directions: lowest ' + mm(min) + ', highest ' + mm(max) + ', land ' +
    share.toFixed(1) + '% of the surface');
}

// ---- the five plates -----------------------------------------------------------------------------------
// The user's own requirement: "不同大陆底色必须各自占据分明板块". So this does not ask whether the colours
// differ; it asks whether each province is ONE piece of ground, by walking the sphere as a grid and counting
// connected components per province.
{
  const LAT = 120, LON = 240;
  const dirs = [], ids = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let j = 0; j < LAT; j++) {
    for (let i = 0; i < LON; i++) {
      const y = 1 - (j + .5) * 2 / LAT, a = i / LON * Math.PI * 2, r = Math.sqrt(1 - y * y);
      // Cells near the poles are shorter in longitude; a Fibonacci lattice would spread better but the grid
      // is what gives the neighbours; the polar rows are counted as single rows, which is the same thing.
      dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      ids.push(provinceAt(dirs[dirs.length - 1]));
    }
  }
  const names = [...new Set(ids)].sort();
  const seen = new Int8Array(ids.length);
  const sizes = new Map();
  const componentOf = new Map();
  let components = 0;
  const stack = [];
  for (let start = 0; start < ids.length; start++) {
    if (seen[start]) continue;
    components++;
    const id = ids[start];
    let size = 0;
    stack.length = 0; stack.push(start); seen[start] = 1;
    while (stack.length) {
      const at = stack.pop(); size++;
      const j = Math.floor(at / LON), i = at % LON;
      const neighbours = [
        (j + 1) * LON + i, (j - 1) * LON + i,
        j * LON + (i + 1) % LON, j * LON + (i + LON - 1) % LON
      ];
      for (const n of neighbours) {
        if (n < 0 || n >= ids.length || seen[n] || ids[n] !== id) continue;
        seen[n] = 1; stack.push(n);
      }
    }
    if (!sizes.has(id)) sizes.set(id, []);
    sizes.get(id).push(size);
    componentOf.set(id, (componentOf.get(id) || 0) + 1);
  }
  // The largest piece of each province, as a share of everything that province owns.
  let worstShare = 1, worstId = '';
  for (const [id, list] of sizes) {
    const total = list.reduce((s, v) => s + v, 0);
    const biggest = Math.max(...list);
    const share = biggest / total;
    if (share < worstShare) { worstShare = share; worstId = id; }
  }
  const pieces = components;
  ok('each of the five provinces is one plate, not a speckle', names.length === 5 && pieces === 5 && worstShare > .98,
    names.length + ' provinces over a ' + LAT + '×' + LON + ' grid in ' + pieces + ' connected pieces' +
    (worstShare < 1 ? '; the worst-split province is ' + worstId.toUpperCase() + ', whose largest single piece holds ' +
      (worstShare * 100).toFixed(2) + '% of its ground' : ' — every plate is whole'));
  const perProvince = new Map(names.map(id => [id, { land: 0, towns: 0 }]));
  for (let i = 0; i < ids.length; i++) if (heightAt(dirs[i]) > SEA + .01) perProvince.get(ids[i]).land++;
  let wet = 0, wrongHeight = 0, worstHeight = 0;
  for (const site of settlementDirs) {
    const id = provinceAt(site.dir);
    if (perProvince.has(id)) perProvince.get(id).towns++;
    // A settlement is a promise about the ground: dry, and where its own record says it is.
    if (heightAt(site.dir) < SEA + .004) wet++;
    const drift = Math.abs(site.h - heightAt(site.dir));
    if (drift > .02) { wrongHeight++; worstHeight = Math.max(worstHeight, drift); }
  }
  ok('and every one of them owns dry land and a handful of settlements, each on the ground it claims',
    names.every(id => perProvince.get(id).land > 20 && perProvince.get(id).towns >= 5) && wet === 0 && wrongHeight === 0,
    names.map(id => id.toUpperCase() + ': ' + (perProvince.get(id).land / ids.length * 100).toFixed(1) + '% of the grid, ' +
      perProvince.get(id).towns + ' settlements').join(' · ') + '; ' + wet + ' of the ' + settlementDirs.length +
    ' stand in the sea, and the worst gap between a settlement\'s own height and the ground under it is ' + mm(worstHeight));
}

// ---- the spot you land on ------------------------------------------------------------------------------
{
  // Read the actual landing chosen by the page, not a reconstructed old seed that could silently disagree.
  const h = heightAt(landing);
  const biome = biomeAt(landing, h);
  const province = provinceAt(landing);
  const nearest = settlementDirs.map(s => s.dir.angleTo(landing) * R).sort((a, b) => a - b)[0];
  ok('the spawn is dry land, in a named province, with a settlement a short walk away',
    h > SEA + .02 && biome !== 'ocean' && h < .235 && nearest >= .26 && nearest <= .38,
    'landing on ' + mm(h) + ' of ' + biome + ' ground in ' + province.toUpperCase() + ', the nearest settlement ' +
    mm(nearest) + ' away (target 260–380 mm; the tallest ground allowed is ' + mm(.235) + ')');
}

// The handoff's .12 is a unit-sphere chord: on R=4.2 it asks for a 504 mm clearing. Check the actual
// collision footprints, not just object centres; this stays red while the design conflict is unresolved.
{
  let clearance = Infinity, kind = '';
  for (const [label, list] of [['prop', hardProps], ['stone', stoneSolids], ['animal', bell]]) for (const item of list) {
    const dir = item.dir || item.pos, radius = item.r !== undefined ? item.r : item.hit.r;
    const gap = landing.distanceTo(dir) * R - radius;
    if (gap < clearance) { clearance = gap; kind = label; }
  }
  for (const box of walkBoxes) {
    if (box.dir.dot(landing) < .9) continue;
    const off = box.dir.clone().sub(landing).multiplyScalar(R);
    const u = Math.abs(off.dot(box.ex)) - box.hx, v = Math.abs(off.dot(box.ez)) - box.hz;
    // For an empty circular clearing, measure the actual distance to the box footprint, including a corner.
    const gap = u < 0 && v < 0 ? Math.max(u, v) : Math.hypot(Math.max(u, 0), Math.max(v, 0));
    if (gap < clearance) { clearance = gap; kind = 'wall'; }
  }
  ok('the requested .12 unit-chord clearing contains no solid footprint', clearance >= .12 * R,
    'nearest ' + kind + ' edge ' + mm(clearance) + '; requested radius ' + mm(.12 * R));
}

// ---- what it costs -------------------------------------------------------------------------------------
{
  let drawables = 0, instanced = 0, instances = 0, triangles = 0;
  scene.traverse(obj => {
    if (!obj.geometry || !obj.visible) return;
    drawables++;
    const geo = obj.geometry;
    const count = geo.index ? geo.index.count : (geo.attributes.position ? geo.attributes.position.count : 0);
    const copies = obj.isInstancedMesh ? obj.count : 1;
    if (obj.isInstancedMesh) { instanced++; instances += obj.count; }
    triangles += count / 3 * copies;
  });
  ok('the whole world is drawn in one scene of a few thousand drawables, and it builds in seconds',
    drawables < 20000 && world.buildMs < 60000,
    drawables.toLocaleString('en-US') + ' drawables (' + instanced + ' of them instanced, ' + instances.toLocaleString('en-US') +
    ' instances), ' + Math.round(triangles).toLocaleString('en-US') + ' triangles, built in ' + (world.buildMs / 1000).toFixed(1) + ' s');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
