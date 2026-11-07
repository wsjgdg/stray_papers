/* ⑥ 关：三个问法，三种 AI 回答。
   文字全部来自页面里的 #qz-data（由 docs/content/p6-academy.md 生成）。 */
(function () {
  var dataEl = document.getElementById('qz-data');
  var reply = document.getElementById('qz-reply');
  var textEl = document.getElementById('qz-text');
  var noteEl = document.getElementById('qz-note');
  if (!dataEl || !reply) return;

  var data;
  try {
    data = JSON.parse(dataEl.textContent);
  } catch (err) {
    return;
  }
  var answers = data.answers || {};
  var opts = Array.prototype.slice.call(document.querySelectorAll('.qz-opt'));
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rich(node, text) {
    String(text || '').split(/(\*\*[^*]+\*\*)/).forEach(function (part) {
      if (!part) return;
      if (part.slice(0, 2) === '**' && part.slice(-2) === '**') {
        var b = document.createElement('strong');
        b.textContent = part.slice(2, -2);
        node.appendChild(b);
      } else {
        node.appendChild(document.createTextNode(part));
      }
    });
    return node;
  }

  var timer = null;

  function type(text) {
    if (timer) window.clearInterval(timer);
    textEl.textContent = '';
    if (reduce) {
      textEl.textContent = text;
      return;
    }
    var i = 0;
    timer = window.setInterval(function () {
      i += 2;
      textEl.textContent = text.slice(0, i);
      if (i >= text.length) {
        window.clearInterval(timer);
        timer = null;
      }
    }, 16);
  }

  opts.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var grade = btn.getAttribute('data-grade');
      var ans = answers[grade];
      if (!ans) return;
      opts.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
        b.classList.toggle('is-on', b === btn);
      });
      reply.hidden = false;
      reply.setAttribute('data-grade', 'grade-' + grade.toLowerCase());
      type(ans.reply || '');
      noteEl.textContent = '';
      rich(noteEl, ans.note || '');
    });
  });
})();
