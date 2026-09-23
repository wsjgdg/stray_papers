/**
 * universe-data.ts — 可观测宇宙数据集 (Observable Universe Dataset)
 * -------------------------------------------------------------------------
 * Curated, real astronomical data for the Cosmos Simulator 3D Three.js
 * cosmic-zoom visualization. Distances, coordinates, magnitudes and types
 * are taken from peer-reviewed / reference sources; all `note` fields are
 * in Chinese (one sentence each).
 *
 * Primary sources:
 *  - NASA / IPAC Extragalactic Database (NED)   https://ned.ipac.caltech.edu
 *  - SIMBAD Astronomical Database (CDS)          https://simbad.u-strasbg.fr
 *  - Wikipedia "List of nearest stars and brown dwarfs"
 *  - Wikipedia "Local Group", "Virgo Cluster", "Lists of galaxies"
 *  - Wikipedia "List of galaxy clusters", "Superclusters"
 *  - Tully et al. (2014) Laniakea Supercluster paper (Nature 513, 71)
 *  - Hubble / JWST press releases for high-z galaxies & quasars
 *  - Gaia DR3 for nearby-star astrometry
 *
 * Coordinate systems:
 *  - Distant galaxies: galactic coords (l, b) in degrees + distance in ly.
 *  - Nearby stars: equatorial coords RA (hours) / Dec (degrees).
 *  - Milky Way arms: cartesian [x, y, z] in kpc, Sun at +X axis, GC at origin.
 *
 * NOTE: For very distant objects "distLy" is the LOOKBACK distance
 * (light-travel distance) unless otherwise stated, since that is what is
 * pedagogically meaningful in a cosmic-zoom timeline.
 * -------------------------------------------------------------------------
 */

import * as THREE from 'three';

// =========================================================================
// 1. Interfaces
// =========================================================================

/** Galaxy classification groups used by the cosmic-zoom UI. */
export type GalaxyGroup = 'local' | 'nearby' | 'virgo' | 'far';

/** Morphological type of a galaxy. */
export type GalaxyType =
  | 'spiral'
  | 'elliptical'
  | 'irregular'
  | 'lenticular'
  | 'dwarf';

/** A single galaxy entry, used for all four galaxy catalogs. */
export interface GalaxyData {
  /** 中文名称 */
  n: string;
  /** English / catalog identifier */
  en: string;
  /** Morphological type */
  type: GalaxyType;
  /** Distance in light-years (lookback for far objects) */
  distLy: number;
  /** Galactic longitude, degrees [0, 360) */
  l: number;
  /** Galactic latitude, degrees [-90, 90] */
  b: number;
  /** Diameter in light-years */
  diamLy: number;
  /** Apparent visual magnitude (string, "—" if N/A) */
  mag: string;
  /** Primary color (RGB 0-255), e.g. disk color for spirals */
  c1: number[];
  /** Secondary color (RGB 0-255), e.g. bulge color for spirals */
  c2: number[];
  /** One-line Chinese description */
  note: string;
  /** Logical grouping used by the cosmic-zoom UI */
  group: GalaxyGroup;
}

/** Large-scale supercluster entry. */
export interface SuperclusterData {
  n: string;
  en: string;
  /** Approximate distance to near edge / center in Mpc */
  distMpc: number;
  /** Galactic longitude of approximate center, degrees */
  l: number;
  /** Galactic latitude of approximate center, degrees */
  b: number;
  /** Approximate longest span in Mpc */
  spanMpc: number;
  note: string;
}

/** A cosmic filament / great wall defined by two endpoints. */
export interface FilamentData {
  n: string;
  /** Start endpoint [l, b, distMpc] */
  from: [number, number, number];
  /** End endpoint [l, b, distMpc] */
  to: [number, number, number];
  note: string;
}

/** Quasar (or high-z AGN) entry. */
export interface QuasarData {
  n: string;
  en: string;
  /** Redshift */
  z: number;
  /** Comoving distance in light-years */
  distLy: number;
  /** Galactic longitude, degrees */
  l: number;
  /** Galactic latitude, degrees */
  b: number;
  note: string;
}

/** Nearby star in the solar neighborhood. */
export interface NearbyStar {
  n: string;
  en: string;
  /** Distance in light-years */
  distLy: number;
  /** Right ascension in hours [0, 24) */
  ra: number;
  /** Declination in degrees [-90, 90] */
  dec: number;
  /** Apparent visual magnitude */
  mag: number;
  /** Spectral type string, e.g. "M5.5Ve", "G2V", "DA2" */
  sp: string;
  /** Hex color derived from spectral type */
  c: number;
}

/** A Milky Way spiral arm as a polyline of cartesian kpc points. */
export interface ArmData {
  n: string;
  /** Array of [x, y, z] points in kpc relative to Galactic center */
  points: number[][];
  /** Hex color of the arm */
  color: number;
}

/** Notable distance/sphere landmark in the observable universe. */
export interface CosmicLandmark {
  n: string;
  en: string;
  /** Distance in light-years (comoving unless noted) */
  distLy: number;
  /** Galactic longitude (l=0, b=0 ⇒ isotropic shell) */
  l: number;
  b: number;
  note: string;
  /** kind: 'horizon' | 'era' | 'structure' | 'milestone' */
  kind: string;
}

// =========================================================================
// 2. Helpers
// =========================================================================

/**
 * Map a spectral-type string to a representative hex color.
 * O→0xb9c8ff, B→0xbcd2ff, A→0xdfe8ff, F→0xfff4e6,
 * G→0xffe9bd, K→0xffc38f, M→0xff9d61. White dwarfs (D*) → 0xeaf0ff.
 */
function spectralColor(sp: string): number {
  const c = sp.charAt(0).toUpperCase();
  switch (c) {
    case 'O':
      return 0xb9c8ff;
    case 'B':
      return 0xbcd2ff;
    case 'A':
      return 0xdfe8ff;
    case 'F':
      return 0xfff4e6;
    case 'G':
      return 0xffe9bd;
    case 'K':
      return 0xffc38f;
    case 'M':
      return 0xff9d61;
    case 'D':
      return 0xeaf0ff; // white dwarf
    default:
      return 0xffffff;
  }
}

/**
 * Generate points along a logarithmic spiral arm.
 *
 *  r(θ) = startR · e^(b·θ),   b = tan(pitch°)
 *
 * Used to approximate the Milky Way's spiral arms (pitch ≈ 12°).
 * Returns `points` cartesian [x, y, z] coordinates in kpc, z=0 (galactic plane).
 */
function genLogSpiral(
  startR: number,
  pitchDeg: number,
  turns: number,
  points: number,
  phase: number
): number[][] {
  const b = Math.tan(THREE.MathUtils.degToRad(pitchDeg));
  const out: number[][] = [];
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * turns * Math.PI * 2 + phase;
    const r = startR * Math.exp(b * t);
    out.push([r * Math.cos(t), r * Math.sin(t), 0]);
  }
  return out;
}

// =========================================================================
// 3. LOCAL_GROUP — 24 galaxies in the Local Group
// =========================================================================

