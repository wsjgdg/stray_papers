/* 02 / Offline classification game. No external APIs, progress writes or user data. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DESK = window.TREND_DESK || null;   // 由真源生成的数据层（trend-desk.js）
  var bins = (DESK && DESK.bins) || { fact: '已查证', test: '可小试', warn: '先警惕' };
  var sharedFact = {
    id: 'users', short: '用户规模', title: '2024 年底约 2.49 亿人，2025 年 6 月约 5.15 亿人使用生成式 AI。',
    source: 'CNNIC · 2025 年报告', correct: 'fact',
    why: '这是 CNNIC 报告中的用户规模，可核查。它只说明使用人数增加，不能推出任何个人收入或成交率。'
  };
  var FALLBACK_TRACKS = {
    finance: { name: '财务与保险', caution: '使用虚构或充分脱敏的资料；核对专业术语，不把 AI 草稿当作产品承诺或理财建议。', cards: [sharedFact,
      { id: 'answer', short: '客户答疑', title: '用虚构客户问题，先写三版通俗的保险产品答疑草稿。', source: '行动提案 · 不是既成事实', correct: 'test', why: '这是可限定范围的小试验：用虚构问题起稿，再由懂产品的人核对。', plan: ['写下一个不含姓名与保单号的常见问题。', '自己或借助信任的工具起草三种说法。', '核对条款，再请一位熟悉业务的人指出误解。'] },
      { id: 'ledger', short: '账表摘要', title: '拿一份自己编的月度账表，试着列出三处值得复核的数字。', source: '行动提案 · 不是既成事实', correct: 'test', why: '用虚构样表试做初筛可行，最后的数字和判断仍需本人核对。', plan: ['用虚构数字做一张小型月度账表。', '请工具或自己列出三处异常与依据。', '手动重算每个数字，记录哪处判断有误。'] },
      { id: 'promise', short: '翻倍承诺', title: '“把客户名单交给 AI，成交率保证翻倍。”', source: '未经证实的推销话术', correct: 'warn', why: '“保证翻倍”没有可核查的依据，客户名单还涉及敏感资料；不要照单全收或上传名单。' }
    ] },
    retail: { name: '电商与销售', caution: '使用自己有权使用的商品信息；价格、功能、图片权属及客户反馈都要人工核对。', cards: [sharedFact,
      { id: 'copy', short: '商品文案', title: '给自家商品的公开参数写三种不同开头，再核对每个卖点。', source: '行动提案 · 不是既成事实', correct: 'test', why: '这是低风险、可比较的试写；商品信息必须以真实参数为准。', plan: ['挑一件自己有权介绍的商品，列出公开参数。', '围绕参数写三种不同开头。', '逐条核对卖点，删掉没有证据的效果承诺。'] },
      { id: 'readers', short: '顾客反馈', title: '把两版真实商品说明给五位顾客读，记下看不懂的地方。', source: '行动提案 · 不是既成事实', correct: 'test', why: '这个小范围读者测试能得到具体反馈；五个人的意见不代表全市场。', plan: ['写两版不夸大的商品说明。', '请五位愿意反馈的人指出看不懂的句子。', '按反馈修改并记录差异，不宣称销量保证增长。'] },
      { id: 'sales', short: '销量承诺', title: '“只要换成 AI 商品图，这个月销量一定暴涨。”', source: '未经证实的推销话术', correct: 'warn', why: '销量受到价格、商品、渠道等多重因素影响；“一定暴涨”不是可靠的行业证据。' }
    ] },
    content: { name: '社区内容', caution: '只写自己确认的经历；涉及医疗、金融等敏感主题，要查来源、标明边界，不冒充专家。', cards: [sharedFact,
      { id: 'stories', short: '亲身经历', title: '从自己的一段真实经历里，试写三个 30 秒话题提纲。', source: '行动提案 · 不是既成事实', correct: 'test', why: '用亲身经历写提纲是可尝试的小事，不需要捏造案例或保证流量。', plan: ['选一段愿意公开的个人经历。', '写三个 30 秒话题提纲，不编造细节。', '读给一位熟人听，记录哪个说法真正清楚。'] },
      { id: 'check', short: '事实核对', title: '一篇内容先给家人试读，再逐一核对数据和引用。', source: '行动提案 · 不是既成事实', correct: 'test', why: '先找人试读和核对引用，是可操作的内容校对步骤。', plan: ['选一篇准备分享的短文。', '请家人标出不清楚的句子及需要证据的数据。', '找到原始出处并修改，再决定是否发布。'] },
      { id: 'expert', short: '专家人设', title: '“让 AI 生成专家人设，健康和理财建议都不用再核实。”', source: '未经证实的推销话术', correct: 'warn', why: '捏造资历并跳过医疗或金融核实会误导别人，不是可采取的行业机会。' }
    ] }
  };
  var tracks = (DESK && DESK.tracks) || FALLBACK_TRACKS;
  var state = {};
  Object.keys(tracks).forEach(function (key) { state[key] = { choices: {}, plan: null }; });
  var current = Object.keys(tracks)[0], selected = null, justFiled = null, lastDecision = null, settledFor = null;

  var fieldSources = {
    finance: [
      { t: 'CNNIC 报告：用户 5.15 亿、普及率 36.5%', u: 'https://www.cnnic.net.cn/n4/2025/1021/c88-11391.html' },
      { t: '新华网：生成式 AI 应用场景持续拓展', u: 'http://www.news.cn/tech/20251029/b02bdb2d8bce4275ad12cab941c00c86/c.html' }
    ],
    retail: [
      { t: '万相营造：一张商品图生成营销图', u: 'https://www.wanxiang.art/' },
      { t: '新华网：淘宝星辰·图生视频向商家开放', u: 'http://www.xinhuanet.com/tech/20250115/ad0511a9bd8746399f196800e5b47bee/c.html' }
    ],
    content: [
      { t: '中国日报网：剪映“图文成片”一键生成视频', u: 'https://cn.chinadaily.com.cn/a/202104/01/WS606584cca3101e7ce97471f7.html' },
      { t: '剪映官网（图文成片入口）', u: 'https://www.capcut.cn' }
    ]
  };
  function paintFieldSource() {
    var row = document.getElementById('track-source');
    if (!row || (DESK && !DESK.sources)) return;
    var list = fieldSources[current] || [];
    row.replaceChildren();
    var label = el('b', '', '本领域的真实功能出处');
    row.appendChild(label);
    list.forEach(function (item) {
      var a = el('a', '', item.t + ' ↗');
      a.href = item.u; a.target = '_blank'; a.rel = 'noopener noreferrer';
      row.appendChild(a);
    });
    var note = el('small', '', '行业功能有官方产品页或权威报道；情报卡本身仍是练习，不是报道原文。');
    row.appendChild(note);
  }

  var stack = document.getElementById('card-stack');
  var feedback = document.getElementById('decision-feedback');
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function format(number) { return String(number).padStart(2, '0'); }
  function total() { return getCards().length; }
  function getCards() { return tracks[current].cards; }
  function grades() {
    var choices = state[current].choices;
    return { sorted: Object.keys(choices).length, right: getCards().filter(function (card) { return choices[card.id] === card.correct; }).length };
  }
  function selectCard(id, focus) {
    selected = id;
    renderCards();
    if (focus) { var button = stack.querySelector('[data-pick="' + id + '"]'); if (button) button.focus({ preventScroll: true }); }
  }
  function renderCards() {
    stack.replaceChildren();
    getCards().forEach(function (card, index) {
      var category = state[current].choices[card.id];
      var grade = category ? (category === card.correct ? 'correct' : 'wrong') : 'none';
      var article = el('article', 'signal-card' + (selected === card.id ? ' is-selected' : '') + (justFiled === card.id ? ' just-filed' : ''));
      article.dataset.grade = grade;
      var pick = el('button', 'card-pick'); pick.type = 'button'; pick.dataset.pick = card.id;
      pick.setAttribute('aria-pressed', String(selected === card.id));
      pick.setAttribute('aria-label', '情报 ' + (index + 1) + '：' + card.title + (/[。！？!?]$/.test(card.title) ? '' : '。') + (category ? '目前归入' + bins[category] + (grade === 'correct' ? '，判断正确' : '，可改判') : '未分拣') + '。点按选择');
      var meta = el('span'); meta.append(el('span', '', 'FILE / ' + format(index + 1)), el('span', '', card.short));
      pick.append(meta, el('strong', '', card.title), el('small', '', card.source));
      pick.addEventListener('click', function () { selectCard(card.id, true); });
      var bottom = el('div', 'card-bottom');
      bottom.appendChild(el('span', 'card-status', category ? (grade === 'correct' ? '✓ ' : '! ') + bins[category] : '未盖章 · 点卡选择'));
      var grip = el('button', 'drag-grip', '拖 ↗'); grip.type = 'button';
      grip.setAttribute('aria-label', '拖动“' + card.short + '”到档案格；也可点击卡片分类');
      attachDrag(grip, card);
      bottom.appendChild(grip);
      article.append(pick, bottom);
      if (lastDecision && lastDecision.track === current && lastDecision.id === card.id) {
        var reason = el('p', 'card-reason', (lastDecision.right ? '已归档 / ' : '改判提示 / 应归入“' + bins[card.correct] + '”。') + (card.why || ''));
        reason.dataset.result = lastDecision.right ? 'right' : 'wrong';
        article.appendChild(reason);
      }
      if (selected === card.id) {
        var tray = el('div', 'card-tray'); tray.appendChild(el('span', '', '给这张情报盖章 / 也可按下方档案格'));
        Object.keys(bins).forEach(function (key) {
          var choice = el('button', '', bins[key]); choice.type = 'button';
          choice.setAttribute('aria-pressed', String(category === key));
          choice.setAttribute('aria-label', '把“' + card.short + '”归入' + bins[key]);
          choice.addEventListener('click', function () { assign(card.id, key); });
          tray.appendChild(choice);
        });
        article.appendChild(tray);
      }
      stack.appendChild(article);
    });
  }
  function renderBins() {
    Object.keys(bins).forEach(function (key) {
      var filed = getCards().filter(function (card) { return state[current].choices[card.id] === key; });
      document.getElementById('count-' + key).textContent = format(filed.length);
      document.getElementById('contents-' + key).textContent = filed.length ? filed.map(function (card) { return card.short; }).join(' / ') : '还没有情报';
    });
  }
  /* 右栏刻度：四张卡就是四格，归档一张亮一格（对的琥珀，错的紫） */
  function renderGauge() {
    var counts = grades(), choices = state[current].choices;
    var ticks = document.querySelectorAll('#sort-gauge i');
    var note = document.getElementById('sort-gauge-note');
    var next = document.getElementById('desk-next');
    Array.prototype.forEach.call(ticks, function (tick, i) {
      var card = getCards()[i], choice = card ? choices[card.id] : null;
      tick.className = choice ? (choice === card.correct ? 'is-on' : 'is-wrong') : '';
    });
    if (note) {
      var n = total(), unit = (DESK && DESK.count) || '四张';
      note.textContent = counts.sorted < n
        ? '还差 ' + (n - counts.sorted) + ' 张没归档'
        : (counts.right === n ? (DESK && DESK.done) || '四张都已核对 · 可以选一个试验'
           : unit + '已归档 · 有 ' + (n - counts.right) + ' 张要改判');
    }
    if (next) next.hidden = counts.sorted < total();
  }
  function renderTicket() {
    var selectedPlan = state[current].plan;
    var ticket = document.getElementById('plan-ticket');
    var buttons = document.querySelectorAll('#plan-choices button');
    buttons.forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.plan === selectedPlan)); });
    ticket.hidden = !selectedPlan;
    if (!selectedPlan) return;
    var card = getCards().find(function (item) { return item.id === selectedPlan; });
    document.getElementById('ticket-title').textContent = tracks[current].name + ' / ' + card.short;
    var steps = document.getElementById('ticket-steps'); steps.replaceChildren();
    (card.plan || []).forEach(function (step) { steps.appendChild(el('li', '', step)); });
    document.getElementById('ticket-caution').textContent = '边界提醒 / ' + tracks[current].caution;
    ticket.classList.remove('is-printing');
    if (!reduced) { void ticket.offsetWidth; ticket.classList.add('is-printing'); }
  }
  function renderReport() {
    var counts = grades(), choices = state[current].choices;
    var n = total();
    // 四条情报全部有去处时，档案区收一次章（每个领域只响一次；减弱动效时不动）
    if (n > 0 && counts.sorted === n) {
      if (settledFor !== current) {
        settledFor = current;
        var binsBox = document.querySelector('.bins');
        if (binsBox && !reduced) {
          binsBox.classList.remove('is-settled'); void binsBox.offsetWidth;
          binsBox.classList.add('is-settled');
          clearTimeout(binsBox.settleTimer);
          binsBox.settleTimer = setTimeout(function () { binsBox.classList.remove('is-settled'); }, 1200);
        }
      }
    } else {
      settledFor = null;
    }
    document.getElementById('progress-fill').style.width = counts.sorted / n * 100 + '%';
    document.getElementById('progress-label').textContent = '已分拣 ' + counts.sorted + ' / ' + n + ' · 已核对 ' + counts.right + ' / ' + n;
    var report = document.getElementById('report-content'), planStage = document.getElementById('plan-stage');
    report.replaceChildren();
    if (counts.sorted < n) {
      report.appendChild(el('p', '', '还有 ' + (n - counts.sorted) + ' 张情报没有去处。选一张卡再归档；改判不会丢掉前面的结果。'));
      planStage.hidden = true; return;
    }
    if (counts.right < n) {
      var intro = el('p'); intro.append(el('strong', '', '先别开工。'), document.createTextNode(' 你已归档全部情报，但有 ' + (n - counts.right) + ' 张需要重看。点对应卡片改判，确认后再选试验。'));
      report.appendChild(intro);
      var list = el('ul', 'report-errors');
      getCards().filter(function (card) { return choices[card.id] !== card.correct; }).forEach(function (card) {
        list.appendChild(el('li', '', card.short + '：应归入“' + bins[card.correct] + '”。' + (card.why || '')));
      });
      report.appendChild(list); planStage.hidden = true; return;
    }
    var tally = el('p', 'report-tally');
    Object.keys(bins).forEach(function (key, i) {
      if (i) tally.appendChild(el('span', 'report-tally-sep', '·'));
      var cell = el('span', 'report-tally-cell');
      var filed = getCards().filter(function (card) { return choices[card.id] === key; }).length;
      cell.appendChild(el('b', '', String(filed)));
      cell.appendChild(document.createTextNode(' 条' + bins[key]));
      tally.appendChild(cell);
    });
    report.appendChild(tally);
    var good = el('p'); good.append(el('strong', '', '信号与噪音已分开。'), document.createTextNode(' 报告里的事实归一处，能自己动手的那件小事归一处。人数增长不是个人收益预测；现在只选一个小试验。'));
    report.appendChild(good); planStage.hidden = false;
    var choiceBox = document.getElementById('plan-choices'); choiceBox.replaceChildren();
    getCards().filter(function (card) { return card.correct === 'test'; }).forEach(function (card, n) {
      var button = el('button'); button.type = 'button'; button.dataset.plan = card.id;
      button.append(el('small', '', '试验 0' + (n + 1)), document.createTextNode(card.short + ' →'));
      button.setAttribute('aria-pressed', String(state[current].plan === card.id));
      button.addEventListener('click', function () { state[current].plan = card.id; renderTicket(); });
      choiceBox.appendChild(button);
    });
    renderTicket();
  }
  function renderAll() { renderCards(); renderBins(); renderGauge(); renderReport(); paintFieldSource(); justFiled = null; }
  function flyCard(id, category, short) {
    if (reduced) return;
    var source = stack.querySelector('[data-pick="' + id + '"]');
    var target = document.querySelector('[data-bin="' + category + '"]');
    if (!source || !target || !source.animate) return;
    var from = source.closest('.signal-card').getBoundingClientRect();
    var to = target.getBoundingClientRect();
    if (to.top > window.innerHeight || to.bottom < 0) return;
    var slip = el('span', 'filing-flight', short + ' / ' + bins[category]);
    slip.setAttribute('aria-hidden', 'true');
    slip.style.left = from.left + from.width * .2 + 'px';
    slip.style.top = from.top + from.height * .4 + 'px';
    document.body.appendChild(slip);
    var dx = to.left + to.width / 2 - (from.left + from.width * .2);
    var dy = to.top + to.height / 2 - (from.top + from.height * .4);
    var animation = slip.animate([
      { transform: 'translate(0,0) rotate(-3deg) scale(1)', opacity: 1 },
      { transform: 'translate(' + (dx * .5) + 'px,' + (dy * .42 - 35) + 'px) rotate(8deg) scale(.9)', opacity: 1, offset: .55 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(2deg) scale(.48)', opacity: 0 }
    ], { duration: 560, easing: 'cubic-bezier(.2,.7,.25,1)' });
    animation.finished.then(function () { slip.remove(); }, function () { slip.remove(); });
    target.classList.remove('bin-receiving'); void target.offsetWidth; target.classList.add('bin-receiving');
    window.setTimeout(function () { target.classList.remove('bin-receiving'); }, 650);
  }
  function assign(id, category, viaDrag) {
    var card = getCards().find(function (item) { return item.id === id; });
    if (!card || !bins[category]) return;
    if (!viaDrag) flyCard(id, category, card.short);
    justFiled = id;
    state[current].choices[id] = category;
    if (card.correct !== category) state[current].plan = null;
    var right = card.correct === category;
    lastDecision = { track: current, id: id, right: right };
    feedback.dataset.result = right ? 'right' : 'wrong';
    feedback.textContent = (right ? '已归档到“' + bins[category] + '”。' : '这张不宜归到“' + bins[category] + '”，应放“' + bins[card.correct] + '”。') + ' ' + card.why + (right ? '' : ' 点卡可改判。');
    var progress = grades();
    if (progress.sorted === 4) feedback.textContent += progress.right === 4 ? ' 四张都已核对，往下领取试验票。' : ' 四张已归档，往下看需要改判的报告。';
    var next = getCards().find(function (item) { return !state[current].choices[item.id]; });
    selected = right && next ? next.id : id;
    renderAll();
    var focusTarget = stack.querySelector('[data-pick="' + selected + '"]');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }
  function attachDrag(grip, card) {
    var start = null, ghost = null, moved = false;
    function clean() {
      if (ghost) ghost.remove(); ghost = null;
      document.querySelectorAll('.bin.drag-over').forEach(function (node) { node.classList.remove('drag-over'); });
    }
    grip.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      moved = false; grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener('pointermove', function (event) {
      if (!start || event.pointerId !== start.id) return;
      if (!moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) {
        moved = true; ghost = el('div', 'drag-ghost', card.short + ' / 归档'); document.body.appendChild(ghost);
      }
      if (!moved) return;
      ghost.style.left = event.clientX + 12 + 'px'; ghost.style.top = event.clientY - 27 + 'px';
      document.querySelectorAll('.bin.drag-over').forEach(function (node) { node.classList.remove('drag-over'); });
      var target = document.elementFromPoint(event.clientX, event.clientY);
      var bin = target && target.closest('[data-bin]');
      if (bin) bin.classList.add('drag-over');
    });
    grip.addEventListener('pointerup', function (event) {
      if (!start) return;
      var wasMoved = moved;
      var target = document.elementFromPoint(event.clientX, event.clientY);
      var bin = target && target.closest('[data-bin]');
      start = null; clean();
      if (wasMoved && bin) assign(card.id, bin.dataset.bin, true);
      else if (!wasMoved) selectCard(card.id, true);
      else { feedback.dataset.result = ''; feedback.textContent = '没有落入档案格，这张卡还在原处。也可以点卡后直接盖章。'; }
    });
    grip.addEventListener('pointercancel', function () { start = null; clean(); });
    grip.addEventListener('click', function (event) { event.preventDefault(); });
    grip.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCard(card.id, true); } });
  }
  function replate() {
    var desk = document.querySelector('.workbench');
    if (!desk || !desk.classList) return;
    desk.classList.remove('is-replating');
    void desk.offsetWidth;
    desk.classList.add('is-replating');
    clearTimeout(desk.replateTimer);
    desk.replateTimer = setTimeout(function () { desk.classList.remove('is-replating'); }, 1100);
  }
  // 键盘：选中一张卡后按 1 / 2 / 3 直接归档，不用一路 Tab 到档案格。
  // 只在焦点确实在分拣台里时生效，避免在页面别处按数字键被误判。
  document.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    var slot = ['1', '2', '3'].indexOf(event.key);
    if (slot < 0 || !selected) return;
    var desk = document.querySelector('.workbench');
    if (!desk || !desk.contains(document.activeElement)) return;
    var target = document.querySelectorAll('[data-bin]')[slot];
    if (!target) return;
    event.preventDefault();
    assign(selected, target.dataset.bin);
  });
  document.querySelectorAll('[data-bin]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (selected) assign(selected, button.dataset.bin);
      else { feedback.dataset.result = ''; feedback.textContent = '先点一张情报卡，再点这个档案格；也可以把卡角手柄拖进来，或用 1 / 2 / 3 键。'; stack.querySelector('.card-pick').focus(); }
    });
  });
  document.querySelectorAll('[data-track]').forEach(function (button) {
    button.addEventListener('click', function () {
      current = button.dataset.track; selected = null; lastDecision = null;
      document.querySelectorAll('[data-track]').forEach(function (node) { node.setAttribute('aria-pressed', String(node === button)); });
      document.getElementById('feed-title').textContent = tracks[current].name + ' · 情报卡';
      feedback.dataset.result = '';
      feedback.textContent = '已换到' + tracks[current].name + '。点卡选择分类；切回其他领域时，之前的本页判断仍在。';
      renderAll();
      replate();
    });
  });
  var deskNext = document.getElementById('desk-next');
  if (deskNext) {
    deskNext.addEventListener('click', function () {
      var verdict = document.getElementById('verdict'), title = document.getElementById('verdict-title');
      if (!verdict) return;
      verdict.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      title.setAttribute('tabindex', '-1');
      window.setTimeout(function () { title.focus({ preventScroll: true }); }, reduced ? 0 : 420);
    });
  }
  document.getElementById('reset-track').addEventListener('click', function () {
    state[current] = { choices: {}, plan: null }; selected = null; lastDecision = null;
    feedback.dataset.result = ''; feedback.textContent = '已清空' + tracks[current].name + '的本页判断。重新从第一张情报开始。';
    renderAll();
    replate();
  });
  document.documentElement.classList.add('trend-ready');
  if (window.matchMedia('(max-width:760px)').matches) feedback.textContent = '先点一张情报卡，再选分类章。分错可以改判。';
  var feedTitle = document.getElementById('feed-title');
  if (feedTitle) feedTitle.textContent = tracks[current].name + ' · 情报卡';
  renderAll();
}());
