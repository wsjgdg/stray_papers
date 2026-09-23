/**
 * cosmos-views.ts — Builds the "cosmic scale" view groups for the observable universe.
 * Each view is a THREE.Group that can be faded in/out as the user zooms the cosmic scale.
 *
 * Every labelled body is a pickable sprite carrying `userData.body` (for the dossier)
 * and is registered in `grp.userData.labelSpecs = [{obj, n, note, up, kind}]` so the
 * engine can build DOM labels that follow the live 3D position.
 *
 * Scale levels:
 *   0  Solar System        (existing orrery)
 *   1  Solar Neighborhood  (nearest stars, < 16 ly)
 *   2  Milky Way Galaxy    (spiral arms, bar, Sun position)
 *   3  Local Group         (~24 galaxies, < 3 Mly)
 *   4  Nearby Universe    (galaxies out to ~50 Mly + Virgo Cluster)
 *   5  Superclusters       (Laniakea, great walls, filaments)
 *   6  Observable Universe (CMB sphere + quasars + far galaxies)
 */
import * as THREE from 'three';
import {
  NEARBY_STARS, LOCAL_GROUP, NEARBY_GALAXIES, VIRGO_CLUSTER, FAMOUS_GALAXIES,
  SUPERCLUSTERS, COSMIC_FILAMENTS, QUASARS, MILKY_WAY_ARMS, MILKY_WAY_BAR,
  MILKY_WAY_SUN_POS,
} from './universe-data';
import { galaxySpriteTex, cmbTex } from './textures';
import { galacticDir, fmtLy, fmtMpc, D2R } from './math-utils';

const _v = new THREE.Vector3();

export interface LabelSpec {
  obj: THREE.Object3D;   // live 3D object to project
  n: string;            // display name
  en: string;           // english / catalog id
  note: string;         // dossier note
  up: number;           // vertical offset above the object
  kind: string;         // tag CSS class: 'cosmos' | 'cosmos-dim'
  c: number;            // swatch color
  rows?: [string, string][];
}

export interface BodyData {
  n: string; en: string; key: string; kind: string;
  c: number; rows: [string, string][]; note: string;
  rDisp?: number; isCosmos?: boolean;
}

/** Round sprite helper. */
function sprite(tex: THREE.Texture, color: number, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, opacity,
  }));
  s.scale.setScalar(size);
  return s;
}