export const LOCAL_GROUP: GalaxyData[] = [
  {
    n: '银河系',
    en: 'Milky Way',
    type: 'spiral',
    distLy: 0,
    l: 0,
    b: 0,
    diamLy: 100000,
    mag: '—',
    c1: [120, 180, 255],
    c2: [255, 220, 160],
    note: '我们所在的棒旋星系,直径约10万光年,太阳位于猎户臂上。',
    group: 'local',
  },
  {
    n: '仙女座星系',
    en: 'M31 / Andromeda',
    type: 'spiral',
    distLy: 2_500_000,
    l: 121.17,
    b: -21.57,
    diamLy: 220000,
    mag: '3.44',
    c1: [180, 200, 255],
    c2: [255, 230, 180],
    note: '本星系群最大成员,约45亿年后将与银河系合并。',
    group: 'local',
  },
  {
    n: '三角座星系',
    en: 'M33 / Triangulum',
    type: 'spiral',
    distLy: 2_730_000,
    l: 133.61,
    b: -31.33,
    diamLy: 60000,
    mag: '5.72',
    c1: [200, 220, 255],
    c2: [255, 235, 200],
    note: '本星系群第三大成员,正与仙女座有引力作用。',
    group: 'local',
  },
  {
    n: '大麦哲伦云',
    en: 'LMC',
    type: 'irregular',
    distLy: 163000,
    l: 280.47,
    b: -32.89,
    diamLy: 14000,
    mag: '0.9',
    c1: [220, 180, 230],
    c2: [200, 170, 220],
    note: '银河系最大卫星星系,1987A超新星即爆发于此。',
    group: 'local',
  },
  {
    n: '小麦哲伦云',
    en: 'SMC',
    type: 'irregular',
    distLy: 197000,
    l: 302.81,
    b: -44.28,
    diamLy: 7000,
    mag: '2.7',
    c1: [210, 190, 230],
    c2: [190, 170, 215],
    note: '矮不规则星系,正被银河系潮汐撕裂形成麦哲伦星流。',
    group: 'local',
  },
  {
    n: '人马座矮椭球星系',
    en: 'Sagittarius dSph',
    type: 'elliptical',
    distLy: 81000,
    l: 5.61,
    b: -14.09,
    diamLy: 10000,
    mag: '4.5',
    c1: [255, 200, 140],
    c2: [220, 170, 110],
    note: '正被银河系吞并的矮椭球星系,残骸形成人马座星流。',
    group: 'local',
  },
  {
    n: '大犬座矮星系',
    en: 'Canis Major Dwarf',
    type: 'irregular',
    distLy: 25000,
    l: 240,
    b: -8,
    diamLy: 10000,
    mag: '8.0',
    c1: [200, 170, 210],
    c2: [170, 150, 190],
    note: '迄今已知距银河系最近的卫星星系,被银盘严重遮蔽。',
    group: 'local',
  },
  {
    n: '狮子座 I',
    en: 'Leo I',
    type: 'dwarf',
    distLy: 820000,
    l: 226.0,
    b: 49.1,
    diamLy: 2000,
    mag: '10.2',
    c1: [180, 180, 200],
    c2: [140, 140, 160],
    note: '最遥远的银河系卫星星系之一,几乎不含暗物质。',
    group: 'local',
  },
  {
    n: '狮子座 II',
    en: 'Leo II',
    type: 'dwarf',
    distLy: 702000,
    l: 220.0,
    b: 67.3,
    diamLy: 1500,
    mag: '11.0',
    c1: [180, 180, 200],
    c2: [140, 140, 160],
    note: '低表面亮度的矮椭球卫星星系,位于狮子座高银纬。',
    group: 'local',
  },
  {
    n: '小熊座矮星系',
    en: 'Ursa Minor Dwarf',
    type: 'dwarf',
    distLy: 200000,
    l: 105.0,
    b: 44.8,
    diamLy: 2000,
    mag: '10.4',
    c1: [180, 180, 200],
    c2: [140, 140, 160],
    note: '银河系最暗弱的卫星之一,暗物质占比极高。',
    group: 'local',
  },
  {
    n: '天龙座矮星系',
    en: 'Draco Dwarf',
    type: 'dwarf',
    distLy: 260000,
    l: 86.4,
    b: 34.7,
    diamLy: 2500,
    mag: '10.9',
    c1: [180, 180, 200],
    c2: [140, 140, 160],
    note: '1965年发现的矮椭球卫星星系,含有大量暗物质。',
    group: 'local',
  },
  {
    n: '船底座矮星系',
    en: 'Carina Dwarf',
    type: 'dwarf',
    distLy: 330000,
    l: 260.1,
    b: -22.3,
    diamLy: 1500,
    mag: '15.5',
    c1: [180, 180, 200],
    c2: [140, 140, 160],
    note: '1977年发现的低光度矮椭球星系,恒星形成历史复杂。',
    group: 'local',
  },
  {
    n: '六分仪座矮星系',
    en: 'Sextans Dwarf',
    type: 'dwarf',
    distLy: 285000,
    l: 243.5,
    b: 42.3,
    diamLy: 3000,
    mag: '12.0',
    c1: [180, 180, 200],
    c2: [140, 140, 160],
    note: '极低表面亮度的矮椭球卫星星系,几乎无重元素。',
    group: 'local',
  },
  {
    n: '玉夫座矮星系',
    en: 'Sculptor Dwarf',
    type: 'dwarf',
    distLy: 290000,
    l: 287.5,
    b: -83.2,
    diamLy: 3000,
    mag: '10.5',
    c1: [180, 180, 200],
    c2: [140, 140, 160],
    note: '1937年发现的第一个矮椭球卫星星系,位于银南极。',
    group: 'local',
  },
  {
    n: '天炉座矮星系',
    en: 'Fornax Dwarf',
    type: 'dwarf',
    distLy: 460000,
    l: 237.1,
    b: -65.7,
    diamLy: 6000,
    mag: '8.8',
    c1: [200, 190, 210],
    c2: [160, 150, 170],
    note: '本星系群最大的矮椭球卫星之一,内含6个球状星团。',
    group: 'local',
  },
  {
    n: '唧筒座矮星系',
    en: 'Antlia Dwarf',
    type: 'dwarf',
    distLy: 1_300_000,
    l: 263,
    b: 11,
    diamLy: 2500,
    mag: '15.7',
    c1: [180, 180, 200],
    c2: [140, 140, 160],
    note: '可能属于本星系群边缘的过渡型矮星系。',
    group: 'local',
  },
  {
    n: '巴纳德星系',
    en: 'NGC 6822',
    type: 'irregular',
    distLy: 1_630_000,
    l: 25.34,
    b: -18.39,
    diamLy: 8000,
    mag: '9.3',
    c1: [200, 200, 240],
    c2: [170, 180, 220],
    note: '1884年巴纳德发现的孤立矮不规则星系。',
    group: 'local',
  },
  {
    n: 'IC 10',
    en: 'IC 10',
    type: 'irregular',
    distLy: 2_200_000,
    l: 119.05,
    b: -3.37,
    diamLy: 9000,
    mag: '10.4',
    c1: [210, 190, 240],
    c2: [180, 170, 220],
    note: '本星系群中唯一的星暴矮不规则星系,正在剧烈造星。',
    group: 'local',
  },
  {
    n: 'IC 1613',
    en: 'IC 1613',
    type: 'irregular',
    distLy: 2_400_000,
    l: 129.74,
    b: -47.36,
    diamLy: 9000,
    mag: '9.3',
    c1: [200, 200, 240],
    c2: [170, 180, 220],
    note: '不规则的矮星系,造父变星使其成为重要的星系距离标尺。',
    group: 'local',
  },
  {
    n: 'WLM 矮星系',
    en: 'WLM (DDO 221)',
    type: 'irregular',
    distLy: 3_000_000,
    l: 75.85,
    b: -73.62,
    diamLy: 10000,
    mag: '11.0',
    c1: [200, 200, 240],
    c2: [170, 180, 220],
    note: '位于本星系群边缘的孤立矮不规则星系。',
    group: 'local',
  },
  {
    n: '飞马座矮星系',
    en: 'Pegasus Dwarf (DDO 216)',
    type: 'irregular',
    distLy: 3_100_000,
    l: 94.78,
    b: -43.55,
    diamLy: 4000,
    mag: '13.2',
    c1: [200, 200, 240],
    c2: [170, 180, 220],
    note: '位于飞马座方向的本星系群边缘矮不规则星系。',
    group: 'local',
  },
  {
    n: '狮子座 A',
    en: 'Leo A',
    type: 'irregular',
    distLy: 2_250_000,
    l: 196.9,
    b: 44.4,
    diamLy: 3000,
    mag: '12.7',
    c1: [200, 200, 240],
    c2: [170, 180, 220],
    note: '极低表面亮度的矮不规则星系,几乎未受污染。',
    group: 'local',
  },
  {
    n: '宝瓶座矮星系',
    en: 'Aquarius Dwarf',
    type: 'irregular',
    distLy: 3_400_000,
    l: 34.41,
    b: -34.95,
    diamLy: 3000,
    mag: '13.7',
    c1: [200, 200, 240],
    c2: [170, 180, 220],
    note: '位于本星系群外围、正在形成恒星的矮不规则星系。',
    group: 'local',
  },
  {
    n: '人马座矮不规则星系',
    en: 'SagDIG',
    type: 'irregular',
    distLy: 3_500_000,
    l: 21.04,
    b: -16.26,
    diamLy: 3000,
    mag: '15.0',
    c1: [210, 190, 240],
    c2: [180, 170, 220],
    note: '本星系群最遥远、最暗弱的成员之一,金属丰度极低。',
    group: 'local',
  },
];

