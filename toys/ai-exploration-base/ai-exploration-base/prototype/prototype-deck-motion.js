/* ②–⑥ 台面动效：沿用 ① 关那套 GSAP / ScrollTrigger 语言——
   台面亮起、卡片落位、时间线一项项钉上去、数字滚到位、柱子从底部长出来。
   依赖 ../assets/vendor/gsap.min.js + ScrollTrigger；缺任意一个就整页静止（内容照常可读）。
   全部用 fromTo + immediateRender:false：没触发前元素是可见的，不会把人忽悠成空白页。 */
(function () {
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!gsap || reduce) return;
  if (ST) gsap.registerPlugin(ST);

  var floor = document.querySelector('.castfloor');
  if (!floor) return;

  function st(el, start, extra) {
    var cfg = { trigger: el, start: start || 'top 90%', once: true };
    return Object.assign({ scrollTrigger: ST ? cfg : undefined }, extra || {});
  }

  function enter(nodes, vars, start, stagger) {
    if (!nodes.length) return;
    gsap.fromTo(nodes, { autoAlpha: 0, y: 22 }, Object.assign({
      autoAlpha: 1, y: 0, duration: 0.72, ease: 'power3.out',
      stagger: stagger == null ? 0.07 : stagger, immediateRender: false
    }, st(nodes[0], start), vars));
  }

  /* ---------- 台面本身 ---------- */
  var headBits = floor.querySelectorAll('.castfloor-head > *');
  gsap.fromTo(headBits, { autoAlpha: 0, y: 16 }, Object.assign({
    autoAlpha: 1, y: 0, duration: 0.7, ease: 'power2.out', stagger: 0.08,
    immediateRender: false
  }, st(floor, 'top 92%')));

  gsap.utils.toArray('.floor-group-head, .floor-summary').forEach(function (el) {
    gsap.fromTo(el, { autoAlpha: 0, y: 14 }, Object.assign({
      autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out', immediateRender: false
    }, st(el, 'top 92%')));
  });

  /* ---------- 卡片：一落一落进场 ---------- */
  if (ST) {
    ST.batch('.tile', {
      start: 'top 92%',
      once: true,
      onEnter: function (batch) {
        gsap.fromTo(batch, { autoAlpha: 0, y: 34 }, {
          autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out',
          stagger: 0.09, overwrite: true
        });
      }
    });
  } else {
    enter(gsap.utils.toArray('.tile'), {}, 'top 92%', 0.09);
  }

  /* ---------- 时间线：一项项钉上去 ---------- */
  gsap.utils.toArray('.tl').forEach(function (list) {
    var rows = list.querySelectorAll('.tl-item');
    gsap.fromTo(rows, { autoAlpha: 0, x: -14 }, Object.assign({
      autoAlpha: 1, x: 0, duration: 0.55, ease: 'power2.out', stagger: 0.09,
      immediateRender: false
    }, st(list, 'top 84%')));
  });

  /* ---------- 人口示意图 ---------- */
  gsap.utils.toArray('.pp-grid').forEach(function (grid) {
    var figs = grid.querySelectorAll('.pp-figure');
    gsap.fromTo(figs, { autoAlpha: 0, scale: 0.6, y: 8 }, Object.assign({
      autoAlpha: 1, scale: 1, y: 0, duration: 0.42, ease: 'back.out(1.7)',
      stagger: 0.045, immediateRender: false
    }, st(grid, 'top 86%')));
  });

  /* ---------- 柱状图：从底部长出来 ---------- */
  gsap.utils.toArray('.ch-plot').forEach(function (plot) {
    var bars = plot.querySelectorAll('.ch-bar');
    gsap.fromTo(bars, { scaleY: 0 }, Object.assign({
      scaleY: 1, duration: 0.9, ease: 'power3.out', stagger: 0.14,
      transformOrigin: 'bottom center', immediateRender: false
    }, st(plot, 'top 86%')));
  });

  /* ---------- 数字：滚到位 ---------- */
  function counter(el) {
    if (el.children.length) return;
    var text = el.textContent;
    var m = /^([+\-]?)(\d+(?:\.\d+)?)([\s\S]*)$/.exec(text);
    if (!m) return;
    var sign = m[1];
    var target = parseFloat(m[2]);
    var tail = m[3];
    var decimals = (m[2].split('.')[1] || '').length;
    var box = { v: 0 };
    gsap.to(box, Object.assign({
      v: target, duration: 0.95, ease: 'power2.out',
      // 触发前保持原样，别让读者先看到一排 0
      onStart: function () { el.textContent = sign + (0).toFixed(decimals) + tail; },
      onUpdate: function () { el.textContent = sign + box.v.toFixed(decimals) + tail; },
      onComplete: function () { el.textContent = text; }
    }, st(el, 'top 88%', { immediateRender: false })));
  }
  gsap.utils.toArray('.st-big').forEach(counter);

  /* ---------- 路线 / 步骤 / 流程：一句句压上去 ---------- */
  ['.rt-steps li', '.sp-item', '.ag-step', '.qz-opt', '.pj-skill li', '.bay-chain li'].forEach(function (sel) {
    gsap.utils.toArray(sel).forEach(function (node) {
      var wrap = node.parentNode;
      gsap.fromTo(node, { autoAlpha: 0, x: -10 }, Object.assign({
        autoAlpha: 1, x: 0, duration: 0.45, ease: 'power2.out', immediateRender: false
      }, st(wrap, 'top 90%')));
    });
  });

  /* ---------- 提示词 / 话术：一句一句亮出来 ---------- */
  ['.pr-body', '.ph-says', '.mc-says', '.in-fact', '.nt-body p'].forEach(function (sel) {
    gsap.utils.toArray(sel).forEach(function (node) {
      gsap.fromTo(node, { autoAlpha: 0 }, Object.assign({
        autoAlpha: 1, duration: 0.9, ease: 'power2.inOut', immediateRender: false
      }, st(node, 'top 92%')));
    });
  });

  /* ---------- 页面底部的来源表 ---------- */
  var rows = document.querySelectorAll('.ktable tbody tr');
  if (rows.length && ST) {
    ST.batch(rows, {
      start: 'top 94%',
      once: true,
      onEnter: function (batch) {
        gsap.fromTo(batch, { autoAlpha: 0, y: 10 }, {
          autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.03
        });
      }
    });
  }

  if (ST) {
    // 图片、iframe 加载完，触发点要重算，不然有的卡片会一直等
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
    window.addEventListener('load', function () { ST.refresh(); });
  }
})();