function hexFromRGB(rgb: number[]): number {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

/** Confirmed / notable exoplanets around stars in NEARBY_STARS.
 *  `orbit` is an exaggerated scene-unit radius (real AU would be invisible at 1 ly = 1 unit). */
interface ExoPlanet {
  host: string;   // star `n` (Chinese) to attach to
  n: string;
  en: string;
  P: number;      // orbital period in days (drives animation speed)
  orbit: number;   // scene-unit orbit radius
  c: number;       // dot color
  rows: [string, string][];
  note: string;
}
export const EXOPLANETS: ExoPlanet[] = [
  { host: '比邻星', n: '比邻星 b', en: 'Proxima Cen b', P: 11.18, orbit: 1.4, c: 0xff8a6a,
    rows: [['母星', '比邻星 M5.5V'], ['质量', '≥ 1.07 地球'], ['公转周期', '11.18 天'], ['轨道', '0.0485 AU'], ['宜居', '位于宜居带边缘']],
    note: '距太阳最近的恒星——比邻星——拥有的类地行星，是搜寻近邻生命的关键目标。' },
  { host: '比邻星', n: '比邻星 c', en: 'Proxima Cen c', P: 1928, orbit: 2.6, c: 0xc0a090,
    rows: [['母星', '比邻星'], ['质量', '≈ 7 地球'], ['公转周期', '约 5.28 年'], ['轨道', '1.49 AU']],
    note: '尚有争议的候选行星，较大质量、较冷。' },
  { host: '巴纳德星', n: '巴纳德星 b', en: "Barnard's b", P: 233, orbit: 1.8, c: 0xe0c0a0,
    rows: [['母星', '巴纳德星 M4V'], ['质量', '≥ 3.2 地球'], ['公转周期', '233 天'], ['轨道', '0.4 AU']],
    note: '雪线附近的超级地球，表面温度约 -170 ℃。' },
  { host: '拉兰德 21185', n: '拉兰德 21185 b', en: 'Lalande 21185 b', P: 12.94, orbit: 1.3, c: 0xff9a70,
    rows: [['母星', '拉兰德 21185 M2V'], ['质量', '≥ 2.99 地球'], ['公转周期', '12.94 天'], ['轨道', '0.078 AU']],
    note: '红矮星周围的暖超级地球，是宜居带候选。' },
  { host: '天仓五', n: '天仓五 e', en: 'Tau Ceti e', P: 162, orbit: 1.7, c: 0xb0d0ff,
    rows: [['母星', '天仓五 G8V'], ['质量', '≥ 3.93 地球'], ['公转周期', '162 天'], ['轨道', '0.538 AU'], ['宜居', '位于宜居带']],
    note: '类太阳恒星周围的候选宜居行星，未来直接成像的重点目标。' },
  { host: '天仓五', n: '天仓五 f', en: 'Tau Ceti f', P: 640, orbit: 2.8, c: 0x90b0e0,
    rows: [['母星', '天仓五'], ['质量', '≥ 3.91 地球'], ['公转周期', '640 天'], ['轨道', '1.33 AU']],
    note: '天仓五星系外侧的候选行星，可能较冷。' },
  { host: '罗斯 128', n: '罗斯 128 b', en: 'Ross 128 b', P: 9.86, orbit: 1.2, c: 0xffa07a,
    rows: [['母星', '罗斯 128 M4V'], ['质量', '≥ 1.4 地球'], ['公转周期', '9.86 天'], ['轨道', '0.0496 AU'], ['宜居', '宜居带候选']],
    note: '其母星是一颗异常平静的红矮星，是近邻宜居行星中受恒星辐射较少的。' },
  { host: 'GJ 1061', n: 'GJ 1061 d', en: 'GJ 1061 d', P: 12.4, orbit: 1.3, c: 0xf5b090,
    rows: [['母星', 'GJ 1061 M5.5V'], ['质量', '≈ 1.4 地球'], ['公转周期', '12.4 天'], ['轨道', '0.054 AU']],
    note: '近邻红矮星周围三颗行星之一，d 位于宜居带。' },
  { host: '鲁坦星', n: 'GJ 273 b', en: 'Luyten b', P: 18.65, orbit: 1.5, c: 0xffb088,
    rows: [['母星', '鲁坦星 M3.5V'], ['质量', '≥ 2.89 地球'], ['公转周期', '18.65 天'], ['轨道', '0.091 AU'], ['宜居', '宜居带']],
    note: 'METI 向鲁坦星发送过「Sones 讯息」，约 12 年后抵达。' },
  { host: '印第安座 ε', n: '印第安座 ε b', en: 'Eps Indi b', P: 30000, orbit: 3.2, c: 0xd0a880,
    rows: [['母星', '印第安座 ε K5V'], ['质量', '≈ 3 木星'], ['公转周期', '约 82 年'], ['轨道', '11.6 AU']],
    note: '近邻类太阳恒星周围确认的冷木星，大气云带清晰可辨。' },
];

/** Attach body + label-spec metadata to a sprite, and register it.
 *  Also adds an invisible pick ball (a sphere sized to the sprite) as a sibling for easy clicking. */
function tag(sp: THREE.Sprite, n: string, en: string, note: string,
  rows: [string, string][], c: number, up: number, specs: LabelSpec[],
  parent?: THREE.Object3D, pickR?: number): THREE.Sprite {
  const body: BodyData = { n, en, key: 'cosmo_' + n, kind: 'cosmos', c, rows, note, isCosmos: true };
  sp.userData.body = body;
  sp.userData.rPick = true; // flag for engine to include in pickables
  specs.push({ obj: sp, n, en, note, up, kind: 'cosmos', c, rows });
  // Optional invisible pick ball for larger click target
  if (parent && pickR && pickR > 0) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    ball.position.copy(sp.position);
    ball.scale.setScalar(pickR);
    ball.userData.body = body;
    ball.userData.rPick = true;
    parent.add(ball);
  }
  return sp;
}

