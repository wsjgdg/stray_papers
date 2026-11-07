/* 正文的入场：滚到哪，读到哪，那一行才浮上来。
   只用 IntersectionObserver + CSS 过渡，不依赖 GSAP；无脚本、减弱动效时正文照常全可见。 */
(function () {
  var els = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (!els.length) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('reveal-ready');

  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

  els.forEach(function (el) { io.observe(el); });

  // 打印时不该有藏起来的段落
  window.addEventListener('beforeprint', function () {
    els.forEach(function (el) { el.classList.add('is-in'); });
  });
})();
