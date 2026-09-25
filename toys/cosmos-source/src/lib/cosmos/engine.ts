/**
 * engine.ts — Main Three.js engine for the Cosmos Simulator.
 * Ports the original 太阳系模拟器-opt.html scene + adds the cosmic-scale system.
 *
 * Exports `CosmosEngine` — instantiate with a container HTMLElement, then drive via
 * the public control methods (called by the React HUD).
 */
import * as THREE from "three";
import {
  EPOCH,
  SUN,
  BODIES,
  SYS,
  COMETS,
  MOONS,
  ASTEROIDS,
  CHI_ASTERISMS,
  DEEP,
  CONS,
  STARS,
  SPCOL,
} from "./data";
import {
  D2R,
  unitDir,
  dirToAltAz,
  rotMatrix,
  posAU,
  scalePos,
  scalePosReal,
  REAL_BASE,
  fmtRA,
  fmtDec,
  fmtDeg,
  fmtP,
} from "./math-utils";
import {
  makeTex,
  sunTex,
  glowTex,
  zodiTex,
  ringTex,
  thinRingTex,
  flareTex,
  softTex,
  nebulaTex,
  milkyWayTex,
  makePlanetMaterial,
  earthNightTex,
  makeAtmosphereMaterial,
} from "./textures";
import {
  buildSolarNeighborhood,
  buildMilkyWayGalaxy,
  buildLocalGroup,
  buildNearbyUniverse,
  buildSuperclusters,
  buildObservableUniverse,
  SCALE_LEVELS,
  type LabelSpec,
  type BodyData,
  type QuasarExtra,
  markBlue,
} from "./cosmos-views";
import { hudStore } from "./hudStore";

const MONTH = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
];

export interface EngineState {
  daysPerSec: number;
  dir: number;
  paused: boolean;
  horizonMode: boolean;
  eps: number;
  site: { lat: number; lon: number };
  show: Record<string, boolean>;
  scaleLevel: number;
  fps: number;
  dprScale: number;
  clock: string;
  focusName: string;
  simT: number;
  transit: number; // 0..1 progress of an in-flight scale transition (for HUD warp flash)
  flyMode: boolean;
  flySpeed: number; // fly speed multiplier (1..200)
  tourActive: boolean;
  realScale: boolean; // true → honest linear distances + proportional sizes
  blueLight: boolean; // true → artistic blue styling; false → neutral, no light override
  solarEclipse: boolean; // true when the Moon's umbra/penumbra currently falls on Earth
  halleyCountdown: string; // human-readable days until 2061 Halley perihelion
  apophisAlert: boolean; // true when the sim date is near Apophis's 2029-04-13 flyby
  planetPanel: {
    n: string;
    sym: string;
    alt: number; // local altitude (deg)
    az: number; // local azimuth (deg, 0=N)
    up: boolean; // above horizon
    vis: boolean; // above horizon AND sun below horizon (tonight-visible)
  }[];
  sunAlt: number; // current Sun altitude (deg) in horizon/planetarium mode
}

export interface BodyInfo {
  n: string;
  en: string;
  c: number;
  rows: [string, string, string?][];
  note: string;
  key: string;
  gotoLevel?: number;
  quasar?: QuasarExtra;
}

type LabelEntry = {
  el: HTMLDivElement;
  obj: THREE.Object3D;
  up: number;
  min?: number;
  grp: string;
  _on?: boolean;
  _x?: number;
  _y?: number;
};

export class CosmosEngine {
  private container: HTMLElement;
  private labelHost: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private BASE_DPR = 1;
  private dprScale = 1;
  private dprCool = 0;
  private ADAPTIVE_DPR = true;
  private _lastCtrlKey = "";

  // Scene graph roots
  private sysGroup = new THREE.Group();
  private eclFrame = new THREE.Group();
  private skyRoot = new THREE.Group();
  private horizonUI = new THREE.Group();
  private cosmosRoot = new THREE.Group(); // cosmic-scale views

  // Solar system
  private sunMesh!: THREE.Mesh;
  private nodes: Record<string, any> = {};
  private pickables: THREE.Object3D[] = [];
  private labelEls: LabelEntry[] = [];
  private labelThrottleMs = 33; // cap DOM label projection to ~30Hz (was 60Hz per frame)
  private lastLabelT = -1e9;
  private liveDist: Record<string, string> = {};
  private liveAltaz: Record<string, string> = {};
  private subOrbits: THREE.LineLoop[] = [];
  private beltAst!: THREE.InstancedMesh;
  private beltKbo!: THREE.InstancedMesh;
  // P1-2: named main-belt asteroids + NEOs (clickable, with dossiers)
  private asteroidGroup = new THREE.Group();
  private asteroidNodes: { mesh: THREE.Object3D; body: any }[] = [];
  // P1-2: Jupiter Trojan swarms (L4 leading / L5 trailing)
  private trojanL4!: THREE.InstancedMesh;
  private trojanL5!: THREE.InstancedMesh;
  private trojanData: { sign: number; dl: number; fr: number; inc: number }[] =
    [];
  private trojanLabel = new THREE.Object3D();
  // P1-4: pulsing feature hotspots on story moons (Europa / Enceladus)
  private pulseSprites: { spr: THREE.Sprite; base: number }[] = [];
  private _halleyTarget = Date.UTC(2061, 6, 28);
  private _halleyCountdown = "";
  private _apophisAlert = false;
  private _planetPanel: {
    n: string;
    sym: string;
    alt: number;
    az: number;
    up: boolean;
    vis: boolean;
  }[] = [];
  private _sunAlt = 0;
  private eclRingGrp!: THREE.Group;
  private zodiGroup = new THREE.Group();
  private geg!: THREE.Sprite;
  private shadowGrp = new THREE.Group();
  private moonShadowGrp = new THREE.Group();
  private eclipseFoot!: THREE.Mesh;
  private _solarEclipse = false;
  private orbitGroupRoot = new THREE.Group();
  private cometGroup = new THREE.Group();
  private comets: any[] = [];
  private skyMarks = new THREE.Group();
  private marks: any[] = [];
  private meteorGroup = new THREE.Group();
  private meteors: any[] = [];
  private nextMeteor = 2;
  private skyGroup = new THREE.Group();
  private starGroup = new THREE.Group();
  // P2-2: Chinese asterism layer (三垣二十八宿)
  private chiGroup = new THREE.Group();
  private chiPickables: THREE.Object3D[] = [];
  private dsoGroup = new THREE.Group();
  private CONG!: THREE.Group;
  private showGrp = { con: true, dso: true, chi: false };
  private fermiGroup?: THREE.Object3D;
  private armsGroup?: THREE.Object3D;
  private sphereGeo!: THREE.SphereGeometry;
  private dummy = new THREE.Object3D();
  private cosmosViews: THREE.Group[] = [];
  private cosmosViewsBuilt: boolean[] = []; // index i → L_i group has been built (lazy)
  private cosmosBuilders: ((() => THREE.Group) | null)[] = []; // index i → builder for L_i
  private cosmosLabelEls: LabelEntry[] = []; // DOM labels for the active cosmic view
  private cosmosPickables: THREE.Object3D[] = []; // pickable sprites in the active cosmic view
  private atmoHalos: { mesh: THREE.Sprite; body: string; tintColor: number }[] =
    [];
  private blueLight = true; // artistic blue styling toggle (off → neutral, no light override)
  private pointLight!: THREE.PointLight; // stored so the blue-light toggle can neutralize it
  private neutralGlowTex?: THREE.Texture; // cached gray glow used when blue-light is off
  private static readonly NEUTRAL = 0x9aa7bd; // neutral grey for recolored accents
  private static readonly NEUTRAL_RGB: [number, number, number] = [
    150, 160, 175,
  ];

  // State
  private simT = (Date.now() - EPOCH) / 86400000;
  private last = 0;
  private fpsT = 0;
  private fpsN = 0;
  private running = true;
  private rafId = 0;
  private handlers: {
    target: EventTarget;
    type: string;
    fn: (e: any) => void;
    opts?: boolean | AddEventListenerOptions;
  }[] = [];
  private EPS = 23.44;
  private site = { lat: 39.9, lon: 116.4 };
  private daysPerSec = 5;
  private dir = 1;
  private paused = false;
  private horizonMode = false;
  private scaleLevel = 0;
  private transit = 0; // 1.0 → 0.0 during a scale-level warp transition
  private transitFrom = 0; // level we are leaving
  private transitTimer = 0; // seconds remaining in the warp
  // Free-fly mode (immersive navigation)
  private flyMode = false;
  private flySpeed = 8; // speed multiplier (1×..200×), adjustable via wheel
  private keys: Record<string, boolean> = {};
  private flyVel = new THREE.Vector3(); // smoothed velocity for frame-rate-independent motion
  private flyPos = new THREE.Vector3(); // when fly mode engages, camera position is tracked here
  private flyYaw = 0;
  private flyPitch = 0; // yaw/pitch in radians (overrides cam.theta/phi)
  // Smooth "fly-to" tween when a body is clicked (cancels if user drags)
  private flyTo: {
    active: boolean;
    t: number;
    dur: number;
    fromTheta: number;
    toTheta: number;
    fromPhi: number;
    toPhi: number;
    fromDist: number;
    toDist: number;
  } = {
    active: false,
    t: 0,
    dur: 1.1,
    fromTheta: 0,
    toTheta: 0,
    fromPhi: 0,
    toPhi: 0,
    fromDist: 0,
    toDist: 0,
  };
  // Auto-tour: flies through a scripted sequence of waypoints across scale levels
  private tour: { active: boolean; idx: number; t: number } = {
    active: false,
    idx: 0,
    t: 0,
  };
  private tourWaypoints: {
    scaleLevel: number;
    bodyKey?: string;
    dist: number;
    dur: number;
    caption: string;
  }[] = [];
  private show = {
    orb: true,
    lab: true,
    belt: true,
    mw: true,
    dso: true,
    con: true,
    comet: true,
    met: true,
    zodi: true,
    shadow: true,
    fermi: false,
    arms: false,
    chi: false,
  };

  // Real-scale mode (honest proportions toggle)
  private realScale = false;
  private orbitLines: { line: THREE.LineLoop; b: any }[] = [];
  private sunGlow1?: THREE.Sprite;
  private sunGlow2?: THREE.Sprite;

  // Camera control
  private cam = {
    theta: 0.7,
    phi: 1.05,
    dist: 120,
    wantDist: 120,
    target: new THREE.Vector3(),
    want: new THREE.Vector3(),
    focus: null as THREE.Object3D | null,
  };
  private drag: any = null;

  // Picking / info
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private _pw = new THREE.Vector3(); // scratch: geocentric dir in horizon/world frame
  /** Pixel radius for the screen-space proximity fallback used to pick tiny/far
   *  cosmic bodies (galaxies, stars, DSOs) that are hard to hit with a precise ray. */
  private COSMIC_PICK_PX = 30;
  private currentKey: string | null = null;
  private distEl: HTMLElement | null = null;
  private altEl: HTMLElement | null = null;
  private onInfoChange?: (b: BodyInfo | null) => void;
  private onStateChange?: (s: Partial<EngineState>) => void;

  // scratch
  private _p = new THREE.Vector3();
  private _s = new THREE.Vector3();
  private _d = new THREE.Vector3();
  private _q = new THREE.Vector3();
  private _camUp = new THREE.Vector3();
  private _pVis = new THREE.Vector3();
  private _mw = new THREE.Vector3();
  private _ew = new THREE.Vector3();
  private _idir = new THREE.Vector3();
  private _uU = new THREE.Vector3();
  private _uN = new THREE.Vector3();
  private _uE = new THREE.Vector3();
  private _M4 = new THREE.Matrix4();
  private UP = new THREE.Vector3(0, 1, 0);
  private MOON_BASE = 0x9a958c;

  constructor(
    container: HTMLElement,
    labelHost: HTMLDivElement,
    opts?: {
      onInfoChange?: (b: BodyInfo | null) => void;
      onStateChange?: (s: Partial<EngineState>) => void;
    },
  ) {
    this.container = container;
    this.labelHost = labelHost;
    this.onInfoChange = opts?.onInfoChange;
    this.onStateChange = opts?.onStateChange;
  }

