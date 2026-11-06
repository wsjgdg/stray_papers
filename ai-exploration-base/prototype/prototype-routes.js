/* 04 / Qualitative, local route matching. No earnings prediction or data storage. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var profile = { hours: '2', field: 'start', camera: 'no', learn: 'no' };
  var selected = null, pinned = false, firstMove = null;
  var scheduled = new Set(), micro = false, trial = false, outcome = null;
  var ids = ['starter', 'craft', 'systems'];
  var names = { starter: '先做一条图文', craft: '做熟悉领域的小作品', systems: '学一个轻量工作流' };
  var tier = { starter: '第一层 / 今天先做一次', craft: '第二层 / 学一点再试做', systems: '第三层 / 长期技能投资' };
  var stages = { starter: '无需先买课', craft: '做一件样品', systems: '先学后验证' };
  var lanes = document.getElementById('route-lanes'), laneNodes = {};
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function fieldName() {
    return { start: '刚起步', finance: '财务经验', insurance: '保险答疑', shop: '熟悉小店' }[profile.field];
  }
  function matchScores() {
    var h = Number(profile.hours), experienced = profile.field !== 'start';
    return {
      starter: 1 + (h <= 5 ? 2 : 0) + (profile.learn === 'no' ? 2 : 0) + (profile.camera === 'no' ? 1 : 0),
      craft: (h >= 5 ? 2 : 0) + (experienced ? 3 : 0) + (profile.learn === 'yes' ? 1 : 0),
      systems: (h >= 10 ? 3 : 0) + (profile.learn === 'yes' ? 3 : 0) - (h < 5 ? 1 : 0)
    };
  }
  function ordering() {
    var scores = matchScores();
    return ids.slice().sort(function (a, b) { return scores[b] - scores[a] || ids.indexOf(a) - ids.indexOf(b); });
  }
  function description(id) {
    if (id === 'starter') {
      var angle = { start: '生活小经验', finance: '家庭记账的小经验', insurance: '常见保障疑问', shop: '熟悉小店的一件小事' }[profile.field];
      return {
        title: '一条真实经验的图文',
        subtitle: '从熟悉的话题出发，无需出镜，也不以点赞数当收入。',
        reasons: [Number(profile.hours) <= 5 ? '时间不多，也能把一次试做拆成短时段。' : '时间充裕仍可以先跑通一次；不必一开始就做大项目。', profile.camera === 'no' ? '不出镜也可用文字和有权使用的配图表达。' : '愿意出镜不代表必须拍视频，先完成一条内容更轻。', profile.learn === 'no' ? '你选择先做一件小事，这条路线不要求系统学习。' : '你愿意学习，也可以先用这条路线验证表达是否清楚。'],
        caution: '先用免费工具；不上传私人照片、账本或客户资料；配图留意授权。',
        options: [
          { label: '写一条小经验', task: '写一条关于“' + angle + '”的真实经历，不编造案例。' },
          { label: '做一张小配图', task: '为“' + angle + '”做一张使用公开或自有素材的简单配图。' }
        ],
        continue: '把草稿念给一位熟人，删掉他听不懂或无法核对的说法。',
        feedback: '只问一句“你看懂了吗”，记录反馈后再决定要不要发布。'
      };
    }
    if (id === 'craft') {
      var specific = {
        start: { title: '熟人小店的第一张样图', task1: '问一家熟悉小店能否借公开商品资料练习，不接单也不收费。', task2: '先做一张只含真实信息的样图，核对价格与图片来源。', cont: '让店主指出不准确的字和图，重新排版一版。', feedback: '请店主说清“哪句看不懂”，先拿到修改意见而非收入承诺。', caution: '不擅自使用商标、名人头像或顾客照片；先求反馈，不承诺成交。' },
        finance: { title: '一页家庭账本说明', task1: '讲清一个你熟悉的家庭账本常见误区，不给投资建议。', task2: '用虚构数字做一页对照样例，自己重算每个数。', cont: '把口述整理成一页小册子草稿，标出仍需核实的数据。', feedback: '请一位熟人试读，改掉他看不懂的地方。', caution: '不荐股、不代客理财、不保证收益；真实账本要先遮住隐私。' },
        insurance: { title: profile.camera === 'yes' ? '一条保险问题短视频' : '一条不出镜的保险答疑', task1: '用一个虚构的客户问题写一则通俗答疑，不透露保单资料。', task2: profile.camera === 'yes' ? '试录一条 30 秒讲解，自己逐句核对条款。' : '把一个常见误区排成不出镜图文，逐句核对条款。', cont: profile.camera === 'yes' ? '剪出一段短片草稿，保留人工复核和更正机会。' : '整理成一张图文卡片，不用出镜也能把话说清楚。', feedback: '请懂业务的人帮你指出一处含糊表述，再修改。', caution: '不夸大保障、不承诺收益、不贬低同业；发布前由人核对产品条款。' },
        shop: { title: '一张社区小店海报', task1: '先问熟悉店主最想说明什么，只收集公开店铺信息。', task2: '用自有或获授权的素材排一张海报，核对营业信息。', cont: '做两个排版版本，自己检查文字是否清楚。', feedback: '把两版给店主看，记下要改的地方，不预测销量。', caution: '核对价格、营业信息和图片权属；不使用名人肖像或顾客照片。' }
      }[profile.field];
      return {
        title: specific.title,
        subtitle: profile.field === 'start' ? '没有既有领域经验时，先试样图；学会基础排版再谈接活。' : '借用你已有的经验，做一个能请人指出问题的小作品。',
        reasons: [Number(profile.hours) >= 5 ? '每周留出至少约 5 小时，够做一份样品再核对。' : '你只留出约 2 小时；做样品和核对可能需要分多周。', profile.field !== 'start' ? '你选了“' + fieldName() + '”，能用已有经验把关内容。' : '还没选熟悉领域时，这条路需要先找一个真实小场景。', profile.field === 'insurance' && profile.camera === 'no' ? '不出镜时自动改为图文答疑，不强迫拍视频。' : '成品只是练习样品，不是收入或客户数量预测。'],
        caution: specific.caution,
        options: [{ label: '从一个问题开始', task: specific.task1 }, { label: '从一份样品开始', task: specific.task2 }],
        continue: specific.cont, feedback: specific.feedback
      };
    }
    return {
      title: '轻量 AI 工作流草图',
      subtitle: '第三层是技能投资：先用虚构素材验证两步流程，不自动发布。',
      reasons: [Number(profile.hours) >= 10 ? '你每周能留约 10 小时，可把学习与复核都排进去。' : '当前时间偏少；要做这条路，先缩小到一张纸上的流程图。', profile.learn === 'yes' ? '你愿意系统学习，适合先研究免费入门工具。' : '你暂不想系统学习，这条路先放在后面也完全可以。', '不要求出镜，但任何自动化内容都必须有人审核。'],
      caution: '不交“包赚钱”培训费；不用客户资料当测试输入；不要让未核对的内容自动发布。',
      options: [{ label: '画出两步流程', task: '用纸画出“输入 → 草稿 → 人工核对”的两步流程。' }, { label: '试一个免费工具', task: '用虚构素材试一个免费入门工具，只连两步，不接真实账户。' }],
      continue: '用虚构输入跑一次，记录哪一步需要人判断而不能全自动。',
      feedback: '自己检查输出是否有事实错误；留一个人工审核闸门，不连接自动发布。'
    };
  }
  function buildLanes() {
    ids.forEach(function (id) {
      var button = el('button', 'route-lane'); button.type = 'button'; button.dataset.route = id;
      button.appendChild(el('span', 'lane-kicker'));
      button.appendChild(el('strong', 'lane-title'));
      button.appendChild(el('span', 'lane-subtitle'));
      var rail = el('span', 'lane-rail'); rail.appendChild(el('i')); button.appendChild(rail);
      button.appendChild(el('span', 'lane-reason'));
      button.addEventListener('click', function () { selected = id; pinned = true; firstMove = null; scheduled.clear(); micro = false; invalidateTrial(); renderSelection(); });
      laneNodes[id] = button; lanes.appendChild(button);
    });
  }
  function paintHero(order) {
    var graphic = document.querySelector('.route-graphic');
    if (!graphic) return;
    var bars = graphic.querySelectorAll('i');
    var fits = ['100%', '74%', '49%'];
    order.forEach(function (id, n) {
      var bar = bars[n];
      if (!bar) return;
      bar.style.setProperty('--fit', fits[n]);
      bar.dataset.route = id;
      bar.dataset.rank = String(n + 1);
      if (id === selected) bar.setAttribute('data-active', 'true');
      else bar.removeAttribute('data-active');
    });
    graphic.setAttribute('data-active', selected || '');
  }
  function renderLanes(order, animate) {
    var before = {};
    ids.forEach(function (id) { before[id] = laneNodes[id].getBoundingClientRect(); });
    order.forEach(function (id, n) {
      var node = laneNodes[id], data = description(id);
      node.querySelector('.lane-kicker').textContent = String(n + 1).padStart(2, '0') + ' / ' + tier[id];
      node.querySelector('.lane-title').textContent = data.title;
      node.querySelector('.lane-subtitle').textContent = data.subtitle;
      node.querySelector('.lane-reason').textContent = n === 0 ? '当前优先 / 点击选这条' : n === 1 ? '可以对比 / 点击选这条' : '暂缓也可以 / 点击查看';
      node.style.setProperty('--rail-length', ['100%', '74%', '49%'][n]);
      node.dataset.rank = String(n + 1);
      node.setAttribute('aria-pressed', String(selected === id));
      lanes.appendChild(node);
    });
    if (animate && !reduced) {
      order.forEach(function (id) {
        var node = laneNodes[id], old = before[id], now = node.getBoundingClientRect();
        var dx = old.left - now.left, dy = old.top - now.top;
        if ((Math.abs(dx) > 1 || Math.abs(dy) > 1) && node.animate) {
          node.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)', filter: 'brightness(1.3)' }, { transform: 'translate(0,0)', filter: 'brightness(1)' }], { duration: 650, easing: 'cubic-bezier(.18,.84,.25,1)' });
        }
      });
    }
    var pulse = document.getElementById('telemetry-pulse');
    order.forEach(function (id, i) {
      var strand = pulse.querySelector('[data-strand="' + id + '"]');
      strand.style.setProperty('--wire', (100 - i * 23) + '%');
      pulse.appendChild(strand);
    });
    pulse.classList.remove('is-switching');
    if (animate && !reduced) { void pulse.offsetWidth; pulse.classList.add('is-switching'); }
    paintHero(order);
  }
  function invalidateTrial() {
    trial = false; outcome = null;
    document.getElementById('week-simulation').hidden = true;
    document.getElementById('route-ticket').hidden = true;
    document.getElementById('copy-status').textContent = '';
  }
  function modules() {
    var data = description(selected), option = data.options[firstMove];
    var baseHours = selected === 'starter' ? (firstMove === 0 ? 1 : 2) : selected === 'craft' ? (firstMove === 0 ? 2 : (profile.field === 'insurance' && profile.camera === 'yes' ? 4 : 3)) : (firstMove === 0 ? 2 : 4);
    var checkDetail = selected === 'starter' ? '核对真假、隐私和素材来源。' : selected === 'systems' ? '用虚构输入核对输出，保留人工审核。' : profile.field === 'finance' ? '重新计算数字，不荐股、不保证收益。' : profile.field === 'insurance' ? '逐句核对产品条款与合规边界。' : '核对价格、图片权属和公开信息。';
    return [
      { id: 'make', name: micro ? '微样本 / ' + option.label : option.label, hours: micro ? 1 : baseHours, detail: micro ? '只做一小段示范，不当成完整作品。' : option.task },
      { id: 'check', name: '人工核对', hours: 1, detail: checkDetail },
      { id: 'feedback', name: '找人看一眼', hours: 1, detail: '邀请一位熟人指出不清楚的地方；不把反馈当成收入。' },
      { id: 'extend', name: selected === 'systems' ? '再学一个连接步骤' : '扩成第二版', hours: selected === 'systems' ? 3 : 2, detail: '可选扩展，别挤掉核对与休息时间。' }
    ];
  }
  function hoursUsed() {
    return modules().filter(function (item) { return scheduled.has(item.id); }).reduce(function (sum, item) { return sum + item.hours; }, 0);
  }
  function flight(sourceRect, id) {
    if (reduced || !sourceRect) return;
    var target = document.querySelector('#scheduled-tasks [data-unschedule="' + id + '"]');
    if (!target || !target.animate) return;
    var dest = target.getBoundingClientRect();
    if (dest.top > window.innerHeight || dest.bottom < 0 || sourceRect.top > window.innerHeight || sourceRect.bottom < 0) return;
    var slip = el('span', 'module-flight', '排入本周 →');
    slip.setAttribute('aria-hidden', 'true');
    slip.style.left = sourceRect.left + 'px'; slip.style.top = sourceRect.top + 'px';
    document.body.appendChild(slip);
    var dx = dest.left - sourceRect.left, dy = dest.top - sourceRect.top;
    var motion = slip.animate([
      { transform: 'translate(0,0) rotate(-4deg) scale(1)', opacity: 1 },
      { transform: 'translate(' + (dx * .55) + 'px,' + (dy * .4 - 30) + 'px) rotate(7deg) scale(.84)', opacity: 1, offset: .6 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(0) scale(.55)', opacity: 0 }
    ], { duration: 540, easing: 'cubic-bezier(.18,.8,.22,1)' });
    motion.finished.then(function () { slip.remove(); }, function () { slip.remove(); });
  }
  function toggleModule(id, source) {
    var rect = source && source.getBoundingClientRect();
    var added = !scheduled.has(id);
    if (added) scheduled.add(id); else scheduled.delete(id);
    invalidateTrial(); renderPlanner(); renderTicket();
    if (added) flight(rect, id);
    var focus = document.querySelector('#module-shelf [data-module="' + id + '"]');
    if (focus) focus.focus({ preventScroll: true });
  }
  function renderPlanner() {
    var planner = document.getElementById('week-planner');
    planner.hidden = firstMove === null;
    if (firstMove === null) return;
    var list = modules(), used = hoursUsed(), cap = Number(profile.hours);
    var shelf = document.getElementById('module-shelf'), tray = document.getElementById('scheduled-tasks');
    shelf.replaceChildren(); tray.replaceChildren();
    list.forEach(function (item) {
      var button = el('button', 'module-chip'); button.type = 'button'; button.dataset.module = item.id;
      button.draggable = true;
      button.setAttribute('aria-pressed', String(scheduled.has(item.id)));
      button.setAttribute('aria-label', (scheduled.has(item.id) ? '撤回' : '加入') + item.name + '，排程估算 ' + item.hours + ' 小时');
      button.append(el('span', 'chip-hour', item.hours + ' h'), el('strong', '', item.name), el('small', '', item.detail));
      button.addEventListener('click', function () { toggleModule(item.id, button); });
      button.addEventListener('dragstart', function (event) { event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'copy'; });
      shelf.appendChild(button);
      if (scheduled.has(item.id)) {
        var slot = el('button', 'scheduled-task'); slot.type = 'button'; slot.dataset.unschedule = item.id;
        slot.setAttribute('aria-label', '从本周撤回' + item.name + '，' + item.hours + ' 小时');
        slot.append(el('span', 'slot-number', String(tray.childElementCount + 1).padStart(2, '0')), el('strong', '', item.name), el('small', '', item.hours + ' h · 点按撤回'));
        slot.addEventListener('click', function () { toggleModule(item.id, null); });
        tray.appendChild(slot);
      }
    });
    if (!scheduled.size) tray.appendChild(el('p', 'empty-schedule', '还没有任务。先放入“做一件事”，再加上人工核对。'));
    document.getElementById('budget-label').textContent = '已排 ' + used + ' / ' + cap + ' 小时';
    document.getElementById('budget-status').textContent = used > cap ? '超出 ' + (used - cap) + ' 小时' : used === cap ? '时间刚好排满' : '还可留 ' + (cap - used) + ' 小时';
    document.getElementById('budget-display').dataset.state = used > cap ? 'over' : used === cap ? 'full' : 'open';
    document.getElementById('budget-fill').style.width = Math.min(100, used / cap * 100) + '%';
    document.getElementById('budget-overflow').hidden = used <= cap;
    var button = document.getElementById('micro-toggle');
    button.setAttribute('aria-pressed', String(micro));
    button.textContent = micro ? '微样本已开启 · 恢复完整起步 ↔' : '把起步缩成 1 小时微样本 ↔';
  }
  function simulate() {
    if (firstMove === null) return;
    var list = modules(), cap = Number(profile.hours), used = hoursUsed();
    var issues = [];
    if (!scheduled.has('make')) issues.push('还没有排进一件真正要做的小事。');
    if (!scheduled.has('check')) issues.push('没有人工核对，不能把草稿当作可用成果。');
    if (used > cap) issues.push('这周超出 ' + (used - cap) + ' 小时：撤掉扩展、做微样本，或调整时间。');
    outcome = issues.length ? (used > cap ? 'over' : !scheduled.has('check') ? 'unsafe' : 'empty') : 'ready';
    trial = true;
    var simulator = document.getElementById('week-simulation'), phases = document.getElementById('simulation-phases');
    simulator.hidden = false; simulator.dataset.outcome = outcome;
    phases.replaceChildren();
    [['01 / 起步', 'make'], ['02 / 核对', 'check'], ['03 / 回看', 'feedback']].forEach(function (entry) {
      var phase = el('span', 'simulation-phase' + (scheduled.has(entry[1]) ? ' is-planned' : ' is-missing'));
      phase.textContent = entry[0] + (scheduled.has(entry[1]) ? ' · 已排' : ' · 待补'); phases.appendChild(phase);
    });
    document.getElementById('simulation-title').textContent = outcome === 'ready' ? '这周可以试做，不代表已完成。' : outcome === 'over' ? '时间超载，先别照这张表开工。' : outcome === 'unsafe' ? '缺少核对，别让草稿直接出去。' : '还没排下真正的第一步。';
    document.getElementById('simulation-detail').textContent = issues.length ? issues.join(' ') : '已排 ' + used + ' / ' + cap + ' 小时，包含起步与人工核对。' + (scheduled.has('feedback') ? '也预留了找人反馈的时间。' : '本周没排反馈，先保留草稿，下周再找人核对看法。') + ' 这只是可尝试的计划，不是已完成的任务或收入保证。';
    simulator.classList.remove('is-running');
    if (!reduced) { void simulator.offsetWidth; simulator.classList.add('is-running'); }
    renderTicket();
  }
  function renderTicket() {
    var ticket = document.getElementById('route-ticket');
    ticket.hidden = firstMove === null || !trial || outcome !== 'ready';
    document.querySelectorAll('#step-choices button').forEach(function (button) { button.setAttribute('aria-pressed', String(Number(button.dataset.move) === firstMove)); });
    if (ticket.hidden) return;
    var data = description(selected), option = data.options[firstMove], list = document.getElementById('ticket-steps');
    var tasks = modules().filter(function (item) { return scheduled.has(item.id); });
    var timeLine = '本周已计划 ' + hoursUsed() + ' / ' + profile.hours + ' 小时' + (micro ? ' · 只做微样本，不是完整作品' : ' · 保留人工核对') + '。';
    document.getElementById('ticket-title').textContent = data.title + ' / ' + option.label;
    document.getElementById('ticket-time').textContent = timeLine;
    list.replaceChildren();
    tasks.forEach(function (item) { list.appendChild(el('li', '', item.name + '（示例 ' + item.hours + ' 小时）：' + item.detail)); });
    if (!scheduled.has('feedback')) list.appendChild(el('li', '', '本周未安排找人反馈；先保留草稿，下周再征求意见，不冒充已经收到反馈。'));
    document.getElementById('ticket-boundary').textContent = '边界 / ' + data.caution;
    document.getElementById('ticket-copy').value = '我的一周路线票（计划，不是完成记录或收入预测）\n条件：每周约 ' + profile.hours + ' 小时 / ' + fieldName() + ' / ' + (profile.camera === 'yes' ? '愿意出镜' : '不出镜') + ' / ' + (profile.learn === 'yes' ? '愿意系统学习' : '先做一件小事') + '\n路线：' + data.title + '\n优先依据：' + data.reasons.join(' ') + '\n' + timeLine + '\n本周排程：\n' + tasks.map(function (item) { return '· ' + item.name + ' / 示例 ' + item.hours + ' 小时：' + item.detail; }).join('\n') + (scheduled.has('feedback') ? '' : '\n· 下周再找人反馈，本周不冒充已收到意见。') + '\n边界：' + data.caution + '\n不保证收入。';
    ticket.classList.remove('is-printed'); if (!reduced) { void ticket.offsetWidth; ticket.classList.add('is-printed'); }
  }
  function renderSelection() {
    var order = ordering(), data = description(selected);
    ids.forEach(function (id) { laneNodes[id].setAttribute('aria-pressed', String(id === selected)); });
    document.getElementById('detail-rank').textContent = selected === order[0] ? '当前优先' : selected === order[1] ? '可对比的路线' : '条件尚不齐 / 仍可选';
    document.getElementById('detail-title').textContent = data.title;
    document.getElementById('detail-reason').textContent = data.reasons.join(' ');
    document.getElementById('detail-caution').textContent = '先看边界 / ' + data.caution;
    var choices = document.getElementById('step-choices'); choices.replaceChildren();
    data.options.forEach(function (option, n) {
      var button = el('button', 'step-choice'); button.type = 'button'; button.dataset.move = String(n);
      button.append(el('span', '', '先从 0' + (n + 1) + ' 开始'), el('strong', '', option.label), el('small', '', option.task));
      button.addEventListener('click', function () {
        if (firstMove !== n) { scheduled.clear(); micro = false; }
        firstMove = n; invalidateTrial(); renderPlanner(); renderTicket();
      });
      choices.appendChild(button);
    });
    document.getElementById('copy-status').textContent = '';
    document.getElementById('live-top').textContent = description(order[0]).title + (pinned && selected !== order[0] ? ' · 你正在看另一条' : ' · 根据你的条件');
    paintHero(order);
    renderPlanner(); renderTicket();
  }
  function update(fromInput) {
    var order = ordering(), prior = selected;
    if (!pinned || selected === null) selected = order[0];
    if (prior !== selected) { firstMove = null; scheduled.clear(); micro = false; }
    if (fromInput) invalidateTrial();
    renderLanes(order, fromInput);
    renderSelection();
    document.querySelectorAll('.choice-group').forEach(function (group) {
      var key = group.dataset.group;
      group.querySelectorAll('button').forEach(function (button) { button.setAttribute('aria-pressed', String(profile[key] === button.dataset.value)); });
    });
  }
  document.querySelectorAll('.choice-group').forEach(function (group) {
    group.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-value]');
      if (!button || !group.contains(button)) return;
      profile[group.dataset.group] = button.dataset.value;
      update(true);
    });
  });
  document.getElementById('reset-conditions').addEventListener('click', function () {
    profile = { hours: '2', field: 'start', camera: 'no', learn: 'no' };
    selected = null; pinned = false; firstMove = null; scheduled.clear(); micro = false; invalidateTrial(); update(true);
  });
  document.getElementById('micro-toggle').addEventListener('click', function () {
    micro = !micro; invalidateTrial(); renderPlanner(); renderTicket();
  });
  document.getElementById('run-week').addEventListener('click', simulate);
  var dropZone = document.getElementById('week-slots');
  dropZone.addEventListener('dragover', function (event) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; dropZone.classList.add('drag-ready'); });
  dropZone.addEventListener('dragleave', function (event) { if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('drag-ready'); });
  dropZone.addEventListener('drop', function (event) {
    event.preventDefault(); dropZone.classList.remove('drag-ready');
    if (firstMove === null) return;
    var id = event.dataTransfer.getData('text/plain');
    if (!modules().some(function (item) { return item.id === id; }) || scheduled.has(id)) return;
    scheduled.add(id); invalidateTrial(); renderPlanner(); renderTicket();
  });
  document.getElementById('copy-route').addEventListener('click', function () {
    var area = document.getElementById('ticket-copy'), status = document.getElementById('copy-status');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(area.value).then(function () { status.textContent = '已复制这张路线票'; }, function () { area.focus(); area.select(); status.textContent = '已选中文字，可手动复制'; });
    else { area.focus(); area.select(); status.textContent = '已选中文字，可手动复制'; }
  });
  buildLanes(); update(false);
  document.documentElement.classList.add('routes-ready');
}());