// =========================================================================
// 4. NEARBY_GALAXIES — 15 notable galaxies within ~30 Mly beyond Local Group
// =========================================================================

export const NEARBY_GALAXIES: GalaxyData[] = [
  {
    n: '半人马座 A',
    en: 'Centaurus A / NGC 5128',
    type: 'lenticular',
    distLy: 13_000_000,
    l: 309.52,
    b: 19.42,
    diamLy: 100000,
    mag: '6.84',
    c1: [180, 150, 130],
    c2: [120, 100, 90],
    note: '距地球最近的活跃射电星系,中心黑洞约5500万太阳质量。',
    group: 'nearby',
  },
  {
    n: '波德星系',
    en: 'M81',
    type: 'spiral',
    distLy: 12_000_000,
    l: 142.09,
    b: 40.9,
    diamLy: 90000,
    mag: '6.94',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '大熊座方向最亮的螺旋星系,与M82正在引力交互。',
    group: 'nearby',
  },
  {
    n: '雪茄星系',
    en: 'M82',
    type: 'irregular',
    distLy: 12_000_000,
    l: 141.4,
    b: 40.6,
    diamLy: 37000,
    mag: '8.4',
    c1: [220, 170, 150],
    c2: [180, 130, 110],
    note: '典型的星暴星系,受M81潮汐扰动而爆发性形成恒星。',
    group: 'nearby',
  },
  {
    n: 'NGC 6744',
    en: 'NGC 6744',
    type: 'spiral',
    distLy: 30_000_000,
    l: 359.5,
    b: -22.7,
    diamLy: 90000,
    mag: '9.14',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '被认为是银河系的最佳"孪生"星系,形态高度相似。',
    group: 'nearby',
  },
  {
    n: '圆规座星系',
    en: 'Circinus Galaxy',
    type: 'spiral',
    distLy: 13_000_000,
    l: 311.31,
    b: 3.81,
    diamLy: 26000,
    mag: '10.1',
    c1: [200, 210, 240],
    c2: [255, 220, 170],
    note: '距地球最近的塞弗特II型活跃星系核星系。',
    group: 'nearby',
  },
  {
    n: '玉夫座大星系',
    en: 'NGC 253 / Sculptor',
    type: 'spiral',
    distLy: 11_400_000,
    l: 97.36,
    b: -87.96,
    diamLy: 90000,
    mag: '7.2',
    c1: [220, 200, 170],
    c2: [255, 220, 170],
    note: '玉夫座星系群的主星系,银南极方向最亮的目标之一。',
    group: 'nearby',
  },
  {
    n: '南风车星系',
    en: 'M83',
    type: 'spiral',
    distLy: 15_000_000,
    l: 314.46,
    b: 31.96,
    diamLy: 55000,
    mag: '7.5',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '长蛇座方向宏伟正向螺旋星系,过去百年内出现6次超新星。',
    group: 'nearby',
  },
  {
    n: 'M94',
    en: 'M94 / NGC 4736',
    type: 'spiral',
    distLy: 16_000_000,
    l: 159.04,
    b: 76.04,
    diamLy: 50000,
    mag: '8.2',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '猎犬座方向,拥有罕见的双星环结构和外层恒星形成区。',
    group: 'nearby',
  },
  {
    n: '向日葵星系',
    en: 'M63 / Sunflower',
    type: 'spiral',
    distLy: 27_000_000,
    l: 129.69,
    b: 86.04,
    diamLy: 50000,
    mag: '8.6',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '猎犬座螺旋星系,外观如向日葵花瓣般细密斑驳。',
    group: 'nearby',
  },
  {
    n: '风车星系',
    en: 'M101 / Pinwheel',
    type: 'spiral',
    distLy: 21_000_000,
    l: 102.05,
    b: 60.31,
    diamLy: 170000,
    mag: '7.9',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '正面朝向我们的巨型螺旋星系,直径达17万光年。',
    group: 'nearby',
  },
  {
    n: '草帽星系',
    en: 'M104 / Sombrero',
    type: 'spiral',
    distLy: 31_000_000,
    l: 299.0,
    b: 51.5,
    diamLy: 50000,
    mag: '8.0',
    c1: [220, 200, 160],
    c2: [180, 140, 100],
    note: '侧面朝向地球的螺旋星系,中央巨大核球形如草帽。',
    group: 'nearby',
  },
  {
    n: '涡状星系',
    en: 'M51 / Whirlpool',
    type: 'spiral',
    distLy: 23_000_000,
    l: 104.86,
    b: 68.6,
    diamLy: 76000,
    mag: '8.4',
    c1: [200, 220, 255],
    c2: [255, 220, 180],
    note: '与伴星系NGC 5195交互的著名正向螺旋星系。',
    group: 'nearby',
  },
  {
    n: 'NGC 2903',
    en: 'NGC 2903',
    type: 'spiral',
    distLy: 30_000_000,
    l: 208.74,
    b: 44.5,
    diamLy: 80000,
    mag: '9.0',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '狮子座方向明亮的棒旋星系,中心恒星形成区异常活跃。',
    group: 'nearby',
  },
  {
    n: '针状星系',
    en: 'NGC 4565 / Needle',
    type: 'spiral',
    distLy: 30_000_000,
    l: 229.7,
    b: 86.0,
    diamLy: 100000,
    mag: '10.4',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '侧面朝向我们的纤细螺旋星系,是后发座方向标志目标。',
    group: 'nearby',
  },
  {
    n: 'NGC 5128 暗弱伴星',
    en: 'NGC 5102',
    type: 'lenticular',
    distLy: 11_000_000,
    l: 311.74,
    b: 22.15,
    diamLy: 20000,
    mag: '9.5',
    c1: [240, 220, 180],
    c2: [200, 170, 130],
    note: '半人马座A星系群内的透镜星系,与M83群相邻。',
    group: 'nearby',
  },
];

