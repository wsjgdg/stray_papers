/* ============================================================
   AI Exploration Base - shared site scaffolding
   Injects header/footer chrome, scroll reveals, typewriter,
   and the per-page "完成打卡" button. Loads AFTER progress.js.
   ============================================================ */
(function (root) {
  'use strict';

  /* Signal CSS that JS is running (enables .reveal hidden state) */
  document.documentElement.classList.add('js');

  /* Pages live in /pages/, so relative roots differ. */
  function basePath() {
    return /\/pages\/[^/]*$/.test(root.location.pathname) ? '..' : '.';
  }

  function mountChrome() {
    if (document.querySelector('.site-header')) return;
    var base = basePath();

    var header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML =
      '<a class="site-home" href="' + base + '/index.html">' +
        '<span class="logo">AI</span>AI 探索基地' +
      '</a>' +
      '<span class="site-header-right">' +
        '<span class="site-badge" id="site-badge">' + root.AIProgress.badge() + '</span>' +
        '<button class="done-btn" id="site-done-btn" type="button"></button>' +
      '</span>';

    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML =
      '<p>这个网站是儿子和 AI 一起做的 · 双击就能打开 · 断网也能看</p>' +
      '<p id="site-footer-hint">看完这页，别忘了点上面的「完成打卡」</p>';

    document.body.insertBefore(header, document.body.firstChild);
    document.body.appendChild(footer);

    root.AIProgress.onChange(function () {
      var b = document.getElementById('site-badge');
      if (b) b.textContent = root.AIProgress.badge();
    });
  }

  /* GSAP ScrollTrigger when available; IntersectionObserver fallback. */
  function revealOnScroll(selector) {
    var els = Array.prototype.slice.call(document.querySelectorAll(selector || '.reveal'));
    if (!els.length) return;

    if (root.gsap && root.ScrollTrigger) {
      root.gsap.registerPlugin(root.ScrollTrigger);
      els.forEach(function (el) {
        root.gsap.fromTo(el,
          { opacity: 0, y: 24 },
          {
            opacity: 1, y: 0, duration: 0.7, ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 85%' }
          });
      });
      return;
    }

    if (!('IntersectionObserver' in root)) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* Typewriter. Usage: AISite.typeText(el, text, {speed: 40}). Resolves
     when done; respects prefers-reduced-motion by finishing instantly. */
  function typeText(el, text, opts) {
    opts = opts || {};
    var speed = opts.speed || 40;
    return new Promise(function (resolve) {
      var reduced = root.matchMedia &&
        root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || speed <= 0) {
        el.textContent = text;
        resolve();
        return;
      }
      el.classList.add('typewriter-caret');
      var i = 0;
      (function step() {
        if (i < text.length) {
          el.textContent = text.slice(0, ++i);
          root.setTimeout(step, speed);
        } else {
          el.classList.remove('typewriter-caret');
          resolve();
        }
      })();
    });
  }

  /* Per-page entry point. Pages that are not checkable tasks
     (landing, graduation) pass null/unknown id: chrome mounts,
     the done button hides. */
  function pageReady(pageId) {
    mountChrome();
    revealOnScroll('.reveal');

    var btn = document.getElementById('site-done-btn');
    if (!btn) return;

    var isTask = AIProgress.PAGES.some(function (p) { return p.id === pageId; });
    if (!isTask) {
      btn.style.display = 'none';
      var hint = document.getElementById('site-footer-hint');
      if (hint) hint.style.display = 'none';
      return;
    }

    function paint() {
      if (root.AIProgress.done(pageId)) {
        btn.textContent = '✓ 已打卡';
        btn.classList.add('is-done');
      } else {
        btn.textContent = '完成打卡';
        btn.classList.remove('is-done');
      }
    }
    paint();

    btn.addEventListener('click', function () {
      root.AIProgress.mark(pageId);
      paint();
    });
  }

  root.AISite = {
    basePath: basePath,
    mountChrome: mountChrome,
    revealOnScroll: revealOnScroll,
    typeText: typeText,
    pageReady: pageReady
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.AISite;
  }
})(typeof window !== 'undefined' ? window : globalThis);
