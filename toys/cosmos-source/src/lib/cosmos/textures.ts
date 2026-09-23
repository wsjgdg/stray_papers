/**
 * textures.ts — Procedural canvas textures (planets, sun, nebulae, Milky Way, rings, glow, flare)
 * Ported from the original simulator and enriched.
 */
import * as THREE from 'three';

export function newCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return [cv, cv.getContext('2d')!];
}

export function done(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function blob(
  g: CanvasRenderingContext2D, x: number, y: number, r: number,
  rgb: number[], a: number,
) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
  rg.addColorStop(0.45, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * 0.4})`);
  rg.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = rg;
  g.beginPath();
  g.arc(x, y, r, 0, 7);
  g.fill();
}

interface TexOpts {
  type: string; base: string; dark: string; spot?: boolean;
}

/** Procedural planet texture (equirectangular). */
export function makeTex(o: TexOpts): THREE.CanvasTexture {
  const [cv, g] = newCanvas(512, 256);
  g.fillStyle = o.base;
  g.fillRect(0, 0, 512, 256);
  const rnd = ((s: number) => () => (s = s * 16807 % 2147483647) / 2147483647)(97);

  if (o.type === 'giant' || o.type === 'cloud' || o.type === 'ice') {
    // Banded atmosphere
    for (let y = 0; y < 256; y += 4) {
      const w = Math.sin(y * 0.11) * 0.5 + 0.5;
      const h = Math.sin(y * 0.045 + 2) * 0.5 + 0.5;
      g.globalAlpha = 0.12 + 0.3 * h;
      g.fillStyle = w > 0.5 ? o.dark : o.base;
      g.fillRect(0, y + Math.sin(y * 0.3) * 2, 512, 4);
    }
    if (o.spot) {
      // Great Red Spot
      g.globalAlpha = 0.75;
      for (let i = 0; i < 26; i++) {
        g.fillStyle = i % 2 ? '#b8502f' : '#d9714a';
        g.beginPath();
        g.ellipse(352 + (rnd() - 0.5) * 34, 150 + (rnd() - 0.5) * 16, 46 - i, 17 - i * 0.5, 0, 0, 7);
        g.fill();
      }
    }
    // Turbulent eddies along band boundaries
    if (o.type === 'giant') {
      g.globalAlpha = 0.18;
      for (let i = 0; i < 40; i++) {
        g.fillStyle = rnd() > 0.5 ? o.dark : '#ffffff';
        g.beginPath();
        g.ellipse(rnd() * 512, rnd() * 256, 6 + rnd() * 16, 3 + rnd() * 5, 0, 0, 7);
        g.fill();
      }
    }
  } else if (o.type === 'earth') {
    // Continents
    g.fillStyle = '#2f7a42';
    for (let i = 0; i < 42; i++) {
      g.globalAlpha = 0.85;
      g.beginPath();
      g.ellipse(rnd() * 512, 30 + rnd() * 200, 18 + rnd() * 46, 12 + rnd() * 26, rnd() * 3, 0, 7);
      g.fill();
    }
    // Polar ice
    g.globalAlpha = 0.9; g.fillStyle = '#eef4ff';
    g.fillRect(0, 0, 512, 9); g.fillRect(0, 247, 512, 9);
    // Clouds
    for (let i = 0; i < 30; i++) {
      g.globalAlpha = 0.35;
      g.beginPath();
      g.ellipse(rnd() * 512, rnd() * 256, 30 + rnd() * 40, 6 + rnd() * 8, 0, 0, 7);
      g.fill();
    }
    // Deserts (tan patches near equator)
    g.fillStyle = '#c9a86a'; g.globalAlpha = 0.5;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.ellipse(rnd() * 512, 90 + rnd() * 80, 20 + rnd() * 30, 10 + rnd() * 14, 0, 0, 7);
      g.fill();
    }
  } else {
    // Rocky / cratered
    for (let i = 0; i < 220; i++) {
      g.globalAlpha = 0.05 + rnd() * 0.12;
      g.fillStyle = rnd() > 0.5 ? o.dark : '#ffffff';
      g.beginPath();
      g.arc(rnd() * 512, rnd() * 256, 3 + rnd() * 22, 0, 7);
      g.fill();
    }
    // Polar caps for mars-like
    if (o.base.startsWith('#c1') || o.base.startsWith('#c8')) {
      g.globalAlpha = 0.7; g.fillStyle = '#f0e8e0';
      g.beginPath(); g.ellipse(256, 12, 90, 12, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(256, 244, 80, 10, 0, 0, 7); g.fill();
    }
  }
  g.globalAlpha = 1;
  return done(cv);
}

/** Sun surface with granulation. */
export function sunTex(): THREE.CanvasTexture {
  const [cv, g] = newCanvas(512, 256);
  g.fillStyle = '#ffb347'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 1400; i++) {
    g.globalAlpha = 0.06 + Math.random() * 0.13;
    g.fillStyle = Math.random() > 0.5 ? '#fff3c4' : '#ff8a2a';
    g.beginPath();
    g.arc(Math.random() * 512, Math.random() * 256, 2 + Math.random() * 9, 0, 7);
    g.fill();
  }
  // Sunspots
  g.globalAlpha = 0.5; g.fillStyle = '#5a2a10';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.ellipse(Math.random() * 512, 80 + Math.random() * 100, 8 + Math.random() * 14, 5 + Math.random() * 8, 0, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  return done(cv);
}

/** Soft radial glow sprite (sun corona, etc.). */
export function glowTex(rgb: number[] = [255, 240, 205]): THREE.CanvasTexture {
  const [cv, g] = newCanvas(256, 256);
  const rg = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  rg.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
  rg.addColorStop(0.18, 'rgba(255,190,110,.55)');
  rg.addColorStop(0.5, 'rgba(245,140,50,.16)');
  rg.addColorStop(1, 'rgba(245,120,30,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 256, 256);
  return done(cv);
}

/** Zodiacal light cone texture. */
export function zodiTex(): THREE.CanvasTexture {
  const [cv, g] = newCanvas(512, 512);
  const rg = g.createRadialGradient(256, 256, 6, 256, 256, 256);
  rg.addColorStop(0, 'rgba(255,244,222,.85)');
  rg.addColorStop(0.12, 'rgba(255,236,206,.34)');
  rg.addColorStop(0.35, 'rgba(250,224,190,.14)');
  rg.addColorStop(0.7, 'rgba(240,215,185,.05)');
  rg.addColorStop(1, 'rgba(235,210,180,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 512, 512);
  return done(cv);
}

/** Saturn-style ring texture with Cassini division + finer banding. */
export function ringTex(): THREE.CanvasTexture {
  const [cv, g] = newCanvas(512, 512);
  // Base radial gradient with many fine bands
  const rg = g.createRadialGradient(256, 256, 256 * 0.6, 256, 256, 256);
  // [stop, alpha] — sharp dips create the Cassini + Encke-like gaps
  rg.addColorStop(0,    'rgba(228,213,183,0)');
  rg.addColorStop(0.60, 'rgba(228,213,183,0)');
  rg.addColorStop(0.61, 'rgba(232,220,195,0.20)'); // D ring inner
  rg.addColorStop(0.635,'rgba(228,213,183,0.40)');
  rg.addColorStop(0.645,'rgba(120,100,80,0.55)');  // dark band
  rg.addColorStop(0.66, 'rgba(232,220,195,0.62)'); // C ring
  rg.addColorStop(0.70, 'rgba(238,225,200,0.78)'); // B ring (brightest)
  rg.addColorStop(0.745,'rgba(238,225,200,0.78)');
  rg.addColorStop(0.755,'rgba(60,48,38,0.85)');    // ★ Cassini Division (sharp dark gap)
  rg.addColorStop(0.78, 'rgba(60,48,38,0.55)');
  rg.addColorStop(0.80, 'rgba(228,213,183,0.72)'); // A ring
  rg.addColorStop(0.845,'rgba(228,213,183,0.30)');
  rg.addColorStop(0.86, 'rgba(150,130,100,0.50)'); // Encke-like gap
  rg.addColorStop(0.88, 'rgba(228,213,183,0.45)');
  rg.addColorStop(0.93, 'rgba(228,213,183,0.28)');
  rg.addColorStop(0.94, 'rgba(180,160,120,0.08)'); // F ring faint
  rg.addColorStop(1,    'rgba(228,213,183,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 512, 512);
  // Fine ringlet striations (concentric noise)
  g.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 90; i++) {
    const r = 256 * 0.6 + Math.random() * 256 * 0.4;
    g.strokeStyle = `rgba(255,240,210,${0.04 + Math.random() * 0.06})`;
    g.lineWidth = 0.6 + Math.random();
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  return done(cv);
}

/** Thin faint ring texture for Uranus/Neptune. */
export function thinRingTex(base: [number, number, number], innerStop = 0.55): THREE.CanvasTexture {
  const [cv, g] = newCanvas(256, 256);
  const rg = g.createRadialGradient(128, 128, 128 * innerStop, 128, 128, 128);
  rg.addColorStop(0, `rgba(${base[0]},${base[1]},${base[2]},0)`);
  rg.addColorStop(innerStop + 0.02, `rgba(${base[0]},${base[1]},${base[2]},.5)`);
  rg.addColorStop(0.72, `rgba(${base[0]},${base[1]},${base[2]},.25)`);
  rg.addColorStop(0.85, `rgba(${base[0]},${base[1]},${base[2]},.45)`);
  rg.addColorStop(1, `rgba(${base[0]},${base[1]},${base[2]},0)`);
  g.fillStyle = rg;
  g.fillRect(0, 0, 256, 256);
  return done(cv);
}

/** Star flare / lens-spike sprite. */
export function flareTex(): THREE.CanvasTexture {
  const [cv, g] = newCanvas(256, 256);
  g.translate(128, 128);
  for (const rot of [0, Math.PI / 2]) {
    g.save(); g.rotate(rot); g.scale(1, 0.035); blob(g, 0, 0, 120, [255,255,255], 0.55); g.restore();
  }
  g.save(); g.rotate(0.62); g.scale(1, 0.03); blob(g, 0, 0, 72, [255,255,255], 0.22); g.restore();
  g.save(); g.rotate(-0.62); g.scale(1, 0.03); blob(g, 0, 0, 72, [255,255,255], 0.22); g.restore();
  blob(g, 0, 0, 44, [255,255,255], 0.95);
  blob(g, 0, 0, 18, [255,255,255], 1);
  return done(cv);
}

/** Soft round dot (sky-mark for planets). */
export function softTex(rgb: number[]): THREE.CanvasTexture {
  const [cv, g] = newCanvas(128, 128);
  blob(g, 64, 64, 62, rgb, 0.9);
  blob(g, 64, 64, 26, [255,255,255], 0.55);
  return done(cv);
}

/** Nebula / galaxy / cluster sprite texture. */
export function nebulaTex(kind: string, c1: number[], c2: number[]): THREE.CanvasTexture {
  const [cv, g] = newCanvas(256, 256);
  const R = (s: number) => (Math.random() - 0.5) * s;
  g.globalCompositeOperation = 'lighter';
  if (kind === 'galaxy') {
    g.save(); g.translate(128, 128); g.scale(1, 0.5); g.rotate(0.5);
    for (let i = 0; i < 26; i++) blob(g, R(60), R(40), 26 + Math.random() * 34, i % 3 ? c1 : c2, 0.05);
    for (let arm = 0; arm < 2; arm++)
      for (let i = 0; i < 26; i++) {
        const a = arm * Math.PI + i * 0.22, r = 12 + i * 3.4;
        blob(g, Math.cos(a) * r * 1.5, Math.sin(a) * r, 12 + Math.random() * 14, i % 4 ? c1 : c2, 0.07);
      }
    g.restore();
    blob(g, 128, 128, 34, [255,245,225], 0.55);
    blob(g, 128, 128, 14, [255,255,240], 0.7);
  } else if (kind === 'cluster') {
    for (let i = 0; i < 150; i++) {
      const a = Math.random() * 7, r = Math.pow(Math.random(), 0.6) * 78;
      blob(g, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2 + Math.random() * 6,
        i % 3 ? c1 : c2, 0.35 + Math.random() * 0.5);
    }
  } else if (kind === 'planetary') {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * 7, r = 30 + Math.random() * 44;
      blob(g, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 22 + Math.random() * 26, i % 2 ? c1 : c2, 0.08);
    }
    blob(g, 128, 128, 30, c1, 0.12);
  } else {
    for (let i = 0; i < 40; i++)
      blob(g, 128 + R(90), 128 + R(80), 24 + Math.random() * 58, Math.random() > 0.4 ? c1 : c2, 0.05 + Math.random() * 0.07);
    for (let i = 0; i < 10; i++) blob(g, 128 + R(50), 128 + R(46), 12 + Math.random() * 26, [255,255,255], 0.05);
  }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 22; i++) blob(g, 128 + R(180), 128 + R(180), 26 + Math.random() * 46, [0,0,0], 0.10);
  for (let i = 0; i < 8; i++) blob(g, 128 + R(120), 128 + R(8), 60 + Math.random() * 50, [0,0,0], 0.22);
  return done(cv);
}

/** Full-sky Milky Way band texture. */
export function milkyWayTex(): THREE.CanvasTexture {
  const [cv, g] = newCanvas(2048, 1024);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * 2048;
    const bulge = Math.exp(-Math.pow((x - 1024) / 280, 2));
    const w = 32 + 78 * bulge + 24 * Math.pow(Math.sin(x * 0.013), 2);
    const y = 512 + Math.sin(x * 0.004) * 24 + (Math.random() - 0.5) * w * 2.6;
    const d = Math.abs(y - 512 - Math.sin(x * 0.004) * 24) / w;
    if (d > 1.7) continue;
    const a = Math.exp(-d * d * 1.5) * (0.03 + 0.06 * bulge) * (0.35 + Math.random() * 0.65);
    blob(g, x, y, 18 + Math.random() * 74, bulge > 0.45 && Math.random() > 0.4 ? [255,232,205] : [214,214,255], a);
  }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 620; i++) {
    const x = Math.random() * 2048;
    const y = 512 + Math.sin(x * 0.004) * 24 + (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 26);
    blob(g, x, y, 12 + Math.random() * 44, [0,0,0], 0.07 + Math.random() * 0.16);
  }
  return done(cv);
}

/** Galaxy sprite for cosmic-view (spiral/elliptical/irregular). */
export function galaxySpriteTex(type: string, c1: number[], c2: number[]): THREE.CanvasTexture {
  const [cv, g] = newCanvas(256, 256);
  g.globalCompositeOperation = 'lighter';
  if (type === 'spiral') {
    g.save(); g.translate(128, 128); g.scale(1, 0.42); g.rotate(0.6);
    // Luminous spiral arms (additive)
    for (let arm = 0; arm < 2; arm++)
      for (let i = 0; i < 30; i++) {
        const a = arm * Math.PI + i * 0.2, r = 8 + i * 3.6;
        blob(g, Math.cos(a) * r * 1.6, Math.sin(a) * r, 10 + Math.random() * 14, i % 4 ? c1 : c2, 0.06);
      }
    // Dark dust lanes along the inner arms (carve out luminance, like M31/M51)
    g.globalCompositeOperation = 'destination-out';
    for (let arm = 0; arm < 2; arm++)
      for (let i = 0; i < 20; i++) {
        const a = arm * Math.PI + i * 0.22 + 0.18, r = 16 + i * 3.4;
        blob(g, Math.cos(a) * r * 1.6, Math.sin(a) * r, 7 + Math.random() * 7, [0,0,0], 0.22);
      }
    g.globalCompositeOperation = 'lighter';
    g.restore();
    // Bright nucleus + bulge on top
    blob(g, 128, 128, 40, [255,245,225], 0.6);
    blob(g, 128, 128, 16, [255,255,240], 0.85);
  } else if (type === 'elliptical' || type === 'lenticular') {
    g.save(); g.translate(128, 128); g.scale(1, 0.7);
    for (let i = 0; i < 26; i++) blob(g, 0, 0, 100 - i * 3.5, c1, 0.04);
    g.restore();
    blob(g, 128, 128, 30, [255,245,225], 0.5);
  } else if (type === 'dwarf') {
    blob(g, 128, 128, 70, c1, 0.18);
    blob(g, 128, 128, 30, c2, 0.25);
    for (let i = 0; i < 30; i++) blob(g, 128 + (Math.random()-0.5)*100, 128 + (Math.random()-0.5)*100, 6 + Math.random()*10, c2, 0.2);
  } else {
    // irregular
    for (let i = 0; i < 36; i++)
      blob(g, 128 + (Math.random()-0.5)*120, 128 + (Math.random()-0.5)*80, 16 + Math.random()*36, Math.random()>0.5?c1:c2, 0.07);
    blob(g, 128, 128, 26, [255,245,225], 0.35);
  }
  return done(cv);
}

/**
 * Real-photo channel (reserved). The cosmic-view builders are procedural by design, but
 * for famous, well-imaged objects you can drop a face-on photo into /public/cosmos/
 * (e.g. M31.jpg, M51.jpg) and register it here. When an entry exists the builder swaps the
 * sprite's map to the photo (true colours) instead of the procedural blob — no network is
 * touched while the map is empty, so the app stays fully offline by default.
 */
export const REAL_BODY_IMAGES: Record<string, string> = {
  // 'M31': '/cosmos/M31.jpg',   // ← example: drop the file in /public/cosmos and uncomment
};

const _realLoader = new THREE.TextureLoader();
/** Returns a real-photo texture for `name` if registered, else null. */
export function realBodyTex(name: string): THREE.Texture | null {
  const url = REAL_BODY_IMAGES[name];
  if (!url) return null;
  const t = _realLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cosmic Microwave Background texture — realistic anisotropy map.
 *  Combines (a) a strong dipole from Solar-system motion relative to the CMB rest frame,
 *  (b) large-scale acoustic peaks (ℓ ≈ 220 first peak), (c) fine-grained Sachs-Wolfe noise.
 *  Color map: cool-blue (cold) → neutral → warm-red (hot), echoing Planck/WMAP colormaps. */
export function cmbTex(): THREE.CanvasTexture {
  const [cv, g] = newCanvas(1024, 512);
  const img = g.createImageData(1024, 512);
  const d = img.data;
  // Value-noise helper (smooth interpolated lattice noise)
  const W = 1024, H = 512;
  const PERM = new Uint8Array(512);
  for (let i = 0; i < 256; i++) PERM[i] = PERM[i + 256] = (Math.random() * 256) | 0;
  const fade = (t: number) => t * t * (3 - 2 * t);
  const grad = (h: number, x: number, y: number) => {
    const u = (h & 1) ? x : -x, v = (h & 2) ? y : -y;
    return u + v;
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  // 2D value noise based on a hashed lattice
  function vnoise(x: number, y: number): number {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const aa = PERM[PERM[xi] + yi], ab = PERM[PERM[xi] + yi + 1];
    const ba = PERM[PERM[xi + 1] + yi], bb = PERM[PERM[xi + 1] + yi + 1];
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
               lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v);
  }
  function fbm(x: number, y: number, oct: number): number {
    let s = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += vnoise(x * freq, y * freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return s / norm; // ~ -1..1
  }

  for (let i = 0; i < W * H; i++) {
    const px = i % W, py = (i / W) | 0;
    // spherical coords (wrapS-friendly): longitude lon = px/W*2π, latitude lat = (py/H - 0.5)*π
    const lon = (px / W) * Math.PI * 2;
    const lat = (py / H - 0.5) * Math.PI;
    // (a) Dipole: direction of motion ≈ (leo, virgo) → galactic coord ~ (264°, 48°).
    // Magnitude ~3.3 mK vs 2.725 K baseline ≈ 0.0012 → exaggerate to ~0.6 for visibility.
    const dDir = Math.sin(lat) * 0.766 + Math.cos(lat) * Math.cos(lon - 4.6); // ~ toward (l=264,b=48)
    const dip = dDir * 0.6;
    // (b) Acoustic peaks: medium-scale structure (first peak ℓ≈220 ≈ ~1° angular)
    const med = fbm(px / 16, py / 16, 4) * 0.35;
    // (c) Fine Sachs-Wolfe / small-scale noise
    const fine = fbm(px / 2.2, py / 2.2, 3) * 0.18;
    const n = dip + med + fine;
    // Colour map: -1..1 → deep-blue → pale → deep-red (Planck-style)
    const t = Math.max(0, Math.min(1, (n + 1) * 0.5));
    let r, gg, b;
    if (t < 0.5) {
      const k = t * 2;
      r = lerp(20, 120, k); gg = lerp(40, 90, k); b = lerp(110, 150, k);
    } else {
      const k = (t - 0.5) * 2;
      r = lerp(180, 220, k); gg = lerp(80, 140, k); b = lerp(80, 70, k);
    }
    d[i * 4] = r | 0; d[i * 4 + 1] = gg | 0; d[i * 4 + 2] = b | 0; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = done(cv);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Earth night-side city-lights texture (yellow speckles on black, land-band biased). */
export function earthNightTex(): THREE.CanvasTexture {
  const [cv, g] = newCanvas(512, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 256);
  // City clusters concentrated in mid-latitudes (50–210 y, away from poles)
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 512;
    const y = 50 + Math.random() * 160;
    const r = Math.random();
    // Big cities brighter & bigger; most are tiny
    const sz = r > 0.97 ? 2.2 : r > 0.85 ? 1.4 : 0.8;
    const a = r > 0.97 ? 0.95 : r > 0.85 ? 0.6 : 0.35;
    const warm = Math.random() > 0.3 ? '#ffd98a' : '#ffcaa0';
    g.fillStyle = warm;
    g.globalAlpha = a;
    g.beginPath();
    g.arc(x, y, sz, 0, 7);
    g.fill();
    // halo
    g.globalAlpha = a * 0.3;
    g.beginPath();
    g.arc(x, y, sz * 2.4, 0, 7);
    g.fill();
  }
  // A few great megalopolis glows
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.5;
    g.fillStyle = '#ffe9b0';
    g.beginPath();
    g.arc(Math.random() * 512, 70 + Math.random() * 120, 6, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  return done(cv);
}

export interface PlanetMatOpts {
  night?: THREE.Texture;     // optional night-lights texture (Earth)
  nightBoost?: number;       // 0 = plain dark night, >0 = show night texture
  twilight?: [number, number, number]; // RGB tint at terminator
  ambient?: number;          // min brightness of night side
}

/** Custom ShaderMaterial for planets: day/night terminator + twilight + optional city lights.
 *  uSunDir is world-space (planet → sun), updated each frame by the engine. */
export function makePlanetMaterial(dayTex: THREE.Texture, opts: PlanetMatOpts = {}): THREE.ShaderMaterial {
  const twilight = opts.twilight ?? [255, 130, 70];
  const uniforms: Record<string, THREE.IUniform> = {
    uDay: { value: dayTex },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uTwilight: { value: new THREE.Vector3(twilight[0] / 255, twilight[1] / 255, twilight[2] / 255) },
    uNightBoost: { value: opts.nightBoost ?? 0 },
    uAmbient: { value: opts.ambient ?? 0.04 },
  };
  if (opts.night) uniforms.uNight = { value: opts.night };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vNormalW;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uDay;
      ${opts.night ? 'uniform sampler2D uNight;' : ''}
      uniform vec3 uSunDir;
      uniform vec3 uTwilight;
      uniform float uNightBoost;
      uniform float uAmbient;
      varying vec3 vNormalW;
      varying vec2 vUv;
      void main(){
        float d = dot(normalize(vNormalW), normalize(uSunDir));
        // smooth lit factor: dark below -0.05, full above 0.30
        float day = smoothstep(-0.05, 0.30, d);
        vec3 col = texture2D(uDay, vUv).rgb;
        // twilight band centred near terminator
        float tw = exp(-pow((d - 0.10) * 5.5, 2.0)) * step(d, 0.35);
        vec3 night = col * uAmbient;
        ${opts.night ? 'night += texture2D(uNight, vUv).rgb * uNightBoost * (1.0 - day);' : ''}
        vec3 finalCol = mix(night, col, day);
        finalCol += uTwilight * tw * 0.45;
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `,
  });
}

/** Atmospheric Rayleigh-scattering rim — a slightly-larger sphere with a Fresnel shader
 *  that glows at the limb, brighter on the day side and tinted by the planet's air.
 *  uSunDir is world-space (planet → sun), updated each frame. */
export function makeAtmosphereMaterial(rgb: [number, number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Vector3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255) },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main(){
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform vec3 uSunDir;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main(){
        vec3 n = normalize(vNormalW);
        vec3 viewDir = normalize(cameraPosition - vPosW);
        // Fresnel: strongest at the limb (edge), where view grazes the surface
        float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        // Day-side boost: rim brighter where the limb is also sunlit
        float lit = max(dot(n, normalize(uSunDir)), 0.0);
        float intensity = fres * (0.35 + 0.65 * lit);
        // Slight blue-shift on the limb facing away from sun (Rayleigh-like forward scatter)
        vec3 col = uColor * intensity;
        gl_FragColor = vec4(col, intensity * 0.9);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
}