// =========================================================================
// 5. VIRGO_CLUSTER — 16 members of the Virgo Cluster (core ~53.5 Mly)
// =========================================================================

export const VIRGO_CLUSTER: GalaxyData[] = [
  {
    n: 'M49',
    en: 'NGC 4472 / M49',
    type: 'elliptical',
    distLy: 53_000_000,
    l: 302.46,
    b: 71.49,
    diamLy: 157000,
    mag: '8.4',
    c1: [255, 200, 140],
    c2: [220, 170, 110],
    note: '室女座星系团最亮的成员,巨型椭圆星系。',
    group: 'virgo',
  },
  {
    n: 'M58',
    en: 'NGC 4579 / M58',
    type: 'spiral',
    distLy: 63_000_000,
    l: 299.49,
    b: 72.34,
    diamLy: 95000,
    mag: '9.6',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '室女座星系团中少有的塞弗特活跃螺旋星系。',
    group: 'virgo',
  },
  {
    n: 'M59',
    en: 'NGC 4621 / M59',
    type: 'elliptical',
    distLy: 60_000_000,
    l: 302.71,
    b: 70.84,
    diamLy: 90000,
    mag: '9.6',
    c1: [255, 200, 140],
    c2: [220, 170, 110],
    note: '室内椭圆星系,自转速度异常,内部含盘状结构。',
    group: 'virgo',
  },
  {
    n: 'M60',
    en: 'NGC 4649 / M60',
    type: 'elliptical',
    distLy: 57_000_000,
    l: 303.49,
    b: 71.07,
    diamLy: 120000,
    mag: '8.8',
    c1: [255, 200, 140],
    c2: [220, 170, 110],
    note: '巨型椭圆星系,中心黑洞约45亿太阳质量。',
    group: 'virgo',
  },
  {
    n: 'M61',
    en: 'NGC 4303 / M61',
    type: 'spiral',
    distLy: 52_000_000,
    l: 290.18,
    b: 66.93,
    diamLy: 100000,
    mag: '9.7',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '正面朝向我们的棒旋星系,星系团中造星最活跃者之一。',
    group: 'virgo',
  },
  {
    n: 'M84',
    en: 'NGC 4374 / M84',
    type: 'elliptical',
    distLy: 53_000_000,
    l: 300.95,
    b: 72.32,
    diamLy: 110000,
    mag: '9.1',
    c1: [255, 200, 140],
    c2: [220, 170, 110],
    note: '室女座星系团核心椭圆星系,拥有相对论性喷流。',
    group: 'virgo',
  },
  {
    n: 'M86',
    en: 'NGC 4406 / M86',
    type: 'lenticular',
    distLy: 52_000_000,
    l: 300.66,
    b: 74.55,
    diamLy: 130000,
    mag: '8.9',
    c1: [240, 220, 180],
    c2: [200, 170, 130],
    note: '透镜星系,正以高速穿越星系团内介质并剥离气体。',
    group: 'virgo',
  },
  {
    n: 'M87 / 室女座 A',
    en: 'NGC 4486 / M87',
    type: 'elliptical',
    distLy: 53_000_000,
    l: 302.96,
    b: 70.56,
    diamLy: 240000,
    mag: '8.6',
    c1: [255, 200, 140],
    c2: [220, 170, 110],
    note: '室女座星系团中心巨型椭圆星系,2019年首张黑洞照片主角。',
    group: 'virgo',
  },
  {
    n: 'M89',
    en: 'NGC 4552 / M89',
    type: 'elliptical',
    distLy: 50_000_000,
    l: 300.31,
    b: 72.18,
    diamLy: 80000,
    mag: '9.8',
    c1: [255, 200, 140],
    c2: [220, 170, 110],
    note: '近球状椭圆星系,拥有延伸约10万光年的外层气体晕。',
    group: 'virgo',
  },
  {
    n: 'M90',
    en: 'NGC 4569 / M90',
    type: 'spiral',
    distLy: 53_000_000,
    l: 298.41,
    b: 75.46,
    diamLy: 85000,
    mag: '9.5',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '因冲压剥离而贫气的螺旋星系,正朝地球蓝移而来。',
    group: 'virgo',
  },
  {
    n: 'M91',
    en: 'NGC 4548 / M91',
    type: 'spiral',
    distLy: 63_000_000,
    l: 297.81,
    b: 74.46,
    diamLy: 85000,
    mag: '10.2',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '棒旋星系,梅西耶编号一度被误认,后由Owen Gingerich确认。',
    group: 'virgo',
  },
  {
    n: 'M98',
    en: 'NGC 4192 / M98',
    type: 'spiral',
    distLy: 44_000_000,
    l: 298.04,
    b: 78.0,
    diamLy: 160000,
    mag: '10.1',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '边缘略斜的螺旋星系,正以约200 km/s向我们运动(蓝移)。',
    group: 'virgo',
  },
  {
    n: 'M99',
    en: 'NGC 4254 / M99',
    type: 'spiral',
    distLy: 50_000_000,
    l: 295.16,
    b: 74.6,
    diamLy: 85000,
    mag: '9.9',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '不对称的螺旋星系,可能受暗物质子结构扰动。',
    group: 'virgo',
  },
  {
    n: 'M100',
    en: 'NGC 4321 / M100',
    type: 'spiral',
    distLy: 56_000_000,
    l: 295.92,
    b: 73.26,
    diamLy: 107000,
    mag: '9.3',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '室女座星系团中最壮观的正面螺旋星系,造父变星距离标尺。',
    group: 'virgo',
  },
  {
    n: 'NGC 4216',
    en: 'NGC 4216',
    type: 'spiral',
    distLy: 53_000_000,
    l: 298.16,
    b: 73.0,
    diamLy: 110000,
    mag: '10.0',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '侧向螺旋星系,尘埃带清晰可见,周围有伴星系。',
    group: 'virgo',
  },
  {
    n: 'NGC 4438',
    en: 'NGC 4438',
    type: 'lenticular',
    distLy: 52_000_000,
    l: 300.23,
    b: 72.0,
    diamLy: 95000,
    mag: '10.0',
    c1: [240, 220, 180],
    c2: [200, 170, 130],
    note: '高度扰动的透镜星系,与NGC 4435可能正在相互作用。',
    group: 'virgo',
  },
];

