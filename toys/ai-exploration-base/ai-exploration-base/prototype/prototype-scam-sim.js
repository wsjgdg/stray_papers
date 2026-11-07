/* ⑤ 关：八幕骗局模拟器。
   剧本、解剖、正确动作、真实报道链接全部来自页面里的 #sim-data
   （由 docs/content/p5-anti-scam.md 生成，台词逐字）。 */
(function () {
  var root = document.getElementById('scam-sim');
  var dataEl = document.getElementById('sim-data');
  if (!root || !dataEl) return;

  var data;
  try {
    data = JSON.parse(dataEl.textContent);
  } catch (err) {
    return;
  }
  var acts = data.acts || [];
  if (!acts.length) return;
  var sides = data.sides || {};
  var finishText = data.finish || {};

  var feed = document.getElementById('sim-feed');
  var anatomy = document.getElementById('sim-anatomy');
  var actLabel = document.getElementById('sim-act');
  var actions = document.getElementById('sim-actions');
  var nextBtn = document.getElementById('sim-next');
  var resetBtn = document.getElementById('sim-reset');
  var chain = Array.prototype.slice.call(
    root.parentNode.querySelectorAll('.bay-chain li')
  );

  var state = { index: 0, early: false, bet: false, done: false, s3: false, s7: false };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // 只认 **加粗**，其余按纯文本，别把真源里的标记当 HTML
  function rich(node, text) {
    String(text || '').split(/(\*\*[^*]+\*\*)/).forEach(function (part) {
      if (!part) return;
      if (part.slice(0, 2) === '**' && part.slice(-2) === '**') {
        node.appendChild(el('strong', null, part.slice(2, -2)));
      } else {
        node.appendChild(document.createTextNode(part));
      }
    });
    return node;
  }

  function bubble(act) {
    var me = /^你/.test(act.speaker || '');
    var row = el('div', 'sim-bubble' + (me ? ' sim-bubble--me' : ''));
    row.appendChild(el('span', 'sim-who', act.speaker || ''));
    row.appendChild(rich(el('p', 'sim-line'), act.line));
    return row;
  }

  function anatomyCard(info) {
    var card = el('div', 'sim-card');
    if (info.aTitle) card.appendChild(el('p', 'sim-card-k', info.aTitle));
    if (info.aBody) card.appendChild(rich(el('p', 'sim-card-p'), info.aBody));
    if (info.right) card.appendChild(rich(el('p', 'sim-right'), info.right));
    if (info.report && info.report.url) {
      var link = el('a', 'sim-report');
      link.href = info.report.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '📰 这一幕在真实案件里：' + (info.report.src || '看报道') + ' ↗';
      card.appendChild(link);
    }
    return card;
  }

  function banner(cls, title, body) {
    var wrap = el('div', 'sim-banner ' + cls);
    if (title) wrap.appendChild(el('p', 'sim-banner-k', title));
    if (body) wrap.appendChild(rich(el('p', 'sim-banner-p'), body));
    return wrap;
  }

  function clearActions() {
    Array.prototype.slice.call(actions.querySelectorAll('[data-dynamic]')).forEach(function (n) {
      n.remove();
    });
  }

  function addAction(node) {
    node.setAttribute('data-dynamic', '1');
    actions.insertBefore(node, nextBtn);
    return node;
  }

  function renderAct() {
    var act = acts[state.index];
    feed.appendChild(bubble(act));
    anatomy.innerHTML = '';
    anatomy.appendChild(anatomyCard(act));
    anatomy.hidden = false;
    actLabel.textContent = '第 ' + act.no + ' 幕 · 共 ' + acts.length + ' 幕';
    chain.forEach(function (li, i) {
      li.classList.toggle('is-on', i <= state.index);
    });
    clearActions();
    nextBtn.hidden = false;
    resetBtn.hidden = true;
    nextBtn.textContent = act.no === acts.length ? '看结局 →' : '继续 →';

    if (act.no === 3 && sides['3'] && !state.s3) {
      var zhang = addAction(el('button', 'sim-side', sides['3'].label));
      zhang.type = 'button';
      zhang.addEventListener('click', function () {
        state.s3 = true;
        zhang.disabled = true;
        feed.appendChild(bubble({ speaker: '群友 · 张姐', line: sides['3'].line }));
        feed.appendChild(anatomyCard({ aTitle: sides['3'].title, aBody: sides['3'].body }));
      });
    }
    if (act.no === 7 && sides['7'] && !state.s7) {
      var call = addAction(el('button', 'sim-side', sides['7'].label));
      call.type = 'button';
      call.addEventListener('click', function () {
        state.s7 = true;
        call.disabled = true;
        feed.appendChild(banner('sim-banner--good', sides['7'].title, sides['7'].body));
      });
    }
    if (act.no === 5 && !state.bet && !state.early) {
      nextBtn.hidden = true;
      var stop = addAction(el('button', 'sim-side sim-stop', '停！先查一查'));
      var go = addAction(el('button', 'sim-next sim-go', '再投一点，看看能不能取出来'));
      stop.type = 'button';
      go.type = 'button';
      stop.addEventListener('click', function () {
        state.early = true;
        state.done = true;
        clearActions();
        feed.appendChild(banner('sim-banner--good', finishText.earlyTitle, finishText.early));
        finish(finishText.earlyDone);
      });
      go.addEventListener('click', function () {
        state.bet = true;
        state.index += 1;
        renderAct();
      });
    }
  }

  function finish(text) {
    state.done = true;
    anatomy.hidden = true;
    clearActions();
    feed.appendChild(el('div', 'sim-finish', text || ''));
    actLabel.textContent = state.early ? '剧终 · 提前下车的聪明人' : '剧终';
    nextBtn.hidden = true;
    resetBtn.hidden = false;
    root.classList.add('is-done');
  }

  nextBtn.addEventListener('click', function () {
    if (state.done) return;
    if (state.index >= acts.length - 1) {
      finish(state.bet ? finishText.bet : finishText.plain);
      return;
    }
    state.index += 1;
    renderAct();
    feed.lastElementChild.scrollIntoView({ block: 'nearest' });
  });

  resetBtn.addEventListener('click', function () {
    state = { index: 0, early: false, bet: false, done: false, s3: false, s7: false };
    feed.innerHTML = '';
    anatomy.innerHTML = '';
    anatomy.hidden = true;
    resetBtn.hidden = true;
    root.classList.remove('is-done');
    renderAct();
  });

  renderAct();
})();