/** ---------- Level 1: Solar Neighborhood ---------- */
export function buildSolarNeighborhood(): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'cosmos-neighborhood';
  const dot = galaxySpriteTex('dwarf', [255, 245, 220], [200, 215, 255]);
  const specs: LabelSpec[] = [];
  const exoUpdaters: { dot: THREE.Sprite; pickBall: THREE.Mesh; host: THREE.LineLoop; P: number; orbit: number; phase: number }[] = [];

  // Sun at origin
  const sunSp = sprite(dot, 0xffe9a0, 3.2, 1);
  grp.add(sunSp);
  tag(sunSp, '太阳', 'SOL', '观测者所在恒星 · G2V 主序星',
    [['光谱型', 'G2V'], ['距离', '0 光年'], ['视星等', '−26.74']], 0xffe9a0, 3.5, specs);

  for (const s of NEARBY_STARS) {
    const dir = new THREE.Vector3(
      Math.cos(s.dec * D2R) * Math.cos((s.ra / 24) * Math.PI * 2),
      Math.sin(s.dec * D2R),
      -Math.cos(s.dec * D2R) * Math.sin((s.ra / 24) * Math.PI * 2),
    );
    const p = dir.multiplyScalar(Math.max(0.2, s.distLy));
    const sp = sprite(dot, s.c, Math.max(0.6, 2.6 * Math.pow(1.4, -s.mag)), 0.95);
    sp.position.copy(p);
    grp.add(sp);
    tag(sp, s.n, s.en, `${s.sp}型恒星 · ${s.distLy.toFixed(2)} 光年`,
      [['光谱型', s.sp], ['距离', s.distLy.toFixed(2) + ' 光年'], ['视星等', s.mag.toFixed(2)]],
      s.c, Math.max(0.6, 2.6 * Math.pow(1.4, -s.mag)) * 0.6, specs);

    // Exoplanet systems: orbit ring + orbiting dot + label, attached at the star's position.
    const exos = EXOPLANETS.filter((e) => e.host === s.n);
    for (const ex of exos) {
      const host = new THREE.Group();
      host.position.copy(p);
      // Orbit ring (slightly tilted for a 3D feel)
      const ringPts: THREE.Vector3[] = [];
      for (let k = 0; k <= 64; k++) {
        const a = (k / 64) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(a) * ex.orbit, 0, Math.sin(a) * ex.orbit));
      }
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts),
        new THREE.LineBasicMaterial({ color: ex.c, transparent: true, opacity: 0.4 }));
      ring.rotation.x = 0.35; ring.rotation.z = 0.12;
      host.add(ring);
      // Orbiting planet dot (clickable)
      const pdot = sprite(dot, ex.c, 1.05, 1);
      const bd: BodyData = { n: ex.n, en: ex.en, key: 'cosmo_' + ex.n, kind: 'cosmos',
        c: ex.c, rows: ex.rows, note: ex.note, isCosmos: true };
      pdot.userData.body = bd;
      pdot.userData.rPick = true;
      host.add(pdot);
      // Pick ball — a larger invisible sphere parented to the dot, makes clicking easy.
      // Its `body` points to the same dossier; the engine's pick() walks visible hits
      // and this ball is part of the host group (visible).
      const ballGeo = new THREE.SphereGeometry(0.8, 12, 8);
      const ballMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const pickBall = new THREE.Mesh(ballGeo, ballMat);
      pickBall.userData.body = bd;
      pickBall.userData.rPick = true;
      host.add(pickBall);
      grp.add(host);
      // store for per-frame orbit animation
      exoUpdaters.push({ dot: pdot, pickBall, host: ring, P: ex.P, orbit: ex.orbit, phase: Math.random() * Math.PI * 2 });
      specs.push({ obj: pdot, n: ex.n, en: ex.en, note: ex.note, up: 0.9, kind: 'cosmos', c: ex.c, rows: ex.rows });
    }
  }
  grp.userData.labelSpecs = specs;
  // Per-frame orbit updater — engine calls grp.userData.exoUpdate(simT)
  grp.userData.exoUpdate = (simT: number) => {
    for (const e of exoUpdaters) {
      const a = e.phase + (2 * Math.PI * simT) / e.P;
      // orbit in the ring's local plane (pre-tilt), then the host ring's rotation applies
      const x = Math.cos(a) * e.orbit, z = Math.sin(a) * e.orbit;
      // apply ring tilt so the dot rides the visible ring
      const y = z * Math.sin(0.35); // x-tilt component
      const z2 = z * Math.cos(0.35);
      e.dot.position.set(x, y, z2);
      e.pickBall.position.set(x, y, z2);
    }
  };

  // 5 ly grid sphere (Oort-cloud inner hint)
  const grid = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(5, 16, 12)),
    new THREE.LineBasicMaterial({ color: 0x3a4a6a, transparent: true, opacity: 0.15 }),
  );
  grp.add(grid);
  return grp;
}

