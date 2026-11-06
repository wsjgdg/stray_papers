/* ============================================================
   翻面卡（① 关）：卡片本身就是正文。
   正面是内容真源里那一张卡的原文，翻过来是能照抄的提示词与出处。
   无脚本时两张面同时在文档里（背面不隐藏），内容不会丢。
   ============================================================ */
(function () {
  'use strict';

  function init() {
    var deck = document.querySelector('.carddeck-bar');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.flipcard'));
    if (!cards.length) return;

    var countEl = document.querySelector('[data-flip-count]');
    var doneEl = document.querySelector('[data-flip-done]');
    var flipped = [];

    function paint() {
      if (countEl) countEl.textContent = String(flipped.length);
      if (doneEl) doneEl.hidden = flipped.length < cards.length;
      if (deck) deck.classList.toggle('is-complete', flipped.length === cards.length);
    }

    cards.forEach(function (card) {
      var btn = card.querySelector('.flipcard-toggle');
      var back = card.querySelector('.flipcard-back');
      var front = card.querySelector('.flipcard-front');
      if (!btn || !back) return;

      function setOpen(open) {
        card.classList.toggle('is-flipped', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        back.hidden = !open;
        if (front) front.hidden = open;
        var label = btn.querySelector('.flipcard-toggle-label');
        if (label) {
          label.textContent = open ? '翻回去 · 看正面' : '翻过来 · 看提示词与出处';
        }
        var id = card.getAttribute('data-flipcard');
        if (open) {
          if (flipped.indexOf(id) === -1) flipped.push(id);
        } else {
          flipped = flipped.filter(function (x) { return x !== id; });
        }
        paint();
      }

      btn.addEventListener('click', function () {
        setOpen(btn.getAttribute('aria-expanded') !== 'true');
      });

      // 卡片标题也可以点（点在按钮上时不重复触发）
      var head = card.querySelector('.flipcard-head');
      if (head) {
        head.addEventListener('click', function (e) {
          if (e.target.closest('.flipcard-toggle')) return;
          setOpen(btn.getAttribute('aria-expanded') !== 'true');
        });
      }
    });

    paint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
