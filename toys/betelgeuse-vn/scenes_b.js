// scenes_b.js — Canvas 2D scene renderers for the visual novel.
// Scenes: apartment_night / email_screen / memory_white / dawn_ending.
// Vanilla Canvas 2D only, no libraries, no images, no text.
//
// The scene canvas is transparent and sits above the css gradient base:
// every scene paints atmosphere ON TOP (low-alpha glows, motes, weather).
//
// Engine contract (engine.js):
//   window.VN_SCENES[id] = { init(ctx, w, h), draw(ctx, w, h, t, dt) }
//   init — called on activation; seeds randomness + pre-renders static layers.
//   draw — called every frame; t = seconds since activation, dt = delta seconds.
//
// All randomness is seeded per scene (mulberry32, fixed seed) so the
// composition is identical on every activation. Per-frame work is limited to
// particle updates + sprite blits (well under ~1200 ops/frame per scene).

(function () {
  "use strict";

  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ *
   *  shared helpers
   * ------------------------------------------------------------------ */

  // deterministic PRNG, seeded once per scene build
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

  // stateless hash -> [0,1); used for endless runtime schedules without
  // advancing the seeded init stream (keeps the composition deterministic)
  function hash1(n) {
    var s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function smoothstep(a, b, x) {
    var k = clamp((x - a) / (b - a || 1e-6), 0, 1);
    return k * k * (3 - 2 * k);
  }

  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // soft radial blob sprite: one colour, alpha ramp inner -> transparent edge
  function blobSprite(size, r, g, b, aIn, aMid) {
    var c = makeCanvas(size, size);
    var x = c.getContext("2d");
    var gr = x.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gr.addColorStop(0, "rgba(" + r + "," + g + "," + b + "," + aIn + ")");
    gr.addColorStop(0.45, "rgba(" + r + "," + g + "," + b + "," + aMid + ")");
    gr.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
    x.fillStyle = gr;
    x.fillRect(0, 0, size, size);
    return c;
  }

  function rrPath(x, px, py, pw, ph, pr) {
    var r = Math.min(pr, pw / 2, ph / 2);
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + pw, py, px + pw, py + ph, r);
    x.arcTo(px + pw, py + ph, px, py + ph, r);
    x.arcTo(px, py + ph, px, py, r);
    x.arcTo(px, py, px + pw, py, r);
    x.closePath();
  }

  // scene factory: rebuilds on init and whenever the canvas is resized
  function scene(seed, build) {
    var S = null;
    return {
      init: function (ctx, w, h) {
        S = build(mulberry32(seed), ctx, w, h);
      },
      draw: function (ctx, w, h, t, dt) {
        if (!S || S.w !== w || S.h !== h)
          S = build(mulberry32(seed), ctx, w, h);
        dt = clamp(dt, 0, 0.05); // dt clamp
        S.tick(ctx, w, h, t, dt);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      },
    };
  }

  /* ------------------------------------------------------------------ *
   *  apartment_night — 深夜·公寓
   *  window rain streaks on glass, beyond-glass bokeh, cold monitor glow
   *  lighting drifting dust, rare distant lightning.
   * ------------------------------------------------------------------ */
  var apartment_night = scene(0x1a2b3c, function (rnd, ctx, w, h) {
    // glass pane occupies the right part of the frame
    var gx = w * 0.34,
      gy = h * 0.05,
      gw = w * 0.63,
      gh = h * 0.74;

    // --- pre-render: glass panel tint + window frame ---
    var panel = makeCanvas(gw, gh);
    var p = panel.getContext("2d");
    p.fillStyle = "rgba(150,180,225,0.045)";
    p.fillRect(0, 0, gw, gh);
    var sheen = p.createLinearGradient(0, 0, gw, gh);
    sheen.addColorStop(0.2, "rgba(190,215,245,0)");
    sheen.addColorStop(0.5, "rgba(190,215,245,0.055)");
    sheen.addColorStop(0.8, "rgba(190,215,245,0)");
    p.fillStyle = sheen;
    p.fillRect(0, 0, gw, gh);
    p.fillStyle = "rgba(8,12,24,0.5)"; // window mullions
    p.fillRect(gw * 0.487, 0, 3, gh);
    p.fillRect(0, gh * 0.44, gw, 3);
    p.strokeStyle = "rgba(175,205,240,0.09)";
    p.lineWidth = 1;
    p.strokeRect(0.5, 0.5, gw - 1, gh - 1);

    // --- sprites ---
    var warmB = blobSprite(64, 255, 196, 128, 0.55, 0.22);
    var coolB = blobSprite(64, 150, 195, 255, 0.5, 0.2);
    var drop = blobSprite(16, 205, 228, 252, 0.9, 0.35);
    var glow = blobSprite(256, 122, 168, 232, 0.3, 0.12);

    var edgeGlow = makeCanvas(64, 64); // monitor light hugging the left edge
    var eg = edgeGlow.getContext("2d");
    var egr = eg.createLinearGradient(0, 0, 64, 0);
    egr.addColorStop(0, "rgba(120,165,235,0.5)");
    egr.addColorStop(1, "rgba(120,165,235,0)");
    eg.fillStyle = egr;
    eg.fillRect(0, 0, 64, 64);

    // --- beyond-glass city bokeh ---
    var bokeh = [];
    for (var i = 0; i < 10; i++) {
      bokeh.push({
        x: gx + gw * (0.06 + rnd() * 0.88),
        y: gy + gh * (0.08 + rnd() * 0.62),
        s: 10 + rnd() * 26,
        warm: rnd() < 0.55,
        sp: 0.25 + rnd() * 0.5,
        ph: rnd() * TAU,
        a: 0.1 + rnd() * 0.12,
      });
    }

    // --- rain streaks meandering down the glass ---
    var streaks = [];
    for (i = 0; i < 14; i++) {
      streaks.push({
        bx: gx + gw * (0.05 + rnd() * 0.9),
        y: gy - 40 + rnd() * gh,
        sp: 14 + rnd() * 18, // px/s base speed (slow)
        wf: 0.5 + rnd() * 0.9, // meander frequency
        aw: 3 + rnd() * 9, // meander amplitude
        ph: rnd() * TAU,
        trail: [], // flat [x,y,x,y,...] pairs, head last
        len: 0,
        mult: 1, // current speed multiplier (slip bursts)
        slipEnd: -1,
        nextSlip: 2 + rnd() * 10,
      });
    }

    // --- floating dust ---
    var dust = [];
    for (i = 0; i < 40; i++) {
      dust.push({
        x: rnd() * w,
        y: rnd() * h,
        vx: -3 + rnd() * 6,
        vy: -2.5 + rnd() * 4,
        sp: 0.4 + rnd() * 0.8,
        ph: rnd() * TAU,
        s: 1 + rnd() * 1.4,
      });
    }

    var glowX = -w * 0.04,
      glowY = h * 0.6,
      glowR = Math.max(w, h) * 0.48;

    var bolt = null,
      flashStart = -10,
      nextFlash = 9 + rnd() * 9;

    function genBolt() {
      var bx = gx + gw * (0.15 + rnd() * 0.7);
      var by = gy + gh * (0.04 + rnd() * 0.14);
      var pts = [[bx, by]];
      var cx = bx,
        cy = by;
      var n = 10 + ((rnd() * 5) | 0);
      for (var k = 0; k < n; k++) {
        cx += (rnd() - 0.5) * 26;
        cy += 14 + rnd() * 22;
        pts.push([cx, cy]);
      }
      var branches = [];
      var nb = 2 + ((rnd() * 2) | 0);
      for (k = 0; k < nb; k++) {
        var sp = pts[2 + ((rnd() * (pts.length - 4)) | 0)];
        var bp = [[sp[0], sp[1]]];
        var bxp = sp[0],
          byp = sp[1];
        var dir = rnd() < 0.5 ? -1 : 1;
        var bn = 3 + ((rnd() * 3) | 0);
        for (var j = 0; j < bn; j++) {
          bxp += dir * (6 + rnd() * 14);
          byp += 10 + rnd() * 16;
          bp.push([bxp, byp]);
        }
        branches.push(bp);
      }
      return { pts: pts, branches: branches };
    }

    function strokePoly(c, pts) {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (var k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
      c.stroke();
    }

    function tick(c, W, H, t, dt) {
      var i;

      // 1) bokeh beyond the glass (clipped to the pane)
      c.save();
      c.beginPath();
      c.rect(gx, gy, gw, gh);
      c.clip();
      for (i = 0; i < bokeh.length; i++) {
        var b = bokeh[i];
        c.globalAlpha = b.a * (0.55 + 0.45 * Math.sin(t * b.sp + b.ph));
        c.drawImage(
          b.warm ? warmB : coolB,
          b.x - b.s / 2,
          b.y - b.s / 2,
          b.s,
          b.s,
        );
      }
      c.restore();

      // 2) glass tint + frame
      c.globalAlpha = 1;
      c.drawImage(panel, gx, gy);

      // 3) rain streaks on the glass (clipped)
      c.save();
      c.beginPath();
      c.rect(gx, gy, gw, gh);
      c.clip();
      c.lineCap = "round";
      c.strokeStyle = "rgba(188,214,244,1)";
      for (i = 0; i < streaks.length; i++) {
        var st = streaks[i];
        // slip bursts: occasional short accelerations down the pane
        if (t >= st.nextSlip) {
          st.slipEnd = t + 0.35 + 0.9 * hash1(st.nextSlip * 7.13 + i);
          st.nextSlip = st.slipEnd + 5 + 9 * hash1(st.nextSlip * 3.71 + i);
        }
        var target = t < st.slipEnd ? 7 : 1;
        st.mult +=
          (target - st.mult) * Math.min(1, dt * (target > st.mult ? 14 : 5));
        var hx = st.bx + Math.sin(t * st.wf + st.ph) * st.aw;
        var hy = st.y + st.sp * st.mult * dt;
        if (hy > gy + gh + 40) {
          hy = gy - 40;
          st.trail.length = 0;
          st.len = 0;
        }
        var tr = st.trail;
        if (tr.length >= 2) {
          var ldx = hx - tr[tr.length - 2],
            ldy = hy - tr[tr.length - 1];
          st.len += Math.sqrt(ldx * ldx + ldy * ldy);
        }
        tr.push(hx, hy);
        while (st.len > 46 && tr.length > 6) {
          var sd = Math.sqrt(
            (tr[2] - tr[0]) * (tr[2] - tr[0]) +
              (tr[3] - tr[1]) * (tr[3] - tr[1]),
          );
          if (!(sd > 0) || st.len - sd < 0) break;
          st.len -= sd;
          tr.splice(0, 2);
        }
        if (tr.length > 30) tr.splice(0, tr.length - 30);
        st.x = hx;
        st.y = hy;
        // fading polyline trail (alpha + width taper toward the tail)
        var np = tr.length / 2;
        for (var k = 0; k < np - 1; k++) {
          var f = 1 - k / (np - 1);
          c.globalAlpha = 0.32 * f * f;
          c.lineWidth = 0.6 + 1.1 * f;
          c.beginPath();
          c.moveTo(tr[k * 2], tr[k * 2 + 1]);
          c.lineTo(tr[k * 2 + 2], tr[k * 2 + 3]);
          c.stroke();
        }
        // bright head droplet
        c.globalAlpha = 0.55;
        c.drawImage(drop, hx - 5, hy - 5, 10, 10);
      }
      c.restore();

      // 4) cold monitor glow — hard two-level flicker at the frame edge
      var seg = Math.floor(t * 2.2);
      var lvl = hash1(seg + 4.7) < 0.32 ? 0.2 : 0.085;
      if (hash1(seg * 3.3 + 1.7) < 0.06) lvl *= 0.45; // occasional near-off dip
      c.globalAlpha = lvl;
      c.drawImage(glow, glowX - glowR, glowY - glowR, glowR * 2, glowR * 2);
      c.globalAlpha = lvl * 0.8;
      c.drawImage(edgeGlow, 0, 0, W * 0.34, H);

      // 5) dust motes — brighter inside the monitor glow
      c.fillStyle = "rgba(170,200,240,1)";
      for (i = 0; i < dust.length; i++) {
        var d = dust[i];
        var dx = (d.x + t * d.vx) % W;
        if (dx < 0) dx += W;
        var dy = (d.y + t * d.vy) % H;
        if (dy < 0) dy += H;
        var gdx = dx - glowX,
          gdy = dy - glowY;
        var near = Math.exp(-(gdx * gdx + gdy * gdy) / (glowR * glowR * 0.35));
        c.globalAlpha = clamp(
          0.07 + 0.24 * near + 0.05 * Math.sin(t * d.sp + d.ph),
          0.02,
          0.4,
        );
        c.fillRect(dx, dy, d.s, d.s);
      }

      // 6) distant lightning every ~12-18s: two-frame scene brightening + bolt
      if (t >= nextFlash) {
        bolt = genBolt();
        flashStart = t;
        nextFlash = t + 12 + 6 * rnd();
      }
      var fp = t - flashStart;
      if (bolt && fp >= 0 && fp < 0.1) {
        var fa =
          fp < 0.035 ? 0.04 + 0.04 * hash1(Math.floor(flashStart * 10)) : 0.016;
        c.globalAlpha = fa;
        c.fillStyle = "rgba(190,212,246,1)";
        c.fillRect(0, 0, W, H);
        c.globalAlpha = Math.min(0.5, fa * 6);
        c.strokeStyle = "rgba(214,230,252,1)";
        c.lineWidth = 1.2;
        strokePoly(c, bolt.pts);
        for (i = 0; i < bolt.branches.length; i++)
          strokePoly(c, bolt.branches[i]);
      }
    }

    return { w: w, h: h, tick: tick };
  });

  /* ------------------------------------------------------------------ *
   *  email_screen — 屏幕·未读邮件
   *  abstract UI mood: panel silhouettes, blinking cursor, scrolling
   *  scanlines, pulsing notification dot, sweeping reading light, dust.
   * ------------------------------------------------------------------ */
  var email_screen = scene(0x0e4a1c, function (rnd, ctx, w, h) {
    var px = w * 0.08,
      py = h * 0.14,
      pw = w * 0.64,
      ph = h * 0.68;

    // --- pre-render: panel + header + list rows (static full-frame layer) ---
    var panelC = makeCanvas(w, h);
    var g = panelC.getContext("2d");
    g.fillStyle = "rgba(130,175,240,0.03)";
    rrPath(g, px, py, pw, ph, 10);
    g.fill();
    g.strokeStyle = "rgba(150,195,255,0.09)";
    g.lineWidth = 1;
    rrPath(g, px + 0.5, py + 0.5, pw - 1, ph - 1, 10);
    g.stroke();
    g.fillStyle = "rgba(140,185,250,0.055)";
    rrPath(g, px + pw * 0.04, py + ph * 0.05, pw * 0.92, ph * 0.09, 6);
    g.fill();
    var ry0 = py + ph * 0.2,
      rh = ph * 0.072,
      gap = ph * 0.102;
    for (var i = 0; i < 7; i++) {
      var rw = pw * (0.5 + rnd() * 0.38);
      g.fillStyle = i < 2 ? "rgba(150,195,255,0.05)" : "rgba(150,195,255,0.03)";
      rrPath(g, px + pw * 0.04, ry0 + i * gap, rw, rh, 5);
      g.fill();
      if (i < 2) {
        g.fillStyle = "rgba(170,205,255,0.12)";
        g.fillRect(px + pw * 0.04, ry0 + i * gap, 2.5, rh);
      }
    }

    // --- scanline pattern (pre-rendered 1px rows, scrolled per frame) ---
    var scanC = makeCanvas(4, 3);
    var sg = scanC.getContext("2d");
    sg.fillStyle = "rgba(160,200,255,0.05)";
    sg.fillRect(0, 0, 4, 1);
    var pat = null;
    try {
      pat = ctx.createPattern(scanC, "repeat");
    } catch (e) {
      pat = null;
    }

    // --- sprites ---
    var dotGlow = blobSprite(64, 255, 96, 96, 0.85, 0.35);
    var cursorGlow = blobSprite(32, 170, 210, 255, 0.8, 0.3);
    var amb = blobSprite(256, 96, 145, 225, 0.16, 0.07);

    // reading-light band (soft vertical gaussian strip)
    var band = makeCanvas(64, 256);
    var bd = band.getContext("2d");
    var bgr = bd.createLinearGradient(0, 0, 0, 256);
    bgr.addColorStop(0, "rgba(150,195,255,0)");
    bgr.addColorStop(0.35, "rgba(150,195,255,0.14)");
    bgr.addColorStop(0.5, "rgba(175,212,255,0.2)");
    bgr.addColorStop(0.65, "rgba(150,195,255,0.14)");
    bgr.addColorStop(1, "rgba(150,195,255,0)");
    bd.fillStyle = bgr;
    bd.fillRect(0, 0, 64, 256);

    // --- sparse dust ---
    var dust = [];
    for (i = 0; i < 22; i++) {
      dust.push({
        x: rnd() * w,
        y: rnd() * h,
        vx: -2 + rnd() * 4,
        vy: -1.5 + rnd() * 3,
        sp: 0.3 + rnd() * 0.6,
        ph: rnd() * TAU,
        s: 0.8 + rnd() * 1.2,
      });
    }

    var curX = px + pw * 0.13,
      curY = ry0 + 3.2 * gap + rh * 0.35;
    var dotX = px + pw * 0.955,
      dotY = py + ph * 0.055;

    function tick(c, W, H, t) {
      var i;

      // ambient breathing glow behind everything
      c.globalAlpha = 0.7 + 0.3 * Math.sin(t * 0.45);
      c.drawImage(
        amb,
        W * 0.42 - W * 0.55,
        H * 0.4 - H * 0.55,
        W * 1.1,
        H * 1.1,
      );

      // panel + rows silhouette
      c.globalAlpha = 1;
      c.drawImage(panelC, 0, 0);

      // reading-light band sweeping down every ~7s (eyes scanning the page)
      var cyc = (t % 7) / 7;
      var bh = H * 0.38;
      var by = -bh + cyc * (H + bh);
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.8;
      c.drawImage(band, px, by, pw, bh);
      c.globalCompositeOperation = "source-over";

      // scanlines (2.5% effective alpha), slowly scrolling
      if (pat) {
        c.save();
        c.globalAlpha = 0.5;
        c.translate(0, (t * 5) % 3);
        c.fillStyle = pat;
        c.fillRect(-8, -4, W + 16, H + 8);
        c.restore();
      }

      // blinking cursor block (hard on/off, .6s cycle)
      if (Math.floor(t / 0.3) % 2 === 0) {
        c.globalAlpha = 0.85;
        c.fillStyle = "rgba(180,215,255,1)";
        c.fillRect(curX, curY, 10, 22);
        c.globalAlpha = 0.3;
        c.drawImage(cursorGlow, curX - 11, curY - 5, 32, 32);
      }

      // red notification dot pulsing (radial glow, additive)
      var pulse = 0.5 + 0.5 * Math.sin((t * TAU) / 2.8);
      var gs = 26 + 10 * pulse;
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.3 + 0.45 * pulse;
      c.drawImage(dotGlow, dotX - gs / 2, dotY - gs / 2, gs, gs);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 0.9;
      c.fillStyle = "rgba(255,118,118,1)";
      c.beginPath();
      c.arc(dotX, dotY, 5, 0, TAU);
      c.fill();

      // sparse dust motes
      c.fillStyle = "rgba(160,195,240,1)";
      for (i = 0; i < dust.length; i++) {
        var d = dust[i];
        var dx = (d.x + t * d.vx) % W;
        if (dx < 0) dx += W;
        var dy = (d.y + t * d.vy) % H;
        if (dy < 0) dy += H;
        c.globalAlpha = 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(t * d.sp + d.ph));
        c.fillRect(dx, dy, d.s, d.s);
      }
    }

    return { w: w, h: h, tick: tick };
  });

  /* ------------------------------------------------------------------ *
   *  memory_white — 过曝·那一夜
   *  overexposed bloom: huge soft light blobs on slow sine paths,
   *  volumetric dust with focus catches, warm light-leak on one edge.
   * ------------------------------------------------------------------ */
  var memory_white = scene(0x0b11e5, function (rnd, ctx, w, h) {
    var m = Math.min(w, h);

    var warmA = blobSprite(256, 255, 219, 180, 0.32, 0.14);
    var warmB = blobSprite(256, 255, 196, 152, 0.26, 0.11);
    var coolB = blobSprite(256, 186, 214, 255, 0.3, 0.13);

    // 3 warm + 1 cool huge blobs, 25-35s sine drift, breathing alpha
    var blobs = [
      {
        sp: warmA,
        cx: 0.27,
        cy: 0.3,
        r: 0.75,
        px: 27,
        py: 33,
        ax: 0.09,
        ay: 0.06,
        p1: 0.4,
        p2: 1.9,
        a: 0.14,
        bph: 0.2,
      },
      {
        sp: warmB,
        cx: 0.74,
        cy: 0.7,
        r: 0.68,
        px: 31,
        py: 26,
        ax: 0.07,
        ay: 0.08,
        p1: 2.6,
        p2: 0.7,
        a: 0.12,
        bph: 2.1,
      },
      {
        sp: warmA,
        cx: 0.52,
        cy: 0.46,
        r: 0.5,
        px: 25,
        py: 34,
        ax: 0.06,
        ay: 0.05,
        p1: 1.2,
        p2: 3.1,
        a: 0.1,
        bph: 4.0,
      },
      {
        sp: coolB,
        cx: 0.63,
        cy: 0.26,
        r: 0.55,
        px: 34,
        py: 28,
        ax: 0.08,
        ay: 0.06,
        p1: 4.2,
        p2: 1.5,
        a: 0.13,
        bph: 1.1,
      },
    ];

    // warm light-leak band hugging the left edge
    var leak = makeCanvas(128, 64);
    var lg = leak.getContext("2d");
    var lgr = lg.createLinearGradient(0, 0, 128, 0);
    lgr.addColorStop(0, "rgba(255,206,160,0.35)");
    lgr.addColorStop(0.4, "rgba(255,214,175,0.12)");
    lgr.addColorStop(1, "rgba(255,220,185,0)");
    lg.fillStyle = lgr;
    lg.fillRect(0, 0, 128, 64);

    // volumetric dust: 100 motes, individual drift + twinkle,
    // every 5th can "catch focus" (sharper + brighter + tiny cross flare)
    var motes = [];
    for (var i = 0; i < 100; i++) {
      motes.push({
        x: rnd(),
        y: rnd(),
        vx: ((rnd() - 0.5) * 16) / w,
        vy: ((rnd() - 0.5) * 10) / h,
        bob: 4 + rnd() * 10,
        bsp: 0.2 + rnd() * 0.5,
        bph: rnd() * TAU,
        sp: 0.5 + rnd() * 1.3,
        ph: rnd() * TAU,
        a: 0.07 + rnd() * 0.13,
        s: 0.8 + rnd() * 1.6,
        foc: i % 5 === 0,
        fc: 9 + rnd() * 12,
        fph: rnd() * 12,
      });
    }

    function tick(c, W, H, t) {
      var i;

      // huge soft light blobs on slow sine paths
      for (i = 0; i < blobs.length; i++) {
        var bl = blobs[i];
        var bx = (bl.cx + Math.sin((TAU * t) / bl.px + bl.p1) * bl.ax) * W;
        var by = (bl.cy + Math.cos((TAU * t) / bl.py + bl.p2) * bl.ay) * H;
        var r = bl.r * m * (1 + 0.05 * Math.sin((TAU * t) / 22 + bl.bph));
        c.globalAlpha =
          bl.a * (0.75 + 0.25 * Math.sin((TAU * t) / (18 + i * 4) + bl.bph));
        c.drawImage(bl.sp, bx - r, by - r, r * 2, r * 2);
      }

      // light-leak edge, very slow pulse
      c.globalAlpha = 0.5 + 0.5 * Math.sin((TAU * t) / 34 + 1);
      c.drawImage(leak, 0, 0, W * 0.22, H);

      // dust motes: drift + twinkle; focus catches get a cross flare
      c.fillStyle = "rgba(122,142,178,1)";
      for (i = 0; i < motes.length; i++) {
        var mo = motes[i];
        var nx = (mo.x + t * mo.vx) % 1;
        if (nx < 0) nx += 1;
        var ny = (mo.y + t * mo.vy) % 1;
        if (ny < 0) ny += 1;
        var mx = nx * W,
          my = ny * H + Math.sin(t * mo.bsp + mo.bph) * mo.bob;
        var tw = 0.45 + 0.55 * Math.sin(t * mo.sp + mo.ph);
        var fa = 0;
        if (mo.foc) {
          var k = ((t + mo.fph) % mo.fc) / mo.fc;
          if (k < 0.12) fa = Math.sin((Math.PI * k) / 0.12);
        }
        c.globalAlpha = clamp(mo.a * tw + fa * 0.14, 0, 0.5);
        var sz = mo.s + fa * 0.6;
        c.fillRect(mx, my, sz, sz);
        if (fa > 0.05) {
          var half = 3.5 + 4.5 * fa;
          c.globalAlpha = fa * 0.22;
          c.fillRect(mx - half, my, half * 2, 1);
          c.fillRect(mx, my - half, 1, half * 2);
        }
      }
    }

    return { w: w, h: h, tick: tick };
  });

  /* ------------------------------------------------------------------ *
   *  dawn_ending — 黎明·圆顶之外
   *  layered sun glow low in frame with faint rotating rays, remnant
   *  stars fading on individual schedules, drifting pink-lit cloud
   *  bands, light haze rising from the horizon.
   * ------------------------------------------------------------------ */
  var dawn_ending = scene(0x4e0c11, function (rnd, ctx, w, h) {
    var m = Math.min(w, h);
    var sunX = 0.74 * w,
      sunY = 0.78 * h; // sun sits low in frame

    var sunOuter = blobSprite(256, 255, 186, 130, 0.34, 0.13);
    var sunMid = blobSprite(256, 255, 205, 150, 0.55, 0.22);
    var sunCore = blobSprite(256, 255, 236, 205, 0.95, 0.45);

    // soft ray wedge: horizontal beam tapered vertically
    var ray = makeCanvas(256, 64);
    var rg = ray.getContext("2d");
    var rgr = rg.createLinearGradient(0, 0, 256, 0);
    rgr.addColorStop(0, "rgba(255,215,160,0.06)");
    rgr.addColorStop(0.55, "rgba(255,210,160,0.025)");
    rgr.addColorStop(1, "rgba(255,210,160,0)");
    rg.fillStyle = rgr;
    rg.fillRect(0, 0, 256, 64);
    rg.globalCompositeOperation = "destination-in";
    var vgr = rg.createLinearGradient(0, 0, 0, 64);
    vgr.addColorStop(0, "rgba(0,0,0,0)");
    vgr.addColorStop(0.5, "rgba(0,0,0,1)");
    vgr.addColorStop(1, "rgba(0,0,0,0)");
    rg.fillStyle = vgr;
    rg.fillRect(0, 0, 256, 64);
    rg.globalCompositeOperation = "source-over";

    // remnant stars: individual fade schedules, most gone by t=60
    var stars = [];
    for (var i = 0; i < 26; i++) {
      stars.push({
        x: rnd() * w,
        y: rnd() * h * 0.55,
        s: rnd() < 0.25 ? 2 : 1.3,
        a: 0.2 + rnd() * 0.5,
        tw: 1.2 + rnd() * 2.4,
        ph: rnd() * TAU,
        f0: 6 + rnd() * 34,
        fd: 9 + rnd() * 12,
        cross: i % 6 === 0,
      });
    }

    // soft cloud band sprites with pink-lit undersides
    var bodyBlob = blobSprite(128, 196, 182, 210, 0.3, 0.14);
    var underBlob = blobSprite(128, 255, 168, 162, 0.3, 0.14);
    function cloudSprite(cw, chh) {
      var c = makeCanvas(cw, chh);
      var cg = c.getContext("2d");
      var k, bxx, byy, br;
      for (k = 0; k < 5; k++) {
        bxx = cw * (0.12 + (0.76 * k) / 4) + (rnd() - 0.5) * 20;
        byy = chh * (0.32 + rnd() * 0.2);
        br = chh * (0.5 + rnd() * 0.35);
        cg.globalAlpha = 0.5 + rnd() * 0.3;
        cg.drawImage(bodyBlob, bxx - br, byy - br, br * 2, br * 2);
      }
      for (k = 0; k < 4; k++) {
        bxx = cw * (0.15 + (0.7 * k) / 3) + (rnd() - 0.5) * 18;
        byy = chh * (0.7 + rnd() * 0.12);
        br = chh * (0.35 + rnd() * 0.3);
        cg.globalAlpha = 0.45 + rnd() * 0.25;
        cg.drawImage(underBlob, bxx - br, byy - br, br * 2, br * 2);
      }
      cg.globalAlpha = 1;
      return c;
    }
    var clouds = [
      { sp: cloudSprite(480, 120), y: 0.5, sc: 1.15, v: 5, x0: rnd(), a: 0.55 },
      { sp: cloudSprite(420, 100), y: 0.6, sc: 0.9, v: 8, x0: rnd(), a: 0.5 },
      { sp: cloudSprite(520, 130), y: 0.7, sc: 1.3, v: 12, x0: rnd(), a: 0.45 },
    ];

    // horizon haze band (bottom-anchored vertical gradient)
    var haze = makeCanvas(64, 256);
    var hg = haze.getContext("2d");
    var hgr = hg.createLinearGradient(0, 256, 0, 0);
    hgr.addColorStop(0, "rgba(255,208,166,0.3)");
    hgr.addColorStop(0.5, "rgba(255,206,170,0.12)");
    hgr.addColorStop(1, "rgba(255,204,172,0)");
    hg.fillStyle = hgr;
    hg.fillRect(0, 0, 64, 256);

    function tick(c, W, H, t) {
      var i;

      // remnant stars: smoothstep lifespan fade, a few still twinkling
      c.fillStyle = "rgba(255,250,240,1)";
      for (i = 0; i < stars.length; i++) {
        var st = stars[i];
        var life = 1 - smoothstep(st.f0, st.f0 + st.fd, t);
        if (life <= 0.01) continue;
        var a = st.a * life * (0.55 + 0.45 * Math.sin(t * st.tw + st.ph));
        if (a <= 0.02) continue;
        c.globalAlpha = a;
        c.fillRect(st.x, st.y, st.s, st.s);
        if (st.cross && a > 0.2) {
          c.globalAlpha = a * 0.35;
          c.fillRect(st.x - 3, st.y + st.s / 2 - 0.5, st.s + 6, 1);
          c.fillRect(st.x + st.s / 2 - 0.5, st.y - 3, 1, st.s + 6);
        }
      }

      // sun breathing (8s) drives glow alphas + scale
      var br = 1 + 0.12 * Math.sin((TAU * t) / 8);
      var aa = 0.85 + 0.15 * Math.sin((TAU * t) / 8 + 0.6);

      // faint rotating rays (additive wedges, ~0.02 effective alpha)
      c.globalCompositeOperation = "lighter";
      for (i = 0; i < 10; i++) {
        var ang =
          (i * TAU) / 10 + t * 0.02 + Math.sin(t * 0.12 + i * 1.7) * 0.02;
        var len = m * (0.85 + 0.45 * hash1(i * 3.31));
        var wid = m * 0.13;
        c.save();
        c.translate(sunX, sunY);
        c.rotate(ang);
        c.globalAlpha = 0.5 * aa;
        c.drawImage(ray, m * 0.1, -wid / 2, len, wid);
        c.restore();
      }
      c.globalCompositeOperation = "source-over";

      // layered sun glow: outer amber -> mid -> warm white core
      var r1 = m * 1.05 * br;
      c.globalAlpha = 0.5 * aa;
      c.drawImage(sunOuter, sunX - r1, sunY - r1, r1 * 2, r1 * 2);
      var r2 = m * 0.5 * br;
      c.globalAlpha = 0.62 * aa;
      c.drawImage(sunMid, sunX - r2, sunY - r2, r2 * 2, r2 * 2);
      var r3 = m * 0.22 * (1 + 0.06 * Math.sin((TAU * t) / 8 + 1.2));
      c.globalAlpha = 0.85 * aa;
      c.drawImage(sunCore, sunX - r3, sunY - r3, r3 * 2, r3 * 2);

      // drifting cloud bands, each at its own speed (wrap around)
      for (i = 0; i < clouds.length; i++) {
        var cl = clouds[i];
        var cw = cl.sp.width * cl.sc,
          chh = cl.sp.height * cl.sc;
        var cx = ((cl.x0 * W + t * cl.v) % (W + cw)) - cw;
        c.globalAlpha = cl.a;
        c.drawImage(cl.sp, cx, cl.y * H - chh / 2, cw, chh);
      }

      // light haze rising from the horizon (slow alpha wave, two bands)
      var hh = H * 0.42;
      c.globalAlpha = 0.55 + 0.45 * Math.sin((TAU * t) / 11);
      c.drawImage(haze, 0, H - hh, W, hh);
      c.globalAlpha = 0.35 + 0.3 * Math.sin((TAU * t) / 13 + 2.1);
      c.drawImage(haze, 0, H - hh * 0.7 - H * 0.06, W, hh * 0.7);
    }

    return { w: w, h: h, tick: tick };
  });

  /* ------------------------------------------------------------------ *
   *  registry (merge-safe: coexists with scenes_a.js)
   * ------------------------------------------------------------------ */
  window.VN_SCENES = Object.assign(window.VN_SCENES || {}, {
    apartment_night: apartment_night,
    email_screen: email_screen,
    memory_white: memory_white,
    dawn_ending: dawn_ending,
  });
})();