// =========================================================================
// 6. FAMOUS_GALAXIES — 12 famous / far-distance galaxies (lookback distLy)
// =========================================================================

export const FAMOUS_GALAXIES: GalaxyData[] = [
  {
    n: 'NGC 1300',
    en: 'NGC 1300',
    type: 'spiral',
    distLy: 61_000_000,
    l: 197.42,
    b: -39.3,
    diamLy: 110000,
    mag: '10.3',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '波江座方向的宏伟棒旋星系,是棒旋星系结构的教科书范例。',
    group: 'far',
  },
  {
    n: 'NGC 2207',
    en: 'NGC 2207 & IC 2163',
    type: 'spiral',
    distLy: 114_000_000,
    l: 239.7,
    b: -18.3,
    diamLy: 140000,
    mag: '11.0',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '大犬座方向正在相互作用的螺旋星系对,正逐步融合。',
    group: 'far',
  },
  {
    n: '触须星系',
    en: 'NGC 4038/4039 Antennae',
    type: 'irregular',
    distLy: 60_000_000,
    l: 302.6,
    b: 24.7,
    diamLy: 70000,
    mag: '10.3',
    c1: [220, 180, 200],
    c2: [180, 160, 200],
    note: '乌鸦座正在合并的星系对,潮汐尾形如昆虫触须。',
    group: 'far',
  },
  {
    n: '霍格天体',
    en: "Hoag's Object",
    type: 'irregular',
    distLy: 600_000_000,
    l: 57.6,
    b: 48.4,
    diamLy: 120000,
    mag: '11.0',
    c1: [220, 200, 255],
    c2: [255, 230, 200],
    note: '罕见的环星系,内核外有一圈年轻蓝色恒星环。',
    group: 'far',
  },
  {
    n: 'NGC 7331',
    en: 'NGC 7331',
    type: 'spiral',
    distLy: 50_000_000,
    l: 69.93,
    b: -32.0,
    diamLy: 100000,
    mag: '9.5',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '飞马座方向明亮的侧向螺旋星系,常被视为银河系替身。',
    group: 'far',
  },
  {
    n: 'NGC 3370',
    en: 'NGC 3370',
    type: 'spiral',
    distLy: 98_000_000,
    l: 224.36,
    b: 63.3,
    diamLy: 90000,
    mag: '11.4',
    c1: [200, 220, 255],
    c2: [255, 230, 180],
    note: '狮子座方向的正向螺旋星系,2004年哈勃拍摄过其精美图像。',
    group: 'far',
  },
  {
    n: '潘多拉星系团',
    en: 'Abell 2744',
    type: 'elliptical',
    distLy: 3_500_000_000,
    l: 292.81,
    b: -73.4,
    diamLy: 6_000_000,
    mag: '—',
    c1: [255, 200, 140],
    c2: [220, 170, 110],
    note: '前沿场深空项目之一,是研究引力透镜与暗物质的关键目标。',
    group: 'far',
  },
  {
    n: 'MACS J1149 透镜星系团',
    en: 'MACS J1149.5+2223',
    type: 'elliptical',
    distLy: 5_400_000_000,
    l: 226.0,
    b: 77.5,
    diamLy: 8_000_000,
    mag: '—',
    c1: [255, 200, 140],
    c2: [220, 170, 110],
    note: '通过其引力透镜首次分辨出单颗超巨星(Icarus)的星系团。',
    group: 'far',
  },
  {
    n: 'GN-z11',
    en: 'GN-z11',
    type: 'irregular',
    distLy: 13_400_000_000,
    l: 147.0,
    b: 52.0,
    diamLy: 5000,
    mag: '25.0',
    c1: [220, 200, 255],
    c2: [180, 180, 230],
    note: '大熊座方向,哈勃观测到的最遥远普通星系之一(z≈11.1)。',
    group: 'far',
  },
  {
    n: 'EGSY8p7',
    en: 'EGSY-2008532660',
    type: 'irregular',
    distLy: 13_200_000_000,
    l: 87.0,
    b: 42.0,
    diamLy: 4000,
    mag: '25.5',
    c1: [220, 200, 255],
    c2: [180, 180, 230],
    note: '夏威夷凯克望远镜在z≈8.68发现的高红移莱曼α发射星系。',
    group: 'far',
  },
  {
    n: 'IOK-1',
    en: 'IOK-1',
    type: 'irregular',
    distLy: 12_900_000_000,
    l: 99.0,
    b: 58.0,
    diamLy: 4000,
    mag: '25.5',
    c1: [220, 200, 255],
    c2: [180, 180, 230],
    note: '昴星团望远镜发现的红移z≈6.96的莱曼断裂星系。',
    group: 'far',
  },
  {
    n: 'UDFj-39546284',
    en: 'UDFj-39546284',
    type: 'irregular',
    distLy: 13_400_000_000,
    l: 224.0,
    b: -54.0,
    diamLy: 3000,
    mag: '28.0',
    c1: [220, 200, 255],
    c2: [180, 180, 230],
    note: '哈勃极深场中候选的最高红移星系之一(z≈11)。',
    group: 'far',
  },
];

// =========================================================================
// 7. SUPERCLUSTERS — 12 large-scale superclusters
// =========================================================================

export const SUPERCLUSTERS: SuperclusterData[] = [
  {
    n: '拉尼亚凯亚超星系团',
    en: 'Laniakea Supercluster',
    distMpc: 100,
    l: 0,
    b: 0,
    spanMpc: 160,
    note: '我们所在的超星系团,跨度约5.2亿光年,包含约10万个星系。',
  },
  {
    n: '室女座超星系团',
    en: 'Virgo Supercluster',
    distMpc: 17,
    l: 290,
    b: 75,
    spanMpc: 33,
    note: '传统的本超星系团,现被认为是拉尼亚凯亚的一个分支。',
  },
  {
    n: '长蛇-半人马超星系团',
    en: 'Hydra-Centaurus Supercluster',
    distMpc: 50,
    l: 300,
    b: 20,
    spanMpc: 30,
    note: '拉尼亚凯亚内的主要引力中心之一,含"巨引源"。',
  },
  {
    n: '英仙-双鱼超星系团',
    en: 'Perseus-Pisces Supercluster',
    distMpc: 70,
    l: 135,
    b: -15,
    spanMpc: 50,
    note: '与拉尼亚凯亚相邻的超星系团,英仙座星系团是其核心。',
  },
  {
    n: '孔雀-印第安超星系团',
    en: 'Pavo-Indus Supercluster',
    distMpc: 70,
    l: 335,
    b: -25,
    spanMpc: 30,
    note: '南天邻近的超星系团,与长蛇-半人马有纤维结构相连。',
  },
  {
    n: '后发座超星系团',
    en: 'Coma Supercluster',
    distMpc: 100,
    l: 60,
    b: 85,
    spanMpc: 50,
    note: '含著名的后发座星系团,是研究大尺度结构的经典目标。',
  },
  {
    n: '沙普利超星系团',
    en: 'Shapley Supercluster',
    distMpc: 650,
    l: 311,
    b: 29,
    spanMpc: 100,
    note: '本超星系团可能正在被其引力牵引,是宇宙中最致密结构之一。',
  },
  {
    n: '时钟座超星系团',
    en: 'Horologium Supercluster',
    distMpc: 1000,
    l: 247,
    b: -55,
    spanMpc: 500,
    note: '已知最大的超星系团之一,横跨约17亿光年。',
  },
  {
    n: '蛇夫座超星系团',
    en: 'Ophiuchus Supercluster',
    distMpc: 370,
    l: 0,
    b: 8,
    spanMpc: 50,
    note: '其核心有蛇夫座星系团,发生过极端的星系团核爆发。',
  },
  {
    n: '萨拉斯瓦蒂超星系团',
    en: 'Saraswati Supercluster',
    distMpc: 1400,
    l: 20,
    b: 20,
    spanMpc: 600,
    note: '印度团队发现的巨型超星系团,跨度约6.5亿光年。',
  },
  {
    n: '斯隆长城',
    en: 'Sloan Great Wall',
    distMpc: 1000,
    l: 180,
    b: 55,
    spanMpc: 420,
    note: '斯隆数字巡天发现的宇宙大尺度结构,长约13.7亿光年。',
  },
  {
    n: '武仙座超星系团',
    en: 'Hercules Supercluster',
    distMpc: 330,
    l: 30,
    b: 45,
    spanMpc: 100,
    note: '武仙座方向的大型超星系团,包含A2147、A2151、A2152星系团。',
  },
];

