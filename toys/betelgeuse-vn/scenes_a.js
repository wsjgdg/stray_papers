/* =========================================================================
 * scenes_a.js — Canvas 2D atmosphere renderers for the visual-novel showcase.
 *
 * Registers on window.VN_SCENES (merge-safe with scenes_b.js):
 *   observatory_night  旧天文台·圆顶   starfield / milky way / meteors / ridge
 *   streets_rain       雨夜·环山公路   rain / splashes / neon / wet road
 *   server_room        地下·机房       rack corridor / LEDs / light sweep
 *   finale_star        夜空·参宿四     betelgeuse / starfield / push-in / dome
 *
 * Contract: init(ctx, w, h) seeds every random value with a fixed-seed
 * mulberry32 PRNG (identical composition on every activation) and pre-renders
 * expensive static layers offscreen; draw(ctx, w, h, t, dt) advances and
 * renders each frame. The canvas is transparent — the css base gradient stays
 * visible beneath; everything here is atmosphere painted on top.
 * Vanilla Canvas 2D only: no libraries, no images, no text.
 * ======================================================================= */

(function () {
  'use strict';

  var TAU = Math.PI * 2;

  /* ----------------------------- helpers ----------------------------- */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function frameDt(dt) {
    return typeof dt === 'number' && isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0.016;
  }

  function hash1(n) {
    var s = Math.sin(n) * 43758.5453;
    return s - Math.floor(s);
  }

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  /* ===================== scene 1: observatory_night ===================== */

  var observatory_night = (function () {
    var SEED = 0x08b57ae5;
    var S = null;

    /* 3 depth bands of stars, grouped by colour to minimise style churn */
    function buildStars(w, h, rng) {
      var area = clamp((w * h) / (1280 * 720), 0.5, 2);
      var bands = [
        { n: Math.round(150 * area), rLo: 0.40, rHi: 0.75, aLo: 0.22, aHi: 0.55, sp: 0.55, tsLo: 0.50, tsHi: 1.70 },
        { n: Math.round(80 * area),  rLo: 0.55, rHi: 1.10, aLo: 0.32, aHi: 0.72, sp: 1.15, tsLo: 0.40, tsHi: 1.40 },
        { n: Math.round(38 * area),  rLo: 0.90, rHi: 1.60, aLo: 0.50, aHi: 0.95, sp: 2.10, tsLo: 0.30, tsHi: 1.00 },
      ];
      var palette = ['198,216,255', '255,255,255', '255,224,185'];
      var groups = [[], [], []];
      var near = [];
      for (var b = 0; b < bands.length; b++) {
        var bd = bands[b];
        for (var i = 0; i < bd.n; i++) {
          var roll = rng();
          var st = {
            x: rng() * w,
            y: rng() * h * 0.88,
            r: bd.rLo + rng() * (bd.rHi - bd.rLo),
            a: bd.aLo + rng() * (bd.aHi - bd.aLo),
            tw: rng() * TAU,
            ts: bd.tsLo + rng() * (bd.tsHi - bd.tsLo),
            sp: bd.sp,
          };
          var ci = roll < 0.42 ? 0 : roll < 0.82 ? 1 : 2;
          groups[ci].push(st);
          if (b === 2) near.push(st);
        }
      }
      return { groups: groups, palette: palette, near: near };
    }

    /* milky way: hundreds of additive low-alpha blobs on a padded offscreen,
       drifted almost imperceptibly at draw time */
    function buildNebula(w, h, rng) {
      var pad = 200;
      var cw = w + pad * 2;
      var ch = h + pad * 2;
      var cv = makeCanvas(cw, ch);
      var c = cv.getContext('2d');
      var ang = -0.40;
      var dx = Math.cos(ang);
      var dy = Math.sin(ang);
      var px = -dy;
      var py = dx;
      var L = Math.sqrt(w * w + h * h) / 2 + pad;
      var halfW = h * 0.20 + 40;
      var i, s, p, x, y, r, a, g;
      c.globalCompositeOperation = 'lighter';
      for (i = 0; i < 230; i++) {
        s = (rng() * 2 - 1) * L;
        p = ((rng() + rng() + rng() + rng()) / 4 * 2 - 1) * halfW;
        x = cw / 2 + dx * s + px * p;
        y = ch / 2 + dy * s + py * p;
        r = 26 + rng() * 72;
        var col = rng() < 0.12 ? [255, 224, 190] : [172, 192, 255];
        a = 0.012 + rng() * 0.028;
        g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(col, a.toFixed(3)));
        g.addColorStop(1, rgba(col, '0'));
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      /* dark dust lane carved along the centreline */
      c.globalCompositeOperation = 'destination-out';
      for (i = 0; i < 26; i++) {
        s = (rng() * 2 - 1) * L * 0.9;
        p = (rng() - 0.5) * halfW * 0.35;
        x = cw / 2 + dx * s + px * p;
        y = ch / 2 + dy * s + py * p;
        r = 16 + rng() * 34;
        a = 0.05 + rng() * 0.06;
        g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(3) + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      return { cv: cv, pad: pad };
    }

    /* mountain ridge + observatory dome silhouette, pre-rendered once */
    function buildSilhouette(w, h, rng) {
      var hSi = Math.round(h * 0.30);
      var cv = makeCanvas(w, hSi);
      var c = cv.getContext('2d');
      var N = 16;
      var ys = [];
      for (var i = 0; i <= N; i++) {
        ys.push(hSi * (0.50 + 0.14 * Math.sin(i * 0.9 + 1.2) + 0.09 * Math.sin(i * 2.17 + 0.4) + (rng() - 0.5) * 0.07));
      }
      /* distant (bluer, higher) ridge */
      c.fillStyle = 'rgba(16,24,42,0.55)';
      c.beginPath();
      c.moveTo(0, hSi);
      for (i = 0; i <= N; i++) c.lineTo((i / N) * w, ys[i] - hSi * 0.17 - (i % 2) * hSi * 0.03);
      c.lineTo(w, hSi);
      c.closePath();
      c.fill();
      /* main ridge */
      c.fillStyle = 'rgba(5,8,16,0.94)';
      c.beginPath();
      c.moveTo(0, hSi);
      for (i = 0; i <= N; i++) c.lineTo((i / N) * w, ys[i]);
      c.lineTo(w, hSi);
      c.closePath();
      c.fill();

      /* observatory dome on a local peak */
      var xd = w * 0.64;
      var fi = (xd / w) * N;
      var i0 = Math.min(Math.floor(fi), N - 1);
      var fr = fi - i0;
      var ry = ys[i0] * (1 - fr) + ys[i0 + 1] * fr;
      var wd = Math.max(18, hSi * 0.17);
      var bh = hSi * 0.20;
      var dr = hSi * 0.135;
      var bx = xd - wd / 2;
      var byTop = ry - bh;
      c.fillStyle = 'rgba(5,8,16,0.96)';
      c.fillRect(bx, byTop, wd, ry - byTop + 2);
      c.beginPath();
      c.arc(xd, byTop, dr, Math.PI, 0);
      c.closePath();
      c.fill();
      /* slit of warm light leaking from the dome */
      var scy = byTop - dr * 0.30;
      c.save();
      c.translate(xd, scy);
      c.rotate(-0.30);
      c.fillStyle = 'rgba(255,190,120,0.22)';
      c.fillRect(-dr * 0.11, -dr * 1.05, dr * 0.22, dr * 1.2);
      c.fillStyle = 'rgba(255,205,140,0.85)';
      c.fillRect(-dr * 0.04, -dr * 1.0, dr * 0.08, dr * 1.1);
      c.restore();
      /* warm windows on the base */
      c.fillStyle = 'rgba(255,200,140,0.5)';
      c.fillRect(bx + wd * 0.22, byTop + bh * 0.4, 2, 2);
      c.fillRect(bx + wd * 0.66, byTop + bh * 0.62, 2, 2);
      return { cv: cv, hSi: hSi, slitX: xd, slitY: h - hSi + byTop - dr * 0.6, slitR: dr * 1.7 };
    }

    function init(ctx, w, h) {
      var rng = mulberry32(SEED);
      S = { w: w, h: h, rng: rng };
      S.stars = buildStars(w, h, rng);
      S.neb = buildNebula(w, h, rng);
      S.sil = buildSilhouette(w, h, rng);
      S.shoots = [];
      S.nextShoot = 2 + rng() * 3;
    }

    function spawnShoot(t) {
      var rng = S.rng;
      var dir = rng() < 0.5 ? -1 : 1;
      var vx = dir * (520 + rng() * 420);
      var vy = 260 + rng() * 240;
      S.shoots.push({
        born: t,
        x0: S.w * (0.12 + rng() * 0.72),
        y0: S.h * (0.05 + rng() * 0.22),
        vx: vx,
        vy: vy,
        ln: Math.sqrt(vx * vx + vy * vy),
        life: 0.8 + rng() * 0.5,
        trail: 80 + rng() * 80,
      });
      S.nextShoot = t + 6 + rng() * 6;
    }

    function draw(ctx, w, h, t, dt) {
      if (!S) return;
      if (w !== S.w || h !== S.h) init(ctx, w, h);
      dt = frameDt(dt);

      ctx.clearRect(0, 0, w, h);

      /* milky way band, wandering almost imperceptibly */
      var wobX = Math.sin(t * 0.011) * 22 + Math.sin(t * 0.023) * 8;
      var wobY = Math.cos(t * 0.009) * 16;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(S.neb.cv, -S.neb.pad + wobX, -S.neb.pad + wobY);
      ctx.globalCompositeOperation = 'source-over';

      /* starfield with per-star twinkle + parallax drift */
      var G = S.stars.groups;
      var P = S.stars.palette;
      var g, i, st, x, a;
      for (g = 0; g < 3; g++) {
        var arr = G[g];
        if (!arr.length) continue;
        ctx.fillStyle = 'rgb(' + P[g] + ')';
        for (i = 0; i < arr.length; i++) {
          st = arr[i];
          x = (st.x + t * st.sp) % w;
          a = st.a * (0.62 + 0.38 * Math.sin(t * st.ts + st.tw));
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(x, st.y, st.r, 0, TAU);
          ctx.fill();
        }
      }
      /* soft halo pass on the nearest band only */
      var near = S.stars.near;
      ctx.fillStyle = 'rgb(220,232,255)';
      for (i = 0; i < near.length; i++) {
        st = near[i];
        x = (st.x + t * st.sp) % w;
        a = st.a * (0.62 + 0.38 * Math.sin(t * st.ts + st.tw));
        ctx.globalAlpha = a * 0.16;
        ctx.beginPath();
        ctx.arc(x, st.y, st.r * 3, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* shooting stars every 6-12s */
      if (t >= S.nextShoot) spawnShoot(t);
      ctx.globalCompositeOperation = 'lighter';
      for (i = S.shoots.length - 1; i >= 0; i--) {
        var sh = S.shoots[i];
        var age = t - sh.born;
        if (age > sh.life) {
          S.shoots.splice(i, 1);
          continue;
        }
        var sx = sh.x0 + sh.vx * age;
        var sy = sh.y0 + sh.vy * age;
        var fade = clamp((sh.life - age) / 0.3, 0, 1);
        var grow = clamp(age * 6, 0, 1);
        var L = sh.trail * grow * fade;
        var tx = sx - (sh.vx / sh.ln) * L;
        var ty = sy - (sh.vy / sh.ln) * L;
        var al = fade * clamp(age * 10, 0, 1) * 0.9;
        var lg = ctx.createLinearGradient(sx, sy, tx, ty);
        lg.addColorStop(0, 'rgba(255,255,255,' + al.toFixed(3) + ')');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = lg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        var hg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 3);
        hg.addColorStop(0, 'rgba(255,255,255,' + (al * 0.9).toFixed(3) + ')');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
      }
      ctx.globalCompositeOperation = 'source-over';

      /* horizon silhouettes */
      ctx.drawImage(S.sil.cv, 0, h - S.sil.hSi);

      /* breathing glow at the dome slit */
      ctx.globalCompositeOperation = 'lighter';
      var ga = 0.10 + 0.05 * Math.sin(t * 1.6);
      var gg = ctx.createRadialGradient(S.sil.slitX, S.sil.slitY, 0, S.sil.slitX, S.sil.slitY, S.sil.slitR);
      gg.addColorStop(0, 'rgba(255,190,120,' + ga.toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(S.sil.slitX - S.sil.slitR, S.sil.slitY - S.sil.slitR, S.sil.slitR * 2, S.sil.slitR * 2);
      ctx.globalCompositeOperation = 'source-over';
    }

    return { init: init, draw: draw };
  })();

  /* ======================= scene 2: streets_rain ======================= */

  var streets_rain = (function () {
    var SEED = 0x5a17a1;
    var S = null;

    function buildBokehSprites() {
      var cols = [
        [255, 196, 120],
        [150, 210, 255],
        [255, 150, 190],
        [255, 230, 180],
        [140, 255, 220],
        [255, 255, 255],
      ];
      return cols.map(function (c) {
        var cv = makeCanvas(64, 64);
        var x = cv.getContext('2d');
        var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, rgba(c, '0.85'));
        g.addColorStop(0.4, rgba(c, '0.35'));
        g.addColorStop(1, rgba(c, '0'));
        x.fillStyle = g;
        x.fillRect(0, 0, 64, 64);
        return cv;
      });
    }

    /* soft vertical gradient strip, blitted in wobbling slices as the
       mirrored neon reflection on the wet road */
    function buildSmear(colStr, rw, rh) {
      var cv = makeCanvas(rw, rh);
      var c = cv.getContext('2d');
      var g = c.createLinearGradient(0, 0, 0, rh);
      g.addColorStop(0, 'rgba(' + colStr + ',0.5)');
      g.addColorStop(0.5, 'rgba(' + colStr + ',0.18)');
      g.addColorStop(1, 'rgba(' + colStr + ',0)');
      c.fillStyle = g;
      c.fillRect(0, 0, rw, rh);
      return cv;
    }

    function init(ctx, w, h) {
      var rng = mulberry32(SEED);
      S = { w: w, h: h, rng: rng };
      S.gyFar = Math.round(h * 0.735);
      S.gyNear = Math.round(h * 0.80);

      /* distant city bokeh */
      var sprites = buildBokehSprites();
      S.bokeh = [];
      for (var i = 0; i < 22; i++) {
        S.bokeh.push({
          x: rng() * (w + 40) - 20,
          y: h * (0.30 + rng() * 0.30),
          r: 4 + rng() * 11,
          spr: sprites[Math.floor(rng() * sprites.length)],
          a0: 0.10 + rng() * 0.13,
          bs: 0.3 + rng() * 0.7,
          bp: rng() * TAU,
          dx: (rng() - 0.5) * 5,
          dy: (rng() - 0.5) * 2.2,
        });
      }

      /* rain: two depth layers, two alpha buckets each (batched strokes) */
      var area = clamp((w * h) / (1280 * 720), 0.78, 1.28);
      var mkLayer = function (n, far) {
        var buckets = [[], []];
        for (var j = 0; j < n; j++) {
          var bk = rng() < 0.5 ? 0 : 1;
          buckets[bk].push({
            x: rng() * (w + 200) - 100,
            y: rng() * h,
            spd: far ? 360 + rng() * 180 : 680 + rng() * 280,
            len: far ? 8 + rng() * 7 : 16 + rng() * 14,
            jp: rng() * TAU,
            js: 1.1 + rng() * 2.2,
          });
        }
        return buckets;
      };
      S.farA = [0.09, 0.15];
      S.nearA = [0.16, 0.28];
      S.far = mkLayer(Math.round(245 * area), true);
      S.near = mkLayer(Math.round(145 * area), false);

      /* neon signs */
      S.haloR = clamp(Math.min(w, h) * 0.12, 40, 150);
      S.pink = { x: w * 0.80, y: h * 0.13, halo: '255,95,175', core: '255,160,205', s1: 1.3, s2: 3.7, hp: 0.0, cp: 1.1 };
      S.cyan = { x: w * 0.16, y: h * 0.24, halo: '95,220,255', core: '170,240,255', s1: 0.9, s2: 2.9, hp: 2.1, cp: 3.6 };
      S.smearP = buildSmear('255,110,185', Math.round(S.haloR * 1.15), h - S.gyFar);
      S.smearC = buildSmear('100,225,255', Math.round(S.haloR * 1.15), h - S.gyFar);

      S.spl = [];
    }

    function splash(x, y, big) {
      if (S.spl.length >= 110) return;
      var rng = S.rng;
      S.spl.push({
        x: x,
        y: y + rng() * 5,
        r: big ? 4 + rng() * 8 : 2.2 + rng() * 3.2,
        life: 0.16 + rng() * 0.12,
        age: 0,
        a: big ? 0.42 : 0.24,
      });
    }

    function neonAlpha(t, n) {
      /* occasional one-frame dim */
      var fl = hash1(Math.floor(t * 30) + n.hp) < 0.035 ? 0.4 : 1;
      return (0.30 + 0.16 * Math.sin(t * n.s1 + n.hp) + 0.08 * Math.sin(t * n.s2 + n.cp)) * fl;
    }

    function drawNeon(ctx, n, a) {
      if (a <= 0) return;
      var r = S.haloR;
      var g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
      g.addColorStop(0, 'rgba(' + n.halo + ',' + (a * 0.5).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + n.halo + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2);
      var r2 = r * 0.34;
      var g2 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r2);
      g2.addColorStop(0, 'rgba(' + n.core + ',' + Math.min(1, a * 1.05).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(' + n.core + ',0)');
      ctx.fillStyle = g2;
      ctx.fillRect(n.x - r2, n.y - r2, r2 * 2, r2 * 2);
    }

    function drawSmear(ctx, spr, cx, a, t, seed) {
      if (a <= 0) return;
      var rw = spr.width;
      var rh = spr.height;
      var seg = rh / 3;
      for (var i = 0; i < 3; i++) {
        var wob = Math.sin(t * 2.0 + seed + i * 1.9) * 3;
        ctx.globalAlpha = clamp(a * (1 - i * 0.2), 0, 1);
        ctx.drawImage(spr, 0, i * seg, rw, seg, cx - rw / 2 + wob, S.gyFar - 1 + i * seg, rw, seg + 1);
      }
      ctx.globalAlpha = 1;
    }

    function drawRainLayer(ctx, buckets, alphas, lw, slant, t, dt, gy, isFar, w, rng) {
      ctx.lineWidth = lw;
      for (var bk = 0; bk < 2; bk++) {
        var drops = buckets[bk];
        if (!drops.length) continue;
        ctx.strokeStyle = 'rgba(185,212,240,' + alphas[bk] + ')';
        ctx.beginPath();
        for (var i = 0; i < drops.length; i++) {
          var d = drops[i];
          var a = slant + Math.sin(t * d.js + d.jp) * 0.02;
          var sa = Math.sin(a);
          var ca = Math.cos(a);
          d.y += d.spd * ca * dt;
          d.x += d.spd * sa * dt;
          if (d.y > gy) {
            if (isFar) {
              if (rng() < 0.3) splash(d.x, gy, false);
            } else {
              splash(d.x, gy, true);
            }
            d.y = -d.len - rng() * 60;
            d.x = rng() * (w + 200) - 100;
          }
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - sa * d.len, d.y - ca * d.len);
        }
        ctx.stroke();
      }
    }

    function draw(ctx, w, h, t, dt) {
      if (!S) return;
      if (w !== S.w || h !== S.h) init(ctx, w, h);
      dt = frameDt(dt);

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';

      /* wind gusts: slow global oscillation + per-drop jitter downstream */
      var slant = Math.sin(t * 0.13) * 0.10 + Math.sin(t * 0.047 + 2) * 0.06;
      var rng = S.rng;
      var i, b;

      /* distant city bokeh: drifting, breathing */
      var yMin = h * 0.28;
      var yMax = h * 0.62;
      var span = yMax - yMin;
      for (i = 0; i < S.bokeh.length; i++) {
        b = S.bokeh[i];
        var bx = ((b.x + t * b.dx + 20) % (w + 40) + (w + 40)) % (w + 40) - 20;
        var by = yMin + ((((b.y + t * b.dy) - yMin) % span) + span) % span;
        var ba = b.a0 * (0.72 + 0.28 * Math.sin(t * b.bs + b.bp));
        var s4 = b.r * 5;
        ctx.globalAlpha = ba;
        ctx.drawImage(b.spr, bx - s4 / 2, by - s4 / 2, s4, s4);
      }
      ctx.globalAlpha = 1;

      /* wet road base */
      var gg = ctx.createLinearGradient(0, S.gyFar, 0, h);
      gg.addColorStop(0, 'rgba(140,175,215,0.10)');
      gg.addColorStop(0.5, 'rgba(90,120,160,0.05)');
      gg.addColorStop(1, 'rgba(60,85,120,0.02)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, S.gyFar, w, h - S.gyFar);

      /* far rain (behind the neon) */
      drawRainLayer(ctx, S.far, S.farA, 1, slant, t, dt, S.gyFar, true, w, rng);

      /* neon glow + mirrored smears on the road */
      var fA = neonAlpha(t, S.pink);
      var cA = neonAlpha(t, S.cyan);
      ctx.globalCompositeOperation = 'lighter';
      drawNeon(ctx, S.pink, fA);
      drawNeon(ctx, S.cyan, cA);
      drawSmear(ctx, S.smearP, S.pink.x, fA * 0.55, t, 0.0);
      drawSmear(ctx, S.smearC, S.cyan.x, cA * 0.55, t, 2.3);
      ctx.globalCompositeOperation = 'source-over';

      /* near rain (in front of the neon) */
      drawRainLayer(ctx, S.near, S.nearA, 1.6, slant, t, dt, S.gyNear, false, w, rng);

      /* splash rings */
      if (S.spl.length) {
        ctx.strokeStyle = 'rgb(190,215,245)';
        ctx.lineWidth = 1;
        for (i = S.spl.length - 1; i >= 0; i--) {
          var sp = S.spl[i];
          sp.age += dt;
          if (sp.age >= sp.life) {
            S.spl.splice(i, 1);
            continue;
          }
          var p = sp.age / sp.life;
          var rx = sp.r * (0.25 + 0.75 * p);
          ctx.globalAlpha = (1 - p) * sp.a;
          ctx.beginPath();
          ctx.ellipse(sp.x, sp.y, rx, rx * 0.32, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    return { init: init, draw: draw };
  })();

  /* ======================= scene 3: server_room ======================= */

  var server_room = (function () {
    var SEED = 0x0c0dec0d;
    var S = null;
    var LED_RGB = [[96, 235, 170], [86, 220, 240], [235, 190, 95]];
    var LED_STR = ['rgb(96,235,170)', 'rgb(86,220,240)', 'rgb(235,190,95)'];

    /* rack corridor static layer: end wall, ceiling wedge, floor, seam lines
       and rack bodies with baked steady-on LEDs, painted far -> near */
    function buildStatic(w, h, rng) {
      var cv = makeCanvas(w, h);
      var c = cv.getContext('2d');
      var cx = w * 0.5;
      var vy = h * 0.40;
      var inOff = w * 0.14;
      var rwN = w * 0.15;
      var tyN = h * 0.12;
      var byN = h * 0.94;
      var KS = [];
      for (var i = 0; i < 5; i++) KS.push(1 / (1 + i * 0.62));

      var cFarY = vy + (tyN - vy) * KS[4];
      var ke = 0.24;
      var ex0 = cx - inOff * ke;
      var ex1 = cx + inOff * ke;
      var et = cFarY;
      var eb = vy + (byN - vy) * ke;

      /* ceiling plane converging to the far end */
      c.fillStyle = 'rgba(4,8,12,0.72)';
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(cx + inOff * KS[4], cFarY);
      c.lineTo(cx - inOff * KS[4], cFarY);
      c.closePath();
      c.fill();

      /* end wall */
      c.fillStyle = 'rgba(3,8,11,0.97)';
      c.fillRect(ex0, et, ex1 - ex0, eb - et);

      /* floor */
      var fg = c.createLinearGradient(0, eb, 0, h);
      fg.addColorStop(0, 'rgba(10,16,20,0.55)');
      fg.addColorStop(1, 'rgba(3,5,8,0.88)');
      c.fillStyle = fg;
      c.fillRect(0, eb, w, h - eb);

      /* converging seam lines (floor + ceiling) */
      c.strokeStyle = 'rgba(90,220,210,0.06)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx - inOff * KS[4], vy + (byN - vy) * KS[4]);
      c.lineTo(cx - inOff, byN);
      c.moveTo(cx + inOff * KS[4], vy + (byN - vy) * KS[4]);
      c.lineTo(cx + inOff, byN);
      c.moveTo(cx - inOff * KS[4], cFarY);
      c.lineTo(cx - inOff, tyN);
      c.moveTo(cx + inOff * KS[4], cFarY);
      c.lineTo(cx + inOff, tyN);
      c.stroke();

      var racks = [];
      var active = null;

      for (i = KS.length - 1; i >= 0; i--) {
        var k = KS[i];
        for (var side = -1; side <= 1; side += 2) {
          var xi = cx + side * inOff * k;
          var rw = rwN * k;
          var x0 = side < 0 ? xi - rw : xi;
          var yt = vy + (tyN - vy) * k;
          var yb = vy + (byN - vy) * k;
          var rh = yb - yt;
          var isActive = i === 0 && side < 0;

          /* rack body */
          var bg = c.createLinearGradient(0, yt, 0, yb);
          bg.addColorStop(0, 'rgba(11,24,30,0.96)');
          bg.addColorStop(1, 'rgba(4,10,14,0.97)');
          c.fillStyle = bg;
          c.fillRect(x0, yt, rw, rh);
          c.strokeStyle = 'rgba(120,230,255,0.09)';
          c.strokeRect(x0 + 0.5, yt + 0.5, rw - 1, rh - 1);
          var fex = side < 0 ? x0 + rw - 1 : x0 + 0.5;
          c.strokeStyle = 'rgba(150,240,255,0.10)';
          c.beginPath();
          c.moveTo(fex, yt + 1);
          c.lineTo(fex, yb - 1);
          c.stroke();
          c.fillStyle = 'rgba(0,0,0,0.5)';
          for (var u = 1; u < 5; u++) c.fillRect(x0, yt + (rh * u) / 5, rw, Math.max(1, 1.2 * k));

          /* LED grid geometry */
          var gx0 = x0 + rw * 0.14;
          var gy0 = yt + rh * 0.08;
          var gw = rw * 0.72;
          var gh = rh * 0.80;
          var cols = 6 + Math.floor(rng() * 3);
          var rows = 9 + Math.floor(rng() * 4);
          var cellW = gw / cols;
          var cellH = gh / rows;
          var sz = Math.max(1.1, 2.1 * k);

          /* region not occluded by nearer racks (for dynamic LEDs) */
          var visL, visR;
          if (side < 0) {
            visL = i === 0 ? x0 : cx - inOff * KS[i - 1];
            visR = xi - 1;
          } else {
            visL = xi + 1;
            visR = i === 0 ? x0 + rw : cx + inOff * KS[i - 1];
          }

          var dyn = [[], [], []];
          var rk = {
            dyn: dyn,
            gx0: gx0,
            gy0: gy0,
            gw: gw,
            gh: gh,
            cols: cols,
            rows: rows,
            cellW: cellW,
            cellH: cellH,
            sz: sz,
          };
          if (isActive) active = rk;

          for (var cc = 0; cc < cols; cc++) {
            for (var rr = 0; rr < rows; rr++) {
              var lx = gx0 + (cc + 0.5) * cellW;
              var ly = gy0 + (rr + 0.5) * cellH;
              var cr = rng();
              var ci = cr < 0.4 ? 0 : cr < 0.8 ? 1 : 2;
              var rgbC = LED_RGB[ci];
              var roll = rng();
              var visible = lx - sz / 2 > visL && lx + sz / 2 < visR;
              if (isActive) {
                if (visible) {
                  dyn[ci].push({
                    x: lx, y: ly, sz: sz,
                    type: roll < 0.5 ? 4 : roll < 0.8 ? 1 : roll < 0.9 ? 2 : 3,
                    ph: rng() * TAU,
                    sp: 1.5 + rng() * 3.5,
                  });
                }
              } else if (roll < 0.55) {
                /* steady-on dim: bake into the static layer */
                c.fillStyle = 'rgba(' + rgbC[0] + ',' + rgbC[1] + ',' + rgbC[2] + ',' + (0.10 + rng() * 0.13).toFixed(3) + ')';
                c.fillRect(lx - sz / 2, ly - sz / 2, sz, sz);
              } else if (visible) {
                dyn[ci].push({
                  x: lx, y: ly, sz: sz,
                  type: roll < 0.85 ? 1 : roll < 0.91 ? 2 : 3,
                  ph: rng() * TAU,
                  sp: 0.8 + rng() * 2.4,
                });
              }
            }
          }
          racks.push(rk);
        }
      }
      return { cv: cv, racks: racks, active: active, cx: cx, et: et, eb: eb, ex0: ex0, ex1: ex1 };
    }

    function init(ctx, w, h) {
      var rng = mulberry32(SEED);
      S = { w: w, h: h, rng: rng };
      S.stat = buildStatic(w, h, rng);
      S.motes = [];
      for (var i = 0; i < 40; i++) {
        S.motes.push({
          x: rng() * w,
          y: rng() * h * 0.96,
          dx: (rng() - 0.5) * 12,
          dy: (rng() - 0.5) * 7,
          ph: rng() * TAU,
          r: 0.7 + rng() * 1.0,
        });
      }
    }

    function draw(ctx, w, h, t, dt) {
      if (!S) return;
      if (w !== S.w || h !== S.h) init(ctx, w, h);
      dt = frameDt(dt);

      ctx.clearRect(0, 0, w, h);

      /* static corridor + baked steady LEDs */
      ctx.drawImage(S.stat.cv, 0, 0);

      /* dynamic LEDs: hash-based blink cycles, per-LED phase + speed */
      var racks = S.stat.racks;
      for (var r = 0; r < racks.length; r++) {
        var rk = racks[r];
        for (var ci = 0; ci < 3; ci++) {
          var list = rk.dyn[ci];
          if (!list.length) continue;
          ctx.fillStyle = LED_STR[ci];
          for (var i = 0; i < list.length; i++) {
            var led = list[i];
            var a;
            if (led.type === 1) a = Math.sin(t * led.sp + led.ph) > 0.15 ? 0.85 : 0.10;
            else if (led.type === 2) a = 0.10 + hash1(t * led.sp * 5.3 + led.ph) * 0.75;
            else if (led.type === 3) a = 0.10 + 0.14 * (0.5 + 0.5 * Math.sin(t * led.sp * 0.6 + led.ph));
            else a = 0.16 + 0.05 * Math.sin(t * 0.8 + led.ph);
            ctx.globalAlpha = a;
            ctx.fillRect(led.x - led.sz / 2, led.y - led.sz / 2, led.sz, led.sz);
          }
        }
      }
      ctx.globalAlpha = 1;

      /* active rack: scrolling brighter light row */
      var ar = S.stat.active;
      var st = S.stat;
      var cc2, prog, rowIdx, rowFrac, cellH, yRow;
      if (ar) {
        prog = t * 1.7;
        rowIdx = Math.floor(prog) % ar.rows;
        rowFrac = prog - Math.floor(prog);
        cellH = ar.gh / ar.rows;
        yRow = ar.gy0 + (rowIdx + 0.5) * cellH;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.08 + 0.07 * (1 - rowFrac);
        ctx.fillStyle = 'rgb(120,255,235)';
        ctx.fillRect(ar.gx0, yRow - cellH * 0.45, ar.gw, cellH * 0.9);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgb(200,255,242)';
        ctx.globalAlpha = 0.5 + 0.45 * (1 - rowFrac);
        for (cc2 = 0; cc2 < ar.cols; cc2++) {
          ctx.fillRect(ar.gx0 + (cc2 + 0.5) * ar.cellW - ar.sz, yRow - ar.sz, ar.sz * 2, ar.sz * 2);
        }
        var prow = (rowIdx - 1 + ar.rows) % ar.rows;
        var yPrev = ar.gy0 + (prow + 0.5) * cellH;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = 'rgb(140,235,220)';
        for (cc2 = 0; cc2 < ar.cols; cc2++) {
          ctx.fillRect(ar.gx0 + (cc2 + 0.5) * ar.cellW - ar.sz * 0.8, yPrev - ar.sz * 0.8, ar.sz * 1.6, ar.sz * 1.6);
        }
        ctx.globalAlpha = 1;
      }

      ctx.globalCompositeOperation = 'lighter';

      /* far-end doorway glow */
      var emid = (st.et + st.eb) / 2;
      var er = (st.ex1 - st.ex0) * 0.9;
      var ea = 0.05 + 0.03 * Math.sin(t * 0.9);
      var eg = ctx.createRadialGradient(st.cx, emid, 0, st.cx, emid, er);
      eg.addColorStop(0, 'rgba(70,235,215,' + ea.toFixed(3) + ')');
      eg.addColorStop(1, 'rgba(70,235,215,0)');
      ctx.fillStyle = eg;
      ctx.fillRect(st.cx - er, emid - er, er * 2, er * 2);

      /* volumetric light band sweeping the corridor every ~9s */
      var per = 9;
      var pr2 = (t % per) / per;
      var env = Math.sin(Math.PI * pr2);
      var bw = w * 0.30;
      var bxx = -bw + (w + 2 * bw) * pr2;
      var sg = ctx.createLinearGradient(bxx, 0, bxx + bw, 0);
      sg.addColorStop(0, 'rgba(110,255,235,0)');
      sg.addColorStop(0.5, 'rgba(110,255,235,' + (0.10 * env).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(110,255,235,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(bxx, 0, bw, h);

      /* dust motes, alpha follows the band position */
      var bc = bxx + bw / 2;
      var sig = bw * 0.55;
      var inv = 1 / (2 * sig * sig);
      ctx.fillStyle = 'rgb(190,255,246)';
      for (var m = 0; m < S.motes.length; m++) {
        var mo = S.motes[m];
        mo.x += mo.dx * dt;
        mo.y += mo.dy * dt;
        if (mo.x < 0) mo.x += w;
        else if (mo.x >= w) mo.x -= w;
        if (mo.y < 0) mo.y += h;
        else if (mo.y >= h) mo.y -= h;
        var dd = mo.x - bc;
        var ma = Math.exp(-dd * dd * inv) * (0.26 + 0.14 * Math.sin(t * 1.3 + mo.ph)) * env;
        if (ma <= 0.01) continue;
        ctx.globalAlpha = ma;
        ctx.fillRect(mo.x - mo.r, mo.y - mo.r, mo.r * 2, mo.r * 2);
      }
      ctx.globalAlpha = 1;

      /* cyan ambient pulse breathing over everything */
      var aa = 0.045 + 0.03 * Math.sin(t * 0.55);
      var ag = ctx.createRadialGradient(st.cx, h * 0.15, 0, st.cx, h * 0.15, Math.max(w, h) * 0.75);
      ag.addColorStop(0, 'rgba(60,225,215,' + aa.toFixed(3) + ')');
      ag.addColorStop(1, 'rgba(60,225,215,0)');
      ctx.fillStyle = ag;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'source-over';
    }

    return { init: init, draw: draw };
  })();

  /* ======================= scene 4: finale_star ======================= */

  var finale_star = (function () {
    var SEED = 0x0be77e11;
    var S = null;

    /* static betelgeuse halo stack: deep red outer -> orange-red mid
       (#ff8c5a), baked once; per-frame breathing is a scaled re-composite */
    function buildHalo(R) {
      var pad = 8;
      var cv = makeCanvas((R + pad) * 2, (R + pad) * 2);
      var c = cv.getContext('2d');
      var cx = R + pad, cy = R + pad;
      var passes = [
        [1.00, [[0, 'rgba(150,42,32,0.30)'], [0.5, 'rgba(142,44,34,0.10)'], [1, 'rgba(150,42,32,0)']]],
        [0.62, [[0, 'rgba(180,54,36,0.30)'], [0.55, 'rgba(168,50,34,0.12)'], [1, 'rgba(178,54,36,0)']]],
        [0.40, [[0, 'rgba(255,140,90,0.50)'], [0.55, 'rgba(255,124,74,0.18)'], [1, 'rgba(255,120,70,0)']]],
        [0.18, [[0, 'rgba(255,196,148,0.55)'], [1, 'rgba(255,180,120,0)']]],
      ];
      c.globalCompositeOperation = 'lighter';
      for (var i = 0; i < passes.length; i++) {
        var r = R * passes[i][0];
        var g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        var stops = passes[i][1];
        for (var j = 0; j < stops.length; j++) g.addColorStop(stops[j][0], stops[j][1]);
        c.fillStyle = g;
        c.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      return { cv: cv, R: R };
    }

    /* white-hot photosphere, baked once; breathes less than the halo */
    function buildCore(r) {
      var pad = 6;
      var cv = makeCanvas((r + pad) * 2, (r + pad) * 2);
      var c = cv.getContext('2d');
      var g = c.createRadialGradient(r + pad, r + pad, 0, r + pad, r + pad, r);
      g.addColorStop(0, 'rgba(255,253,248,1)');
      g.addColorStop(0.25, 'rgba(255,240,220,0.96)');
      g.addColorStop(0.55, 'rgba(255,202,152,0.60)');
      g.addColorStop(1, 'rgba(255,164,104,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, cv.width, cv.height);
      return { cv: cv, r: r };
    }

    /* 90-140 dim twinkling stars; a red-warm tinted handful (8-12) as if
       lit by the supergiant; none inside the star's core disc */
    function buildStars(w, h, sx, sy, coreR, rng) {
      var area = clamp((w * h) / (1280 * 720), 0.5, 2);
      var n = clamp(Math.round(118 * area), 90, 140);
      var nWarm = 8 + Math.floor(rng() * 5);
      var groups = [[], [], []];
      var kill = coreR * 2.6;
      var kill2 = kill * kill;
      for (var i = 0; i < n; i++) {
        var x = rng() * w;
        var y = rng() * h * 0.86;
        var tries = 0;
        while (tries++ < 4) {
          var dx = x - sx;
          var dy = y - sy;
          if (dx * dx + dy * dy > kill2) break;
          x = rng() * w;
          y = rng() * h * 0.86;
        }
        var st = {
          x: x,
          y: y,
          r: 0.35 + rng() * 0.80,
          a: 0.13 + rng() * 0.34, /* capped low: the finale star dominates */
          tw: rng() * TAU,
          ts: 0.40 + rng() * 1.60,
        };
        groups[i < nWarm ? 2 : rng() < 0.42 ? 0 : 1].push(st);
      }
      return { groups: groups, palette: ['198,214,255', '244,246,255', '255,198,160'] };
    }

    /* observatory dome (bottom centre-left) + pines on a low ridge,
       pre-rendered once; same shape language as observatory_night */
    function buildSilhouette(w, h, rng) {
      var hSi = Math.round(h * 0.17);
      var cv = makeCanvas(w, hSi);
      var c = cv.getContext('2d');
      var N = 14;
      var ys = [];
      var i;
      for (i = 0; i <= N; i++) {
        ys.push(hSi * (0.62 + 0.10 * Math.sin(i * 0.95 + 0.7) + 0.06 * Math.sin(i * 2.3 + 2.1) + (rng() - 0.5) * 0.05));
      }
      var groundAt = function (x) {
        var fi = (x / w) * N;
        var i0 = Math.min(Math.floor(fi), N - 1);
        var fr = fi - i0;
        return ys[i0] * (1 - fr) + ys[i0 + 1] * fr;
      };
      c.fillStyle = 'rgba(5,8,16,0.95)';
      c.beginPath();
      c.moveTo(0, hSi);
      for (i = 0; i <= N; i++) c.lineTo((i / N) * w, ys[i]);
      c.lineTo(w, hSi);
      c.closePath();
      c.fill();

      /* silhouette pines flanking the dome */
      var nP = 5 + Math.floor(rng() * 3);
      c.fillStyle = 'rgba(4,7,14,0.97)';
      for (i = 0; i < nP; i++) {
        var px = i < nP - 2 ? w * (0.05 + rng() * 0.20) : w * (0.68 + rng() * 0.26);
        var gy = groundAt(px);
        var ph = hSi * (0.30 + rng() * 0.30);
        var pw = ph * (0.32 + rng() * 0.10);
        for (var j = 0; j < 3; j++) {
          var frac = j / 3;
          var ty = gy - ph * (0.50 + frac * 0.50);
          var tw = pw * (1 - frac * 0.5);
          c.beginPath();
          c.moveTo(px, ty);
          c.lineTo(px - tw, ty + ph * 0.45);
          c.lineTo(px + tw, ty + ph * 0.45);
          c.closePath();
          c.fill();
        }
        c.fillRect(px - pw * 0.07, gy - ph * 0.18, pw * 0.14, ph * 0.20);
      }

      /* dome with one warm lit slit */
      var xd = w * 0.34;
      var ry = groundAt(xd);
      var wd = Math.max(16, hSi * 0.30);
      var bh = hSi * 0.26;
      var dr = hSi * 0.17;
      var bx = xd - wd / 2;
      var byTop = ry - bh;
      c.fillStyle = 'rgba(4,7,14,0.97)';
      c.fillRect(bx, byTop, wd, ry - byTop + 2);
      c.beginPath();
      c.arc(xd, byTop, dr, Math.PI, 0);
      c.closePath();
      c.fill();
      var scy = byTop - dr * 0.30;
      c.save();
      c.translate(xd, scy);
      c.rotate(-0.30);
      c.fillStyle = 'rgba(255,190,120,0.20)';
      c.fillRect(-dr * 0.11, -dr * 1.05, dr * 0.22, dr * 1.2);
      c.fillStyle = 'rgba(255,205,140,0.82)';
      c.fillRect(-dr * 0.04, -dr * 1.0, dr * 0.08, dr * 1.1);
      c.restore();
      c.fillStyle = 'rgba(255,200,140,0.45)';
      c.fillRect(bx + wd * 0.24, byTop + bh * 0.5, 2, 2);
      return { cv: cv, hSi: hSi, slitX: xd, slitY: h - hSi + byTop - dr * 0.6, slitR: dr * 2.1 };
    }

    function init(ctx, w, h) {
      var rng = mulberry32(SEED);
      S = { w: w, h: h, rng: rng };
      S.sx = w * 0.5;
      S.sy = h * 0.28;
      var m = Math.min(w, h);
      S.haloR = m * 0.34;
      S.colW = m * 0.30;
      S.moteDen = 0.61 * S.haloR * S.haloR; /* 2*(0.55R)^2, mote glow falloff */
      S.halo = buildHalo(S.haloR);
      S.core = buildCore(m * 0.052);
      S.stars = buildStars(w, h, S.sx, S.sy, m * 0.052, rng);
      S.sil = buildSilhouette(w, h, rng);
      S.motes = [];
      var nM = 22 + Math.floor(rng() * 8); /* 22-29 */
      for (var i = 0; i < nM; i++) {
        S.motes.push({
          x: S.sx + (rng() - 0.5) * S.colW,
          y: S.sy + rng() * (h * 0.97 - S.sy),
          v: 6 + rng() * 14,
          ph: rng() * TAU,
          r: 0.6 + rng() * 0.9,
        });
      }
      S.sat = null;
      S.nextSat = 6 + rng() * 8;
    }

    function spawnSat(t) {
      var rng = S.rng;
      var dir = rng() < 0.5 ? 1 : -1;
      S.sat = {
        born: t,
        dur: 13 + rng() * 5,
        y: S.h * (0.10 + rng() * 0.14),
        x0: dir > 0 ? -24 : S.w + 24,
        x1: dir > 0 ? S.w + 24 : -24,
      };
      S.nextSat = t + 34 + rng() * 12; /* every ~40s */
    }

    function draw(ctx, w, h, t, dt) {
      if (!S) return;
      if (w !== S.w || h !== S.h) init(ctx, w, h);
      dt = frameDt(dt);

      ctx.clearRect(0, 0, w, h);

      /* slow cinematic push-in anchored on the star (1.0 -> 1.06 / ~90s);
         wraps every layer below */
      var p = clamp(t / 90, 0, 1);
      var sc = 1 + 0.06 * p * p * (3 - 2 * p);
      var i, st;
      ctx.save();
      ctx.translate(S.sx, S.sy);
      ctx.scale(sc, sc);
      ctx.translate(-S.sx, -S.sy);

      /* starfield: grouped by tint to minimise style churn */
      var G = S.stars.groups;
      var P = S.stars.palette;
      var g, arr;
      for (g = 0; g < 3; g++) {
        arr = G[g];
        if (!arr.length) continue;
        ctx.fillStyle = 'rgb(' + P[g] + ')';
        for (i = 0; i < arr.length; i++) {
          st = arr[i];
          ctx.globalAlpha = st.a * (0.62 + 0.38 * Math.sin(t * st.ts + st.tw));
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.r, 0, TAU);
          ctx.fill();
        }
      }
      /* soft warm halo pass on the tinted few only */
      arr = G[2];
      ctx.fillStyle = 'rgb(255,178,140)';
      for (i = 0; i < arr.length; i++) {
        st = arr[i];
        ctx.globalAlpha = st.a * (0.62 + 0.38 * Math.sin(t * st.ts + st.tw)) * 0.16;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r * 3.2, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* BETELGEUSE: breathing re-composite of the pre-rendered stack
         (period ~6s, scale 1.0->1.12, alpha breathing) */
      var br = 0.5 + 0.5 * Math.sin(t * TAU / 6);
      var side = S.halo.cv.width * (1 + 0.12 * br);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.72 + 0.28 * br;
      ctx.drawImage(S.halo.cv, S.sx - side / 2, S.sy - side / 2, side, side);
      var cside = S.core.cv.width * (1 + 0.04 * br);
      ctx.drawImage(S.core.cv, S.sx - cside / 2, S.sy - cside / 2, cside, cside);
      ctx.globalAlpha = 1;

      /* 4-point diffraction cross, slowly rocking +/-2deg */
      var rot = 0.035 * Math.sin(t * 0.21);
      var L = S.haloR * 1.15;
      var hw = Math.max(1.1, Math.min(w, h) / 620);
      var ca = 0.30 + 0.22 * br;
      ctx.save();
      ctx.translate(S.sx, S.sy);
      ctx.rotate(rot);
      for (i = 0; i < 2; i++) {
        var xg = ctx.createLinearGradient(-L, 0, L, 0);
        xg.addColorStop(0, 'rgba(255,216,184,0)');
        xg.addColorStop(0.42, 'rgba(255,224,194,' + (ca * 0.55).toFixed(3) + ')');
        xg.addColorStop(0.5, 'rgba(255,228,200,' + ca.toFixed(3) + ')');
        xg.addColorStop(0.58, 'rgba(255,224,194,' + (ca * 0.55).toFixed(3) + ')');
        xg.addColorStop(1, 'rgba(255,216,184,0)');
        ctx.fillStyle = xg;
        ctx.fillRect(-L, -hw, L * 2, hw * 2);
        ctx.rotate(Math.PI / 2);
      }
      ctx.restore();

      /* lens flare ghosts along the star->centre diagonal */
      var fvx = w * 0.05;
      var fvy = h * 0.5 - S.sy + h * 0.10;
      var fvl = Math.sqrt(fvx * fvx + fvy * fvy) || 1;
      fvx /= fvl;
      fvy /= fvl;
      var ghosts = [
        [0.45, 9, 0.050, '255,226,200'],
        [0.80, 15, 0.040, '255,182,142'],
        [1.25, 24, 0.030, '172,216,236'],
      ];
      for (i = 0; i < ghosts.length; i++) {
        var gh = ghosts[i];
        var gx = S.sx + fvx * fvl * gh[0];
        var gy = S.sy + fvy * fvl * gh[0];
        var gr = gh[1] * (Math.min(w, h) / 720);
        var gg = ctx.createRadialGradient(gx, gy, gr * 0.2, gx, gy, gr);
        gg.addColorStop(0, 'rgba(' + gh[3] + ',0)');
        gg.addColorStop(0.72, 'rgba(' + gh[3] + ',' + gh[2] + ')');
        gg.addColorStop(1, 'rgba(' + gh[3] + ',0)');
        ctx.fillStyle = gg;
        ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      }

      /* heat-shimmer: sine-perturbed arcs at the halo edge, very low alpha */
      ctx.lineWidth = 1.2;
      for (i = 0; i < 3; i++) {
        var sr = S.haloR * (0.60 + i * 0.14) * (1 + 0.12 * br) *
          (1 + 0.012 * Math.sin(t * (1.05 + i * 0.4) + i * 2.3));
        var s0 = t * (0.05 + i * 0.03) + i * 1.8;
        var sa = 0.018 + 0.012 * (0.5 + 0.5 * Math.sin(t * 0.7 + i * 2.0));
        ctx.strokeStyle = 'rgba(255,205,165,' + sa.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(S.sx, S.sy, sr, s0, s0 + Math.PI * 1.35);
        ctx.stroke();
      }

      /* dust motes rising through the glow column, brighter inside it */
      var rng = S.rng;
      ctx.fillStyle = 'rgb(255,226,202)';
      for (i = 0; i < S.motes.length; i++) {
        var mo = S.motes[i];
        mo.y -= mo.v * dt;
        mo.x += Math.sin(t * 0.5 + mo.ph) * 4 * dt;
        if (mo.y < S.sy - S.haloR * 0.5) {
          mo.y = h * (0.92 + rng() * 0.07);
          mo.x = S.sx + (rng() - 0.5) * S.colW;
        }
        var mdx = mo.x - S.sx;
        var mdy = mo.y - S.sy;
        var mg = Math.exp(-(mdx * mdx + mdy * mdy) / S.moteDen);
        var ma = 0.05 + 0.20 * mg + 0.03 * Math.sin(t * 1.7 + mo.ph);
        if (ma <= 0.02) continue;
        ctx.globalAlpha = clamp(ma, 0, 0.3);
        ctx.fillRect(mo.x - mo.r, mo.y - mo.r, mo.r * 2, mo.r * 2);
      }

      /* satellite: one tiny steady dot crossing slowly, every ~40s */
      if (!S.sat && t >= S.nextSat) spawnSat(t);
      if (S.sat) {
        var age = t - S.sat.born;
        if (age > S.sat.dur) S.sat = null;
        else {
          var pp = age / S.sat.dur;
          var sxx = S.sat.x0 + (S.sat.x1 - S.sat.x0) * pp;
          var sf = clamp(Math.min(pp, 1 - pp) * 8, 0, 1);
          ctx.globalAlpha = 0.55 * sf;
          ctx.fillStyle = 'rgb(222,232,250)';
          ctx.fillRect(sxx - 0.8, S.sat.y - 0.8, 1.6, 1.6);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      /* horizon: dome + pines, then the breathing slit glow */
      ctx.drawImage(S.sil.cv, 0, h - S.sil.hSi);
      ctx.globalCompositeOperation = 'lighter';
      var ga = 0.10 + 0.05 * Math.sin(t * 1.4);
      var sg = ctx.createRadialGradient(S.sil.slitX, S.sil.slitY, 0, S.sil.slitX, S.sil.slitY, S.sil.slitR);
      sg.addColorStop(0, 'rgba(255,190,120,' + ga.toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(S.sil.slitX - S.sil.slitR, S.sil.slitY - S.sil.slitR, S.sil.slitR * 2, S.sil.slitR * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    return { init: init, draw: draw };
  })();

  /* --------------------------- registration --------------------------- */

  window.VN_SCENES = Object.assign(window.VN_SCENES || {}, {
    observatory_night: observatory_night,
    streets_rain: streets_rain,
    server_room: server_room,
    finale_star: finale_star,
  });
})();