/** ---------- Level 2: Milky Way Galaxy ---------- */
export function buildMilkyWayGalaxy(): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'cosmos-milkyway';
  const specs: LabelSpec[] = [];

  const armColors: Record<string, number> = {
    '英仙臂': 0x8fb8ff, '人马臂': 0xffd9a0, '盾牌-半人马臂': 0xbfe0ff, '矩尺臂': 0xffc0d0,
    'Perseus': 0x8fb8ff, 'Sagittarius': 0xffd9a0, 'Scutum-Centaurus': 0xbfe0ff, 'Norma': 0xffc0d0,
  };
  for (const arm of MILKY_WAY_ARMS) {
    if (arm.points.length < 2) continue;
    const pts = arm.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    grp.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: armColors[arm.n] ?? 0xaaccff, transparent: true, opacity: 0.55,
    })));
    const starGeo = new THREE.BufferGeometry();
    const pos: number[] = [], col: number[] = [];
    const c = new THREE.Color(armColors[arm.n] ?? 0xaaccff);
    for (const p of arm.points) {
      for (let k = 0; k < 14; k++) {
        const ox = (Math.random() - 0.5) * 0.8;
        const oy = (Math.random() - 0.5) * 0.18;
        const oz = (Math.random() - 0.5) * 0.8;
        pos.push(p[0] + ox, p[1] + oy, p[2] + oz);
        const b = 0.4 + Math.random() * 0.6;
        col.push(c.r * b, c.g * b, c.b * b);
      }
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    grp.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 0.18, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
    })));
    // Label at the outer tip of the arm
    const tip = pts[pts.length - 1];
    const anchor = new THREE.Object3D();
    anchor.position.copy(tip);
    grp.add(anchor);
    specs.push({ obj: anchor, n: arm.n, en: arm.n, note: '银河系旋臂',
      up: 0, kind: 'cosmos-dim', c: armColors[arm.n] ?? 0xaaccff });
  }

  // Central bar
  if (MILKY_WAY_BAR.length >= 2) {
    const pts = MILKY_WAY_BAR.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffe9bd, transparent: true, opacity: 0.7 })));
  }

  // Galactic core bulge (clickable)
  const bulgeTex = galaxySpriteTex('elliptical', [255, 230, 180], [255, 200, 130]);
  const bulge = sprite(bulgeTex, 0xffe9bd, 5.5, 0.95);
  grp.add(bulge);
  tag(bulge, '银心', 'Sgr A*', '银河系中心 · 超大质量黑洞',
    [['类型', '超大质量黑洞'], ['质量', '约 410 万倍太阳质量'],
     ['距离', '26,700 光年'], ['视星等', '—']], 0xffe9bd, 4, specs, grp, 4);

  // Sun position marker (clickable)
  const sunP = new THREE.Vector3(MILKY_WAY_SUN_POS[0], MILKY_WAY_SUN_POS[1], MILKY_WAY_SUN_POS[2]);
  const sunMarker = sprite(bulgeTex, 0xff9d61, 1.6, 1);
  sunMarker.position.copy(sunP);
  grp.add(sunMarker);
  tag(sunMarker, '太阳', 'SUN', '猎户臂内侧 · 距银心 8.2 kpc',
    [['位置', '猎户臂内侧'], ['距银心', '8.2 kpc（≈ 26,700 光年）'],
     ['绕银心速度', '220 km/s'], ['绕银心一周', '约 2.25 亿年']], 0xff9d61, 1.6, specs, grp, 2.5);

  grp.userData.labelSpecs = specs;
  // mark for slow rotation
  grp.userData.spin = 0.04;
  return grp;
}