// =========================================================================
// 8. COSMIC_FILAMENTS — 6 great cosmic filaments / walls
//    (endpoints as [l, b, distMpc])
// =========================================================================

export const COSMIC_FILAMENTS: FilamentData[] = [
  {
    n: '斯隆长城',
    from: [165, 50, 870],
    to: [190, 65, 1100],
    note: '由众多超星系团串接的巨型墙体,长度约13.7亿光年。',
  },
  {
    n: 'CfA2 长城',
    from: [90, 40, 200],
    to: [120, 60, 260],
    note: '1989年由Geller与Huchra发现,长约7.5亿光年的早期大型结构。',
  },
  {
    n: '武仙-北冕座长城',
    from: [225, 45, 9500],
    to: [280, 70, 10500],
    note: '已知最大宇宙结构,跨度约100亿光年,挑战宇宙学原理。',
  },
  {
    n: '英仙-飞马纤维',
    from: [130, -15, 50],
    to: [170, 30, 100],
    note: '连接英仙-双鱼超星系团与飞马-双鱼区的纤维结构。',
  },
  {
    n: '大熊座超星系团链',
    from: [140, 70, 120],
    to: [180, 80, 200],
    note: '从本星系群向大熊座方向延伸的近邻纤维状结构。',
  },
  {
    n: '拉尼亚凯亚边界',
    from: [0, 0, 0],
    to: [290, 75, 100],
    note: '拉尼亚凯亚超星系团内部主轴,从本星系群延展至巨引源方向。',
  },
];

// =========================================================================
// 9. QUASARS — 8 famous quasars (distLy = comoving)
// =========================================================================

export const QUASARS: QuasarData[] = [
  {
    n: '3C 273',
    en: '3C 273',
    z: 0.158,
    distLy: 2_400_000_000,
    l: 289.95,
    b: 64.36,
    note: '室女座方向,首个被确认的类星体,视星等约12.9等。',
  },
  {
    n: '3C 48',
    en: '3C 48',
    z: 0.367,
    distLy: 4_500_000_000,
    l: 134.95,
    b: -5.83,
    note: '三角座方向,1960年发现的第一个类星体候选体。',
  },
  {
    n: 'ULAS J1342+0928',
    en: 'ULAS J1342+0928',
    z: 7.54,
    distLy: 27_900_000_000,
    l: 318.0,
    b: 58.0,
    note: '截至2017年发现的最遥远类星体之一,中心黑洞约8亿太阳质量。',
  },
  {
    n: 'ULAS J1120+0641',
    en: 'ULAS J1120+0641',
    z: 7.085,
    distLy: 27_400_000_000,
    l: 235.0,
    b: 66.0,
    note: '首个红移大于7的类星体,中心黑洞约20亿太阳质量。',
  },
  {
    n: 'J0439+1634',
    en: 'J0439+1634',
    z: 2.54,
    distLy: 19_300_000_000,
    l: 188.0,
    b: -21.0,
    note: '前景星系强引力透镜放大的高红移类星体,视亮度被增亮约50倍。',
  },
  {
    n: 'SDSS J1030+0524',
    en: 'SDSS J1030+0524',
    z: 6.31,
    distLy: 25_800_000_000,
    l: 232.0,
    b: 51.0,
    note: '斯隆巡天发现的首批z>6类星体,周围有中性氢吸收区。',
  },
  {
    n: 'Pōniuāʻena',
    en: 'J1007+2115 / Pōniuāʻena',
    z: 7.515,
    distLy: 27_800_000_000,
    l: 222.0,
    b: 55.0,
    note: '夏威夷命名的高红移类星体,中心黑洞约15亿太阳质量。',
  },
  {
    n: 'TON 618',
    en: 'TON 618',
    z: 2.219,
    distLy: 17_900_000_000,
    l: 164.0,
    b: 64.0,
    note: '已知最大黑洞之一,中心质量约660亿太阳质量。',
  },
];

// =========================================================================
// 10. NEARBY_STARS — 36 nearest star systems within ~14 ly
// =========================================================================

