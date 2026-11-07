/* 06 / Offline question calibration. No model calls, persistence, or production progress. */
(function () {
  'use strict';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fields = ['task', 'role', 'context', 'spec'];
  var names = { task: '任务', role: '角色', context: '背景', spec: '要求' };
  var inputs = { task: document.getElementById('task-input'), role: document.getElementById('role-input'), context: document.getElementById('context-input'), spec: document.getElementById('spec-input') };
  var scenes = {
    vague: { task: '帮我写点东西。', role: '', context: '', spec: '' },
    reading: { task: '为下周社区读书会写一段开场白', role: '社区读书会主持人', context: '给 50–60 岁的邻居，在下周社区读书会上使用', spec: '200 字左右，口语化，结尾邀请大家参与' },
    phone: { task: '写一份清理手机空间的操作说明', role: '耐心的手机使用讲解员', context: '给不熟悉手机设置的家人看；机型未知', spec: '按顺序列三步；提醒先备份，不确定的界面名称要核实' },
    finance: { task: '列出家庭开支表里值得复核的项目', role: '谨慎的财务整理助手', context: '给家庭成员看；不要填入真实账本、姓名和账户信息', spec: '只列可能需要核对的问题，不作投资或财务决定' }
  };
  var state = { pinned: null, sample: null, previous: null, trial: null, lastRun: null };
  function value(id) { return inputs[id].value.trim(); }
  function snapshot() { return Object.fromEntries(fields.map(function (id) { return [id, value(id)]; })); }
  function qualityTask(text) {
    var plain = text.replace(/[\s。！？!?，,、.]/g, '');
    return plain.length >= 6 && !/^(帮我)?(写点东西|做点东西|随便写|写一篇文章|写文章|做个东西|给点建议|给我建议|帮我做)(你看着办|随便|都行|就行|吧|谢谢)?$/.test(plain);
  }
  function usableClue(text) {
    /* Reject bare numbers and one-character placeholders, not certify meaning. */
    return text.trim().length >= 2 && /[\p{L}]/u.test(text);
  }
  function diagnostic(id, text) {
    if (id === 'task') return qualityTask(text) ? '写下了任务描述；它是否真的具体，要由你判断。' : '还不知道具体要做哪件事。';
    if (text && !usableClue(text)) return '只有数字或过短的占位文字；请写出可读的线索。';
    if (id === 'role') return text ? '填了角色线索；仍需自己核对适用性。' : '不清楚请它以谁的视角回答。';
    if (id === 'context') return text ? '填了背景线索；仍需检查使用对象与场合。' : '不知道给谁看、什么场合使用。';
    return text ? '填了输出要求；仍需自己核对具体程度。' : '不知道篇幅、形式或边界等具体要求。';
  }
  function setFeedback(text) { document.getElementById('deck-feedback').textContent = text; }
  function create(tag, cls, text) { var node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
  function renderCompare() {
    var box = document.getElementById('version-compare');
    box.hidden = !state.pinned;
    if (!state.pinned) return;
    var current = snapshot();
    var changed = fields.filter(function (id) { return current[id] !== state.pinned[id]; });
    document.getElementById('compare-count').textContent = changed.length ? '相比钉住的版本，已改 ' + changed.length + ' 项' : '与钉住的版本相同 · 改动后这里会显示差异';
    var lines = document.getElementById('compare-lines'); lines.replaceChildren();
    changed.forEach(function (id) {
      var line = create('div', 'compare-line');
      line.append(create('b', '', names[id]), create('del', '', '旧 · ' + (state.pinned[id] || '未填写')), create('ins', '', '新 · ' + (current[id] || '未填写')));
      lines.appendChild(line);
    });
  }
  function render() {
    var current = snapshot();
    var checks = fields.map(function (id) { return id === 'task' ? qualityTask(current[id]) : usableClue(current[id]); });
    var count = checks.filter(Boolean).length;
    document.getElementById('clarity-count').textContent = count + ' / 4 栏有线索';
    document.getElementById('signal-word').textContent = count === 4 ? '四栏有线索 / 还需判断内容' : '待补 ' + (4 - count) + ' 栏线索';
    var orbit = document.getElementById('signal-orbit');
    orbit.style.setProperty('--power', (count / 4).toFixed(2));
    orbit.dataset.level = String(count);
    document.getElementById('orbit-number').firstChild.textContent = String(count);
    orbit.querySelectorAll(':scope > i').forEach(function (dot, i) { dot.classList.toggle('on', checks[i]); });
    var diagnostics = document.getElementById('diagnostics'); diagnostics.replaceChildren();
    fields.forEach(function (id, i) {
      var node = create('div', 'diagnostic'); node.dataset.ready = String(checks[i]);
      if (state.previous && state.previous[i] !== checks[i] && !reduced) node.classList.add('is-flashing');
      node.append(create('b', '', (checks[i] ? '有线索 / ' : '待补充 / ') + names[id]), create('span', '', diagnostic(id, current[id])));
      diagnostics.appendChild(node);
      if (id === 'task') {
        document.querySelector('.task-field').dataset.ready = String(checks[i]);
        document.getElementById('task-hint').textContent = checks[i] ? '任务已有描述；是否真的具体，仍要由你判断。' : '这句话仍含糊：写什么、给谁用？';
      } else document.querySelector('[data-part="' + id + '"]').dataset.ready = String(checks[i]);
    });
    var composed = [current.task || '（任务待填写）'];
    if (current.role) composed.push('请以' + current.role + '的身份来回答。');
    if (current.context) composed.push('使用背景：' + current.context + (/[。！？!?]$/.test(current.context) ? '' : '。'));
    if (current.spec) composed.push('具体要求：' + current.spec + (/[。！？!?]$/.test(current.spec) ? '' : '。'));
    composed.push('请先给出可修改的草稿；不确定的事实请标明，别编造。最终内容由我核对后再使用。');
    document.getElementById('prompt-output').value = composed.join('\n');
    var copyState = document.getElementById('copy-state');
    copyState.textContent = count === 4 ? '四栏有线索 · 仍需自己判断' : '仍有 ' + (4 - count) + ' 栏待补';
    copyState.dataset.ready = String(count === 4);
    document.getElementById('copy-prompt').disabled = !current.task;
    state.previous = checks;
    renderCompare();
  }
  function pulse() {
    var orbit = document.getElementById('signal-orbit');
    orbit.classList.remove('is-pulsing');
    if (!reduced) { void orbit.offsetWidth; orbit.classList.add('is-pulsing'); }
  }
  function markCustom() {
    document.querySelectorAll('[data-scene]').forEach(function (button) { button.setAttribute('aria-pressed', 'false'); });
  }
  function update(message) {
    markCustom();
    invalidateTrial();
    render(); pulse();
    document.getElementById('copy-feedback').textContent = '当前是整理稿，不是 AI 生成的回答。复制后仍需核对。';
    if (message) setFeedback(message);
  }
  /* A deliberately local, deterministic thought experiment. The cards expose
     missing instructions; they are not generated answers or model predictions. */
  function invalidateTrial() {
    if (!state.trial) return;
    state.trial = null;
    var console = document.getElementById('trial-console');
    console.dataset.phase = 'stale'; console.classList.remove('is-running');
    document.getElementById('trial-message').textContent = '稿子变了：上一次试投和交接单都已失效。按“试投这一版”重新看看分岔。';
    document.getElementById('repair-receipt').hidden = true;
    var dock = document.getElementById('repair-dock');
    document.getElementById('repair-ports').insertAdjacentElement('afterend', dock);
    document.getElementById('branch-list').replaceChildren();
    document.getElementById('repair-ports').replaceChildren();
    ['repair-ports', 'repair-dock', 'review-gate', 'handoff'].forEach(function (id) { document.getElementById(id).hidden = true; });
  }
  function trialScene(task) {
    /* Only an unchanged, explicitly supplied sample receives sample repairs.
       Never guess a person's intent from keywords in their free writing. */
    return ['reading', 'phone', 'finance'].map(function (id) { return scenes[id]; })
      .find(function (scene) { return task === scene.task; }) || null;
  }
  function trialBranches(current) {
    if (!qualityTask(current.task)) {
      return [
        { field: 'task', title: '也许是活动开场？', effect: '如果本来想为读书会开场，笼统的“写点东西”没有说出这件事。', suggestion: scenes.reading.task },
        { field: 'task', title: '也许是手机说明？', effect: '如果想帮家人清理手机，这句话也没有操作对象或用途。', suggestion: scenes.phone.task },
        { field: 'task', title: '也许是开支核对？', effect: '如果要整理家庭账本，同一句话依然可能被误读。', suggestion: scenes.finance.task }
      ];
    }
    var example = trialScene(current.task);
    return [
      { field: 'role', title: '谁在说？', effect: '没有角色线索，可能得到泛泛的说法，而非你想要的视角。', suggestion: example ? example.role : '' },
      { field: 'context', title: '给谁看？', effect: '没有对象或场合，语气、背景知识和使用场景可能错位。', suggestion: example ? example.context : '' },
      { field: 'spec', title: '怎样算合用？', effect: '没有长度、形式或边界，可能拿到一篇无法直接使用的长文。', suggestion: example ? example.spec : '' }
    ].filter(function (branch) { return !usableClue(current[branch.field]); });
  }
  function trialMsg(message) { document.getElementById('trial-message').textContent = message; }
  function selectBranch(index) {
    var trial = state.trial;
    if (!trial || !trial.branches[index]) return;
    trial.selected = index;
    document.querySelectorAll('.branch-card').forEach(function (button, n) { button.setAttribute('aria-pressed', String(n === index)); });
    var branch = trial.branches[index], dock = document.getElementById('repair-dock');
    dock.hidden = false;
    var card = document.querySelector('.branch-card[data-branch="' + index + '"]');
    if (window.matchMedia('(max-width:760px)').matches) card.insertAdjacentElement('afterend', dock);
    else document.getElementById('repair-ports').insertAdjacentElement('afterend', dock);
    document.getElementById('repair-title').textContent = branch.title + ' / 接回“' + names[branch.field] + '”';
    document.getElementById('repair-explanation').textContent = branch.effect + (branch.suggestion ? ' 可借用一条预置示例；它不代表对你意图的推断，接回后仍可改写。' : ' 自由任务无法自动推断这一项，请回输入框自己填写。');
    document.getElementById('repair-suggestion').textContent = branch.suggestion || '不替你猜：请自己写下' + names[branch.field] + '。';
    document.getElementById('apply-repair').textContent = branch.suggestion ? '接回' + names[branch.field] + '示例 ↗' : '去填写' + names[branch.field] + ' ↗';
    trialMsg('选中“' + branch.title + '”：点击接回，或把这张卡拖进“' + names[branch.field] + '”接回口。');
    if (dock.getBoundingClientRect().bottom > innerHeight || dock.getBoundingClientRect().top < 0) {
      dock.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest' });
    }
  }
  function repairFlight(source, target) {
    if (reduced || !source || !target) return;
    var a = source.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (a.top < 0 || a.top > innerHeight || b.top < 0 || b.top > innerHeight) return;
    var slip = create('span', 'trial-flight', '线索接回 →');
    slip.setAttribute('aria-hidden', 'true'); slip.style.left = a.left + 'px'; slip.style.top = a.top + 'px';
    document.body.appendChild(slip);
    slip.animate([
      { transform: 'translate(0,0) rotate(-6deg)', opacity: 1 },
      { transform: 'translate(' + ((b.left - a.left) * .55) + 'px,' + ((b.top - a.top) * .4 - 28) + 'px) rotate(8deg)', opacity: 1, offset: .55 },
      { transform: 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px) scale(.55)', opacity: 0 }
    ], { duration: 550, easing: 'cubic-bezier(.16,.8,.2,1)' }).finished.then(function () { slip.remove(); }, function () { slip.remove(); });
  }
  function applyRepair(index, port, source) {
    var trial = state.trial;
    if (!trial || !trial.branches[index]) return;
    var branch = trial.branches[index];
    if (branch.field !== port) { trialMsg('还没接回：这张卡属于“' + names[branch.field] + '”，不是“' + names[port] + '”。'); return; }
    if (!branch.suggestion) {
      trialMsg('没有可安全推断的预置示例。请亲自写下“' + names[port] + '”；写完再试投。');
      inputs[port].focus(); return;
    }
    var target = document.querySelector('#repair-ports [data-port="' + port + '"]');
    repairFlight(source, target);
    inputs[port].value = branch.suggestion;
    update('已把“' + names[port] + '”示例接回输入；仍请改成你自己的意思。');
    trialMsg('已接回“' + names[port] + '”：整理稿与四项诊断已更新。上次试投失效；现在再试投一次，看看剩下什么。');
    var receipt = document.getElementById('repair-receipt');
    document.getElementById('receipt-change').textContent = names[port] + ' ← ' + branch.suggestion;
    receipt.hidden = false;
    receipt.scrollIntoView({ behavior: 'instant', block: 'center' });
    document.getElementById('rerun-trial').focus({ preventScroll: true });
  }
  /* 上一次试投和这一次的对照：改稿到底让分岔少了几处 */
  function paintTrialCompare(branches) {
    var console = document.getElementById('trial-console');
    if (!console) return;
    var prev = state.lastRun;
    var now = { count: branches.length, fields: branches.map(function (b) { return b.field; }) };
    var box = document.getElementById('trial-compare');
    if (!prev) {
      if (box) box.remove();
      state.lastRun = now;
      return;
    }
    if (!box) {
      box = create('div', 'trial-compare');
      box.id = 'trial-compare';
      var line = console.querySelector('.trial-line');
      if (line) line.insertAdjacentElement('afterend', box); else console.prepend(box);
    }
    var delta = prev.count - now.count;
    box.hidden = false;
    box.dataset.trend = delta > 0 ? 'down' : delta < 0 ? 'up' : 'same';
    box.replaceChildren(
      create('span', '', '上一次试投 / PREVIOUS'),
      create('strong', '', prev.count ? prev.count + ' 处没说清' : '四栏齐了'),
      create('i', '', '→'),
      create('em', '', '这一次 / NOW'),
      create('strong', '', now.count ? now.count + ' 处没说清' : '四栏齐了'),
      create('b', '', delta > 0 ? '少 ' + delta + ' 处' : delta < 0 ? '多 ' + (-delta) + ' 处' : '没有变化')
    );
    state.lastRun = now;
  }
  function runTrial() {
    document.getElementById('repair-receipt').hidden = true;
    var current = snapshot(), branches = trialBranches(current);
    state.trial = { branches: branches, selected: null, review: new Set() };
    var console = document.getElementById('trial-console'), list = document.getElementById('branch-list'), ports = document.getElementById('repair-ports');
    console.dataset.phase = branches.length ? 'branched' : 'ready';
    paintTrialCompare(branches);
    console.classList.remove('is-running');
    if (!reduced) { void console.offsetWidth; console.classList.add('is-running'); }
    ports.insertAdjacentElement('afterend', document.getElementById('repair-dock'));
    list.replaceChildren(); ports.replaceChildren();
    document.getElementById('repair-dock').hidden = true;
    document.getElementById('handoff').hidden = true;
    document.getElementById('handoff-status').textContent = '';
    document.getElementById('review-gate').hidden = !!branches.length;
    ports.hidden = !branches.length;
    if (branches.length) {
      trialMsg(!qualityTask(current.task) ? '这句话可能指向三件完全不同的事。下面仅是教学中的可能意图；选一条你真正想做的，再亲手接回。' : '还有 ' + branches.length + ' 处没有说清。每张卡是一个缺项可能造成的后果，不是模型预测的实际回答。');
      branches.forEach(function (branch, index) {
        var button = create('button', 'branch-card'); button.type = 'button'; button.draggable = true;
        button.dataset.branch = String(index); button.setAttribute('aria-pressed', 'false');
        button.append(create('small', '', String(index + 1).padStart(2, '0') + ' / 可能分岔'), create('strong', '', branch.title), create('span', '', branch.effect), create('b', '', '接回' + names[branch.field] + ' ↗'));
        button.addEventListener('click', function () { selectBranch(index); });
        button.addEventListener('dragstart', function (event) { event.dataTransfer.setData('text/plain', 'trial:' + index); event.dataTransfer.effectAllowed = 'move'; });
        list.appendChild(button);
      });
      Array.from(new Set(branches.map(function (branch) { return branch.field; }))).forEach(function (field) {
        var port = create('button', '', names[field] + ' / 接回口'); port.type = 'button'; port.dataset.port = field;
        port.addEventListener('click', function () {
          if (state.trial && state.trial.selected !== null) applyRepair(state.trial.selected, field, document.querySelector('.branch-card[aria-pressed="true"]'));
          else trialMsg('先选一张分岔卡，再点对应的接回口；桌面也可以把卡片直接拖进去。');
        });
        port.addEventListener('dragover', function (event) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; port.classList.add('drag-over'); });
        port.addEventListener('dragleave', function () { port.classList.remove('drag-over'); });
        port.addEventListener('drop', function (event) {
          event.preventDefault(); port.classList.remove('drag-over');
          var match = /^trial:(\d+)$/.exec(event.dataTransfer.getData('text/plain'));
          if (!match) return;
          var index = Number(match[1]);
          applyRepair(index, field, document.querySelector('.branch-card[data-branch="' + index + '"]'));
        });
        ports.appendChild(port);
      });
    } else {
      trialMsg('四栏都有可读线索；这无法判断内容是否具体、是否彼此一致，更不能证明模型会答对。先安排人工核对，再带走练习交接单。');
      document.querySelectorAll('[data-review]').forEach(function (button) { button.setAttribute('aria-pressed', 'false'); });
      document.getElementById('review-status').textContent = '尚未安排核对项。';
      document.getElementById('issue-handoff').disabled = true;
    }
  }
  document.getElementById('run-trial').addEventListener('click', runTrial);
  document.getElementById('rerun-trial').addEventListener('click', function () {
    runTrial();
    var next = document.querySelector('#branch-list .branch-card') || document.querySelector('#review-steps button');
    if (next) {
      next.scrollIntoView({ behavior: 'instant', block: 'center' });
      next.focus({ preventScroll: true });
    }
  });
  document.getElementById('apply-repair').addEventListener('click', function (event) {
    if (state.trial && state.trial.selected !== null) {
      var branch = state.trial.branches[state.trial.selected];
      applyRepair(state.trial.selected, branch.field, event.currentTarget);
    }
  });
  document.querySelectorAll('[data-review]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (!state.trial || state.trial.branches.length) return;
      var id = button.dataset.review;
      if (state.trial.review.has(id)) state.trial.review.delete(id); else state.trial.review.add(id);
      button.setAttribute('aria-pressed', String(state.trial.review.has(id)));
      var n = state.trial.review.size;
      document.getElementById('review-status').textContent = '已安排 ' + n + ' / 3 项待核对事项；并不代表已经查证。';
      document.getElementById('issue-handoff').disabled = n !== 3;
      document.getElementById('handoff').hidden = true;
    });
  });
  document.getElementById('issue-handoff').addEventListener('click', function () {
    if (!state.trial || state.trial.branches.length || state.trial.review.size !== 3) return;
    document.getElementById('handoff').hidden = false;
    document.getElementById('handoff-summary').textContent = '你安排了三项核对工作。下面只有提问稿和待办，不包含模型回答，也不证明这些事已经完成。';
    document.getElementById('handoff-copy').value = '我的练习交接单（计划，不是完成记录）\n\n' + document.getElementById('prompt-output').value + '\n\n待人工核对：\n1. 查证事实与来源\n2. 遮住隐私与账户信息\n3. 核对素材权属及使用场合\n\n本地练习未调用 AI；预写教学样例不对应这条自由输入。';
    document.getElementById('handoff-status').textContent = '';
    if (!reduced) {
      var ticket = document.getElementById('handoff');
      ticket.animate([{ opacity: .3, transform: 'translateY(28px) rotate(3deg)' }, { opacity: 1, transform: 'translateY(0) rotate(-.25deg)' }], { duration: 540, easing: 'cubic-bezier(.16,.8,.2,1)' });
    }
  });
  document.getElementById('copy-handoff').addEventListener('click', function () {
    var area = document.getElementById('handoff-copy'), status = document.getElementById('handoff-status');
    function fallback() {
      area.focus(); area.select();
      try { if (document.execCommand('copy')) { status.textContent = '已复制练习计划'; return; } } catch (e) { /* selection remains */ }
      status.textContent = '已选中文字，请手动复制';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(area.value).then(function () { status.textContent = '已复制练习计划'; }, fallback);
    else fallback();
  });

  fields.forEach(function (id) {
    inputs[id].addEventListener('input', function () { update('已更新' + names[id] + '；右侧重新检查四项线索。'); });
  });
  document.querySelectorAll('[data-scene]').forEach(function (button) {
    button.addEventListener('click', function () {
      var id = button.dataset.scene, scene = scenes[id];
      fields.forEach(function (field) { inputs[field].value = scene[field]; });
      markCustom(); button.setAttribute('aria-pressed', 'true');
      invalidateTrial(); render(); pulse(); setFeedback('已切到“' + button.textContent.trim() + '”；可以继续修改任何一项。');
      document.getElementById('copy-feedback').textContent = '切换场景后整理稿已更新；它不是模型回答。';
    });
  });
  function applyPiece(button) {
    var id = button.dataset.piece;
    inputs[id].value = button.dataset.text;
    update('已接上' + names[id] + '线索；你可以直接改写，也可以取下。');
    inputs[id].focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-piece]').forEach(function (button) {
    button.addEventListener('click', function () { applyPiece(button); });
    button.addEventListener('dragstart', function (event) { event.dataTransfer.setData('text/plain', button.dataset.piece + ':' + button.dataset.text); event.dataTransfer.effectAllowed = 'copy'; });
  });
  document.querySelectorAll('.part').forEach(function (part) {
    part.addEventListener('dragover', function (event) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; part.classList.add('drag-over'); });
    part.addEventListener('dragleave', function () { part.classList.remove('drag-over'); });
    part.addEventListener('drop', function (event) {
      event.preventDefault(); part.classList.remove('drag-over');
      var raw = event.dataTransfer.getData('text/plain'); var split = raw.indexOf(':');
      var id = split < 0 ? '' : raw.slice(0, split), text = raw.slice(split + 1);
      var known = Array.prototype.some.call(document.querySelectorAll('.part-options button[data-piece]'), function (button) {
        return button.dataset.piece === id && button.dataset.text === text;
      });
      if (id !== part.dataset.part || !known) { setFeedback('这一条应放在对应的线索位；也可以直接点线索。'); return; }
      inputs[id].value = text; update('已把' + names[id] + '线索拖进对应位置。');
    });
  });
  document.querySelectorAll('[data-clear]').forEach(function (button) {
    button.addEventListener('click', function () {
      var id = button.dataset.clear;
      inputs[id].value = ''; update('已取下' + names[id] + '；对照右侧会看到缺失带来的歧义。');
      inputs[id].focus({ preventScroll: true });
    });
  });
  document.getElementById('pin-version').addEventListener('click', function () {
    state.pinned = snapshot();
    renderCompare();
    setFeedback('这一版已在当前页面钉住。现在删改线索，对照区会列出实际变化。');
  });
  document.getElementById('copy-prompt').addEventListener('click', function () {
    var area = document.getElementById('prompt-output');
    function status(message) { document.getElementById('copy-feedback').textContent = message + ' · 这是提问稿，不是 AI 的回答。'; }
    function fallback() {
      area.focus(); area.select();
      try { if (document.execCommand('copy')) { status('已复制'); return; } } catch (e) { /* manual selection remains */ }
      status('已选中文字，请手动复制');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(area.value).then(function () { status('已复制'); }, fallback);
    else fallback();
  });
  var samples = {
    A: { answer: '好的，我可以帮您写文章、诗歌、祝福语……您想写什么主题？给谁看呢？', suitable: false, note: 'A 连任务都没说清，示例只能把问题问回来。先补具体任务，再谈风格。' },
    B: { answer: '秋天来了，树叶黄了，风里带着一丝凉意。脚下的落叶沙沙作响……（教学节选）', suitable: false, note: 'B 写出了秋天散文，却不是邻居读书会的开场白。题材、听众和用途没有对上。' },
    C: { answer: '各位邻居、各位书友，下午好！一本书、一壶茶、一群聊得来的老伙计，让退休生活有滋味。今天，先把掌声送给愿意来读书会的自己！（教学节选）', suitable: true, note: 'C 更贴近固定任务：主持人的身份、邻居听众、读书会场合与结尾动作都在。但仍要人检查表达是否合适，不能直接视为真实 AI 的回答。' }
  };
  document.querySelectorAll('[data-sample]').forEach(function (button) {
    button.addEventListener('click', function () {
      var id = button.dataset.sample;
      state.sample = id;
      document.querySelectorAll('[data-sample]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      document.getElementById('sample-label').textContent = 'PREWRITTEN / 固定教学样例 ' + id;
      document.getElementById('sample-answer').textContent = samples[id].answer;
      document.getElementById('sample-feedback').textContent = '';
      document.getElementById('sample-judge').hidden = false;
      var result = document.getElementById('sample-result'); result.classList.remove('is-revealing');
      if (!reduced) { void result.offsetWidth; result.classList.add('is-revealing'); }
    });
  });
  document.querySelectorAll('[data-judgment]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (!state.sample) return;
      var choice = button.dataset.judgment === 'yes', sample = samples[state.sample];
      document.getElementById('sample-feedback').textContent = (choice === sample.suitable ? '判断和这道固定任务吻合。' : '再看看这份回答和固定任务对不对得上。') + sample.note;
    });
  });
  var levels = [
    'L1：找一个你真正关心的问题，先写明任务、角色、背景、要求，再到你选择的工具里试一次；这里不会替你发送。',
    'L2：挑一张图或一段文案完成一次小作品。使用前核对事实、素材授权和个人隐私，不把练习当成已交付。',
    'L3：观察一个真正的语音助手或 Agent 如何拆步骤；检查它是否每一步都需要你确认。本页不模拟真实执行。',
    'L4：回到③规则调试台，亲手运行一个规则，再问儿子：哪一步是算法，哪一步才可能用到 AI？',
    'L5：这是远期目标。先列出一个小助手可以处理的任务、数据边界与需要人确认的步骤，再和儿子讨论。'
  ];
  document.querySelectorAll('.level-list button[data-level]').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('.level-list button[data-level]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      document.getElementById('level-plan').textContent = levels[Number(button.dataset.level)] + ' 这是下一步计划，不是完成证明。';
    });
  });
  var phoneReading = window.matchMedia('(max-width:760px)');
  function arrangeReadingLayers() {
    ['sample-expand', 'after-expand'].forEach(function (id) { document.getElementById(id).open = !phoneReading.matches; });
  }
  arrangeReadingLayers();
  if (phoneReading.addEventListener) phoneReading.addEventListener('change', arrangeReadingLayers);
  render();
  document.documentElement.classList.add('academy-ready');
}());
