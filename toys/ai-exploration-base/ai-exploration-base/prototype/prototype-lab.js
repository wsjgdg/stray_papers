/* 03 / A local Conway cellular automaton. This is an original teaching slice,
   not the existing Algorithm Lab app and not an AI-generated simulation. */
(function () {
  'use strict';
  var size = 15, reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rules = { birth23: { birth: [2, 3], survive: [2, 3] }, survive3: { birth: [3], survive: [3] }, standard: { birth: [3], survive: [2, 3] } };
  var seeds = {
    blinker: [[7, 6], [7, 7], [7, 8]],
    glider: [[5, 7], [6, 8], [7, 6], [7, 7], [7, 8]],
    free: []
  };
  var goals = {
    blinker: { gen: 1, cells: [[6, 7], [7, 7], [8, 7]], label: '横排三格 → 竖排三格' },
    glider: { gen: 4, cells: seeds.glider.map(function (p) { return [p[0] + 1, p[1] + 1]; }), label: '滑翔机向右下移动一格' }
  };
  var preset = 'blinker', rule = 'birth23', generation = 0, cells = new Set(), initial = new Set();
  var focusIndex = 7 * size + 7, recent = [], lastValidation = null, timer = null, painted = null;
  var grid = document.getElementById('cell-grid');
  var buttons = [], audit = document.getElementById('audit');
  var title = document.getElementById('audit-title'), detail = document.getElementById('audit-detail');
  function index(r, c) { return r * size + c; }
  function asSet(points) { return new Set(points.map(function (p) { return index(p[0], p[1]); })); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function same(a, b) { return a.size === b.size && Array.from(a).every(function (cell) { return b.has(cell); }); }
  function resultDiff(actual, target) {
    var extra = Array.from(actual).filter(function (i) { return !target.has(i); });
    var missing = Array.from(target).filter(function (i) { return !actual.has(i); });
    return { extra: extra, missing: missing, count: extra.length + missing.length };
  }
  function targetSet() { return goals[preset] ? asSet(goals[preset].cells) : null; }
  function text(state, heading, body) {
    audit.dataset.state = state;
    audit.firstElementChild.textContent = state === 'pass' ? 'AUDIT / 对照通过' : state === 'fail' ? 'AUDIT / 找到偏差' : 'AUDIT / 正在测试';
    title.textContent = heading; detail.textContent = body;
  }
  function renderGrid(grade) {
    var target = grade ? targetSet() : null;
    buttons.forEach(function (button, i) {
      var live = cells.has(i);
      button.className = 'cell' + (live ? ' alive' : '') + (target && target.has(i) ? ' expected' : '') + (target && target.has(i) && !live ? ' missing' : '') + (target && !target.has(i) && live ? ' extra' : '');
      // 新生细胞从左到右依次亮起：把动画延迟按列错开（--delay 在 CSS 里兜底 0s）
      button.style.setProperty('--delay', ((i % size) * 7) + 'ms');
      button.setAttribute('aria-pressed', String(live));
      button.setAttribute('aria-label', '第 ' + (Math.floor(i / size) + 1) + ' 行第 ' + (i % size + 1) + ' 列：' + (live ? '亮' : '暗') + (target && target.has(i) && !live ? '，预期亮' : target && !target.has(i) && live ? '，多出的亮格' : ''));
      button.tabIndex = i === focusIndex ? 0 : -1;
    });
    document.getElementById('generation-badge').textContent = 'GEN ' + pad(generation);
    document.getElementById('cell-count').textContent = '活细胞 ' + pad(cells.size);
    document.getElementById('target-count').textContent = grade && target ? (resultDiff(cells, target).count ? '偏差 ' + pad(resultDiff(cells, target).count) : '与目标一致 ✓') : (preset === 'free' ? '自由实验' : '目标 / 第 ' + goals[preset].gen + ' 代');
  }
  function renderHistory() {
    var list = document.getElementById('history-list'); list.replaceChildren();
    recent.slice(-7).reverse().forEach(function (entry) {
      var li = document.createElement('li');
      li.textContent = '第 ' + entry.gen + ' 代 · 活细胞 ' + entry.live + ' · 新生 ' + entry.born + ' / 消失 ' + entry.died;
      list.appendChild(li);
    });
  }
  function showProof(isSuccess) {
    var proof = document.getElementById('lab-proof');
    if (!isSuccess) { proof.hidden = true; return; }
    proof.hidden = false;
    var summary, note;
    if (preset === 'free') {
      summary = '这是一张真实运行所得的本页记录：第 ' + generation + ' 代有 ' + cells.size + ' 个活细胞。改画布或改规则，结果会不同。';
      note = '自由画布 / 本地实验记录\n规则：' + ruleLabel() + '\n运行到第 ' + generation + ' 代，活细胞 ' + cells.size + ' 个。\n这是细胞自动机的计算结果，不是 AI 生成或真实生命。';
    } else {
      summary = '你修好了这次交付：第 ' + goals[preset].gen + ' 代的图形与目标完全一致。规则不是“看起来对”，是被实际跑出来、对照过。';
      note = '儿子的实验室 / 规则验收记录\n样本：' + (preset === 'blinker' ? '三格灯' : '滑翔机') + '\n采用规则：' + ruleLabel() + '\n第 ' + goals[preset].gen + ' 代活细胞 ' + cells.size + ' 个，与目标差异 0 格。\n我做了：设目标 → 运行 → 对照 → 修订。\n本地确定性模拟；没有调用 AI，也没有上传资料。';
    }
    document.getElementById('proof-summary').textContent = summary;
    document.getElementById('proof-text').value = note;
  }
  function ruleLabel() {
    return rule === 'standard' ? '出生 3 / 存活 2 或 3' : rule === 'birth23' ? '出生 2 或 3 / 存活 2 或 3' : '出生 3 / 存活 3';
  }
  function stopPlay() {
    if (timer !== null) { window.clearInterval(timer); timer = null; }
    var button = document.getElementById('toggle-play');
    button.textContent = '连续运行 ▷'; button.setAttribute('aria-pressed', 'false');
  }
  function auditStep() {
    var goal = goals[preset];
    if (!goal) {
      lastValidation = null;
      text('neutral', cells.size ? '这一步，又长成了另一幅图。' : '这一代，细胞全部熄灭。', '第 ' + generation + ' 代有 ' + cells.size + ' 个活细胞。自由画布不设标准答案；换规则或改画布再试。');
      showProof(generation > 0); return;
    }
    if (generation < goal.gen) {
      text('neutral', '还差 ' + (goal.gen - generation) + ' 步到验收点。', '观察形态，再点“运行一步”。只有到了第 ' + goal.gen + ' 代，才与目标对照。');
      return;
    }
    if (generation > goal.gen) {
      text(lastValidation === true ? 'pass' : 'neutral', '已经超过第 ' + goal.gen + ' 代验收点。', '回到起点，就能按同一份样本重试；上次对照' + (lastValidation === true ? '通过。' : '未通过。'));
      return;
    }
    var delta = resultDiff(cells, targetSet());
    lastValidation = delta.count === 0;
    if (lastValidation) {
      text('pass', '对上了：0 格偏差。', '第 ' + goal.gen + ' 代，' + goal.label + '。你选的规则经受住了这次样本测试；下面的实验记录可复制。');
      showProof(true);
    } else {
      text('fail', '相差 ' + delta.count + ' 格；这份规则需要修。', '目标位置少了 ' + delta.missing.length + ' 格，额外亮了 ' + delta.extra.length + ' 格。轮廓标出预期位置；换一张规则卡，画布会回到同一个起点再跑。');
      showProof(false);
    }
  }
  function nextGeneration() {
    var next = new Set(), chosen = rules[rule], born = 0, died = 0;
    for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) {
      var neighbours = 0;
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && cells.has(index(nr, nc))) neighbours++;
      }
      var i = index(r, c), wasAlive = cells.has(i);
      var lives = wasAlive ? chosen.survive.includes(neighbours) : chosen.birth.includes(neighbours);
      if (lives) next.add(i);
      if (lives && !wasAlive) born++;
      if (!lives && wasAlive) died++;
    }
    cells = next; generation++;
    // 世代徽章跳一下：让"又长了一代"这件事在眼角有动静（减弱动效时由 CSS 关掉）
    var badge = document.getElementById('generation-badge');
    if (badge && !reduced) {
      badge.classList.remove('is-ticking'); void badge.offsetWidth; badge.classList.add('is-ticking');
    }
    recent.push({ gen: generation, live: cells.size, born: born, died: died });
    document.getElementById('delta-count').textContent = '变化 ' + pad(born + died);
    // 每一代都从上往下扫一道光，让"整片网格重新算了一遍"看得见
    var gridEl = document.getElementById('cell-grid');
    if (gridEl && !reduced) {
      gridEl.classList.remove('is-advancing'); void gridEl.offsetWidth;
      gridEl.classList.add('is-advancing');
      clearTimeout(gridEl.scanTimer);
      gridEl.scanTimer = setTimeout(function () { gridEl.classList.remove('is-advancing'); }, 700);
    }
    renderGrid(goals[preset] && generation === goals[preset].gen);
    renderHistory(); auditStep();
    if (timer !== null && ((goals[preset] && generation >= goals[preset].gen) || generation >= 24 || cells.size === 0)) stopPlay();
  }
  function resetToInitial(message) {
    stopPlay(); cells = new Set(initial); generation = 0; recent = [{ gen: 0, live: cells.size, born: 0, died: 0 }]; lastValidation = null;
    document.getElementById('delta-count').textContent = '变化 00';
    renderGrid(false); renderHistory(); showProof(false);
    text('neutral', message || '起点已恢复，可以重新试。', preset === 'free' ? '点画布里的格子画或擦，再运行看看。' : '目标：' + goals[preset].label + '。先运行到第 ' + goals[preset].gen + ' 代，再看与预期差几格。');
    document.getElementById('copy-status').textContent = '';
  }
  function changePreset(name) {
    if (!Object.prototype.hasOwnProperty.call(seeds, name)) return;
    preset = name; initial = asSet(seeds[name]); focusIndex = name === 'glider' ? index(6, 7) : index(7, 7);
    document.querySelectorAll('[data-preset]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.preset === name)); });
    var instructions = name === 'blinker' ? '目标：让横排三格在第 1 代变成竖排三格。先用当前规则运行，再修订。' : name === 'glider' ? '目标：让五格滑翔机在第 4 代整体右下移动一格。可以连续运行，但会停在验收点。' : '自由实验：点或划过画布生成细胞，自己决定规则，观察它怎样生长。没有预设答案。';
    document.getElementById('challenge-text').textContent = instructions;
    resetToInitial(name === 'free' ? '空白画布，轮到你下第一笔。' : '样本已装入。试运行，再核对。');
  }
  function editCell(i, live) {
    if (timer !== null) stopPlay();
    if (generation > 0) {
      generation = 0; lastValidation = null;
      text('neutral', '你修改了起点。', '这是一份新的样本；请从第 0 代重新运行。');
      document.getElementById('delta-count').textContent = '变化 00';
      showProof(false);
    }
    if (live) cells.add(i); else cells.delete(i);
    initial = new Set(cells);
    recent = [{ gen: 0, live: cells.size, born: 0, died: 0 }]; renderHistory(); renderGrid(false);
    if (preset !== 'free') text('neutral', '样本已修改，准备重新验收。', '目标图形仍是预设样本的目标；若想自由画图，请选择“自由画布”。');
    else text('neutral', '画布已修改。', '现在有 ' + cells.size + ' 个活细胞。选规则并运行一步，看看画出的形状怎样改变。');
  }
  function buildGrid() {
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < size * size; i++) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'cell'; button.dataset.cell = String(i);
      button.style.setProperty('--delay', (i % size) * 10 + 'ms');
      buttons.push(button); fragment.appendChild(button);
    }
    grid.appendChild(fragment);
    grid.addEventListener('pointerdown', function (event) {
      var cell = event.target.closest('[data-cell]');
      if (!cell || event.button !== 0) return;
      event.preventDefault();
      var i = Number(cell.dataset.cell); focusIndex = i;
      painted = { pointer: event.pointerId, live: !cells.has(i), last: i };
      grid.setPointerCapture(event.pointerId); editCell(i, painted.live); cell.focus({ preventScroll: true });
    });
    grid.addEventListener('pointermove', function (event) {
      if (!painted || painted.pointer !== event.pointerId) return;
      var hit = document.elementFromPoint(event.clientX, event.clientY);
      var cell = hit && hit.closest('[data-cell]');
      if (!cell || !grid.contains(cell)) return;
      var i = Number(cell.dataset.cell);
      if (i === painted.last) return;
      painted.last = i; focusIndex = i; editCell(i, painted.live);
    });
    grid.addEventListener('pointerup', function () {
      if (painted) buttons[painted.last].focus({ preventScroll: true });
      painted = null;
    });
    grid.addEventListener('pointercancel', function () { painted = null; });
    grid.addEventListener('click', function (event) {
      var cell = event.target.closest('[data-cell]');
      if (cell && event.detail === 0) { var i = Number(cell.dataset.cell); focusIndex = i; editCell(i, !cells.has(i)); }
    });
    grid.addEventListener('keydown', function (event) {
      var i = Number(event.target.dataset.cell);
      if (Number.isNaN(i)) return;
      var row = Math.floor(i / size), col = i % size;
      if (event.key === 'ArrowUp') row = Math.max(0, row - 1);
      else if (event.key === 'ArrowDown') row = Math.min(size - 1, row + 1);
      else if (event.key === 'ArrowLeft') col = Math.max(0, col - 1);
      else if (event.key === 'ArrowRight') col = Math.min(size - 1, col + 1);
      else if (event.key === 'Home') col = 0;
      else if (event.key === 'End') col = size - 1;
      else return;
      event.preventDefault(); focusIndex = index(row, col); renderGrid(!!(goals[preset] && generation === goals[preset].gen)); buttons[focusIndex].focus({ preventScroll: true });
    });
  }
  document.querySelectorAll('[data-preset]').forEach(function (button) { button.addEventListener('click', function () { changePreset(button.dataset.preset); }); });
  document.querySelectorAll('[data-rule]').forEach(function (button) {
    button.addEventListener('click', function () {
      rule = button.dataset.rule;
      document.querySelectorAll('[data-rule]').forEach(function (option) { option.setAttribute('aria-pressed', String(option === button)); });
      resetToInitial('规则已换成“' + ruleLabel() + '”。');
    });
  });
  document.getElementById('step-once').addEventListener('click', function () { stopPlay(); nextGeneration(); });
  document.getElementById('toggle-play').addEventListener('click', function () {
    if (timer !== null) { stopPlay(); return; }
    if (goals[preset] && generation >= goals[preset].gen) resetToInitial('从同一个起点重新运行。');
    if (generation >= 24) resetToInitial('自由实验到第 24 代后，从起点重跑。');
    if (!cells.size) { text('neutral', '画布还是空的。', '先点亮几格，或换到预设样本，再运行。'); return; }
    timer = window.setInterval(nextGeneration, reduced ? 750 : 510);
    this.textContent = '暂停运行 ‖'; this.setAttribute('aria-pressed', 'true');
  });
  document.getElementById('rewind-seed').addEventListener('click', function () { resetToInitial('同一个起点已恢复。'); });
  document.getElementById('copy-proof').addEventListener('click', function () {
    var area = document.getElementById('proof-text'), status = document.getElementById('copy-status');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(area.value).then(function () { status.textContent = '已复制这张本页实验记录'; }, function () { area.focus(); area.select(); status.textContent = '已选中文字，可手动复制'; });
    } else { area.focus(); area.select(); status.textContent = '已选中文字，可手动复制'; }
  });
  buildGrid(); changePreset('blinker');
  document.documentElement.classList.add('lab-ready');
}());