export const NEARBY_STARS: NearbyStar[] = [
  {
    n: '比邻星',
    en: 'Proxima Centauri',
    distLy: 4.2465,
    ra: 14.495,
    dec: -62.68,
    mag: 11.13,
    sp: 'M5.5Ve',
    c: spectralColor('M5.5Ve'),
  },
  {
    n: '南门二 A',
    en: 'Alpha Centauri A',
    distLy: 4.37,
    ra: 14.66,
    dec: -60.833,
    mag: 0.01,
    sp: 'G2V',
    c: spectralColor('G2V'),
  },
  {
    n: '南门二 B',
    en: 'Alpha Centauri B',
    distLy: 4.37,
    ra: 14.66,
    dec: -60.833,
    mag: 1.34,
    sp: 'K1V',
    c: spectralColor('K1V'),
  },
  {
    n: '巴纳德星',
    en: "Barnard's Star",
    distLy: 5.963,
    ra: 17.963,
    dec: 4.693,
    mag: 9.51,
    sp: 'M4Ve',
    c: spectralColor('M4Ve'),
  },
  {
    n: '沃尔夫 359',
    en: 'Wolf 359',
    distLy: 7.86,
    ra: 10.941,
    dec: 7.015,
    mag: 13.54,
    sp: 'M6V',
    c: spectralColor('M6V'),
  },
  {
    n: '拉兰德 21185',
    en: 'Lalande 21185',
    distLy: 8.31,
    ra: 11.056,
    dec: 35.97,
    mag: 7.52,
    sp: 'M2V',
    c: spectralColor('M2V'),
  },
  {
    n: '天狼星 A',
    en: 'Sirius A',
    distLy: 8.6,
    ra: 6.7525,
    dec: -16.716,
    mag: -1.46,
    sp: 'A1V',
    c: spectralColor('A1V'),
  },
  {
    n: '天狼星 B',
    en: 'Sirius B',
    distLy: 8.6,
    ra: 6.7525,
    dec: -16.716,
    mag: 8.44,
    sp: 'DA2',
    c: spectralColor('DA2'),
  },
  {
    n: '鲁坦 726-8 A',
    en: 'Luyten 726-8 A',
    distLy: 8.73,
    ra: 1.6505,
    dec: -17.951,
    mag: 12.54,
    sp: 'M5.5Ve',
    c: spectralColor('M5.5Ve'),
  },
  {
    n: '鲁坦 726-8 B',
    en: 'Luyten 726-8 B',
    distLy: 8.73,
    ra: 1.6505,
    dec: -17.951,
    mag: 12.99,
    sp: 'M6V',
    c: spectralColor('M6V'),
  },
  {
    n: '罗斯 154',
    en: 'Ross 154',
    distLy: 9.7,
    ra: 18.83,
    dec: -23.836,
    mag: 10.43,
    sp: 'M3.5Ve',
    c: spectralColor('M3.5Ve'),
  },
  {
    n: '罗斯 248',
    en: 'Ross 248',
    distLy: 10.32,
    ra: 23.698,
    dec: 44.175,
    mag: 12.29,
    sp: 'M5.5V',
    c: spectralColor('M5.5V'),
  },
  {
    n: '天苑四',
    en: 'Epsilon Eridani',
    distLy: 10.475,
    ra: 3.549,
    dec: -9.458,
    mag: 3.73,
    sp: 'K2V',
    c: spectralColor('K2V'),
  },
  {
    n: '罗斯 128',
    en: 'Ross 128',
    distLy: 11.03,
    ra: 11.796,
    dec: 0.804,
    mag: 11.13,
    sp: 'M4V',
    c: spectralColor('M4V'),
  },
  {
    n: '拉卡伊 9352',
    en: 'Lacaille 9352',
    distLy: 11.04,
    ra: 23.098,
    dec: -35.853,
    mag: 7.34,
    sp: 'M2V',
    c: spectralColor('M2V'),
  },
  {
    n: 'EZ 星座宝瓶 A',
    en: 'EZ Aquarii A',
    distLy: 11.27,
    ra: 22.643,
    dec: -15.299,
    mag: 11.27,
    sp: 'M5V',
    c: spectralColor('M5V'),
  },
  {
    n: 'EZ 星座宝瓶 B',
    en: 'EZ Aquarii B',
    distLy: 11.27,
    ra: 22.643,
    dec: -15.299,
    mag: 11.6,
    sp: 'M5V',
    c: spectralColor('M5V'),
  },
  {
    n: 'EZ 星座宝瓶 C',
    en: 'EZ Aquarii C',
    distLy: 11.27,
    ra: 22.643,
    dec: -15.299,
    mag: 12.3,
    sp: 'M5.5V',
    c: spectralColor('M5.5V'),
  },
  {
    n: '南河三 A',
    en: 'Procyon A',
    distLy: 11.4,
    ra: 7.655,
    dec: 5.225,
    mag: 0.34,
    sp: 'F5IV-V',
    c: spectralColor('F5IV-V'),
  },
  {
    n: '南河三 B',
    en: 'Procyon B',
    distLy: 11.4,
    ra: 7.655,
    dec: 5.225,
    mag: 10.7,
    sp: 'DA',
    c: spectralColor('DA'),
  },
  {
    n: '天津增廿九 A',
    en: '61 Cygni A',
    distLy: 11.4,
    ra: 21.115,
    dec: 38.749,
    mag: 5.21,
    sp: 'K5V',
    c: spectralColor('K5V'),
  },
  {
    n: '天津增廿九 B',
    en: '61 Cygni B',
    distLy: 11.4,
    ra: 21.115,
    dec: 38.749,
    mag: 6.03,
    sp: 'K7V',
    c: spectralColor('K7V'),
  },
  {
    n: '斯特鲁维 2398 A',
    en: 'Struve 2398 A',
    distLy: 11.49,
    ra: 18.704,
    dec: 59.63,
    mag: 8.94,
    sp: 'M3V',
    c: spectralColor('M3V'),
  },
  {
    n: '斯特鲁维 2398 B',
    en: 'Struve 2398 B',
    distLy: 11.49,
    ra: 18.704,
    dec: 59.63,
    mag: 9.69,
    sp: 'M3.5V',
    c: spectralColor('M3.5V'),
  },
  {
    n: '格鲁姆布里奇 34 A',
    en: 'Groombridge 34 A',
    distLy: 11.62,
    ra: 0.307,
    dec: 43.947,
    mag: 8.07,
    sp: 'M1.5V',
    c: spectralColor('M1.5V'),
  },
  {
    n: '格鲁姆布里奇 34 B',
    en: 'Groombridge 34 B',
    distLy: 11.62,
    ra: 0.307,
    dec: 43.947,
    mag: 11.06,
    sp: 'M3.5V',
    c: spectralColor('M3.5V'),
  },
  {
    n: '印第安座 ε',
    en: 'Epsilon Indi',
    distLy: 11.87,
    ra: 22.056,
    dec: -56.786,
    mag: 4.69,
    sp: 'K4.5V',
    c: spectralColor('K4.5V'),
  },
  {
    n: 'DX 巨蟹座',
    en: 'DX Cancri',
    distLy: 11.83,
    ra: 8.497,
    dec: 26.776,
    mag: 14.81,
    sp: 'M6.5V',
    c: spectralColor('M6.5V'),
  },
  {
    n: '天仓五',
    en: 'Tau Ceti',
    distLy: 11.94,
    ra: 1.734,
    dec: -15.938,
    mag: 3.5,
    sp: 'G8V',
    c: spectralColor('G8V'),
  },
  {
    n: 'GJ 1061',
    en: 'GJ 1061',
    distLy: 11.99,
    ra: 3.6,
    dec: -44.513,
    mag: 13.03,
    sp: 'M5.5V',
    c: spectralColor('M5.5V'),
  },
  {
    n: 'YZ 鲸鱼座',
    en: 'YZ Ceti',
    distLy: 12.07,
    ra: 1.208,
    dec: -16.999,
    mag: 12.07,
    sp: 'M4.5V',
    c: spectralColor('M4.5V'),
  },
  {
    n: '鲁坦星',
    en: "Luyten's Star",
    distLy: 12.36,
    ra: 7.457,
    dec: 5.231,
    mag: 9.87,
    sp: 'M3.5V',
    c: spectralColor('M3.5V'),
  },
  {
    n: '蒂加登星',
    en: "Teegarden's Star",
    distLy: 12.5,
    ra: 2.884,
    dec: 16.881,
    mag: 15.13,
    sp: 'M6.5V',
    c: spectralColor('M6.5V'),
  },
  {
    n: '卡普坦星',
    en: "Kapteyn's Star",
    distLy: 12.83,
    ra: 5.195,
    dec: -45.018,
    mag: 8.86,
    sp: 'M1.5V',
    c: spectralColor('M1.5V'),
  },
  {
    n: '拉卡伊 8760',
    en: 'Lacaille 8760',
    distLy: 12.87,
    ra: 21.288,
    dec: -38.868,
    mag: 6.7,
    sp: 'K7V',
    c: spectralColor('K7V'),
  },
  {
    n: '克鲁格 60 A',
    en: 'Kruger 60 A',
    distLy: 13.07,
    ra: 23.499,
    dec: 57.492,
    mag: 9.59,
    sp: 'M3V',
    c: spectralColor('M3V'),
  },
  {
    n: '克鲁格 60 B',
    en: 'Kruger 60 B',
    distLy: 13.07,
    ra: 23.499,
    dec: 57.492,
    mag: 11.1,
    sp: 'M4V',
    c: spectralColor('M4V'),
  },
  {
    n: '罗斯 614 A',
    en: 'Ross 614 A',
    distLy: 13.15,
    ra: 8.875,
    dec: 2.466,
    mag: 11.15,
    sp: 'M4.5V',
    c: spectralColor('M4.5V'),
  },
  {
    n: '罗斯 614 B',
    en: 'Ross 614 B',
    distLy: 13.15,
    ra: 8.875,
    dec: 2.466,
    mag: 14.5,
    sp: 'M8V',
    c: spectralColor('M8V'),
  },
];