/** ---------- Level 3: Local Group ---------- */
export function buildLocalGroup(): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'cosmos-localgroup';
  const specs: LabelSpec[] = [];
  const compress = (ly: number) => Math.cbrt(ly / 1000) * 6;

  for (const g of LOCAL_GROUP) {
    const p = galacticDir(g.l, g.b, _v.clone()).multiplyScalar(compress(g.distLy));
    const tex = galaxySpriteTex(g.type, g.c1, g.c2);
    // Cap sprite size so the two big galaxies don't visually swallow the rest
    const size = Math.min(3.5, Math.max(1.2, Math.cbrt(g.diamLy) * 0.5));
    const sp = sprite(tex, hexFromRGB(g.c1), size, 0.9);
    sp.position.copy(p);
    grp.add(sp);
    tag(sp, g.n, g.en, g.note,
      [['类型', g.type], ['距离', fmtLy(g.distLy)], ['直径', fmtLy(g.diamLy)],
       ['视星等', g.mag], ['坐标', `l=${g.l.toFixed(1)}° b=${g.b.toFixed(1)}°`]],
      hexFromRGB(g.c1), size * 0.55, specs, grp, size * 1.8);
  }

  const sphere = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(compress(3000000), 24, 16)),
    new THREE.LineBasicMaterial({ color: 0x4a6a9a, transparent: true, opacity: 0.12 }),
  );
  grp.add(sphere);
  grp.userData.labelSpecs = specs;
  return grp;
}

/** ---------- Level 4: Nearby Universe + Virgo Cluster ---------- */
export function buildNearbyUniverse(): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'cosmos-nearby';
  const specs: LabelSpec[] = [];
  const compress = (ly: number) => Math.cbrt(ly / 100000) * 8;

  const mwTex = galaxySpriteTex('spiral', [220, 220, 255], [180, 200, 255]);
  const mw = sprite(mwTex, 0xdfe8ff, 4, 1);
  grp.add(mw);
  tag(mw, '银河系', 'MILKY WAY', '本星系群中心 · 棒旋星系',
    [['类型', '棒旋星系 SBbc'], ['恒星数', '约 4,000 亿'], ['直径', '约 10 万光年']],
    0xdfe8ff, 3.5, specs, grp, 5);

  const all = [...NEARBY_GALAXIES, ...VIRGO_CLUSTER];
  for (const g of all) {
    const p = galacticDir(g.l, g.b, _v.clone()).multiplyScalar(compress(g.distLy));
    const tex = galaxySpriteTex(g.type, g.c1, g.c2);
    const size = Math.min(5, Math.max(1, Math.cbrt(g.diamLy) * 0.6));
    const sp = sprite(tex, hexFromRGB(g.c1), size, g.group === 'virgo' ? 0.95 : 0.8);
    sp.position.copy(p);
    grp.add(sp);
    tag(sp, g.n, g.en, g.note,
      [['类型', g.type], ['距离', fmtLy(g.distLy)], ['直径', fmtLy(g.diamLy)],
       ['视星等', g.mag], ['坐标', `l=${g.l.toFixed(1)}° b=${g.b.toFixed(1)}°`]],
      hexFromRGB(g.c1), size * 0.55, specs, grp, size * 2);
  }

  // Virgo cluster core glow (clickable anchor)
  const virgoCenter = galacticDir(283.8, 74.5, _v.clone()).multiplyScalar(compress(53500000));
  const glowTex = galaxySpriteTex('elliptical', [255, 230, 200], [255, 200, 150]);
  const glow = sprite(glowTex, 0xffe9bd, 10, 0.25);
  glow.position.copy(virgoCenter);
  grp.add(glow);
  tag(glow, '室女座星系团', 'VIRGO CLUSTER', '本超星系团引力中心',
    [['类型', '星系团'], ['成员', '约 1,300 个星系'], ['距离', '约 5,350 万光年'],
     ['质心', '本超星系团引力中心']], 0xffe9bd, 10, specs, grp, 12);

  grp.userData.labelSpecs = specs;
  return grp;
}