  /* ═════════ INIT ═════════ */
  init() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.BASE_DPR = Math.min(devicePixelRatio, 1.75);
    this.applyDpr();
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      52,
      innerWidth / innerHeight,
      0.1,
      20000,
    );
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    this.pointLight = new THREE.PointLight(0xfff1dd, 2.4, 0, 0);
    this.scene.add(this.pointLight);

    this.sphereGeo = new THREE.SphereGeometry(1, 48, 24);
    this.scene.add(this.sysGroup);
    this.sysGroup.add(this.eclFrame);
    this.scene.add(this.skyRoot);
    this.scene.add(this.horizonUI);
    this.scene.add(this.cosmosRoot);

    this.buildSolarSystem();
    this.buildSky();
    this.buildHorizon();
    this.buildComets();
    this.buildAsteroids();
    this.buildZodiAndShadow();
    this.buildMeteors();
    this.buildCosmosViews();
    this.applyBlueLight(); // ensure accents match the initial blueLight state
    this.applyEps();
    this.bindEvents();
    this.showInfo(SUN);

    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  private applyDpr() {
    this.renderer.setPixelRatio(this.BASE_DPR * this.dprScale);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  private applyEps() {
    const r = this.EPS * D2R;
    this.eclFrame.rotation.x = r;
    this.eclRingGrp.rotation.x = r;
    this.zodiGroup.rotation.x = r;
  }

  /* ═════════ SOLAR SYSTEM ═════════ */
  private planetRows(b: any): [string, string, string?][] {
    return [
      ["赤道半径", b.R.toLocaleString("zh-CN") + " km"],
      ["公转周期", fmtP(b.P)],
      ["自转周期", fmtP(Math.abs(b.rot)) + (b.rot < 0 ? "（逆行）" : "")],
      ["轨道半长径", b.a.toFixed(3) + " AU"],
      ["轨道偏心率", b.e.toFixed(4)],
      ["轨道倾角", b.i.toFixed(2) + "°"],
      ["天球可见性", b.eye || "—"],
      ["当前日心距", "—", "dist"],
    ];
  }

  /* ═════════ SCALE MODE (readable vs real-proportion) ═════════ */
  /** Distance mapper: linear + honest in real mode, compressed otherwise. */
  private sp(p: THREE.Vector3, out?: THREE.Vector3): THREE.Vector3 {
    return this.realScale ? scalePosReal(p, out) : scalePos(p, out);
  }
  /** Planet display radius (scene units). */
  private planetRDisp(b: any): number {
    if (this.realScale) return Math.max(0.02, REAL_BASE * (b.R / 6371));
    return 0.42 * Math.sqrt(b.R / 6371);
  }
  /** Moon display radius (scene units). */
  private moonRDisp(mo: any): number {
    if (this.realScale) return Math.max(0.02, REAL_BASE * (mo.R / 6371));
    return 0.42 * Math.sqrt(mo.R / 6371);
  }
  /** Sun display radius. Capped in real mode so Mercury's orbit stays clear of the disc. */
  private sunRDisp(): number {
    if (!this.realScale) return 2.4;
    return Math.min(0.3, REAL_BASE * (SUN.R / 6371));
  }

  private buildSolarSystem() {
    const sunR = this.sunRDisp();
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshBasicMaterial({ map: sunTex() }),
    );
    this.sunMesh.scale.setScalar(sunR);
    this.sunMesh.userData.body = { ...SUN, rDisp: sunR };
    this.eclFrame.add(this.sunMesh);
    this.pickables.push(this.sunMesh);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    glow.scale.setScalar(sunR * 9.17);
    this.eclFrame.add(glow);
    this.sunGlow1 = glow;
    const glow2 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow.material.map,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.4,
      }),
    );
    glow2.scale.setScalar(sunR * 20);
    this.eclFrame.add(glow2);
    this.sunGlow2 = glow2;

    this.eclFrame.add(this.orbitGroupRoot);

    for (const b of SYS) {
      const rDisp = this.planetRDisp(b);
      const og = new THREE.Group();
      const tg = new THREE.Group();
      tg.rotation.z = b.tilt * D2R;
      // Day/night terminator shader: lit hemisphere + twilight band + (Earth) night city lights
      const isEarth = b.n === "地球";
      const isGas =
        b.tex.type === "giant" ||
        b.tex.type === "ice" ||
        b.tex.type === "cloud";
      const mat = makePlanetMaterial(makeTex(b.tex), {
        night: isEarth ? earthNightTex() : undefined,
        nightBoost: isEarth ? 1.0 : 0,
        twilight: isGas
          ? [255, 180, 110]
          : isEarth
            ? [255, 120, 60]
            : [220, 110, 70],
        ambient: isGas ? 0.08 : 0.04,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      if (b.ellip) mesh.scale.set(rDisp * 1.6, rDisp * 0.8, rDisp * 0.8);
      else mesh.scale.setScalar(rDisp);
      mesh.userData.body = { ...b, rDisp, rows: this.planetRows(b) };
      mesh.userData.planetMat = mat; // keep ref to update uSunDir each frame
      let ndHalo: THREE.Sprite | undefined, ndAtmo: THREE.Mesh | undefined;
      let ndRing: THREE.Mesh | undefined,
        ndRingShadow: THREE.Mesh | undefined,
        ndRingThin = false;
      tg.add(mesh);
      og.add(tg);
      this.eclFrame.add(og);
      this.pickables.push(mesh);

      // Atmospheric glow halo — color chosen per body for realism
      const haloColor =
        b.n === "地球"
          ? 0x5fd3ff
          : b.n === "金星"
            ? 0xf5e6a0
            : b.n === "火星"
              ? 0xffa070
              : b.n === "木星"
                ? 0xf5c98a
                : b.n === "土星"
                  ? 0xf0d9a0
                  : b.n === "天王星"
                    ? 0x9adfe0
                    : b.n === "海王星"
                      ? 0x6f8fe0
                      : 0;
      if (haloColor) {
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex([
              (haloColor >> 16) & 255,
              (haloColor >> 8) & 255,
              haloColor & 255,
            ]),
            color: haloColor,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.55,
          }),
        );
        halo.scale.setScalar(rDisp * 2.4);
        halo.renderOrder = 2;
        tg.add(halo);
        ndHalo = halo;
        this.atmoHalos.push({ mesh: halo, body: b.n, tintColor: haloColor });
        // Earth's signature blue atmosphere glow — part of the "blue light" styling.
        if (haloColor === 0x5fd3ff) markBlue(halo.material, { glow: true });

        // Rayleigh-scattering rim: a slightly-larger BackSide sphere with a Fresnel shader.
        // Glows at the limb, brighter on the day side — the classic "atmosphere edge".
        const atmoRGB =
          b.n === "地球"
            ? ([95, 160, 255] as [number, number, number])
            : b.n === "金星"
              ? ([255, 220, 130] as [number, number, number])
              : b.n === "火星"
                ? ([255, 140, 90] as [number, number, number])
                : b.n === "木星"
                  ? ([230, 190, 130] as [number, number, number])
                  : b.n === "土星"
                    ? ([220, 200, 150] as [number, number, number])
                    : b.n === "天王星"
                      ? ([150, 220, 230] as [number, number, number])
                      : ([110, 140, 230] as [number, number, number]); // Neptune
        const atmoMat = makeAtmosphereMaterial(atmoRGB);
        // Earth's Rayleigh-scattering rim is blue; neutralize it with the blue-light toggle.
        if (b.n === "地球") markBlue(atmoMat, { uColor: true });
        const atmoMesh = new THREE.Mesh(this.sphereGeo, atmoMat);
        atmoMesh.scale.setScalar(rDisp * 1.06);
        atmoMesh.renderOrder = 3;
        tg.add(atmoMesh);
        ndAtmo = atmoMesh;
        mesh.userData.atmoMat = atmoMat; // update uSunDir each frame (same as planet mat)
      }

      // Rings for all giant/ice planets (enrichment: Uranus & Neptune now have faint rings)
      if (b.ring) {
        const isThin = b.n === "天王星" || b.n === "海王星";
        const ringMat = isThin
          ? new THREE.MeshBasicMaterial({
              map: thinRingTex(
                b.n === "天王星" ? [155, 220, 222] : [95, 127, 224],
                0.5,
              ),
              transparent: true,
              side: THREE.DoubleSide,
              depthWrite: false,
              opacity: 0.55,
            })
          : new THREE.MeshBasicMaterial({
              map: ringTex(),
              transparent: true,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
        const innerR = isThin ? rDisp * 1.55 : rDisp * 1.42;
        const outerR = isThin ? rDisp * 2.1 : rDisp * 2.35;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(innerR, outerR, 96),
          ringMat,
        );
        ring.rotation.x = -Math.PI / 2;
        if (b.n === "天王星") ring.rotation.y = Math.PI / 2.1; // tilted ring
        tg.add(ring);
        ndRing = ring;
        ndRingThin = isThin;

        // Saturn ring shadow on the planet — a slightly-larger invisible sphere
        // whose shader darkens a band where the ring occludes sunlight.
        if (b.n === "土星") {
          const rInner = innerR,
            rOuter = outerR;
          const shadowMat = new THREE.ShaderMaterial({
            uniforms: {
              uSunDir: { value: new THREE.Vector3(1, 0, 0) },
              uRingInner: { value: rInner / rDisp },
              uRingOuter: { value: rOuter / rDisp },
              uStrength: { value: 0.55 },
            },
            vertexShader: `varying vec3 vNormalW; varying vec3 vPosW;
              void main(){
                vNormalW = normalize(mat3(modelMatrix) * normal);
                vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }`,
            fragmentShader: `uniform vec3 uSunDir; uniform float uRingInner, uRingOuter, uStrength;
              varying vec3 vNormalW; varying vec3 vPosW;
              void main(){
                // distance from the planet centre to the ray (sun → surface point) measured in the ring plane
                // ring plane is the planet's equatorial plane (local y=0); world normal = planet up (we approximate with ring rotation)
                // Project the sun direction onto the ring plane and compute the shadow band.
                vec3 n = normalize(vNormalW);
                float lit = dot(n, normalize(uSunDir));
                // Only the lit hemisphere can receive a ring shadow
                if (lit <= 0.0) { gl_FragColor = vec4(0.0); return; }
                // shadow ray: from surface point toward sun. The ring plane passes through planet centre.
                // distance from centre to that ray ≈ |cross(posW, sunDir)| / 1 (in planet-local units, normalised by rDisp)
                vec3 toSun = normalize(uSunDir);
                vec3 cr = cross(vPosW, toSun);
                float dist = length(cr) / ${rDisp.toFixed(4)};
                float band = smoothstep(uRingInner, uRingInner + 0.04, dist)
                           * (1.0 - smoothstep(uRingOuter - 0.08, uRingOuter, dist));
                // Cassini gap: tiny bright slit inside the band
                float gap = exp(-pow((dist - (uRingInner + uRingOuter) * 0.5 * 0.78) * 18.0, 2.0)) * 0.4;
                float dark = band * uStrength * lit;
                dark *= (1.0 - gap);
                // Output dark semi-transparent overlay (NormalBlending darkens the planet below)
                gl_FragColor = vec4(0.02, 0.02, 0.03, dark);
              }`,
            transparent: true,
            depthWrite: false,
          });
          const shadowMesh = new THREE.Mesh(this.sphereGeo, shadowMat);
          shadowMesh.scale.setScalar(rDisp * 1.01);
          tg.add(shadowMesh);
          ndRingShadow = shadowMesh;
          mesh.userData.ringShadowMat = shadowMat; // update uSunDir each frame (same as planet mat)
        }
      }

      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 240; k++)
        pts.push(
          this.sp(posAU(b, (k / 240) * b.P, this._p), new THREE.Vector3()),
        );
      const orbitLine = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: b.c,
          transparent: true,
          opacity: 0.28,
        }),
      );
      this.orbitGroupRoot.add(orbitLine);
      this.orbitLines.push({ line: orbitLine, b });

      const el = document.createElement("div");
      el.className = "tag";
      el.innerHTML = `<b>${b.n[0]}</b>${b.n.slice(1)}`;
      this.labelHost.appendChild(el);
      this.labelEls.push({ el, obj: og, up: rDisp * 1.8 + 0.4, grp: "sys" });
      this.nodes[b.n] = {
        og,
        tg,
        mesh,
        body: b,
        rDisp,
        halo: ndHalo,
        atmo: ndAtmo,
        ring: ndRing,
        ringShadow: ndRingShadow,
        ringThin: ndRingThin,
      };
    }

    // Earth's Moon (handled specially because it orbits in og of earth)
    const earthNode = this.nodes["地球"];
    const moon = new THREE.Mesh(
      this.sphereGeo,
      new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 1 }),
    );
    moon.scale.setScalar(0.13);
    moon.userData.body = {
      n: "月球",
      en: "THE MOON (LUNA)",
      sym: "☽",
      key: "月球",
      kind: "moon",
      rDisp: 0.13,
      c: 0x9a958c,
      rows: [
        ["半径", "1,737 km"],
        ["绕地周期", "27.32 天"],
        ["平均距离", "384,400 km"],
        ["自转", "潮汐锁定"],
        ["当前日心距", "—", "dist"],
      ] as [string, string, string?][],
      note: "地球唯一的天然卫星，同步自转使其永远以同一面朝向地球；进入地影即发生月食。",
    };
    this.pickables.push(moon);
    earthNode.og.add(moon);
    earthNode.moon = moon;
    const moonLabel = document.createElement("div");
    moonLabel.className = "tag moon";
    moonLabel.innerHTML = `<b>·</b>月球`;
    this.labelHost.appendChild(moonLabel);
    this.labelEls.push({
      el: moonLabel,
      obj: moon,
      up: 0.5,
      min: 30,
      grp: "sys",
    });

    // Other moons
    for (const mo of MOONS) {
      const nd = this.nodes[mo.p];
      if (!nd) continue;
      // Mars moons orbit close; use a min distance
      mo.dist = nd.rDisp * 1.8 * Math.pow(mo.aKm / 421700, 0.62);
      if (mo.minDist) mo.dist = Math.max(mo.dist, nd.rDisp * mo.minDist);
      else mo.dist = Math.max(mo.dist, nd.rDisp * 1.5);
      const rDisp = this.moonRDisp(mo);
      const tilt = new THREE.Group();
      tilt.rotation.x = 3 * D2R;
      const mesh = new THREE.Mesh(
        this.sphereGeo,
        new THREE.MeshStandardMaterial({ color: mo.col, roughness: 1 }),
      );
      mesh.scale.setScalar(Math.max(0.02, rDisp));
      mesh.userData.body = {
        n: mo.full,
        en: mo.full.includes("·")
          ? mo.full.split("·")[1].trim().toUpperCase()
          : mo.n,
        key: mo.n,
        kind: "moon",
        rDisp,
        c: mo.col,
        rows: [
          ["半径", Math.round(mo.R).toLocaleString("zh-CN") + " km"],
          ["绕行周期", fmtP(mo.P)],
          ["轨道半径", mo.aKm.toLocaleString("zh-CN") + " km"],
          ["发现", mo.by || "—"],
          ["当前日心距", "—", "dist"],
        ] as [string, string, string?][],
        note: mo.note,
      };
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 10, 8),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      ball.userData.body = mesh.userData.body;
      tilt.add(mesh, ball);
      const ringPts: THREE.Vector3[] = [];
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        ringPts.push(
          new THREE.Vector3(Math.cos(a) * mo.dist, 0, Math.sin(a) * mo.dist),
        );
      }
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(ringPts),
        new THREE.LineBasicMaterial({
          color: mo.col,
          transparent: true,
          opacity: 0.16,
        }),
      );
      tilt.add(ring);
      this.subOrbits.push(ring);
      nd.og.add(tilt);
      this.pickables.push(ball);
      mo.tilt = tilt;
      mo.mesh = mesh;
      mo.nd = nd;
      mo.ring = ring;
      const el = document.createElement("div");
      el.className = "tag moon";
      el.innerHTML = `<b>·</b>${mo.n}`;
      this.labelHost.appendChild(el);
      this.labelEls.push({
        el,
        obj: mesh,
        up: rDisp * 2 + 0.12,
        min: 30,
        grp: "sys",
      });

      // P1-4: pulsing feature hotspot (Europa 冰下海洋 / Enceladus 羽流)
      if (mo.pulse) {
        const spr = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: softTex([255, 255, 255]),
            color: mo.pulse.c,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            opacity: 0.5,
          }),
        );
        const base = Math.max(0.35, rDisp * 2.4);
        spr.scale.setScalar(base);
        spr.userData.body = {
          n: mo.pulse.label,
          en: mo.full.includes("·")
            ? mo.full.split("·")[1].trim().toUpperCase()
            : mo.n,
          key: mo.n + "_pulse",
          kind: "moon",
          rDisp: rDisp,
          c: mo.pulse.c,
          rows: [
            ["所属卫星", mo.full],
            ["类型", "特征热点"],
            ["当前日心距", "—", "dist"],
          ] as [string, string, string?][],
          note: mo.pulse.note,
        };
        tilt.add(spr);
        this.pickables.push(spr);
        this.pulseSprites.push({ spr, base });
      }
    }

    // Asteroid belt + Kuiper belt
    this.beltAst = this.makeBelt(620, 2.15, 3.25, 12, 0.04, 0.11, 0x8a8074, 7);
    this.beltKbo = this.makeBelt(820, 33, 56, 30, 0.05, 0.11, 0x9fb0be, 23);
    this.eclFrame.add(this.beltAst, this.beltKbo);
  }

  /* ═════════ NAMED ASTEROIDS + TROJANS (P1-2) ═════════ */
  private asteroidRDisp(R: number): number {
    if (this.realScale) return Math.max(0.02, REAL_BASE * (R / 6371));
    return Math.max(0.06, 0.32 * Math.sqrt(R / 6371));
  }
  private buildAsteroids() {
    this.eclFrame.add(this.asteroidGroup);

    for (const a of ASTEROIDS) {
      const rDisp = this.asteroidRDisp(a.R);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 14, 10),
        new THREE.MeshStandardMaterial({ color: a.c, roughness: 1 }),
      );
      mesh.scale.setScalar(rDisp);
      const body = {
        n: a.n,
        en: a.en,
        key: a.key,
        kind: a.kind,
        rDisp,
        c: a.c,
        neo: a.neo,
        rows: [
          ["直径", Math.round(a.R).toLocaleString("zh-CN") + " km"],
          ["成分", a.comp],
          ["轨道半长径", a.a.toFixed(3) + " AU"],
          ["偏心率", a.e.toFixed(4)],
          ["倾角", a.i.toFixed(2) + "°"],
          ["公转周期", fmtP(a.P!)],
          ["当前日心距", "—", "dist"],
        ] as [string, string, string?][],
        note: a.note,
      };
      mesh.userData.body = body;
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 8),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      ball.scale.setScalar(Math.max(0.3, rDisp * 2.2));
      ball.userData.body = body;
      const g = new THREE.Group();
      g.add(mesh, ball);
      this.asteroidGroup.add(g);
      this.pickables.push(ball);
      this.asteroidNodes.push({ mesh: g, body });

      const el = document.createElement("div");
      el.className = "tag" + (a.neo ? " neo" : "");
      el.innerHTML = `<b>${a.neo ? "☄" : "✦"}</b>${a.n}`;
      this.labelHost.appendChild(el);
      this.labelEls.push({
        el,
        obj: g,
        up: rDisp * 2 + 0.1,
        min: 26,
        grp: "sys",
      });
    }

    // ── Jupiter Trojan swarms (L4 leading / L5 trailing) ──
    const N = 150;
    const rnd = (
      (s: number) => () =>
        (s = (s * 48271) % 2147483647) / 2147483647
    )(101);
    this.trojanData = [];
    for (let k = 0; k < N; k++) {
      this.trojanData.push({
        sign: 1,
        dl: (rnd() - 0.5) * 70, // libration spread (deg)
        fr: 0.97 + rnd() * 0.06, // radial spread around Jupiter
        inc: (rnd() - 0.5) * 16, // out-of-plane spread (deg)
      });
      this.trojanData.push({
        sign: -1,
        dl: (rnd() - 0.5) * 70,
        fr: 0.97 + rnd() * 0.06,
        inc: (rnd() - 0.5) * 16,
      });
    }
    const mkTrojan = (color: number) =>
      new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshBasicMaterial({ color }),
        this.trojanData.length,
      );
    this.trojanL4 = mkTrojan(0xffc46b);
    this.trojanL5 = mkTrojan(0x6fd0c0);
    this.trojanL4.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trojanL5.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eclFrame.add(this.trojanL4, this.trojanL5);

    this.trojanLabel.position.set(0, 0, 0);
    this.eclFrame.add(this.trojanLabel);
    const tl = document.createElement("div");
    tl.className = "tag";
    tl.innerHTML = `<b>⚑</b>木星特洛伊（L4 / L5 阵营）`;
    this.labelHost.appendChild(tl);
    this.labelEls.push({
      el: tl,
      obj: this.trojanLabel,
      up: 0.4,
      min: 60,
      grp: "sys",
    });
  }

  private makeBelt(
    N: number,
    aMin: number,
    aMax: number,
    iMax: number,
    sMin: number,
    sMax: number,
    color: number,
    seed: number,
  ): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color, roughness: 1 }),
      N,
    );
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const rnd = (
      (s: number) => () =>
        (s = (s * 48271) % 2147483647) / 2147483647
    )(seed);
    const list: any[] = [];
    for (let k = 0; k < N; k++) {
      const a = aMin + rnd() * (aMax - aMin);
      const o: any = {
        a,
        e: rnd() * 0.14,
        i: (rnd() - 0.5) * iMax,
        Om: rnd() * 360,
        w: rnd() * 360,
        M0: rnd() * 360,
        P: Math.pow(a, 1.5) * 365.25,
        s: sMin + rnd() * (sMax - sMin),
        rx: rnd() * 3,
        ry: rnd() * 3,
        rz: rnd() * 3,
      };
      o._m = rotMatrix(o);
      list.push(o);
    }
    m.userData.list = list;
    const arr = m.instanceMatrix.array;
    for (let k = 0; k < N; k++) {
      const o = list[k];
      this.dummy.position.set(0, 0, 0);
      this.dummy.rotation.set(o.rx, o.ry, o.rz);
      this.dummy.scale.setScalar(o.s);
      this.dummy.updateMatrix();
      this.dummy.matrix.toArray(arr, k * 16);
    }
    return m;
  }

  private updateBelt(m: THREE.InstancedMesh) {
    const list = m.userData.list,
      arr = m.instanceMatrix.array;
    for (let k = 0; k < list.length; k++) {
      const p = this.sp(posAU(list[k], this.simT, this._p), this._s);
      const o = k * 16;
      arr[o + 12] = p.x;
      arr[o + 13] = p.y;
      arr[o + 14] = p.z;
    }
    m.instanceMatrix.needsUpdate = true;
  }

  /* ═════════ NAMED ASTEROIDS + TROJANS (P1-2) update ═════════ */
  private updateAsteroids() {
    if (this.asteroidGroup.visible) {
      for (const an of this.asteroidNodes) {
        const au = posAU(an.body, this.simT, this._p);
        this.liveDist[an.body.key] = au.length().toFixed(3) + " AU";
        an.mesh.position.copy(this.sp(au, this._s));
      }
    }
    if (this.trojanL4.visible) {
      const jup = posAU(this.nodes["木星"].body, this.simT, this._p);
      this.sp(jup, this._s);
      const base = Math.atan2(this._s.z, this._s.x);
      const rJ = Math.hypot(this._s.x, this._s.z);
      const arr4 = this.trojanL4.instanceMatrix.array;
      const arr5 = this.trojanL5.instanceMatrix.array;
      for (let k = 0; k < this.trojanData.length; k++) {
        const t = this.trojanData[k];
        const ang = base + (t.sign * Math.PI) / 3 + t.dl * D2R;
        const r = rJ * t.fr;
        const x = r * Math.cos(ang);
        const z = r * Math.sin(ang);
        const y = r * Math.sin(t.inc * D2R);
        const o = k * 16;
        arr4[o + 12] = x;
        arr4[o + 13] = y;
        arr4[o + 14] = z;
        arr5[o + 12] = x;
        arr5[o + 13] = y;
        arr5[o + 14] = z;
      }
      this.trojanL4.instanceMatrix.needsUpdate = true;
      this.trojanL5.instanceMatrix.needsUpdate = true;
      // keep the label parked at the L4 centroid
      const angL = base + Math.PI / 3;
      this.trojanLabel.position.set(
        rJ * Math.cos(angL),
        rJ * Math.sin(8 * D2R),
        rJ * Math.sin(angL),
      );
      // scale instance matrices (fixed small size)
      if (!this.trojanL4.userData._inited) {
        const sz = this.realScale ? 0.05 : 0.06;
        const d = new THREE.Matrix4();
        for (let k = 0; k < this.trojanData.length; k++) {
          d.makeScale(sz, sz, sz);
          d.toArray(arr4, k * 16);
          d.toArray(arr5, k * 16);
        }
        this.trojanL4.userData._inited = true;
      }
    }

    // P1-4: animate pulse hotspots
    if (this.pulseSprites.length) {
      const ph = (this.simT * 0.06) % (Math.PI * 2);
      const s = 1 + 0.35 * Math.sin(ph);
      for (const p of this.pulseSprites) {
        p.spr.scale.setScalar(p.base * s);
        (p.spr.material as THREE.SpriteMaterial).opacity =
          0.35 + 0.35 * (0.5 + 0.5 * Math.sin(ph));
      }
    }
  }

  /* ═════════ SKY (real starfield) ═════════ */
  private buildSky() {
    // Align skyGroup to galactic plane-ish basis
    {
      const vX = unitDir(17.7606, -28.936);
      const vY = unitDir(12.856, 27.128);
      vX.addScaledVector(vY, -vX.dot(vY)).normalize();
      const vZ = new THREE.Vector3().crossVectors(vX, vY).normalize();
      this.skyGroup.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(vX, vY, vZ),
      );
    }
    this.skyRoot.add(this.skyGroup);

    // Milky Way band — real full-sky panorama (Stellarium / Mellinger composite, public-domain).
    // Under AdditiveBlending the black sky adds nothing, so only the real galactic band glows.
    // Falls back to the procedural milkyWayTex() if the asset fails to load.
    // Placed in skyRoot (equatorial frame) so the band aligns with the equatorial star field.
    const mwMat = new THREE.MeshBasicMaterial({
      map: milkyWayTex(),
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: 0.92,
    });
    const mw = new THREE.Mesh(new THREE.SphereGeometry(2400, 64, 32), mwMat);
    mw.renderOrder = -20;
    mw.frustumCulled = false;
    mw.name = "mw";
    new THREE.TextureLoader().load(
      "/cosmos/milkyway-pano.png",
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        mwMat.map = t;
        mwMat.needsUpdate = true;
      },
      undefined,
      () => {
        /* keep procedural fallback */
      },
    );
    this.skyRoot.add(mw);

    // Background star points
    {
      const N = 7200,
        pos = new Float32Array(N * 3),
        col = new Float32Array(N * 3);
      const pal = [
        [1, 1, 1],
        [0.78, 0.86, 1],
        [1, 0.92, 0.78],
        [1, 0.78, 0.62],
      ];
      for (let k = 0; k < N; k++) {
        const th = Math.random() * Math.PI * 2;
        const ph =
          Math.random() < 0.55
            ? Math.PI / 2 +
              (Math.random() + Math.random() + Math.random() - 1.5) * 0.38
            : Math.acos(Math.random() * 2 - 1);
        const r = 2500 + Math.random() * 700;
        pos[k * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[k * 3 + 1] = r * Math.cos(ph);
        pos[k * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        const c = pal[(Math.random() * pal.length) | 0],
          b = 0.35 + Math.random() * 0.65;
        col[k * 3] = c[0] * b;
        col[k * 3 + 1] = c[1] * b;
        col[k * 3 + 2] = c[2] * b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      this.skyGroup.add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          }),
        ),
      );
    }

    // Named bright stars
    const flare = flareTex();
    this.skyRoot.add(this.starGroup);
    for (const [, ra, dec, mag, sp] of STARS) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: flare,
          color: SPCOL[sp],
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      s.position.copy(unitDir(ra, dec)).multiplyScalar(2450);
      s.scale.setScalar(Math.max(9, 62 * Math.pow(1.6, -mag)));
      s.renderOrder = -15;
      this.starGroup.add(s);
    }

    // Deep sky objects
    this.skyRoot.add(this.dsoGroup);
    DEEP.forEach((d, idx) => {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: nebulaTex(d.kind, d.c1, d.c2),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.92,
          rotation: d.kind === "galaxy" ? 0.7 : (idx % 5) * 0.4,
        }),
      );
      sp.position
        .copy(unitDir(d.ra, d.dec))
        .multiplyScalar(1950 + (idx % 5) * 80);
      sp.scale.setScalar(1950 * d.size * D2R * 1.35);
      sp.renderOrder = -10;
      sp.userData.body = {
        n: d.n,
        en: d.id,
        key: d.id,
        kind: "deep",
        isDeep: true,
        c: (d.c1[0] << 16) | (d.c1[1] << 8) | d.c1[2],
        rows: [
          ["类型", d.type],
          ["距离", d.dist],
          ["视星等", d.mag],
          ["视直径", ((d.size * 60) | 0) + "′"],
          ["坐标 J2000", fmtRA(d.ra) + "  " + fmtDec(d.dec)],
        ] as [string, string, string?][],
        note: d.note,
      };
      this.dsoGroup.add(sp);
      this.pickables.push(sp);
      const el = document.createElement("div");
      el.className = "tag deep";
      el.innerHTML = `<b>✦</b>${d.n}`;
      this.labelHost.appendChild(el);
      this.labelEls.push({ el, obj: sp, up: 0, min: 40, grp: "dso" });
    });

    // Constellation lines + labels
    {
      const gp: number[] = [],
        gc: number[] = [],
        seg: THREE.Vector3[] = [],
        R = 2580;
      for (const c of CONS) {
        const base = gp.length / 3;
        for (const s of c.stars) {
          const v = unitDir(s[0], s[1]).multiplyScalar(R);
          gp.push(v.x, v.y, v.z);
          const b = Math.max(0.3, 1.05 - s[2] * 0.18);
          gc.push(b, b * 0.98, b * 0.92);
        }
        for (const [x, y] of c.lines) {
          seg.push(
            new THREE.Vector3(
              gp[(base + x) * 3],
              gp[(base + x) * 3 + 1],
              gp[(base + x) * 3 + 2],
            ),
            new THREE.Vector3(
              gp[(base + y) * 3],
              gp[(base + y) * 3 + 1],
              gp[(base + y) * 3 + 2],
            ),
          );
        }
        const anchor = new THREE.Object3D();
        anchor.position.copy(new THREE.Vector3().set(0, 0, 0));
        // centroid anchor
        let cx = 0,
          cy = 0,
          cz = 0;
        for (let i = 0; i < c.stars.length; i++) {
          const v = unitDir(c.stars[i][0], c.stars[i][1]);
          cx += v.x;
          cy += v.y;
          cz += v.z;
        }
        const len = c.stars.length;
        anchor.position
          .set(cx / len, cy / len, cz / len)
          .normalize()
          .multiplyScalar(2720);
        this.scene.add(anchor);
        const el = document.createElement("div");
        el.className = "tag con";
        el.textContent = c.name;
        this.labelHost.appendChild(el);
        this.labelEls.push({ el, obj: anchor, up: 0, min: 34, grp: "con" });
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(gp), 3),
      );
      pg.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(gc), 3),
      );
      const conGroup = new THREE.Group();
      conGroup.add(
        new THREE.Points(
          pg,
          new THREE.PointsMaterial({
            size: 2.2,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
          }),
        ),
      );
      const conMat = new THREE.LineBasicMaterial({
        color: 0x41628f,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
      });
      markBlue(conMat);
      conGroup.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(seg),
          conMat,
        ),
      );
      conGroup.renderOrder = -8;
      this.skyRoot.add(conGroup);
      this.CONG = conGroup;
    }

    // P2-2: Chinese asterism layer (三垣二十八宿) — cultural sky map that
    // overlays the Western constellations; same star positions, different lens.
    {
      const R = 2580;
      const gp: number[] = [];
      const seg: THREE.Vector3[] = [];
      const CHI_COL = 0xffcf6b;
      for (const a of CHI_ASTERISMS) {
        const base = gp.length / 3;
        for (const s of a.stars) {
          const v = unitDir(s[0], s[1]).multiplyScalar(R);
          gp.push(v.x, v.y, v.z);
        }
        if (a.lines) {
          for (const [x, y] of a.lines) {
            seg.push(
              new THREE.Vector3(
                gp[(base + x) * 3],
                gp[(base + x) * 3 + 1],
                gp[(base + x) * 3 + 2],
              ),
              new THREE.Vector3(
                gp[(base + y) * 3],
                gp[(base + y) * 3 + 1],
                gp[(base + y) * 3 + 2],
              ),
            );
          }
        }
        // centroid anchor (normalized → far shell) for label + pickable
        let cx = 0,
          cy = 0,
          cz = 0;
        for (const s of a.stars) {
          const v = unitDir(s[0], s[1]);
          cx += v.x;
          cy += v.y;
          cz += v.z;
        }
        const n = a.stars.length;
        const anchor = new THREE.Object3D();
        anchor.position
          .set(cx / n, cy / n, cz / n)
          .normalize()
          .multiplyScalar(2720);
        this.scene.add(anchor);
        const el = document.createElement("div");
        el.className = "tag chi";
        el.textContent = a.n;
        this.labelHost.appendChild(el);
        this.labelEls.push({ el, obj: anchor, up: 0, min: 50, grp: "chi" });

        const pick = new THREE.Mesh(
          new THREE.SphereGeometry(0.9, 8, 6),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        pick.position.copy(anchor.position);
        pick.userData.body = {
          n: a.n,
          en: a.en,
          key: "chi:" + a.n,
          kind: "chi",
          c: CHI_COL,
          rows: [
            ["类别", a.kind],
            ["归属", a.group || "—"],
            ["成员星", String(a.stars.length) + " 颗"],
            [
              "距星坐标 J2000",
              fmtRA(a.stars[0][0]) + "  " + fmtDec(a.stars[0][1]),
            ],
          ] as [string, string, string?][],
          note: a.note || "",
        };
        pick.userData.chiPick = true;
        this.chiGroup.add(pick);
        this.chiPickables.push(pick);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(gp), 3),
      );
      const chiPts = new THREE.Points(
        pg,
        new THREE.PointsMaterial({
          color: CHI_COL,
          size: 3.2,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        }),
      );
      const chiLineMat = new THREE.LineBasicMaterial({
        color: CHI_COL,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      });
      const chiLines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(seg),
        chiLineMat,
      );
      this.chiGroup.add(chiPts, chiLines);
      this.chiGroup.renderOrder = -7;
      this.chiGroup.visible = this.show.chi;
      this.skyRoot.add(this.chiGroup);
    }

    // Celestial equator + ecliptic rings
    const circleLine = (
      r: number,
      y: number,
      plane: string,
      color: number,
      op: number,
      segs = 144,
    ) => {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        const c = Math.cos(a) * r,
          s = Math.sin(a) * r;
        pts.push(
          plane === "xy"
            ? new THREE.Vector3(c, s, 0)
            : plane === "yz"
              ? new THREE.Vector3(0, s, c)
              : new THREE.Vector3(c, y, s),
        );
      }
      return new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: op,
          depthTest: false,
        }),
      );
    };
    {
      const R = 2500;
      const eqRing = circleLine(R, 0, "xz", 0x8fa8c8, 0.3);
      markBlue(eqRing.material as THREE.LineBasicMaterial);
      this.skyRoot.add(eqRing);
      this.eclRingGrp = new THREE.Group();
      this.skyRoot.add(this.eclRingGrp);
      this.eclRingGrp.add(circleLine(R, 0, "xz", 0xf5a623, 0.38));
      for (const [grp, pos, txt] of [
        [this.skyRoot, new THREE.Vector3(R * 0.87, 0, R * 0.5), "天赤道"],
        [this.eclRingGrp, new THREE.Vector3(-R * 0.87, 0, R * 0.5), "黄道"],
      ] as const) {
        const a = new THREE.Object3D();
        a.position.copy(pos);
        (grp as THREE.Group).add(a);
        const el = document.createElement("div");
        el.className = "tag con";
        el.textContent = txt;
        this.labelHost.appendChild(el);
        this.labelEls.push({ el, obj: a, up: 0, grp: "ring" });
      }
    }

    // Sky marks (planets projected onto celestial sphere for planetarium mode)
    const addSkyMark = (
      size: number,
      body: any,
      srcObj: THREE.Object3D,
      isSun: boolean,
      isMoon: boolean,
    ) => {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: softTex([
            (body.c >> 16) & 255,
            (body.c >> 8) & 255,
            body.c & 255,
          ]),
          color: body.c,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      sp.scale.setScalar(size);
      sp.renderOrder = -6;
      const bd = { ...body, isSky: true, kind: "sky" };
      sp.userData.body = bd;
      this.skyMarks.add(sp);
      this.pickables.push(sp);
      this.marks.push({ sp, body: bd, srcObj, isSun, isMoon });
      const el = document.createElement("div");
      el.className = "tag sky";
      el.innerHTML = `<b>${body.sym || "·"}</b>${body.n}`;
      this.labelHost.appendChild(el);
      this.labelEls.push({ el, obj: sp, up: size * 0.55, grp: "sky" });
    };
    addSkyMark(120, SUN, this.sunMesh, true, false);
    addSkyMark(
      84,
      this.nodes["地球"].moon.userData.body,
      this.nodes["地球"].moon,
      false,
      true,
    );
    for (const b of BODIES)
      if (b.n !== "地球") addSkyMark(44, b, this.nodes[b.n].og, false, false);
  }

  /* ═════════ HORIZON (planetarium) ═════════ */
  private buildHorizon() {
    const HZ = 2400;
    const circleLine = (
      r: number,
      y: number,
      plane: string,
      color: number,
      op: number,
      segs = 144,
    ) => {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        const c = Math.cos(a) * r,
          s = Math.sin(a) * r;
        pts.push(
          plane === "xy"
            ? new THREE.Vector3(c, s, 0)
            : plane === "yz"
              ? new THREE.Vector3(0, s, c)
              : new THREE.Vector3(c, y, s),
        );
      }
      return new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: op,
          depthTest: false,
        }),
      );
    };
    const hzRing0 = circleLine(HZ, 0, "xz", 0x5fd3ff, 0.5);
    markBlue(hzRing0.material as THREE.LineBasicMaterial);
    this.horizonUI.add(hzRing0);
    const hzRing30 = circleLine(
      HZ * Math.cos(30 * D2R),
      HZ * Math.sin(30 * D2R),
      "xz",
      0x3f6f9f,
      0.2,
    );
    markBlue(hzRing30.material as THREE.LineBasicMaterial);
    this.horizonUI.add(hzRing30);
    const hzRing60 = circleLine(
      HZ * Math.cos(60 * D2R),
      HZ * Math.sin(60 * D2R),
      "xz",
      0x3f6f9f,
      0.2,
    );
    markBlue(hzRing60.material as THREE.LineBasicMaterial);
    this.horizonUI.add(hzRing60);
    const hzRingXY = circleLine(HZ, 0, "xy", 0x3f6f9f, 0.28);
    markBlue(hzRingXY.material as THREE.LineBasicMaterial);
    this.horizonUI.add(hzRingXY);
    const hzRingYZ = circleLine(HZ, 0, "yz", 0x3f6f9f, 0.28);
    markBlue(hzRingYZ.material as THREE.LineBasicMaterial);
    this.horizonUI.add(hzRingYZ);
    for (const [pos, txt] of [
      [[HZ, 0, 0], "北 N"],
      [[-HZ, 0, 0], "南 S"],
      [[0, 0, HZ], "东 E"],
      [[0, 0, -HZ], "西 W"],
      [[0, HZ, 0], "天顶 Z"],
    ] as const) {
      const a = new THREE.Object3D();
      a.position.set(pos[0], pos[1], pos[2]);
      this.horizonUI.add(a);
      const el = document.createElement("div");
      el.className = "tag card";
      el.textContent = txt;
      this.labelHost.appendChild(el);
      this.labelEls.push({ el, obj: a, up: 0, grp: "hzd" });
    }
    this.horizonUI.visible = false;
    this.skyMarks.visible = false;
    this.skyRoot.add(this.skyMarks);
  }

  /** Rotate an ecliptic-frame direction (x=γ, y=ecl-Y, z=ecl-north) into the
   *  equatorial star-frame used by skyRoot/unitDir, by the obliquity ε. */
  private eclToEq(v: THREE.Vector3): THREE.Vector3 {
    const e = this.EPS * D2R;
    const se = Math.sin(e),
      ce = Math.cos(e);
    const x = v.x;
    const y = ce * v.y - se * v.z;
    const z = ce * v.z + se * v.y;
    return v.set(x, y, z);
  }

  private updateHorizonFrame(): number {
    const lstH =
      ((280.46061837 + 360.98564736629 * this.simT + this.site.lon) / 15 + 24) %
      24;
    this._uU.copy(unitDir(lstH, this.site.lat));
    this._uN.set(0, 1, 0).addScaledVector(this._uU, -this._uU.y).normalize();
    this._uE.crossVectors(this._uN, this._uU);
    this._M4.makeBasis(this._uN, this._uU, this._uE).transpose();
    this.skyRoot.quaternion.setFromRotationMatrix(this._M4);
    return lstH;
  }

  /* ═════════ COMETS ═════════ */
  private buildComets() {
    const comaTex = softTex([215, 255, 225]);
    const dustTex = softTex([255, 232, 195]);
    const ionTex = softTex([165, 205, 255]);
    this.eclFrame.add(this.cometGroup);
    for (const c of COMETS) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 10, 8),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      ball.userData.body = {
        n: c.n,
        en: c.en,
        key: c.key,
        kind: "comet",
        rDisp: 0.3,
        c: c.c,
        rows: [
          ["彗核直径", c.core],
          ["公转周期", fmtP(c.P!)],
          ["轨道半长径", c.a.toFixed(2) + " AU"],
          ["轨道偏心率", c.e.toFixed(4)],
          ["轨道倾角", c.i.toFixed(1) + "°"],
          ["当前日心距", "—", "dist"],
        ] as [string, string, string?][],
        note: c.note,
      };
      g.add(core, ball);
      this.pickables.push(ball);
      const mk = (tex: THREE.Texture, n: number) => {
        const arr: THREE.Sprite[] = [];
        for (let k = 0; k < n; k++) {
          const s = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: tex,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              transparent: true,
              opacity: 0,
            }),
          );
          s.frustumCulled = false;
          g.add(s);
          arr.push(s);
        }
        return arr;
      };
      this.cometGroup.add(g);
      const el = document.createElement("div");
      el.className = "tag";
      el.innerHTML = `<b>彗</b>${c.n}`;
      this.labelHost.appendChild(el);
      this.labelEls.push({ el, obj: g, up: 1.2, grp: "sys" });
      this.comets.push({
        c,
        g,
        core,
        coma: mk(comaTex, 1),
        dust: mk(dustTex, 12),
        ion: mk(ionTex, 10),
      });
    }
  }

  /* ═════════ ZODI / SHADOW ═════════ */
  private buildZodiAndShadow() {
    this.sysGroup.add(this.zodiGroup);
    const zt = zodiTex();
    for (const [s, op] of [
      [560, 0.34],
      [1000, 0.13],
    ] as const) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: zt,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          opacity: op,
        }),
      );
      p.rotation.x = -Math.PI / 2;
      p.scale.set(s, s, 1);
      p.renderOrder = -5;
      this.zodiGroup.add(p);
    }
    this.geg = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex([235, 235, 255]),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.06,
      }),
    );
    this.geg.scale.setScalar(300);
    markBlue(this.geg.material, { glow: true });
    this.sysGroup.add(this.geg);

    // Earth shadow cones
    const UMBRA_LEN = 5.0,
      UMBRA_R0 = 0.42,
      UMBRA_R1 = 0.03,
      PENUMBRA_LEN = 7.5,
      PENUMBRA_R1 = 1.7;
    const shadowMat = (
      r0: number,
      r1: number,
      len: number,
      color: number,
      a: number,
    ) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uR0: { value: r0 },
          uR1: { value: r1 },
          uLen: { value: len },
          uC: { value: new THREE.Color(color) },
          uA: { value: a },
        },
        vertexShader: `varying vec3 vP;
          void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uR0, uR1, uLen, uA; uniform vec3 uC; varying vec3 vP;
          void main(){
            float t = clamp(vP.y / uLen, 0.0, 1.0);
            float rad = mix(uR0, uR1, t);
            float rr = length(vP.xz) / max(rad, 1e-4);
            float a = (1.0 - smoothstep(0.45, 1.0, rr)) * (1.0 - smoothstep(0.5, 1.0, t)) * uA;
            gl_FragColor = vec4(uC, a);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    const cone = (
      r0: number,
      r1: number,
      len: number,
      color: number,
      a: number,
    ) => {
      const g = new THREE.CylinderGeometry(r1, r0, len, 28, 12, true);
      g.translate(0, len / 2, 0);
      const m = new THREE.Mesh(g, shadowMat(r0, r1, len, color, a));
      m.renderOrder = 5;
      return m;
    };
    this.shadowGrp.add(cone(UMBRA_R0, UMBRA_R1, UMBRA_LEN, 0x170f1c, 0.85));
    this.shadowGrp.add(cone(0.5, PENUMBRA_R1, PENUMBRA_LEN, 0x241d2e, 0.3));
    this.sysGroup.add(this.shadowGrp);
    (this as any)._UMBRA = {
      LEN: UMBRA_LEN,
      R0: UMBRA_R0,
      R1: UMBRA_R1,
      PLEN: PENUMBRA_LEN,
      PR1: PENUMBRA_R1,
    };

    // P1-1: Moon shadow cones for solar-eclipse visualization (mirror of Earth's shadow).
    // Umbra length ~1.6 so it reaches Earth (Moon orbits at ~1.4 scene units); small radii so the
    // footprint on Earth is a compact spot. Penumbra wider for the partial-eclipse zone.
    const M_U_LEN = 1.6,
      M_U_R0 = 0.06,
      M_U_R1 = 0.005,
      M_P_LEN = 2.2,
      M_P_R1 = 0.26;
    this.moonShadowGrp.add(cone(M_U_R0, M_U_R1, M_U_LEN, 0x0a0612, 0.85));
    this.moonShadowGrp.add(cone(0.18, M_P_R1, M_P_LEN, 0x181226, 0.28));
    this.sysGroup.add(this.moonShadowGrp);
    (this as any)._MUMBRA = {
      LEN: M_U_LEN,
      R0: M_U_R0,
      R1: M_U_R1,
      PLEN: M_P_LEN,
      PR1: M_P_R1,
    };

    // Solar-eclipse footprint: a dark disk placed on Earth's surface at the sub-shadow point.
    const footGeo = new THREE.CircleGeometry(0.05, 32);
    footGeo.rotateX(-Math.PI / 2); // face +Y by default; re-oriented each frame
    this.eclipseFoot = new THREE.Mesh(
      footGeo,
      new THREE.MeshBasicMaterial({
        color: 0x05030a,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.eclipseFoot.visible = false;
    this.eclipseFoot.renderOrder = 6;
    this.sysGroup.add(this.eclipseFoot);
  }

  /* ═════════ METEORS ═════════ */
  private buildMeteors() {
    this.skyRoot.add(this.meteorGroup);
    for (let k = 0; k < 4; k++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(6), 3),
      );
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: 0xdff0ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      line.frustumCulled = false;
      this.meteorGroup.add(line);
      this.meteors.push({
        line,
        t: 1e9,
        dur: 1,
        p: new THREE.Vector3(),
        d: new THREE.Vector3(),
        speed: 0,
        len: 0,
      });
    }
  }
  private spawnMeteor(m: any) {
    const th = Math.random() * Math.PI * 2,
      ph = Math.acos(Math.random() * 2 - 1);
    m.p
      .set(
        Math.sin(ph) * Math.cos(th),
        Math.cos(ph),
        Math.sin(ph) * Math.sin(th),
      )
      .multiplyScalar(1450);
    m.d
      .set(
        Math.random() - 0.5,
        -(0.25 + Math.random() * 0.75),
        Math.random() - 0.5,
      )
      .normalize();
    m.t = 0;
    m.dur = 0.55 + Math.random() * 0.55;
    m.speed = 1500 + Math.random() * 1400;
    m.len = 70 + Math.random() * 110;
  }

  /* ═════════ COSMIC VIEWS ═════════ */
  private buildCosmosViews() {
    // Lazy construction: allocate empty placeholder groups only. Each level's heavy
    // content (galaxy photos run through a luminance→alpha cutout, the 2 MB survey
    // cloud fetch, etc.) is built on first warp into that scale level and then cached.
    // This keeps startup to the solar-system + sky (~3 images) instead of eagerly
    // loading all 40 photos + the survey JSON across every level at once.
    this.cosmosViews = [
      new THREE.Group(), // level 0 placeholder (solar system handled by sysGroup)
      new THREE.Group(),
      new THREE.Group(),
      new THREE.Group(),
      new THREE.Group(),
      new THREE.Group(),
      new THREE.Group(),
    ];
    this.cosmosViewsBuilt = this.cosmosViews.map(() => false);
    this.cosmosViewsBuilt[0] = true; // placeholder, never rebuilt
    this.cosmosBuilders = [
      null,
      buildSolarNeighborhood,
      buildMilkyWayGalaxy,
      buildLocalGroup,
      buildNearbyUniverse,
      buildSuperclusters,
      buildObservableUniverse,
    ];
    for (let i = 1; i < this.cosmosViews.length; i++) {
      this.cosmosViews[i].visible = false;
      this.cosmosRoot.add(this.cosmosViews[i]);
    }
  }

  /** Build a cosmic-view level on first need and cache it. Idempotent. */
  private ensureCosmosView(level: number) {
    if (level < 1 || level >= this.cosmosViews.length) return;
    if (this.cosmosViewsBuilt[level]) return;
    const build = this.cosmosBuilders[level];
    if (!build) return;
    const real = build();
    const old = this.cosmosViews[level];
    if (old.parent) old.parent.remove(old);
    this.cosmosRoot.add(real);
    this.cosmosViews[level] = real;
    this.cosmosViewsBuilt[level] = true;
    if (level === 2) {
      this.fermiGroup = real.getObjectByName("fermi");
      if (this.fermiGroup) this.fermiGroup.visible = this.show.fermi;
      this.armsGroup = real.getObjectByName("arms");
      if (this.armsGroup) this.armsGroup.visible = this.show.arms;
    }
    this.applyBlueLight(); // recolor the freshly-built view to the current blueLight state
  }

  /** Build (or rebuild) DOM labels + pickables for the active cosmic view. */
  private activateCosmosLabels(level: number) {
    // Clear previous cosmos labels (DOM + from the shared labelEls list)
    for (const L of this.cosmosLabelEls) {
      L.el.remove();
    }
    this.labelEls = this.labelEls.filter((L) => L.grp !== "cosmos");
    this.cosmosLabelEls = [];
    for (const p of this.cosmosPickables) {
      const i = this.pickables.indexOf(p);
      if (i >= 0) this.pickables.splice(i, 1);
    }
    this.cosmosPickables = [];

    if (level < 1 || level >= this.cosmosViews.length) return;
    const grp = this.cosmosViews[level];
    const specs: LabelSpec[] = grp.userData.labelSpecs || [];
    for (const sp of specs) {
      const el = document.createElement("div");
      el.className = sp.kind === "cosmos-dim" ? "tag con" : "tag deep";
      el.innerHTML = sp.kind === "cosmos-dim" ? sp.n : `<b>✦</b>${sp.n}`;
      // Clicking a cosmic label opens its dossier directly — robust alternative to the
      // canvas raycast (thin cosmic structures sit inside the bulge's screen footprint
      // and are easy to miss with a precise pick; the label is always on-screen).
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showInfo({
          n: sp.n,
          en: sp.en,
          key: "cosmo_" + sp.n,
          kind: sp.kind,
          c: sp.c,
          rows: sp.rows || [],
          note: sp.note,
          isCosmos: true,
        } as unknown as BodyData);
      });
      this.labelHost.appendChild(el);
      const entry: LabelEntry = { el, obj: sp.obj, up: sp.up, grp: "cosmos" };
      this.labelEls.push(entry);
      this.cosmosLabelEls.push(entry);
    }
    // Register pickable sprites (those carrying userData.body.isCosmos)
    grp.traverse((o) => {
      const b = o.userData?.body as BodyData | undefined;
      if (b && b.isCosmos) {
        this.pickables.push(o);
        this.cosmosPickables.push(o);
      }
    });
    // Quasar cloud: a single THREE.Points carrying per-vertex bodies for picking.
    const qc = grp.userData.quasarCloud as THREE.Points | undefined;
    if (qc) {
      this.pickables.push(qc);
      this.cosmosPickables.push(qc);
    }
  }

  /* ═════════ EVENTS ═════════ */
  /** Register a listener and track it so dispose() can remove it. */
  private on(
    target: EventTarget,
    type: string,
    fn: (e: any) => void,
    opts?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(type, fn as EventListener, opts);
    this.handlers.push({ target, type, fn, opts });
  }

  private bindEvents() {
    const dom = this.renderer.domElement;
    this.on(dom, "pointerdown", (e) => {
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        t: Date.now(),
        pan: (e.shiftKey || e.button === 2) && !this.horizonMode,
      };
      dom.setPointerCapture(e.pointerId);
    });
    this.on(dom, "pointermove", (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x,
        dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      // Any drag cancels a cinematic fly-to AND the auto-tour (user takes control)
      if (this.flyTo.active) this.flyTo.active = false;
      if (this.tour.active) {
        this.tour.active = false;
        this.onTourCaption?.("");
      }
      if (this.flyMode) {
        // In fly mode, drag = look around (mouselook)
        this.flyYaw -= dx * 0.0035;
        this.flyPitch = Math.max(
          -1.5,
          Math.min(1.5, this.flyPitch - dy * 0.0035),
        );
      } else if (this.drag.pan) {
        this.cam.focus = null;
        const s = this.cam.dist * 0.0016;
        this.cam.want
          .addScaledVector(
            new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0),
            -dx * s,
          )
          .addScaledVector(
            new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1),
            dy * s,
          );
      } else {
        this.cam.theta -= dx * 0.0052;
        this.cam.phi = Math.max(
          0.08,
          Math.min(Math.PI - 0.08, this.cam.phi - dy * 0.0052),
        );
      }
    });
    this.on(dom, "pointerup", (e) => {
      if (
        this.drag &&
        Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) < 5 &&
        Date.now() - this.drag.t < 350
      )
        this.pick(e);
      this.drag = null;
    });
    this.on(dom, "contextmenu", (e) => e.preventDefault());
    this.on(
      dom,
      "wheel",
      (e) => {
        e.preventDefault();
        if (this.flyMode) {
          // In fly mode, wheel = speed multiplier (1× .. 200×)
          const cur = this.flySpeed;
          this.flySpeed = Math.max(
            1,
            Math.min(200, cur * Math.pow(1.0018, e.deltaY)),
          );
        } else {
          this.cam.wantDist = Math.max(
            0.8,
            Math.min(12000, this.cam.wantDist * Math.pow(1.0016, e.deltaY)),
          );
        }
      },
      { passive: false },
    );

    // WebGL context loss/restore: keep the app alive across GPU resets (driver crash,
    // backgrounded tabs, mobile). preventDefault on `lost` is required for `restored`
    // to fire; Three.js re-uploads scene resources lazily, so resuming the loop suffices.
    this.on(dom, "webglcontextlost", (e) => {
      e.preventDefault();
      this.running = false;
    });
    this.on(dom, "webglcontextrestored", () => {
      this.last = performance.now();
      this.running = true;
      this.rafId = requestAnimationFrame(this.frame);
    });

    this.on(document, "visibilitychange", () => {
      this.running = !document.hidden;
      if (this.running) {
        this.last = performance.now();
        this.rafId = requestAnimationFrame(this.frame);
      }
    });
    this.on(window, "resize", () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // Free-fly keyboard controls (active only when flyMode is on)
    this.on(window, "keydown", (e) => {
      if (!this.flyMode) return;
      const k = e.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "q",
          "e",
          " ",
          "shift",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ].includes(k)
      ) {
        e.preventDefault();
        this.keys[k] = true;
      }
    });
    this.on(window, "keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
    // In fly mode, pointer drag turns the camera (yaw/pitch) instead of orbiting
  }

  private aimAt(v: THREE.Vector3) {
    const d = this._p.copy(v).normalize().negate();
    this.cam.theta = Math.atan2(d.x, d.z);
    this.cam.phi = Math.max(
      0.08,
      Math.min(Math.PI - 0.08, Math.acos(THREE.MathUtils.clamp(d.y, -1, 1))),
    );
  }

  /** Launch a smooth cinematic fly-to: tween theta/phi/dist to target values over ~1.1s.
   *  Picking the shortest angular path.  Cancels if the user starts dragging. */
  private startFlyTo(toTheta: number, toPhi: number, toDist: number) {
    // shortest angular path for theta
    let dt = toTheta - this.cam.theta;
    while (dt > Math.PI) dt -= Math.PI * 2;
    while (dt < -Math.PI) dt += Math.PI * 2;
    this.flyTo = {
      active: true,
      t: 0,
      dur: 1.1,
      fromTheta: this.cam.theta,
      toTheta: this.cam.theta + dt,
      fromPhi: this.cam.phi,
      toPhi: toPhi,
      fromDist: this.cam.dist,
      toDist: toDist,
    };
  }
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /** Walk the parent chain to decide if an object is actually being rendered. */
  private effectivelyVisible(o: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = o;
    while (cur) {
      if (!cur.visible) return false;
      cur = cur.parent;
    }
    return true;
  }

  /* ═════════ PICK / INFO ═════════ */
  private pick(e: PointerEvent | MouseEvent) {
    this.ndc.set(
      (e.clientX / innerWidth) * 2 - 1,
      -(e.clientY / innerHeight) * 2 + 1,
    );
    this.ray.setFromCamera(this.ndc, this.camera);
    // Quasar cloud is a single THREE.Points in pickables; give its raycast a world-space
    // hit radius so clicks land on the merged point cloud (screen fallback covers near-misses).
    this.ray.params.Points.threshold = 2.5;
    const hits = this.ray.intersectObjects(this.pickables, false);
    // Pick the first hit whose object (and ancestors) is actually visible on screen.
    // This prevents clicking invisible solar-system bodies while in a cosmic-scale view.
    let hit: THREE.Intersection | null = null;
    let focusedHit: THREE.Intersection | null = null;
    for (const h of hits) {
      if (!this.effectivelyVisible(h.object)) continue;
      // If the nearest hit is the body we're already focused on, remember it but keep
      // looking for a different body behind it. Otherwise the focused body's invisible
      // pick-ball (parked ~2 units in front of the camera) traps the cursor and you can
      // never click *through* it to another body — the dossier stays pinned.
      if (this.cam.focus && h.object === this.cam.focus) {
        focusedHit = h as THREE.Intersection;
        continue;
      }
      hit = h as THREE.Intersection;
      break;
    }
    if (!hit) hit = focusedHit; // nothing else under the ray → keep the focused body selected

    // Screen-space proximity fallback. Tiny/far cosmic bodies (galaxies, stars, DSOs)
    // are very hard to hit with a precise ray; if the ray missed, select the nearest
    // labelled body within a small pixel radius so a click *near* a body still works.
    if (!hit) {
      let bestD2 = this.COSMIC_PICK_PX * this.COSMIC_PICK_PX;
      let bestObj: THREE.Object3D | null = null;
      let bestIdx = -1;
      let bestWorld: THREE.Vector3 | null = null;
      for (const o of this.pickables) {
        if (!this.effectivelyVisible(o)) continue;
        if (o.userData?.isQuasarCloud) {
          // Merged quasar cloud: test each vertex against the click in screen space.
          const arr = o.userData.quasarPositions as Float32Array | undefined;
          const bodies = o.userData.quasarBodies as BodyData[] | undefined;
          if (!arr || !bodies) continue;
          const m = o.matrixWorld;
          for (let i = 0; i < bodies.length; i++) {
            this._q
              .set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2])
              .applyMatrix4(m);
            this._p.copy(this._q).project(this.camera);
            if (this._p.z > 1) continue;
            const sx = (this._p.x * 0.5 + 0.5) * innerWidth;
            const sy = (-0.5 * this._p.y + 0.5) * innerHeight;
            const d2 = (sx - e.clientX) ** 2 + (sy - e.clientY) ** 2;
            if (d2 <= bestD2) {
              bestD2 = d2;
              bestObj = o;
              bestIdx = i;
              bestWorld = this._q.clone();
            }
          }
          continue;
        }
        const ub = (o.userData as any)?.body;
        if (!ub || (!ub.isCosmos && !ub.isDeep && !ub.isSky)) continue;
        this._p.setFromMatrixPosition(o.matrixWorld);
        this._p.project(this.camera);
        if (this._p.z > 1) continue;
        const sx = (this._p.x * 0.5 + 0.5) * innerWidth;
        const sy = (-0.5 * this._p.y + 0.5) * innerHeight;
        const d2 = (sx - e.clientX) ** 2 + (sy - e.clientY) ** 2;
        if (d2 <= bestD2) {
          bestD2 = d2;
          bestObj = o;
          bestIdx = -1;
        }
      }
      if (bestObj) {
        hit = {
          object: bestObj,
          index: bestIdx >= 0 ? bestIdx : undefined,
          point: bestWorld ?? undefined,
        } as unknown as THREE.Intersection;
      }
    }
    // Resolve the picked body, handling the merged quasar cloud (per-vertex body via index).
    let b: BodyData | null = null;
    if (hit) {
      if (hit.object.userData?.isQuasarCloud && hit.index != null) {
        b =
          (hit.object.userData.quasarBodies as BodyData[] | undefined)?.[
            hit.index
          ] ?? null;
      } else {
        b = (hit.object.userData?.body as BodyData | undefined) ?? null;
      }
    }
    if (!b || !hit) {
      // Clicked empty space: release focus AND clear the dossier so the info panel
      // doesn't stay pinned to the last body.
      this.cam.focus = null;
      this.currentKey = null;
      this.onInfoChange?.(null);
      return;
    }
    if (b.isCosmos) {
      // Clicked a galaxy / star / quasar in a cosmic-scale view → show dossier + focus it
      this.showInfo(b);
      this.cam.focus = hit.object;
      const isCloud = !!hit.object.userData?.isQuasarCloud;
      // For the merged quasar cloud, aim at the specific quasar's world position
      // (looked up from its per-vertex positions); otherwise aim at the object origin.
      let objPos: THREE.Vector3;
      if (isCloud && hit.index != null) {
        const qp = hit.object.userData.quasarPositions as Float32Array;
        objPos = this._q
          .set(qp[hit.index * 3], qp[hit.index * 3 + 1], qp[hit.index * 3 + 2])
          .applyMatrix4(hit.object.matrixWorld)
          .clone();
      } else {
        objPos = hit.object.getWorldPosition(this._p);
      }
      const toDist = Math.max(3, isCloud ? 9 : (hit.object.scale.x || 1) * 2.5);
      const camToObj = this._q.copy(objPos).sub(this.camera.position);
      const toTheta = Math.atan2(camToObj.x, camToObj.z);
      const toPhi = Math.max(
        0.08,
        Math.min(
          Math.PI - 0.08,
          Math.acos(
            THREE.MathUtils.clamp(camToObj.y / camToObj.length(), -1, 1),
          ),
        ),
      );
      // Persist the focus distance so the post-flyTo per-frame lerp (dist → wantDist)
      // doesn't drag the camera back out to the stale scale-default distance. This is
      // what caused the "zoom in then snap back" on cosmic-scale bodies (e.g. L6).
      this.cam.wantDist = toDist;
      this.startFlyTo(toTheta, toPhi, toDist);
      return;
    }
    if (b.isSky) {
      const rows = [...(b.rows || []), ["地平坐标", "—", "altaz"]] as [
        string,
        string,
        string?,
      ][];
      this.showInfo({ ...b, rows });
      this.aimAt(hit.point);
      return;
    }
    if (b.isDeep) {
      this.showInfo(b);
      if (this.horizonMode) {
        this.cam.focus = null;
        this.aimAt(hit.point);
        return;
      }
      this.cam.focus = null;
      const d = this.cam.target.clone().sub(hit.object.position).normalize();
      const toTheta = Math.atan2(d.x, d.z);
      const toPhi = Math.max(
        0.08,
        Math.min(Math.PI - 0.08, Math.acos(THREE.MathUtils.clamp(d.y, -1, 1))),
      );
      this.startFlyTo(toTheta, toPhi, this.cam.wantDist);
      return;
    }
    if (this.horizonMode) return;
    this.cam.focus = hit.object;
    const toDist = Math.max(
      (b.rDisp || 0.3) * 7 + 0.25,
      b.kind === "moon" ? 1.1 : 2.2,
    );
    this.cam.wantDist = toDist;
    this.showInfo(b);
    // Launch a cinematic fly-to: aim at the body (object→origin direction from camera)
    hit.object.getWorldPosition(this._p);
    const camToObj = this._q.copy(this._p).sub(this.camera.position);
    const toTheta = Math.atan2(camToObj.x, camToObj.z);
    const toPhi = Math.max(
      0.08,
      Math.min(
        Math.PI - 0.08,
        Math.acos(THREE.MathUtils.clamp(camToObj.y / camToObj.length(), -1, 1)),
      ),
    );
    this.startFlyTo(toTheta, toPhi, toDist);
  }

  private showInfo(b: any) {
    this.currentKey = b.key;
    const info: BodyInfo = {
      n: b.n,
      en: b.en || "",
      c: b.c ?? 0xf5a623,
      key: b.key,
      rows: b.rows || [],
      note: b.note || "",
      gotoLevel: b.gotoLevel,
      quasar: b.quasar,
    };
    this.onInfoChange?.(info);
  }

  /* ═════════ RENDER LOOP ═════════ */
  private frame = (now: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (!this.paused) this.simT += this.daysPerSec * dt;

    // Solar system update
    for (const key in this.nodes) {
      const nd = this.nodes[key],
        au = posAU(nd.body, this.simT, this._p);
      this.liveDist[nd.body.key] = au.length().toFixed(3) + " AU";
      nd.og.position.copy(this.sp(au, this._s));
      if (!nd.body.tidal)
        nd.mesh.rotation.y +=
          (((2 * Math.PI) / nd.body.rot) * (this.daysPerSec * dt)) / 20;
      // Update planet day/night shader: sun is at eclFrame origin, so sun-direction (planet→sun)
      // is the negation of the planet's world position, normalized.
      const pmat = nd.mesh.userData.planetMat;
      if (pmat) {
        nd.mesh.getWorldPosition(this._ew);
        (pmat.uniforms.uSunDir.value as THREE.Vector3)
          .copy(this._ew)
          .negate()
          .normalize();
      }
      // Saturn ring shadow: same sun direction
      const rsm = nd.mesh.userData.ringShadowMat;
      if (rsm) {
        nd.mesh.getWorldPosition(this._ew);
        (rsm.uniforms.uSunDir.value as THREE.Vector3)
          .copy(this._ew)
          .negate()
          .normalize();
      }
      // Atmosphere rim (Fresnel): same sun direction
      const atm = nd.mesh.userData.atmoMat;
      if (atm) {
        nd.mesh.getWorldPosition(this._ew);
        (atm.uniforms.uSunDir.value as THREE.Vector3)
          .copy(this._ew)
          .negate()
          .normalize();
      }
      if (nd.moon) {
        const a = (2 * Math.PI * this.simT) / 27.322 + 0.8;
        nd.moon.position.set(
          Math.cos(a) * 1.4,
          Math.sin(a) * 0.18,
          Math.sin(a) * 1.4,
        );
      }
    }
    this.liveDist.sun = "—";
    for (const mo of MOONS) {
      if (!mo.nd) continue;
      const a = mo.M0 * D2R + (2 * Math.PI * this.simT) / mo.P;
      const r = mo.dist ?? 0;
      mo.mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (mo.tidal) mo.nd.mesh.rotation.y = a;
      this.liveDist[mo.n] = this.liveDist[mo.nd.body.key];
    }
    if (!this.paused && this.beltAst.visible) this.updateBelt(this.beltAst);
    if (!this.paused && this.beltKbo.visible) this.updateBelt(this.beltKbo);

    // Comets
    if (this.cometGroup.visible) {
      for (const cm of this.comets) {
        const au = posAU(cm.c, this.simT, this._p);
        const r = au.length();
        this.liveDist[cm.c.key] = r.toFixed(3) + " AU";
        cm.g.position.copy(this.sp(au, this._s));
        this._d.copy(cm.g.position).normalize().multiplyScalar(-1);
        this._q.set(this._d.y, -this._d.x, this._d.z);
        if (this._q.lengthSq() < 1e-6) this._q.set(1, 0, 0);
        this._q.normalize();
        const f = 1 / (r * 0.85 + 0.3);
        const L = Math.min(38, Math.max(2.5, 30 * f));
        cm.coma[0].scale.setScalar(0.9 + 2.6 * f);
        cm.coma[0].material.opacity = Math.min(0.85, 0.12 + f * 0.5);
        cm.core.scale.setScalar(0.8 + 0.5 * f);
        for (let k = 0; k < cm.dust.length; k++) {
          const s = (k + 1) / cm.dust.length,
            sp = cm.dust[k];
          sp.position
            .copy(this._d)
            .multiplyScalar(L * s * 1.02)
            .addScaledVector(this._q, L * 0.3 * s * s);
          sp.scale.setScalar((2.4 - s * 1.7) * (0.7 + f));
          sp.material.opacity = Math.min(0.5, (0.55 - s * 0.38) * (0.3 + f));
        }
        const idir = this._idir.copy(this._d).applyAxisAngle(this._q, -0.12);
        for (let k = 0; k < cm.ion.length; k++) {
          const s = (k + 1) / cm.ion.length,
            sp = cm.ion[k];
          sp.position.copy(idir).multiplyScalar(L * 1.35 * s);
          sp.scale.setScalar((1.2 - s * 0.8) * (0.6 + f) * 0.8);
          sp.material.opacity = Math.min(0.4, (0.42 - s * 0.34) * (0.25 + f));
        }
      }
    }

    this.updateAsteroids();

    // Earth shadow + lunar eclipse
    this.nodes["地球"].og.getWorldPosition(this._ew);
    const sdir = this._d.copy(this._ew).normalize();
    this.shadowGrp.position.copy(this._ew);
    this.shadowGrp.quaternion.setFromUnitVectors(this.UP, sdir);
    if (this.shadowGrp.visible) {
      const moonMat = this.nodes["地球"].moon.material;
      this.nodes["地球"].moon.getWorldPosition(this._mw);
      const rel = this._mw.sub(this._ew);
      const s = rel.dot(sdir);
      const U = (this as any)._UMBRA;
      if (s > 0 && s < U.LEN) {
        const perp = Math.sqrt(Math.max(0, rel.lengthSq() - s * s));
        const uR = U.R0 + ((U.R1 - U.R0) * s) / U.LEN;
        const pR = 0.5 + ((U.PR1 - 0.5) * s) / U.PLEN;
        moonMat.color.setHex(
          perp < uR ? 0x8a4034 : perp < pR ? 0x6d6259 : this.MOON_BASE,
        );
      } else moonMat.color.setHex(this.MOON_BASE);
    }
    if (this.geg.visible)
      this.geg.position.copy(this._ew).addScaledVector(sdir, 1600);

    // P1-1: Moon shadow + solar-eclipse detection (mirror of the lunar-eclipse test above).
    {
      const moon = this.nodes["地球"].moon;
      moon.getWorldPosition(this._mw);
      // shadow axis points anti-sunward: away from the origin (Sun), i.e. along the Moon's radial dir.
      const axis = this._mw.clone().normalize();
      this.moonShadowGrp.position.copy(this._mw);
      this.moonShadowGrp.quaternion.setFromUnitVectors(this.UP, axis);
      const U = (this as any)._MUMBRA as {
        LEN: number;
        R0: number;
        R1: number;
        PLEN: number;
        PR1: number;
      };
      const rel = this._ew.clone().sub(this._mw); // Moon → Earth
      const s = rel.dot(axis);
      const perp = Math.sqrt(Math.max(0, rel.lengthSq() - s * s));
      const uR = U.R0 + ((U.R1 - U.R0) * Math.max(0, s)) / U.LEN;
      const pR = 0.18 + ((U.PR1 - 0.18) * Math.max(0, s)) / U.PLEN;
      const eclipsing = s > 0 && perp < pR && this.moonShadowGrp.visible;
      this._solarEclipse = eclipsing;
      if (eclipsing) {
        const R = this.nodes["地球"].rDisp as number;
        const t = s - Math.sqrt(Math.max(0, R * R - perp * perp));
        const fp = this._mw.clone().addScaledVector(axis, t);
        const nrm = fp.clone().sub(this._ew).normalize();
        this.eclipseFoot.position.copy(fp).addScaledVector(nrm, 0.01);
        this.eclipseFoot.quaternion.setFromUnitVectors(this.UP, nrm);
        this.eclipseFoot.visible = true;
      } else {
        this.eclipseFoot.visible = false;
      }
    }

    // Horizon mode
    if (this.horizonMode) {
      this.updateHorizonFrame();
      for (const m of this.marks) {
        if (m.isSun) this._p.copy(this._ew).negate();
        else {
          m.srcObj.getWorldPosition(this._p);
          this._p.sub(this._ew);
        }
        this._p.normalize();
        // The geocentric direction (from mesh positions) lives in the ecliptic
        // frame, but the star sphere / skyRoot use the equatorial frame. Rotate
        // by the obliquity so planets land on the correct RA/Dec relative to
        // the stars (otherwise they'd be off by up to ~23°).
        this.eclToEq(this._p);
        m.sp.position.copy(this._p).multiplyScalar(2520);
        // True local alt/az: transform the equatorial direction by the horizon
        // frame (skyRoot.quaternion) before measuring.
        this._pw.copy(this._p).applyQuaternion(this.skyRoot.quaternion);
        const [alt, az] = dirToAltAz(this._pw);
        m.alt = alt;
        m.az = az;
        if (m.isSun) this._sunAlt = alt;
        this.liveAltaz[m.body.key] =
          fmtDeg(alt) + "  高度 · " + az.toFixed(1) + "° 方位";
      }
      this.cam.want.set(0, 0, 0);
      this.cam.wantDist = 2;
    } else {
      this.skyRoot.quaternion.identity();
    }

    // Meteors
    if (this.meteorGroup.visible) {
      this.nextMeteor -= dt;
      if (this.nextMeteor <= 0) {
        const m = this.meteors.find((x) => x.t > x.dur);
        if (m) this.spawnMeteor(m);
        this.nextMeteor = 2 + Math.random() * 6;
      }
      for (const m of this.meteors) {
        if (m.t > m.dur) {
          m.line.material.opacity = 0;
          continue;
        }
        m.t += dt;
        const k = Math.min(1, m.t / m.dur);
        this._p.copy(m.p).addScaledVector(this._d.copy(m.d), m.speed * m.t);
        this._s.copy(this._p).addScaledVector(m.d, -m.len);
        const P = m.line.geometry.attributes.position;
        P.setXYZ(0, this._p.x, this._p.y, this._p.z);
        P.setXYZ(1, this._s.x, this._s.y, this._s.z);
        P.needsUpdate = true;
        m.line.material.opacity = Math.sin(Math.PI * k) * 0.8;
      }
    }

    // Cosmic-view animations (galaxy spin, bulge pulse, exoplanet orbits)
    for (let i = 1; i < this.cosmosViews.length; i++) {
      const g = this.cosmosViews[i];
      if (!g.visible) continue;
      const spin = g.userData.spin as number | undefined;
      if (spin) g.rotation.y += spin * dt;
      // Exoplanet orbit animation (neighborhood view)
      const exoUpdate = g.userData.exoUpdate as
        ((t: number) => void) | undefined;
      if (exoUpdate) exoUpdate(this.simT);
      // gentle pulse on the galactic core sprite (first child of Milky Way)
      if (
        i === 2 &&
        g.children[1] &&
        (g.children[1] as THREE.Sprite).material
      ) {
        const s = g.children[1] as THREE.Sprite;
        const base = 5.5;
        s.scale.setScalar(base + Math.sin(this.simT * 0.5) * 0.25);
      }
    }

    // Auto-tour: advance scripted waypoints (drives scale-level + camera)
    if (this.tour.active) this.tourTick(dt);

    // Camera
    if (this.cam.focus) this.cam.focus.getWorldPosition(this.cam.want);
    const sm = 1 - Math.exp(-7 * dt);
    this.cam.target.lerp(this.cam.want, sm);
    this.cam.dist += (this.cam.wantDist - this.cam.dist) * sm;

    // Cinematic fly-to tween (overrides theta/phi/dist with eased path)
    if (this.flyTo.active) {
      this.flyTo.t += dt;
      const k = Math.min(1, this.flyTo.t / this.flyTo.dur);
      const e = this.easeInOutCubic(k);
      this.cam.theta =
        this.flyTo.fromTheta + (this.flyTo.toTheta - this.flyTo.fromTheta) * e;
      this.cam.phi =
        this.flyTo.fromPhi + (this.flyTo.toPhi - this.flyTo.fromPhi) * e;
      this.cam.dist =
        this.flyTo.fromDist + (this.flyTo.toDist - this.flyTo.fromDist) * e;
      if (k >= 1) this.flyTo.active = false;
    }

    // ── Free-fly mode: keyboard-driven WASD navigation, drag = look ──
    if (this.flyMode) {
      // Build a forward/right/up basis from flyYaw/flyPitch
      const cp = Math.cos(this.flyPitch),
        sp = Math.sin(this.flyPitch);
      const fwd = this._d
        .set(Math.sin(this.flyYaw) * cp, sp, Math.cos(this.flyYaw) * cp)
        .normalize();
      const right = this._q.set(fwd.z, 0, -fwd.x).normalize(); // horizontal right
      const up = this._s.crossVectors(right, fwd).normalize();
      // desired velocity from keys
      const speed =
        (this.keys["shift"] ? 6 : 2) *
        this.flySpeed *
        (this.scaleLevel === 0 ? 1 : 3);
      const want = this._p.set(0, 0, 0);
      if (this.keys["w"] || this.keys["arrowup"]) want.addScaledVector(fwd, 1);
      if (this.keys["s"] || this.keys["arrowdown"])
        want.addScaledVector(fwd, -1);
      if (this.keys["a"] || this.keys["arrowleft"])
        want.addScaledVector(right, -1);
      if (this.keys["d"] || this.keys["arrowright"])
        want.addScaledVector(right, 1);
      if (this.keys["e"] || this.keys[" "]) want.addScaledVector(up, 1);
      if (this.keys["q"]) want.addScaledVector(up, -1);
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);
      // smooth velocity (accel/decel)
      this.flyVel.lerp(want, 1 - Math.exp(-8 * dt));
      this.flyPos.addScaledVector(this.flyVel, dt);
      // place camera + look target
      this.camera.position.copy(this.flyPos);
      this.cam.target.copy(this.flyPos).addScaledVector(fwd, 10);
      this.camera.up.copy(up);
      this.camera.lookAt(this.cam.target);
    } else {
      const sp2 = Math.max(0.05, Math.min(Math.PI - 0.05, this.cam.phi));
      this.camera.position.set(
        this.cam.target.x +
          this.cam.dist * Math.sin(sp2) * Math.sin(this.cam.theta),
        this.cam.target.y + this.cam.dist * Math.cos(sp2),
        this.cam.target.z +
          this.cam.dist * Math.sin(sp2) * Math.cos(this.cam.theta),
      );
      const d = this._q
        .copy(this.cam.target)
        .sub(this.camera.position)
        .normalize();
      if (this.horizonMode)
        this.camera.up.copy(
          Math.abs(this._uU.dot(d)) > 0.9 ? this._uN : this._uU,
        );
      else this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.cam.target);
    }
    // Cosmic warp transition: swap content at midpoint, decay `transit` for HUD flash
    if (this.transitTimer > 0) {
      const prev = this.transitTimer;
      this.transitTimer = Math.max(0, this.transitTimer - dt);
      // Swap content when crossing the midpoint (transitTimer goes 0.45→0.45-)
      if (prev > 0.45 && this.transitTimer <= 0.45) {
        this.applyScaleContent(this.scaleLevel);
      }
      this.transit = this.transitTimer / 0.9; // 1 → 0 over the warp
    } else {
      this.transit = 0;
    }

    // Labels — throttle DOM projection to ~30Hz. Per-label style writes are the
    // dominant cost of this block; 30Hz is imperceptible and halves frame work.
    if (
      this.labelHost.style.display !== "none" &&
      now - this.lastLabelT >= this.labelThrottleMs
    ) {
      this.lastLabelT = now;
      this.scene.updateMatrixWorld();
      this.camera.updateMatrixWorld();
      this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
      const iw = innerWidth;
      const ih = innerHeight;
      for (const L of this.labelEls) {
        // Visibility is decided from the BODY position only — the up-offset below
        // is purely cosmetic (it floats the tag above the body). If we tested the
        // offset anchor instead, bodies sitting near the top edge of the screen
        // get their tags culled even though the body itself is visible (this was
        // hiding the Virgo-cluster core labels in the L4 nearby-universe level).
        this._pVis
          .setFromMatrixPosition(L.obj.matrixWorld)
          .project(this.camera);
        this._p.setFromMatrixPosition(L.obj.matrixWorld);
        // Offset along the camera's screen-up axis (NOT world +Y). In free-fly
        // mode the camera rolls freely, so a fixed world-space +Y offset would
        // project to a swinging screen position and the tag would visually
        // detach from its body. Using the camera up-vector keeps it glued.
        this._camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
        this._p.addScaledVector(this._camUp, L.up);
        this._p.project(this.camera);
        const grpOk = !L.grp
          ? true
          : L.grp === "cosmos"
            ? this.scaleLevel !== 0
            : L.grp === "sys"
              ? !this.horizonMode && this.scaleLevel === 0
              : L.grp === "sky" || L.grp === "hzd"
                ? this.horizonMode
                : L.grp === "ring"
                  ? this.scaleLevel === 0
                  : this.showGrp[L.grp as keyof typeof this.showGrp];
        const on =
          grpOk &&
          this._pVis.z < 1 &&
          Math.abs(this._pVis.x) < 1.05 &&
          Math.abs(this._pVis.y) < 1.05 &&
          (L.grp === "cosmos" ||
            !L.min ||
            this.cam.dist < L.min ||
            this.horizonMode ||
            this.flyMode);
        if (on !== L._on) {
          L.el.style.display = on ? "" : "none";
          L._on = on;
        }
        if (on) {
          const x = (this._p.x * 0.5 + 0.5) * iw;
          const y = (-0.5 * this._p.y + 0.5) * ih;
          if (x !== L._x || y !== L._y) {
            L.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-140%)`;
            L._x = x;
            L._y = y;
          }
        }
      }
    }

    this.renderer.render(this.scene, this.camera);

    // FPS / state
    this.fpsN++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      const fps = this.fpsN / this.fpsT;
      const dte = new Date(EPOCH + this.simT * 86400000);
      const clock = `${dte.getUTCFullYear()}–${MONTH[dte.getUTCMonth()]}–${String(dte.getUTCDate()).padStart(2, "0")}  ${String(dte.getUTCHours()).padStart(2, "0")}:${String(dte.getUTCMinutes()).padStart(2, "0")}`;

      // P1-2 / P1-5: date-driven HUD cues
      const simMillis = EPOCH + this.simT * 86400000;
      const halleyDays = Math.round(
        (this._halleyTarget - simMillis) / 86400000,
      );
      this._halleyCountdown =
        (halleyDays >= 0 ? "约 " : "已过 ") +
        Math.abs(halleyDays).toLocaleString("zh-CN") +
        " 天（下一近地点 2061-07-28）";
      const apophisTarget = Date.UTC(2029, 3, 13);
      this._apophisAlert =
        Math.abs((apophisTarget - simMillis) / 86400000) < 45;

      // P2-3: tonight-visibility panel for the five classical naked-eye planets.
      // Only meaningful in planetarium/horizon mode (marks carry live alt/az there).
      this._planetPanel = [];
      if (this.horizonMode) {
        const NAKED = ["水星", "金星", "火星", "木星", "土星"];
        const night = this._sunAlt < 0; // Sun below horizon → dark sky
        for (const m of this.marks) {
          if (!NAKED.includes(m.body.n)) continue;
          const up = (m.alt ?? 0) > 0;
          this._planetPanel.push({
            n: m.body.n,
            sym: m.body.sym || "·",
            alt: m.alt ?? 0,
            az: m.az ?? 0,
            up,
            vis: up && night,
          });
        }
        this._planetPanel.sort((a, b) => b.alt - a.alt);
      }
      if (this.ADAPTIVE_DPR) {
        if (this.dprCool > 0) this.dprCool--;
        else if (fps < 45 && this.dprScale > 0.55) {
          this.dprScale = Math.max(0.55, this.dprScale - 0.15);
          this.applyDpr();
          this.dprCool = 6;
        } else if (fps > 58 && this.dprScale < 1) {
          this.dprScale = Math.min(1, this.dprScale + 0.1);
          this.applyDpr();
          this.dprCool = 6;
        }
      }
      // High-frequency HUD values (clock / fps / dpr / simT) go through the
      // external store so only the tiny leaf components re-render (~2 Hz),
      // never the whole React tree.
      // Draw-call audit (H task): read the per-frame GPU draw-call count from the
      // renderer so we can confirm which scale level dominates and how much the
      // quasar cloud costs before deciding whether to merge it into one Points.
      const info = this.renderer.info.render;
      hudStore.set({
        clock,
        fps: Math.round(fps),
        dprScale: this.dprScale,
        simT: this.simT,
        drawCalls: info.calls,
        triangles: info.triangles,
      });
      console.info(
        `[DRAW] level=${this.scaleLevel} calls=${info.calls} tris=${info.triangles}`,
      );

      // Control state is pushed to React only when it actually changes, so the
      // parent component re-renders on user actions, not every 0.5 s.
      const ctrl: Partial<EngineState> = {
        daysPerSec: this.daysPerSec,
        dir: this.dir,
        paused: this.paused,
        horizonMode: this.horizonMode,
        eps: this.EPS,
        site: { ...this.site },
        show: { ...this.show },
        scaleLevel: this.scaleLevel,
        transit: this.transit,
        flyMode: this.flyMode,
        flySpeed: this.flySpeed,
        tourActive: this.tour.active,
        blueLight: this.blueLight,
        solarEclipse: this._solarEclipse,
        halleyCountdown: this._halleyCountdown,
        apophisAlert: this._apophisAlert,
        planetPanel: this._planetPanel,
        sunAlt: this._sunAlt,
      };
      const ctrlKey = JSON.stringify(ctrl);
      if (ctrlKey !== this._lastCtrlKey) {
        this._lastCtrlKey = ctrlKey;
        this.onStateChange?.(ctrl);
      }
      this.fpsN = 0;
      this.fpsT = 0;
    }
  };

  /* ═════════ PUBLIC CONTROL API ═════════ */
  setRate(v: number) {
    // v is slider 0..1000
    this.daysPerSec = Math.pow(10, -2 + v * 5) * this.dir;
  }
  setDir(dir: number) {
    this.dir = dir;
  }
  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }
  setRealTime() {
    this.daysPerSec = 1 / 86400;
  }
  jumpToNow() {
    this.simT = (Date.now() - EPOCH) / 86400000;
  }
  resetView() {
    this.cam.focus = null;
    this.cam.want.set(0, 0, 0);
    this.cam.wantDist = this.horizonMode
      ? 2
      : SCALE_LEVELS[this.scaleLevel].sceneScale;
    this.cam.theta = 0.7;
    this.cam.phi = 1.05;
    this.showInfo(SUN);
  }
  toggleHorizon(): boolean {
    this.horizonMode = !this.horizonMode;
    this.sysGroup.visible = !this.horizonMode && this.scaleLevel === 0;
    this.skyMarks.visible = this.horizonMode;
    this.horizonUI.visible = this.horizonMode;
    this.cam.focus = null;
    if (this.horizonMode) {
      this.cam.want.set(0, 0, 0);
      this.cam.wantDist = 2;
      this.camera.fov = 62;
    } else this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
    this.showInfo(SUN);
    return this.horizonMode;
  }
  /**
   * Toggle the global "blue light" styling. When OFF, every material tagged via `markBlue`
   * (UI rings, horizon guides, cosmic filaments/arms, atmosphere glows, Earth's Rayleigh rim)
   * is recolored to neutral grey and the warm point light becomes pure white — so models &
   * textures render in their original colors with no blue/light override.
   */
  setBlueLight(on: boolean) {
    this.blueLight = on;
    this.applyBlueLight();
    this.onStateChange?.({ blueLight: on });
  }
  /** Recolor all `markBlue`-tagged materials to match the current `blueLight` state. */
  private applyBlueLight() {
    const neutral = CosmosEngine.NEUTRAL;
    const neutralGlow = this.getNeutralGlowTex();
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as
        THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        if (!m.userData?.cosmicMarked) continue;
        const blue = m.userData.cosmicBlue as number | undefined;
        if (
          blue !== undefined &&
          (m as unknown as { color?: THREE.Color }).color
        ) {
          (m as unknown as { color: THREE.Color }).color.setHex(
            this.blueLight ? blue : neutral,
          );
        }
        if (m.userData.cosmicGlow && m instanceof THREE.SpriteMaterial) {
          m.map = this.blueLight
            ? (m.userData.blueTex as THREE.Texture)
            : neutralGlow;
          m.needsUpdate = true;
        }
        if (
          m.userData.cosmicUColor &&
          m instanceof THREE.ShaderMaterial &&
          m.uniforms?.uColor
        ) {
          const c = this.blueLight
            ? (m.userData.cosmicUColor as [number, number, number])
            : CosmosEngine.NEUTRAL_RGB;
          (m.uniforms.uColor.value as THREE.Vector3).set(
            c[0] / 255,
            c[1] / 255,
            c[2] / 255,
          );
        }
      }
    });
    if (this.pointLight)
      this.pointLight.color.setHex(this.blueLight ? 0xfff1dd : 0xffffff);
  }
  private getNeutralGlowTex(): THREE.Texture {
    if (!this.neutralGlowTex) this.neutralGlowTex = glowTex([200, 200, 208]);
    return this.neutralGlowTex;
  }
  setObliquity(v: number) {
    this.EPS = v;
    this.applyEps();
  }
  setLat(v: number) {
    this.site.lat = v;
  }
  setLon(v: number) {
    this.site.lon = v;
  }
  /** Jump simulation time to an absolute day count since J2000 epoch. */
  setSimTime(days: number) {
    this.simT = days;
  }
  /** Toggle immersive free-fly navigation. On engage, camera position & orientation seed flyPos/yaw/pitch. */
  toggleFly(): boolean {
    this.flyMode = !this.flyMode;
    if (this.flyMode) {
      // Seed from current orbit camera
      this.flyPos.copy(this.camera.position);
      const fwd = this._p
        .copy(this.cam.target)
        .sub(this.camera.position)
        .normalize();
      this.flyYaw = Math.atan2(fwd.x, fwd.z);
      this.flyPitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
      this.flyVel.set(0, 0, 0);
      this.flySpeed = 8;
      this.cam.focus = null;
    }
    return this.flyMode;
  }
  setFlySpeed(v: number) {
    this.flySpeed = Math.max(1, Math.min(200, v));
  }

  /** Toggle the auto-tour: a scripted cinematic fly-through across scale levels. */
  toggleTour(): boolean {
    if (this.tour.active) {
      this.tour.active = false;
      return false;
    }
    // Build the waypoint list (re-evaluated each start in case data changed)
    this.tourWaypoints = [
      {
        scaleLevel: 0,
        bodyKey: "sun",
        dist: 14,
        dur: 4,
        caption: "太阳 · G2V 主序星，太阳系的中心",
      },
      {
        scaleLevel: 0,
        bodyKey: "地球",
        dist: 4,
        dur: 4,
        caption: "地球 · 唯一已知存在液态水海洋的行星",
      },
      {
        scaleLevel: 0,
        bodyKey: "木星",
        dist: 12,
        dur: 4,
        caption: "木星 · 质量为其余七颗行星总和的 2.5 倍",
      },
      {
        scaleLevel: 0,
        bodyKey: "土星",
        dist: 10,
        dur: 4,
        caption: "土星 · 环系宽达 28 万公里却厚不足百米",
      },
      {
        scaleLevel: 1,
        dist: 14,
        dur: 5,
        caption: "近邻恒星 · 太阳周围 16 光年内的恒星邻居",
      },
      {
        scaleLevel: 2,
        dist: 35,
        dur: 5,
        caption: "银河系 · 约 4000 亿颗恒星组成的棒旋星系",
      },
      {
        scaleLevel: 3,
        dist: 34,
        dur: 5,
        caption: "本星系群 · 银河系与仙女座星系为两大核心",
      },
      {
        scaleLevel: 4,
        dist: 45,
        dur: 5,
        caption: "近邻宇宙 · 室女座星系团是本超星系团引力中心",
      },
      {
        scaleLevel: 5,
        dist: 95,
        dur: 5,
        caption: "超星系团网络 · 星系沿宇宙网状结构聚集",
      },
      {
        scaleLevel: 6,
        dist: 30,
        dur: 6,
        caption: "可观测宇宙 · 直径约 930 亿光年，最外层是 CMB",
      },
    ];
    this.tour.active = true;
    this.tour.idx = 0;
    this.tour.t = 0;
    if (this.flyMode) this.flyMode = false; // tour uses orbit camera, not free-fly
    this.onTourCaption?.(this.tourWaypoints[0].caption);
    return true;
  }
  private onTourCaption?: (caption: string) => void;
  setTourCaptionCallback(cb: (caption: string) => void) {
    this.onTourCaption = cb;
  }
  isTourActive() {
    return this.tour.active;
  }
  /** Skip to the next tour waypoint (or finish if at last). */
  tourSkip(): boolean {
    if (!this.tour.active) return false;
    this.tour.idx++;
    this.tour.t = 0;
    if (this.tour.idx >= this.tourWaypoints.length) {
      this.tour.active = false;
      this.onTourCaption?.("");
      return false;
    }
    this.onTourCaption?.(this.tourWaypoints[this.tour.idx].caption);
    return true;
  }
  /** Advance the tour: called from the frame loop. */
  private tourTick(dt: number) {
    if (!this.tour.active) return;
    const wp = this.tourWaypoints[this.tour.idx];
    if (!wp) {
      this.tour.active = false;
      return;
    }
    // On entering a new waypoint, snap scale level + aim at body
    if (this.tour.t === 0) {
      if (this.scaleLevel !== wp.scaleLevel) {
        // Use the warp transition (transit flash) instead of instant swap for cosmic levels
        if (wp.scaleLevel !== 0 || this.scaleLevel !== 0) {
          this.transitFrom = this.scaleLevel;
          this.scaleLevel = wp.scaleLevel;
          this.transit = 1;
          this.transitTimer = 0.7;
          // Swap content at warp midpoint via applyScaleContent (called by the warp tick)
          // But tour needs content ready NOW for camera aim, so swap immediately for solar levels,
          // and let the warp flash play cosmetically on top.
          this.applyScaleContent(wp.scaleLevel);
        }
      }
      this.cam.want.set(0, 0, 0);
      this.cam.wantDist = wp.dist;
      // Aim at body if specified (solar system level)
      if (wp.bodyKey && wp.scaleLevel === 0) {
        const nd = Object.values(this.nodes).find(
          (n: any) => n.body.key === wp.bodyKey,
        );
        if (nd) {
          nd.og.getWorldPosition(this._p);
          const camToObj = this._q.copy(this._p).sub(this.camera.position);
          const toTheta = Math.atan2(camToObj.x, camToObj.z);
          const toPhi = Math.max(
            0.08,
            Math.min(
              Math.PI - 0.08,
              Math.acos(
                THREE.MathUtils.clamp(camToObj.y / camToObj.length(), -1, 1),
              ),
            ),
          );
          this.startFlyTo(toTheta, toPhi, wp.dist);
          this.cam.focus = nd.mesh;
        }
      } else {
        // For cosmic levels, slowly orbit
        this.cam.focus = null;
      }
    }
    this.tour.t += dt;
    // Gentle auto-rotate during the waypoint for cinematic feel
    this.cam.theta += dt * 0.12;
    if (this.tour.t >= wp.dur) {
      this.tour.idx++;
      this.tour.t = 0;
      if (this.tour.idx >= this.tourWaypoints.length) {
        this.tour.active = false;
        this.onTourCaption?.("");
      } else {
        this.onTourCaption?.(this.tourWaypoints[this.tour.idx].caption);
      }
    }
  }
  toggleLayer(key: string, on: boolean) {
    this.show[key as keyof typeof this.show] = on;
    if (key === "orb") {
      this.orbitGroupRoot.visible = on;
      for (const r of this.subOrbits) r.visible = on;
    }
    if (key === "lab") this.labelHost.style.display = on ? "" : "none";
    if (key === "belt") {
      this.beltAst.visible = on;
      this.beltKbo.visible = on;
      this.asteroidGroup.visible = on;
      this.trojanL4.visible = on;
      this.trojanL5.visible = on;
    }
    if (key === "mw") {
      const mw = this.skyGroup.getObjectByName("mw");
      if (mw) mw.visible = on;
    }
    if (key === "dso") {
      this.dsoGroup.visible = on;
      this.starGroup.visible = on;
      this.showGrp.dso = on;
    }
    if (key === "con") {
      this.CONG.visible = on;
      this.showGrp.con = on;
    }
    if (key === "comet") this.cometGroup.visible = on;
    if (key === "met") this.meteorGroup.visible = on;
    if (key === "zodi") {
      this.zodiGroup.visible = on;
      this.geg.visible = on;
    }
    if (key === "shadow") {
      this.shadowGrp.visible = on;
      this.moonShadowGrp.visible = on;
    }
    if (key === "fermi" && this.fermiGroup) this.fermiGroup.visible = on;
    if (key === "arms" && this.armsGroup) this.armsGroup.visible = on;
    if (key === "chi") {
      this.chiGroup.visible = on;
      this.showGrp.chi = on;
      if (on) {
        for (const p of this.chiPickables)
          if (!this.pickables.includes(p)) this.pickables.push(p);
      } else {
        this.pickables = this.pickables.filter((p) => !p.userData.chiPick);
      }
    }
  }
  setScaleLevel(level: number) {
    if (level === this.scaleLevel) return;
    // Begin building the target level's content immediately (lazy) so its galaxy
    // photos / survey cloud are fetched during the warp rather than at startup.
    this.ensureCosmosView(level);
    // Fly mode doesn't compose with the warp transition; disable it.
    if (this.flyMode) this.flyMode = false;
    // Kick off a short cinematic warp: swap content at the midpoint while the
    // camera dollies. The HUD reads `transit` (0..1) to render a flash overlay.
    this.transitFrom = this.scaleLevel;
    this.scaleLevel = level;
    this.transit = 1;
    this.transitTimer = 0.9; // seconds for the full warp
    // Pre-stage the target camera distance so the doll happens during the warp
    this.cam.focus = null;
    this.cam.want.set(0, 0, 0);
    this.cam.wantDist = SCALE_LEVELS[level].sceneScale;
  }

  /** Toggle honest-proportion (real-scale) mode. Distances become linear in AU and
   *  body sizes proportional; the scene is re-scaled in place and the camera reframed. */
  setRealScale(v: boolean) {
    if (v === this.realScale) return;
    this.realScale = v;
    this.applyScaleMode();
    this.onStateChange?.({ realScale: v });
  }

  /** Re-apply sizing + orbit geometry for the current scale mode (called on toggle). */
  private applyScaleMode() {
    // Sun
    const sunR = this.sunRDisp();
    this.sunMesh.scale.setScalar(sunR);
    this.sunMesh.userData.body.rDisp = sunR;
    if (this.sunGlow1) this.sunGlow1.scale.setScalar(sunR * 9.17);
    if (this.sunGlow2) this.sunGlow2.scale.setScalar(sunR * 20);

    // Planets
    for (const key in this.nodes) {
      const nd: any = this.nodes[key];
      const b = nd.body;
      const rDisp = this.planetRDisp(b);
      if (b.ellip) nd.mesh.scale.set(rDisp * 1.6, rDisp * 0.8, rDisp * 0.8);
      else nd.mesh.scale.setScalar(rDisp);
      nd.rDisp = rDisp;
      nd.body.rDisp = rDisp;
      nd.mesh.userData.body.rDisp = rDisp;
      if (nd.halo) nd.halo.scale.setScalar(rDisp * 2.4);
      if (nd.atmo) nd.atmo.scale.setScalar(rDisp * 1.06);
      if (nd.ringShadow) nd.ringShadow.scale.setScalar(rDisp * 1.01);
      if (nd.ring) {
        const inner = nd.ringThin ? rDisp * 1.55 : rDisp * 1.42;
        const outer = nd.ringThin ? rDisp * 2.1 : rDisp * 2.35;
        nd.ring.geometry.dispose();
        nd.ring.geometry = new THREE.RingGeometry(inner, outer, 96);
      }
      const le = this.labelEls.find((l: LabelEntry) => l.obj === nd.og);
      if (le) le.up = rDisp * 1.8 + 0.4;
    }

    // Earth's Moon (handled specially — fixed-size mesh + hardcoded orbit radius)
    const earthNode: any = this.nodes["地球"];
    if (earthNode?.moon) {
      const mr = this.realScale ? 0.02 : 0.13;
      earthNode.moon.scale.setScalar(mr);
      earthNode.moon.userData.body.rDisp = mr;
    }

    // Other moons
    for (const mo of MOONS) {
      if (!mo.nd) continue;
      mo.dist = mo.nd.rDisp * 1.8 * Math.pow(mo.aKm / 421700, 0.62);
      if (mo.minDist) mo.dist = Math.max(mo.dist, mo.nd.rDisp * mo.minDist);
      else mo.dist = Math.max(mo.dist, mo.nd.rDisp * 1.5);
      const mr = this.moonRDisp(mo);
      mo.mesh.scale.setScalar(Math.max(0.02, mr));
      if (mo.ring) {
        const ringPts: THREE.Vector3[] = [];
        for (let k = 0; k <= 72; k++) {
          const a = (k / 72) * Math.PI * 2;
          ringPts.push(
            new THREE.Vector3(Math.cos(a) * mo.dist, 0, Math.sin(a) * mo.dist),
          );
        }
        mo.ring.geometry.setFromPoints(ringPts);
      }
      const le = this.labelEls.find((l: LabelEntry) => l.obj === mo.mesh);
      if (le) le.up = mr * 2 + 0.12;
    }

    // Orbit lines (rebuilt with the active distance mapping)
    for (const { line, b } of this.orbitLines) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 240; k++)
        pts.push(
          this.sp(posAU(b, (k / 240) * b.P, this._p), new THREE.Vector3()),
        );
      line.geometry.setFromPoints(pts);
    }

    // Reframe camera to encompass the (now linear) solar system
    this.cam.focus = null;
    this.cam.want.set(0, 0, 0);
    this.cam.wantDist = this.realScale ? 320 : 120;
  }
  /** Apply the content swap at the warp midpoint (called from the frame loop). */
  private applyScaleContent(level: number) {
    this.ensureCosmosView(level); // build on first visit (lazy), then cache
    for (let i = 1; i < this.cosmosViews.length; i++)
      this.cosmosViews[i].visible = i === level;
    const showSolar = level === 0 && !this.horizonMode;
    this.sysGroup.visible = showSolar;
    this.skyRoot.visible = level === 0;
    this.horizonUI.visible = this.horizonMode && level === 0;
    this.activateCosmosLabels(level);
    this.labelHost.style.display = this.show.lab ? "" : "none";
    // Reclaim GPU memory: keep only the active level ±1 cached, dispose the rest so
    // long sessions don't accumulate all six levels' photos + survey cloud permanently.
    for (let i = 1; i < this.cosmosViews.length; i++) {
      if (i === level) continue;
      if (this.cosmosViewsBuilt[i] && Math.abs(i - level) > 1)
        this.disposeCosmosView(i);
    }
  }
  /** Dispose a material and any textures it references. The engine-cached neutral
   *  glow texture is shared across levels, so it is never disposed here. */
  private disposeMaterial(m: THREE.Material) {
    const anyMat = m as any;
    for (const key in anyMat) {
      const val = anyMat[key];
      if (val && val.isTexture && val !== this.neutralGlowTex) val.dispose();
    }
    m.dispose();
  }

  /** Reclaim GPU resources of a built cosmic-view level and reset it to an empty
   *  placeholder so it can be lazily rebuilt on next visit. Keeps resident memory
   *  bounded to the active level ±1 instead of caching all six levels forever.
   *  (DOM labels/pickables are owned by `activateCosmosLabels`, which already
   *  rebuilds them for the active level, so we never touch them here.) */
  private disposeCosmosView(level: number) {
    if (level < 1 || level >= this.cosmosViews.length) return;
    if (!this.cosmosViewsBuilt[level]) return;
    const grp = this.cosmosViews[level];
    grp.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as
        THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => this.disposeMaterial(m));
      else if (mat) this.disposeMaterial(mat);
    });
    if (grp.parent) grp.parent.remove(grp);
    this.cosmosViews[level] = new THREE.Group();
    this.cosmosViews[level].visible = false;
    this.cosmosRoot.add(this.cosmosViews[level]);
    this.cosmosViewsBuilt[level] = false;
  }

  dispose() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    // remove all tracked event listeners
    for (const h of this.handlers) {
      h.target.removeEventListener(h.type, h.fn as EventListener, h.opts);
    }
    this.handlers = [];

    // release GPU resources (geometry / material / textures) via scene traversal
    if (this.scene) {
      this.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as
          THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => this.disposeMaterial(m));
        else if (mat) this.disposeMaterial(mat);
      });
    }
    if (this.sphereGeo) this.sphereGeo.dispose();

    // remove DOM label elements and reset pickable/label registries
    for (const L of this.labelEls) L.el.remove();
    this.labelEls = [];
    this.cosmosLabelEls = [];
    this.cosmosPickables = [];
    this.pickables = [];

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement)
        this.renderer.domElement.parentElement.removeChild(
          this.renderer.domElement,
        );
    }
  }
}
