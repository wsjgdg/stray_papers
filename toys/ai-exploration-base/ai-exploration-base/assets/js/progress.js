/* ============================================================
   AI Exploration Base - task progress system
   Single source of truth for completion state (localStorage).
   Works on file:// in Edge/Chrome; degrades silently when
   storage is unavailable (state just doesn't persist).
   ============================================================ */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'ai-base-progress';

  /* Order matters: this is the recommended journey. */
  var PAGES = [
    { id: 'what-ai-can-do', title: 'AI 能做什么', url: 'pages/what-ai-can-do.html', desc: '亲眼看看 AI 做出来的东西' },
    { id: 'trends',         title: 'AI 趋势与行业', url: 'pages/trends.html', desc: '这两年发生了什么，机会在哪' },
    { id: 'lab',            title: '儿子的 AI 实验室', url: 'pages/lab.html', desc: '这些项目全是 AI 陪着写出来的' },
    { id: 'side-jobs',      title: '副业地图', url: 'pages/side-jobs.html', desc: '三条路：今天就能做 → 深度方向' },
    { id: 'anti-scam',      title: '骗局解剖室', url: 'pages/anti-scam.html', desc: '儿子最想让你看的一页' },
    { id: 'academy',        title: '提示词学院', url: 'pages/academy.html', desc: '学会提问，AI 才真正好用' }
  ];

  var TOTAL = PAGES.length;
  var listeners = [];

  /* In-memory state, hydrated from storage once. All getters read this,
     so logic works even where storage is unavailable (e.g. node tests). */
  var doneIds = (function () {
    try {
      var raw = root.localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  })();

  function save() {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(doneIds));
    } catch (e) {
      /* storage blocked: keep in-memory only */
    }
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) { /* one listener failing must not break others */ }
    });
  }

  var AIProgress = {
    PAGES: PAGES,
    TOTAL: TOTAL,

    done: function (id) {
      return doneIds.indexOf(id) !== -1;
    },

    /* Idempotent. Fires confetti + onChange only on first mark. */
    mark: function (id) {
      if (doneIds.indexOf(id) !== -1) return;
      doneIds.push(id);
      save();
      if (typeof root.confetti === 'function') {
        root.confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 } });
      }
      emit();
    },

    doneCount: function () {
      return doneIds.length;
    },

    isAllDone: function () {
      return doneIds.length >= TOTAL;
    },

    badge: function () {
      return doneIds.length + ' / ' + TOTAL;
    },

    onChange: function (fn) {
      listeners.push(fn);
    },

    /* Render the task map into `el` (used on index page).
       Re-render on change: AIProgress.onChange(function(){ renderMap(el); }) */
    renderMap: function (el) {
      if (!el) return;
      el.innerHTML = PAGES.map(function (p, i) {
        var ok = doneIds.indexOf(p.id) !== -1;
        return (
          '<a class="task-card' + (ok ? ' is-done' : '') + '" href="' + p.url + '">' +
            '<span class="task-num">' + (i + 1) + '</span>' +
            '<span class="task-body">' +
              '<strong class="task-title">' + p.title + '</strong>' +
              '<span class="task-desc">' + p.desc + '</span>' +
            '</span>' +
            '<span class="task-check" aria-label="' + (ok ? '已完成' : '未完成') + '">' +
              (ok ? '✓' : '') +
            '</span>' +
          '</a>'
        );
      }).join('');
    }
  };

  root.AIProgress = AIProgress;

  /* Export for node smoke tests */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIProgress;
  }
})(typeof window !== 'undefined' ? window : globalThis);