/** ---------- Level 5: Superclusters & Cosmic Web ---------- */
export function buildSuperclusters(): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'cosmos-superclusters';
  const specs: LabelSpec[] = [];
  const compress = (mpc: number) => Math.cbrt(mpc) * 4;

  const mwTex = galaxySpriteTex('spiral', [220, 220, 255], [180, 200, 255]);
  const mw = sprite(mwTex, 0xdfe8ff, 3, 1);
  grp.add(mw);
  tag(mw, '银河系', 'MILKY WAY', '拉尼亚凯亚超星系团一隅',
    [['位置', '拉尼亚凯亚超星系团边缘']], 0xdfe8ff, 3, specs, grp, 4);

  for (const s of SUPERCLUSTERS) {
    const p = galacticDir(s.l, s.b, _v.clone()).multiplyScalar(compress(s.distMpc));
    const tex = galaxySpriteTex('cluster', [255, 230, 200], [200, 220, 255]);
    const size = Math.max(2, Math.cbrt(s.spanMpc) * 2.2);
    const sp = sprite(tex, 0xffd9a0, size, 0.5);
    sp.position.copy(p);
    grp.add(sp);
    tag(sp, s.n, s.en, s.note,
      [['类型', '超星系团'], ['距离', fmtMpc(s.distMpc)], ['跨度', fmtMpc(s.spanMpc)]],
      0xffd9a0, size * 0.6, specs, grp, size * 1.6);
  }

  for (const f of COSMIC_FILAMENTS) {
    const a = galacticDir(f.from[0], f.from[1], _v.clone()).multiplyScalar(compress(f.from[2]));
    const b = galacticDir(f.to[0], f.to[1], _v.clone()).multiplyScalar(compress(f.to[2]));
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    grp.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0x5a7faa, transparent: true, opacity: 0.4,
    })));
  }

  const N = 2600;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    const r = Math.pow(Math.random(), 0.4) * 60;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 2 - 1);
    pos[k * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[k * 3 + 1] = r * Math.cos(ph) * 0.4;
    pos[k * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const b = 0.3 + Math.random() * 0.5;
    col[k * 3] = 0.6 * b; col[k * 3 + 1] = 0.7 * b; col[k * 3 + 2] = 0.9 * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  grp.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.5, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false,
  })));

  grp.userData.labelSpecs = specs;
  return grp;
}

/** ---------- Level 6: Observable Universe (CMB shell + quasars + far galaxies) ---------- */
export function buildObservableUniverse(): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'cosmos-observable';
  const specs: LabelSpec[] = [];

  const R = 100;
  const cmb = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 32),
    new THREE.MeshBasicMaterial({
      map: cmbTex(), side: THREE.BackSide,
      transparent: true, opacity: 0.85, depthWrite: false,
    }),
  );
  cmb.renderOrder = -10;
  grp.add(cmb);
  // CMB label anchor
  const cmbAnchor = new THREE.Object3D();
  cmbAnchor.position.set(0, 0, -R);
  grp.add(cmbAnchor);
  specs.push({ obj: cmbAnchor, n: '宇宙微波背景', en: 'CMB',
    note: '大爆炸 38 万年后的「最后散射面」· 13.8 Gyr 前的余辉',
    up: 0, kind: 'cosmos', c: 0x9fb8e0,
    rows: [['类型', '宇宙微波背景辐射'], ['温度', '2.725 K'],
           ['红移', 'z ≈ 1100'], ['年龄', '38 万年（大爆炸后）'],
           ['涨落', 'ΔT/T ≈ 10⁻⁵'], ['偶极', '3.3 mK（运动方向）'],
           ['第一峰', 'ℓ ≈ 220（≈ 1°）'], ['宇宙年龄', '13.8 Gyr']] });

  // CMB dipole direction marker (direction of Solar-system motion relative to CMB rest frame)
  const dipoleDir = galacticDir(264, 48, _v.clone()).multiplyScalar(R);
  const dipoleAnchor = new THREE.Object3D();
  dipoleAnchor.position.copy(dipoleDir);
  grp.add(dipoleAnchor);
  specs.push({ obj: dipoleAnchor, n: 'CMB 偶极方向', en: 'CMB DIPOLE',
    note: '太阳系相对 CMB 静止参考系以约 370 km/s 运动，朝狮子座/室女座方向',
    up: 0, kind: 'cosmos-dim', c: 0xc0d0e0,
    rows: [['方向', '银经 264° 银纬 48°'], ['速度', '约 370 km/s'], ['成因', '多普勒运动效应']] });

  // Acoustic-peak annotation anchors at the CMB first-peak angular scale (≈1° → a few degrees on shell)
  const peakAnchor = new THREE.Object3D();
  peakAnchor.position.set(R * 0.3, R * 0.4, -R * 0.86);
  grp.add(peakAnchor);
  specs.push({ obj: peakAnchor, n: '声学峰 ℓ≈220', en: 'ACOUSTIC PEAK',
    note: 'CMB 角功率谱的第一峰，对应约 1° 角尺度，证明宇宙平坦（Ω≈1）',
    up: 0, kind: 'cosmos-dim', c: 0xb0c8e0,
    rows: [['多极数', 'ℓ ≈ 220'], ['角尺度', '≈ 0.9°'], ['物理', '重子声学振荡']] });

  // Inner shell ring marking the "surface of last scattering" boundary
  const ringPts: THREE.Vector3[] = [];
  const ringR = R * 0.99;
  for (let k = 0; k <= 128; k++) {
    const a = (k / 128) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * ringR, Math.sin(a * 3) * 2, Math.sin(a) * ringR));
  }
  grp.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color: 0x5fd3ff, transparent: true, opacity: 0.18, depthWrite: false })));

  const qTex = galaxySpriteTex('elliptical', [255, 220, 160], [255, 180, 120]);
  for (const q of QUASARS) {
    const p = galacticDir(q.l, q.b, _v.clone()).multiplyScalar(R * 0.6 * (1 - 1 / (1 + q.z) + 0.2));
    const sp = sprite(qTex, 0xffd9a0, 3.5, 0.95);
    sp.position.copy(p);
    grp.add(sp);
    tag(sp, q.n, q.en, q.note,
      [['类型', '类星体'], ['红移', 'z=' + q.z], ['距离', fmtLy(q.distLy)]],
      0xffd9a0, 3.5, specs, grp, 5);
  }

  const gTex = galaxySpriteTex('spiral', [255, 230, 200], [200, 220, 255]);
  for (const g of FAMOUS_GALAXIES) {
    const p = galacticDir(g.l, g.b, _v.clone()).multiplyScalar(R * 0.45 * (0.5 + Math.random() * 0.4));
    const sp = sprite(gTex, hexFromRGB(g.c1), 2.2, 0.7);
    sp.position.copy(p);
    grp.add(sp);
    tag(sp, g.n, g.en, g.note,
      [['类型', g.type], ['距离', fmtLy(g.distLy)]],
      hexFromRGB(g.c1), 2.2, specs, grp, 4);
  }

  const N = 1800;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    const r = Math.sqrt(Math.random()) * R * 0.85;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 2 - 1);
    pos[k * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[k * 3 + 1] = r * Math.cos(ph);
    pos[k * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const b = 0.3 + Math.random() * 0.5;
    col[k * 3] = 0.7 * b; col[k * 3 + 1] = 0.65 * b; col[k * 3 + 2] = 0.85 * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  grp.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.8, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false,
  })));

  grp.userData.labelSpecs = specs;
  return grp;
}