// =========================================================================
// 11. MILKY_WAY_ARMS — 4 main spiral arms (logarithmic spirals, ~80 pts each)
//     Coordinate system: Galactic center at origin; Sun on +X axis at 8.2 kpc.
//     Pitch angle ≈ 12° (typical for the Milky Way).
// =========================================================================

const ARM_POINTS = 80;
const ARM_PITCH = 12; // degrees
const ARM_TURNS = 1.4;

export const MILKY_WAY_ARMS: ArmData[] = [
  {
    n: '矩尺座旋臂',
    points: genLogSpiral(3.0, ARM_PITCH, ARM_TURNS, ARM_POINTS, 0),
    color: 0xff9d61,
  },
  {
    n: '盾牌-半人马旋臂',
    points: genLogSpiral(3.4, ARM_PITCH, ARM_TURNS, ARM_POINTS, Math.PI / 2),
    color: 0xffc38f,
  },
  {
    n: '人马座旋臂',
    points: genLogSpiral(3.8, ARM_PITCH, ARM_TURNS, ARM_POINTS, Math.PI),
    color: 0xffe9bd,
  },
  {
    n: '英仙座旋臂',
    points: genLogSpiral(4.2, ARM_PITCH, ARM_TURNS, ARM_POINTS, (3 * Math.PI) / 2),
    color: 0xdfe8ff,
  },
];

// =========================================================================
// 12. MILKY_WAY_BAR — central bar (~8.4 kpc long) at ~60° to Sun-GC line
// =========================================================================

export const MILKY_WAY_BAR: number[][] = (() => {
  const points: number[][] = [];
  const halfLen = 4.2; // kpc → total bar ~8.4 kpc
  const angle = THREE.MathUtils.degToRad(60); // bar long axis from +Y axis
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const n = 21;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * 2 - 1; // -1 .. +1
    const x = s * halfLen * cosA;
    const y = s * halfLen * sinA;
    points.push([x, y, 0]);
  }
  return points;
})();

// =========================================================================
// 13. MILKY_WAY_SUN_POS — Sun position ~8.2 kpc from GC, in galactic plane
// =========================================================================

export const MILKY_WAY_SUN_POS: [number, number, number] = [8.2, 0, 0];

// =========================================================================
// 14. COSMIC_LANDMARKS — notable distance shells & cosmic era markers
// =========================================================================

export const COSMIC_LANDMARKS: CosmicLandmark[] = [
  {
    n: '太阳系边界',
    en: 'Heliopause',
    distLy: 0.0021,
    l: 0,
    b: 0,
    note: '日球层顶约距太阳0.002光年,标志着太阳风与星际介质的边界。',
    kind: 'milestone',
  },
  {
    n: '奥尔特云外缘',
    en: 'Oort Cloud Outer Edge',
    distLy: 3.26,
    l: 0,
    b: 0,
    note: '奥尔特云外缘约1秒差距,被视为太阳引力束缚的极限。',
    kind: 'milestone',
  },
  {
    n: '比邻星',
    en: 'Proxima Centauri',
    distLy: 4.2465,
    l: 313,
    b: -2,
    note: '除太阳外距地球最近的恒星。',
    kind: 'milestone',
  },
  {
    n: '本星际云',
    en: 'Local Interstellar Cloud',
    distLy: 30,
    l: 0,
    b: 0,
    note: '太阳目前正穿行的局部星际气体云团。',
    kind: 'structure',
  },
  {
    n: '本星系群半径',
    en: 'Local Group Radius',
    distLy: 4_000_000,
    l: 0,
    b: 0,
    note: '本星系群直径约1000万光年,包含银河系与仙女座等数十星系。',
    kind: 'structure',
  },
  {
    n: '巨引源',
    en: 'Great Attractor',
    distLy: 220_000_000,
    l: 307,
    b: 9,
    note: '拉尼亚凯亚内的引力异常区,本星系群正以约600 km/s向其坠落。',
    kind: 'structure',
  },
  {
    n: '宇宙黎明',
    en: 'Cosmic Dawn',
    distLy: 13_600_000_000,
    l: 0,
    b: 0,
    note: '宇宙大爆炸后约2亿年,首批恒星点亮宇宙的回望时刻。',
    kind: 'era',
  },
  {
    n: '再电离时代',
    en: 'Epoch of Reionization',
    distLy: 13_000_000_000,
    l: 0,
    b: 0,
    note: '大爆炸后约8亿年,首批恒星与类星体使宇宙气体再电离。',
    kind: 'era',
  },
  {
    n: '黑暗时代边界',
    en: 'Dark Ages Boundary',
    distLy: 13_700_000_000,
    l: 0,
    b: 0,
    note: '复合之后、首批恒星点亮之前的不可见时期边界。',
    kind: 'era',
  },
  {
    n: '哈勃深场',
    en: 'Hubble Deep Field',
    distLy: 12_000_000_000,
    l: 126,
    b: 54,
    note: '哈勃望远镜对一小片天区长时间曝光,揭示数千早期星系。',
    kind: 'milestone',
  },
  {
    n: '最后散射面',
    en: 'Surface of Last Scattering',
    distLy: 45_600_000_000,
    l: 0,
    b: 0,
    note: '宇宙微波背景辐射的源头,红移约1100,回望约138亿年。',
    kind: 'horizon',
  },
  {
    n: '哈勃球面',
    en: 'Hubble Sphere',
    distLy: 14_400_000_000,
    l: 0,
    b: 0,
    note: '由哈勃常数定义的退行速度等于光速的球面,半径约144亿光年。',
    kind: 'horizon',
  },
  {
    n: '可观测宇宙边缘',
    en: 'Observable Universe Edge',
    distLy: 46_500_000_000,
    l: 0,
    b: 0,
    note: '粒子视界,共动距离约465亿光年,即我们理论上能观测的最远距离。',
    kind: 'horizon',
  },
];

// =========================================================================
// Convenience re-exports
// =========================================================================

/** All galaxy catalogs combined, tagged by `group`. */
export const ALL_GALAXIES: GalaxyData[] = [
  ...LOCAL_GROUP,
  ...NEARBY_GALAXIES,
  ...VIRGO_CLUSTER,
  ...FAMOUS_GALAXIES,
];
