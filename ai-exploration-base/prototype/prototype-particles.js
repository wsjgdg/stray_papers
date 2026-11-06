/* ============================================================
   星群 / CONSTELLATION — 原型版的唯一图形语言
   黑色虚空里的一团三角形粒子：知识不是层级，是发光的碎片。
   纯 canvas 绘制，无依赖；prefers-reduced-motion 时只画一帧。
   ============================================================ */
(function () {
  'use strict';

  var COLORS = ['#8052ff', '#ffb829', '#15846e', '#c152ff', '#4f7dff', '#8be0c4'];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function makeCanvas() {
    var canvas = document.createElement('canvas');
    canvas.className = 'constellation';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    return canvas;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* 一团"脑形"云：两个交叠的椭圆 + 边缘的散点 */
  function buildCloud(count, w, h) {
    var points = [];
    var cx = w * 0.66, cy = h * 0.34;
    var rx = Math.min(w * 0.30, 420), ry = Math.min(h * 0.26, 300);
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var lobe = i % 3 === 0 ? -0.34 : 0.30;          // 左右两个半球
      var bias = Math.random();
      var radius = bias * bias;                        // 向边缘聚拢
      var squash = 0.86 + Math.random() * 0.2;
      var px = cx + Math.cos(angle + lobe) * rx * radius * squash + rand(-26, 26);
      var py = cy + Math.sin(angle + lobe) * ry * radius * squash + rand(-22, 22);
      if (Math.random() < 0.16) {                      // 少数粒子飘在云外
        px += rand(-160, 160);
        py += rand(-120, 120);
      }
      points.push({
        x: px, y: py,
        size: rand(1.6, 4.4),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        alpha: rand(0.28, 0.9),
        phase: Math.random() * Math.PI * 2,
        speed: rand(0.15, 0.55),
        drift: rand(0.4, 1.6),
        spin: rand(-0.4, 0.4)
      });
    }
    return points;
  }

  function buildAmbient(count, w, h) {
    var points = [];
    for (var i = 0; i < count; i++) {
      points.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: rand(1, 2.6),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        alpha: rand(0.05, 0.22),
        phase: Math.random() * Math.PI * 2,
        speed: rand(0.1, 0.4),
        drift: rand(2, 8),
        spin: rand(-0.2, 0.2)
      });
    }
    return points;
  }

  function triangle(ctx, x, y, size, rotation) {
    ctx.beginPath();
    for (var i = 0; i < 3; i++) {
      var a = rotation + (i * Math.PI * 2) / 3;
      var px = x + Math.cos(a) * size;
      var py = y + Math.sin(a) * size;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  function start() {
    var canvas = makeCanvas();
    var ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }
    var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cloud = [], ambient = [], raf = 0, t = 0, running = true;

    function resize() {
      w = window.innerWidth;
      h = Math.max(window.innerHeight, 640);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var small = w < 720;
      cloud = buildCloud(small ? 420 : 900, w, h);
      ambient = buildAmbient(small ? 60 : 150, w, h);
      if (reduce) draw();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      var i, p;
      for (i = 0; i < ambient.length; i++) {
        p = ambient[i];
        var ax = p.x + Math.sin(t * p.speed + p.phase) * p.drift;
        var ay = p.y + Math.cos(t * p.speed * 0.8 + p.phase) * p.drift;
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = p.color;
        triangle(ctx, ax, ay, p.size, t * p.spin + p.phase);
      }
      for (i = 0; i < cloud.length; i++) {
        p = cloud[i];
        var x = p.x + Math.sin(t * p.speed + p.phase) * p.drift;
        var y = p.y + Math.cos(t * p.speed * 0.7 + p.phase) * p.drift;
        ctx.globalAlpha = p.alpha * (0.72 + 0.28 * Math.sin(t * 0.9 + p.phase));
        ctx.strokeStyle = p.color;
        triangle(ctx, x, y, p.size, t * p.spin + p.phase);
      }
      ctx.globalAlpha = 1;
    }

    function loop() {
      if (!running) return;
      t += 0.011;
      draw();
      raf = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener('resize', function () {
      clearTimeout(resize._t);
      resize._t = setTimeout(resize, 180);
    });
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running && !reduce) loop();
      else cancelAnimationFrame(raf);
    });
    if (!reduce) loop();
    document.documentElement.classList.add('constellation-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