/** Scale-level metadata for HUD. */
export interface ScaleLevel {
  id: number;
  key: string;
  name: string;
  en: string;
  span: string;
  sceneScale: number;
  description: string;
}

export const SCALE_LEVELS: ScaleLevel[] = [
  { id: 0, key: 'solar', name: '太阳系', en: 'SOLAR SYSTEM',
    span: '≈ 9 十亿 km（60 AU）', sceneScale: 120,
    description: '太阳与其八大行星、矮行星、彗星和小天体构成的引力系统。' },
  { id: 1, key: 'neighborhood', name: '近邻恒星', en: 'SOLAR NEIGHBORHOOD',
    span: '≈ 16 光年', sceneScale: 22,
    description: '太阳周围最近的恒星，红矮星占大多数，比邻星仅 4.24 光年。' },
  { id: 2, key: 'milkyway', name: '银河系', en: 'MILKY WAY GALAXY',
    span: '直径 ≈ 10 万光年', sceneScale: 28,
    description: '棒旋星系，约 4,000 亿颗恒星分属四条主旋臂，太阳位于猎户臂内侧。' },
  { id: 3, key: 'localgroup', name: '本星系群', en: 'LOCAL GROUP',
    span: '直径 ≈ 1,000 万光年', sceneScale: 30,
    description: '约 80 个星系组成的引力群，以银河系与仙女座星系为两大核心。' },
  { id: 4, key: 'nearby', name: '近邻宇宙', en: 'NEARBY UNIVERSE',
    span: '≈ 1 亿光年', sceneScale: 40,
    description: '本星系群周围的星系与星系团，室女座星系团是本超星系团的引力中心。' },
  { id: 5, key: 'supercluster', name: '超星系团网络', en: 'COSMIC WEB',
    span: '≈ 10 亿光年', sceneScale: 90,
    description: '星系沿宇宙网状结构聚集，超星系团被巨大的「巨洞」隔开。' },
  { id: 6, key: 'observable', name: '可观测宇宙', en: 'OBSERVABLE UNIVERSE',
    span: '直径 ≈ 930 亿光年', sceneScale: 220,
    description: '我们能观测到的全部宇宙，最外层是宇宙微波背景辐射（CMB）。' },
];
