/* Standalone, offline interaction prototype. This does not call AI, store user input,
   or touch the production site's completion/progress state. */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function motion(targets) {
    if (!reduced && window.gsap) {
      window.gsap.killTweensOf(targets);
      window.gsap.fromTo(targets, { opacity: 0.35, y: 15 }, { opacity: 1, y: 0, duration: 0.42, stagger: 0.055, ease: 'power2.out', overwrite: true });
    }
  }
  function create(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function replace(parent, nodes) {
    parent.replaceChildren.apply(parent, nodes);
  }
  var page = document.body.getAttribute('data-page');
  if (page === 'home') initHome();
  if (page === 'scam') initScam();

  function initHome() {
    var channels = [
      // mode 是给样式用的内部代号（.preview-forge 等），不必跟页面名字一致
      { name: 'AI 能做什么', desc: '五张能翻面的实物卡：海报、朋友圈、小票、修照片、微信问答——背面是能照抄的提示词。', href: 'chapter-01.html', playable: true, mode: 'forge', a: '正面', b: '背面' },
      { name: 'AI 趋势与行业', desc: '一条时间线、一张十人里 3.6 个在用的数据展台、五个行业——把情报分拣成两档。', href: 'chapter-02.html', playable: true, mode: 'trends', a: '情报', b: '试验票' },
      { name: '儿子的 AI 实验室', desc: '把一条细胞规则真的跑起来，看它自己长出图案，再翻孩子这学期交的三件作品。', href: 'chapter-03.html', playable: true, mode: 'lab', a: '规则', b: '实验记录' },
      { name: '副业地图', desc: '三条路线摆在一张地图上，先算时间再算钱，挑一个能落地的第一步。', href: 'chapter-04.html', playable: true, mode: 'routes', a: '条件', b: '试运行' },
      { name: '骗局解剖室', desc: '八幕演完一场骗局，关键处自己踩一脚，看话术怎么一步步合围。', href: 'chapter-05.html', playable: true, mode: 'scam', a: '话术', b: '证据' },
      { name: '提示词学院', desc: '三课：拆出好提示词的三要素、把一句烂提示词试投三档看差别、再看 AI 下一步怎么自己干活。', href: 'chapter-06.html', playable: true, mode: 'academy', a: '模糊问题', b: '校准稿' }
    ];
    var track = document.getElementById('dial-track');
    var dial = document.getElementById('dial');
    var handle = track.querySelector('.dial-handle');
    var nav = Array.prototype.slice.call(document.querySelectorAll('.channel-list [data-channel]'));
    var visual = document.getElementById('mission-visual');
    var launch = document.getElementById('mission-launch');
    var active = 0, dragging = false, glideFrame = 0, glideDeg = 0;
    // 把指针放到某个角度上（拖动时逐帧调用，必须即时）
    function position(degrees) {
      glideDeg = degrees;
      var radians = degrees * Math.PI / 180;
      handle.style.left = 'calc(50% + ' + (Math.sin(radians) * 50) + '% - 16px)';
      handle.style.top = 'calc(50% - ' + (Math.cos(radians) * 50) + '% - 16px)';
      dial.style.setProperty('--needle', degrees + 'deg');
    }
    function stopGlide() {
      if (glideFrame) cancelAnimationFrame(glideFrame);
      glideFrame = 0;
      dial.classList.remove('is-gliding');
    }
    function jump(degrees) { stopGlide(); position(degrees); }
    // 换台时让旋钮沿弧线滑过去：以前指针有 .75s 缓动、把手却是瞬移，两个指示器会打架。
    function glideTo(target, animate) {
      stopGlide();
      if (!animate || reduced) { position(target); return; }
      var from = glideDeg;
      var delta = ((target - from + 540) % 360) - 180;   // 走短弧，别绕整圈
      var started = performance.now(), duration = 750;
      dial.classList.add('is-gliding');
      (function frame(now) {
        var t = Math.min(1, (now - started) / duration);
        var eased = 1 - Math.pow(1 - t, 5);
        position(from + delta * eased);
        if (t < 1) { glideFrame = requestAnimationFrame(frame); }
        else {
          glideFrame = 0;
          dial.classList.remove('is-gliding');
          // 到位"咔哒"一下：让指针落定的手感和旋钮同步（减弱动效时由 CSS 关掉）
          if (delta) {
            dial.classList.remove('is-seated');
            void dial.offsetWidth;
            dial.classList.add('is-seated');
            setTimeout(function () { dial.classList.remove('is-seated'); }, 340);
          }
        }
      })(started);
    }
    function select(i, animate) {
      active = (i + channels.length) % channels.length;
      var ch = channels[active], number = String(active + 1).padStart(2, '0');
      dial.dataset.channel = String(active);
      dial.dataset.playable = String(ch.playable);
      document.getElementById('dial-number').textContent = number;
      document.getElementById('dial-mode').textContent = ch.playable ? 'ON AIR' : 'NO SIGNAL';
      document.getElementById('mission-index').textContent = number + ' / 06 · ' + (ch.playable ? '可玩原型' : '预留频段');
      document.getElementById('signal-power').textContent = ch.playable ? 'LIVE / 已接通' : 'OFFLINE / 未制作';
      document.getElementById('deck-readout').textContent = 'CH.' + number + (ch.playable ? ' 接通 · ' : ' 尚未制作 · ') + ch.name;
      document.getElementById('mission-name').textContent = ch.name;
      document.getElementById('mission-description').textContent = ch.desc;
      document.querySelector('.preview-a').textContent = ch.a;
      document.querySelector('.preview-b').textContent = ch.b;
      visual.dataset.mode = ch.mode;
      visual.classList.remove('is-tuning');
      if (animate && !reduced) { void visual.offsetWidth; visual.classList.add('is-tuning'); }
      if (ch.playable) { launch.href = ch.href; launch.hidden = false; }
      else { launch.removeAttribute('href'); launch.hidden = true; }
      document.getElementById('mission-caption').hidden = !ch.playable;
      document.getElementById('mission-caption').textContent = ch.mode === 'scam' ? '情景模拟 · 不涉及真钱或个人资料' : ch.mode === 'trends' ? '离线资料练习 · 不连接实时新闻' : ch.mode === 'lab' ? '本地规则计算 · 不调用 AI 或上传数据' : ch.mode === 'routes' ? '定性路线练习 · 不预测收入或保存条件' : ch.mode === 'academy' ? '本地整理提问 · 不调用 AI 或保存输入' : '离线可用 · 不提交任何输入';
      track.setAttribute('aria-valuenow', String(active + 1));
      track.setAttribute('aria-valuetext', '第 ' + (active + 1) + ' 关：' + nav[active].querySelector('strong').textContent + '；' + (ch.playable ? '可玩原型' : '原型尚未制作'));
      nav.forEach(function (button, n) { button.setAttribute('aria-pressed', String(n === active)); });
      if (!dragging) glideTo(active * 60, animate);
    }
    function chooseFromPointer(e) {
      var r = track.getBoundingClientRect();
      var degrees = ((Math.atan2(e.clientX - (r.left + r.width / 2), (r.top + r.height / 2) - e.clientY) * 180 / Math.PI) + 360) % 360;
      jump(degrees);
      var next = Math.round(degrees / 60) % 6;
      if (next !== active) select(next, true);
    }
    track.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      dragging = true; dial.classList.add('is-dragging');
      track.setPointerCapture(e.pointerId); chooseFromPointer(e);
    });
    track.addEventListener('pointermove', function (e) { if (dragging) chooseFromPointer(e); });
    function stopDrag() { if (dragging) { dragging = false; dial.classList.remove('is-dragging'); glideTo(active * 60, true); } }
    track.addEventListener('pointerup', stopDrag);
    track.addEventListener('pointercancel', stopDrag);
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); select(active + 1, true); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); select(active - 1, true); }
      else if (e.key === 'Home') { e.preventDefault(); select(0, true); }
      else if (e.key === 'End') { e.preventDefault(); select(5, true); }
      else if (e.key === 'Enter' && channels[active].playable) { window.location.href = channels[active].href; }
    });
    nav.forEach(function (button, n) {
      button.addEventListener('click', function (e) {
        select(n, true);
        if (e.detail > 0 && window.matchMedia('(max-width: 650px)').matches) {
          visual.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
        }
      });
    });
    document.querySelectorAll('[data-quick-channel]').forEach(function (button) {
      button.addEventListener('click', function () { select(Number(button.dataset.quickChannel), true); });
    });
    select(0, false);
  }

  function initScam() {
    if (!Array.isArray(window.SCAM_SCRIPT) || window.SCAM_SCRIPT.length < 3) return;
    var script = window.SCAM_SCRIPT;
    var index = 0, visited = 0, branch = null, finalDecision = null;
    // 幕数由数据决定：真源是八幕，岔路在第 5 幕，第二次判断在第 6 幕
    var last = script.length - 1, BRANCH = 4, DECISION = 5;
    var clues = new Set(), revealed = new Set();
    var actClues = (Array.isArray(window.SCAM_CLUES) && window.SCAM_CLUES.length)
      ? window.SCAM_CLUES : [
      [
        { phrase: '15年私募', why: '自称资历不等于持牌资质，应到独立渠道查证。' },
        { phrase: '免费分享', why: '免费荐股建立信任，随后可能诱导你转向私下交易。' }
      ],
      [
        { phrase: '先投500', why: '用小金额降低戒心，再逐步要求投入更多。' },
        { phrase: '张姐都赚了小两千', why: '借“别人都赚了”制造社会认同；群友与收益截图均需查证。' }
      ],
      [
        { phrase: '国家扶持的量化基金项目', why: '借官方名义包装，未经核验不能当作真实背书。' },
        { phrase: '保本保息', why: '保本承诺是典型风险信号，不能凭一句话相信。' },
        { phrase: '今晚12点截止', why: '倒计时逼你跳过查证和与家人商量。' }
      ],
      [{ phrase: '账户显示：盈利 6,000 元', why: '账面数字不是已到手的钱，先验证是否能正常提现。' }],
      [{ phrase: '先缴纳20%保证金', why: '提现前先收费是高危信号，不要再向对方转账。' }],
      [{ phrase: '就差这最后一笔', why: '用沉没成本和亲近口吻催你再交钱，先停下核验。' }]
    ];
    var totalClues = actClues.reduce(function (n, group) { return n + group.length; }, 0);
    function stageCount(i) { return (actClues[i] || []).filter(function (c) { return clues.has(c.phrase); }).length; }
    var message = document.getElementById('story-message');
    var analysis = document.getElementById('analysis-content');
    var actions = document.getElementById('decision-actions');
    var clueArea = document.getElementById('clue-area');
    var clueButtons = document.getElementById('clue-buttons');
    var progress = document.getElementById('scam-progress');
    var previous = document.getElementById('previous-stage');
    var caseLayout = document.querySelector('.decision-layout');
    var storySide = document.querySelector('.story-side');
    function exposeNotes(open) { caseLayout.dataset.revealed = open ? 'true' : 'false'; }
    function action(label, fn, cls) {
      var button = create('button', cls || '', label);
      button.type = 'button'; button.addEventListener('click', fn);
      actions.appendChild(button);
      return button;
    }
    function paragraph(parent, text, cls) { parent.appendChild(create('p', cls || '', text)); }
    var actReports = (Array.isArray(window.SCAM_REPORTS) && window.SCAM_REPORTS.length)
      ? window.SCAM_REPORTS.map(function (r, i) {
          return (r && r.u) ? r : { t: '中国长安网：单亲妈妈 10 天被骗 150 万全过程',
                                   u: 'https://www.chinapeace.gov.cn/chinapeace/c100059/2021-09/06/content_12533425.shtml' };
        })
      : [
      { t: '深圳市公安局：短视频里的“股神”主动找你？这是 80 万骗局的开始', u: 'https://ga.sz.gov.cn/gkmlpt/content/12/12287/post_12287269.html' },
      { t: '新浪财经：“2724 人的炒股群，除了自己全是托”', u: 'https://finance.sina.com.cn/jjxw/2026-08-14/doc-ininfrtz9564749.shtml' },
      { t: '人民网：公安部公布十大高发电信网络诈骗类型', u: 'http://society.people.com.cn/n1/2024/0625/c1008-40263971.html' },
      { t: '新京报：北京虚假投资理财电诈主要受害者为中老年人', u: 'https://m.bjnews.com.cn/detail/1761656258168910.html' },
      { t: '上海市公安局松江分局：提现需缴 2 万元保证金解冻', u: 'https://gaj.sh.gov.cn/sjga/list/toGjDetail?lmName=%E8%AD%A6%E6%96%B9%E6%96%B0%E9%97%BB&lmUrl=list/toGjIndex?type=jwbd&pa=c756679f93e8708fd4be8289ef26c15542fe1f419a5529d4590b5b7bd83f5296' },
      { t: '深圳市龙华区公安分局：骗子专挑“离异带娃”打感情牌', u: 'https://www.szlhq.gov.cn/bmxxgk/gafj/dtxx_124565/gzdt_124566/content/post_11932588.html' },
      { t: '中国长安网：单亲妈妈 10 天被骗 150 万全过程', u: 'https://www.chinapeace.gov.cn/chinapeace/c100059/2021-09/06/content_12533425.shtml' }
    ];
    function paintReport() {
      var item = actReports[index];
      if (!item) return;
      var row = create('p', 'story-source');
      row.appendChild(create('b', '', index === last ? '📰 整条链条' : '📰 这一幕在真实案件里'));
      var a = create('a', '', item.t + ' ↗');
      a.href = item.u; a.target = '_blank'; a.rel = 'noopener noreferrer';
      row.appendChild(a);
      analysis.appendChild(row);
    }
    function detail(extra, safe) {
      var st = script[index];
      exposeNotes(true);
      analysis.replaceChildren();
      analysis.appendChild(create('h3', '', st.hookTitle));
      paragraph(analysis, st.anatomy);
      if (index < last) {
        paragraph(analysis, '本幕已封存 ' + stageCount(index) + ' / ' + actClues[index].length + ' 处话术。' + (stageCount(index) ? '你标记的句子已写入证据袋。' : '还没标记？可以回到原话点选或拖入。'), 'analysis-count');
        actClues[index].filter(function (c) { return clues.has(c.phrase); }).forEach(function (c) {
          paragraph(analysis, '“' + c.phrase + '”：' + c.why, 'analysis-note');
        });
      }
      paragraph(analysis, '下一步：' + st.correctMove, 'analysis-note safe');
      if (extra) paragraph(analysis, extra, 'analysis-note' + (safe ? ' safe' : ''));
      paintReport();
      motion(Array.prototype.slice.call(analysis.children));
    }
    function renderMessage() {
      message.replaceChildren();
      var text = script[index].message;
      if (index === last || !stageCount(index)) { message.textContent = text; return; }
      var found = actClues[index].filter(function (c) { return clues.has(c.phrase); }).map(function (c) { return { word: c.phrase, at: text.indexOf(c.phrase) }; }).filter(function (c) { return c.at >= 0; }).sort(function (a, b) { return a.at - b.at; });
      var cursor = 0;
      found.forEach(function (c) {
        message.appendChild(document.createTextNode(text.slice(cursor, c.at)));
        message.appendChild(create('mark', '', c.word));
        cursor = c.at + c.word.length;
      });
      message.appendChild(document.createTextNode(text.slice(cursor)));
    }
    function paintEvidence() {
      var side = document.querySelector('.story-side');
      side.dataset.act = String(index + 1);
      side.dataset.clues = String(index < last ? stageCount(index) : clues.size);
      side.style.setProperty('--filed', String(clues.size / totalClues));
      var caption = index < last ? '本幕已封存 ' + stageCount(index) + ' / ' + actClues[index].length + ' 条 · 总计 ' + clues.size + ' / ' + totalClues :
        '全剧本取证结束 · 共封存 ' + clues.size + ' / ' + totalClues + ' 条话术';
      document.getElementById('evidence-caption').textContent = caption;
      document.getElementById('route-caption').textContent =
        finalDecision === 'check' ? '第 6 幕 · 拒绝交钱，改走核验' :
        finalDecision === 'pay' ? '第 6 幕 · 模拟交钱；现实中请立即停止' :
        branch === 'stop' ? '第 5 幕 · 已停下，后续只旁观' :
        branch === 'continue' ? '第 5 幕 · 仅模拟继续，注意收费要求' :
        index < last ? '取证 ' + stageCount(index) + ' / ' + actClues[index].length + ' · 第 5 幕再决定' :
        '取证完成 · 查看复盘';
    }
    function renderClues() {
      clueArea.hidden = index === last;
      document.getElementById('reveal-clues').hidden = index !== 1;
      paintEvidence();
      if (index === last) return;
      clueButtons.replaceChildren();
      var tray = document.getElementById('evidence-tray');
      function paintTray() {
        var collected = actClues[index].filter(function (c) { return clues.has(c.phrase); });
        document.getElementById('evidence-total').textContent = String(collected.length).padStart(2, '0') + ' / ' + String(actClues[index].length).padStart(2, '0');
        tray.dataset.count = String(collected.length);
        replace(document.getElementById('evidence-tags'), collected.length ? collected.map(function (c) {
          return create('span', '', c.phrase);
        }) : [create('span', 'evidence-empty', '点选或把词条拖到这里')]);
      }
      function flyToTray(button) {
        if (reduced || !button.animate) return;
        var from = button.getBoundingClientRect(), to = tray.getBoundingClientRect();
        var ghost = button.cloneNode(true);
        ghost.className = 'evidence-ghost'; ghost.setAttribute('aria-hidden', 'true');
        ghost.style.left = from.left + 'px'; ghost.style.top = from.top + 'px';
        ghost.style.width = from.width + 'px'; ghost.style.height = from.height + 'px';
        document.body.appendChild(ghost);
        var move = ghost.animate([
          { transform: 'translate(0,0) rotate(0) scale(1)', opacity: .9 },
          { transform: 'translate(' + (to.left + to.width / 2 - from.left - from.width / 2) + 'px,' + (to.top + to.height / 2 - from.top - from.height / 2) + 'px) rotate(-12deg) scale(.42)', opacity: 0 }
        ], { duration: 620, easing: 'cubic-bezier(.16,.8,.2,1)' });
        move.onfinish = function () { ghost.remove(); };
        move.oncancel = function () { ghost.remove(); };
      }
      actClues[index].forEach(function (c) {
        var button = create('button', '', '“' + c.phrase + '”');
        button.type = 'button'; button.setAttribute('aria-pressed', String(clues.has(c.phrase)));
        button.setAttribute('aria-label', (clues.has(c.phrase) ? '撤回' : '封存') + '证据：“' + c.phrase + '”');
        function fileClue() {
          var adding = !clues.has(c.phrase);
          if (adding) { flyToTray(button); clues.add(c.phrase); }
          else clues.delete(c.phrase);
          button.setAttribute('aria-pressed', String(adding));
          button.setAttribute('aria-label', (adding ? '撤回' : '封存') + '证据：“' + c.phrase + '”');
          renderMessage(); paintEvidence(); paintTray();
          storySide.classList.remove('is-new-clue');
          if (!reduced) { void storySide.offsetWidth; storySide.classList.add('is-new-clue'); }
          if (revealed.has(index)) {
            if (index === 1) showClueAnalysis();
            else detail('', branch === 'stop' || finalDecision === 'check');
          }
        }
        var pointer = null, startX = 0, startY = 0, moved = false, over = false, suppressClick = false;
        function resetDrag() {
          pointer = null; moved = false; over = false;
          button.classList.remove('is-dragging');
          button.style.removeProperty('--drag-x'); button.style.removeProperty('--drag-y');
          tray.classList.remove('is-target');
        }
        button.addEventListener('pointerdown', function (e) {
          if (e.button !== 0) return;
          pointer = e.pointerId; startX = e.clientX; startY = e.clientY;
          button.setPointerCapture(pointer);
        });
        button.addEventListener('pointermove', function (e) {
          if (e.pointerId !== pointer) return;
          var dx = e.clientX - startX, dy = e.clientY - startY;
          if (Math.hypot(dx, dy) < 8 && !moved) return;
          moved = true; button.classList.add('is-dragging');
          button.style.setProperty('--drag-x', dx + 'px'); button.style.setProperty('--drag-y', dy + 'px');
          var r = tray.getBoundingClientRect();
          over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          tray.classList.toggle('is-target', over);
        });
        button.addEventListener('pointerup', function (e) {
          if (e.pointerId !== pointer) return;
          if (moved) {
            suppressClick = true;
            setTimeout(function () { suppressClick = false; }, 0);
            if (over && !clues.has(c.phrase)) fileClue();
          }
          resetDrag();
        });
        button.addEventListener('pointercancel', resetDrag);
        button.addEventListener('click', function () {
          if (suppressClick) { suppressClick = false; return; }
          fileClue();
        });
        clueButtons.appendChild(button);
      });
      paintTray();
    }
    function showClueAnalysis() {
      exposeNotes(true);
      analysis.replaceChildren();
      analysis.appendChild(create('h3', '', '甜头，也是诱饵。'));
      paragraph(analysis, '第 2 幕已封存 ' + stageCount(1) + ' / 2 条话术。未封存的也可回到证据袋补上。', 'analysis-count');
      actClues[1].forEach(function (c) { paragraph(analysis, '“' + c.phrase + '”：' + c.why, 'analysis-note'); });
      paragraph(analysis, '下一步：' + script[1].correctMove, 'analysis-note safe');
      motion(Array.prototype.slice.call(analysis.children));
    }
    document.getElementById('reveal-clues').addEventListener('click', function () { revealed.add(1); showClueAnalysis(); });
    function finishReport() {
      exposeNotes(true);
      analysis.replaceChildren();
      analysis.appendChild(create('h3', '', '你走完的复盘'));
      paragraph(analysis, '沿途封存 ' + clues.size + ' / ' + totalClues + ' 处话术。' + (clues.size ? '每条都可以返回原幕重新核对；没存下的也值得再看。' : '这次没有存下证据，仍可返回任意幕重新标记。'), 'analysis-count');
      paragraph(analysis, '第 2 幕识别到 ' + stageCount(1) + ' / 2 条可疑话术。' + (stageCount(1) < 2 ? '回去再找找没有圈出的那句。' : '你注意到了小额试水和群友晒单。'));
      paragraph(analysis, '第 5 幕：' + (branch === 'stop' ? '停下查证，没有继续投入。' : '选择继续，进入后续的提现收费话术。'));
      if (branch === 'continue') paragraph(analysis, '第 6 幕：' + (finalDecision === 'check' ? '拒绝再交钱，转向核验。' : finalDecision === 'pay' ? '模拟中选择交保证金；现实中切勿照做，请立即停止并联系警方。' : '尚未选择第二次核验动作。'));
      paragraph(analysis, '带走的动作：遇到“取钱先交钱”，停止转账，保留证据，通过独立渠道联系反诈专线 96110 或家人。', 'analysis-note safe');
      motion(Array.prototype.slice.call(analysis.children));
    }
    function updateProgress() {
      progress.replaceChildren();
      script.forEach(function (stage, i) {
        var button = create('button', (i === index ? 'is-current' : '') + (i < visited ? ' is-visited' : ''), '');
        var circle = create('span', '', String(i + 1));
        button.appendChild(circle); button.appendChild(document.createTextNode('第' + (i + 1) + '幕'));
        button.type = 'button'; button.disabled = i > visited;
        if (i === index) button.setAttribute('aria-current', 'step');
        button.setAttribute('aria-label', '第 ' + (i + 1) + ' 幕' + (i > visited ? '，尚未到达' : '，可返回查看'));
        button.addEventListener('click', function () { show(i); });
        progress.appendChild(button);
      });
      centerCurrent();
    }
    /* 幕条可以横向拖动；点选仍是点选，拖过 6px 才算拖 */
    var railDrag = { on: false, x: 0, left: 0, moved: 0 };
    function centerCurrent() {
      var cur = progress.querySelector('.is-current');
      if (!cur) return;
      var target = cur.offsetLeft - (progress.clientWidth - cur.offsetWidth) / 2;
      if (Math.abs(progress.scrollLeft - target) < 4) return;
      progress.scrollTo({ left: Math.max(0, target), behavior: railDrag.on ? 'auto' : 'smooth' });
    }
    // 键盘：← → 在幕条上前后走一格，走完焦点跟到新的当前幕（读屏用户像翻页一样推进）
    progress.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      var step = event.key === 'ArrowRight' ? 1 : -1;
      var next = index + step;
      if (next < 0 || next > last) return;
      event.preventDefault();
      show(next);
      var cur = progress.querySelector('.is-current');
      if (cur) cur.focus({ preventScroll: true });
    });
    progress.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      railDrag.on = true; railDrag.x = event.clientX; railDrag.left = progress.scrollLeft; railDrag.moved = 0;
      railDrag.pointer = event.pointerId; railDrag.captured = false;
    });
    progress.addEventListener('pointermove', function (event) {
      if (!railDrag.on) return;
      var dx = event.clientX - railDrag.x;
      railDrag.moved = Math.max(railDrag.moved, Math.abs(dx));
      if (railDrag.moved < 6) return;
      if (!railDrag.captured) {
        railDrag.captured = true;
        progress.classList.add('is-dragging');
        try { progress.setPointerCapture(event.pointerId); } catch (err) {}
      }
      progress.scrollLeft = railDrag.left - dx;
      event.preventDefault();
    });
    function endRailDrag() {
      if (!railDrag.on) return;
      railDrag.on = false;
      progress.classList.remove('is-dragging');
      window.setTimeout(function () { railDrag.moved = 0; }, 0);
    }
    progress.addEventListener('pointerup', endRailDrag);
    progress.addEventListener('pointercancel', endRailDrag);
    progress.addEventListener('click', function (event) {
      if (railDrag.moved < 6) return;
      event.preventDefault(); event.stopPropagation();
    }, true);
    progress.addEventListener('focusin', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      var target = button.offsetLeft - (progress.clientWidth - button.offsetWidth) / 2;
      progress.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    });
    var tearInterlude = document.getElementById('tear-interlude'), tearRequested = false;
    function ensureTear() {
      if (tearRequested) return;
      tearRequested = true;
      var script = document.createElement('script');
      // 撕纸动效懒加载；戳跟 prototype-scam-tear.css 同一包（登记在 build-source-pages.py 的 VERSIONS）
      script.src = 'motion-lab-v2.js?v=tear-in-07';
      script.addEventListener('load', function () { initDrum(); });
      document.body.appendChild(script);
    }
    function openTear() {
      tearInterlude.open = true;
      ensureTear();
      tearInterlude.scrollIntoView({ behavior: 'instant', block: 'start' });
      tearInterlude.querySelector('summary').focus({ preventScroll: true });
    }
    tearInterlude.addEventListener('toggle', function () { if (tearInterlude.open) ensureTear(); });
    document.getElementById('tear-back').addEventListener('click', function () {
      tearInterlude.open = false;
      show(branch ? BRANCH + 1 : BRANCH);
    });
    var storyInitialized = false;
    function show(i) {
      var changedAct = storyInitialized && i !== index;
      index = i; visited = Math.max(visited, i);
      var st = script[index];
      document.getElementById('stage-counter').textContent = 'ACT ' + String(st.stage).padStart(2, '0') + ' / ' + String(last + 1).padStart(2, '0');
      document.getElementById('case-live-act').textContent = String(st.stage).padStart(2, '0');
      document.getElementById('story-watermark').textContent = String(st.stage).padStart(2, '0');
      document.getElementById('story-persona').textContent = st.persona;
      exposeNotes(false);
      document.getElementById('analysis-cover-hint').textContent = i === 1 ? '先存证据，再揭开本幕话术 ↗' :
        i === BRANCH ? '先存证据，再选一条路 ↗' :
        i === DECISION && branch === 'continue' ? '先存证据，再作一次判断 ↗' :
        '把话术存入证据袋，再揭开记录 ↗';
      storySide.dataset.branch = finalDecision || branch || 'neutral';
      storySide.classList.remove('is-changing');
      if (!reduced) { void storySide.offsetWidth; storySide.classList.add('is-changing'); }
      renderMessage(); renderClues(); updateProgress();
      previous.disabled = i === 0;
      actions.replaceChildren();
      if (i === last) {
        finishReport();
        action('回到第 5 幕，试另一条路', function () { show(BRANCH); }, 'safe-action');
        action('查看核验渠道与出处 ↗', function () {
          var sources = document.getElementById('case-sources');
          sources.open = true;
          sources.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
        });
      } else if (i === BRANCH) {
        if (branch) detail(branch === 'stop' ? '你选择了停止：后面三幕仍可旁观骗子如何继续说，但不会再“投入”。' : '你选择继续（仅模拟）。观察后面他们会如何拦住提现。', branch === 'stop');
        else paragraphAndQuestion('账户数字看起来上涨了。你现在会怎么做？下面是模拟决定，不涉及真钱。');
        paragraph(actions, '第 5 幕 · 请选择一个方向', 'action-label');
        action('继续看看（模拟）', function () { branch = 'continue'; finalDecision = null; visited = BRANCH; show(BRANCH + 1); }, 'warning-action');
        action('停下，先核验', function () { branch = 'stop'; finalDecision = null; visited = BRANCH; show(BRANCH + 1); }, 'safe-action');
      } else if (i === DECISION && branch === 'continue') {
        if (finalDecision) detail(finalDecision === 'check' ? '你拒绝再次付款，并决定从独立渠道核验。' : '交保证金是模拟中的危险决定，现实中请立即停止转账并寻求帮助。', finalDecision === 'check');
        else paragraphAndQuestion('对方说“就差最后一笔”。你已经在第 5 幕选择继续；现在还有一次停下来的机会。');
        paragraph(actions, '第 6 幕 · 再作一次判断', 'action-label');
        action('拒绝交钱，先核验', function () { finalDecision = 'check'; detail('你改变了决定。立即停止转账，用独立渠道核实并保留聊天证据。', true); show(last); }, 'safe-action');
        action('交保证金（仅模拟）', function () { finalDecision = 'pay'; detail('这是骗局的最终目的。模拟结束；现实中不要汇款，尽快求助。', false); show(last); }, 'warning-action');
      } else {
        if (revealed.has(i)) {
          if (i === 1) showClueAnalysis();
          else detail(i > BRANCH && branch === 'stop' ? '你已停下；这一幕是旁观骗子接下来的话术，不涉及新的投入。' : '', i > BRANCH && branch === 'stop');
        } else paragraphAndQuestion(i === 1 ? '先把两句可疑话术存入证据袋，再揭开本幕；也可直接进入下一幕。' : (i > BRANCH && branch === 'stop' ? '你已在第 5 幕停下。以下只旁观骗子会怎样继续说；读完可点“解剖这一幕”。' : i > BRANCH && branch === 'continue' ? '你在第 5 幕选择了继续（仅模拟）。观察对方如何拦住提现，再点“解剖这一幕”。' : '先读对话，猜一猜对方想让你做什么，再点“解剖这一幕”。'));
        if (i !== 1) action('解剖这一幕', function () { revealed.add(i); detail(i > BRANCH && branch === 'stop' ? '你已停下；这里是旁观后续话术。' : '', i > BRANCH && branch === 'stop'); });
        if (i === 4) action('撕开账面，核对提现条件 ↘', openTear, 'safe-action');
        action('下一幕 →', function () { show(index + 1); });
      }
      motion([document.getElementById('story-persona'), message]);
      message.setAttribute('aria-label', '第 ' + (i + 1) + ' 幕话术');
      // Keep the new line visible immediately; a smooth scroll can leave focus
      // on off-screen dialogue while the old act is still animating away.
      if (changedAct) message.scrollIntoView({ behavior: 'instant', block: 'center' });
      if (storyInitialized) message.focus({ preventScroll: true });
      storyInitialized = true;
    }
    function paragraphAndQuestion(text) { exposeNotes(false); analysis.replaceChildren(); paragraph(analysis, text); }
    previous.addEventListener('click', function () { if (index > 0) show(index - 1); });
    document.getElementById('restart-story').addEventListener('click', function () {
      branch = null; finalDecision = null; clues.clear(); revealed.clear(); visited = 0; show(0);
    });
    show(0);
    // 撕纸默认是展开的：不再等 toggle，进页面就把账页那层装上
    if (tearInterlude.open) ensureTear();
    if (window.location.hash === '#tear-interlude') openTear();
    initDrum();
  }

  // 话术滚筒：鼓面与解释全部来自真源的话术词典（scam-acts.js 的 SCAM_DICT）
  var readDrumStep = null;
  function initDrum() {
    var dict = window.SCAM_DICT || [];
    var drum = document.getElementById('word-drum');
    var cylinder = document.getElementById('drum-cylinder');
    if (!dict.length || !drum || !cylinder) return;
    var explanation = document.getElementById('drum-explanation');
    var position = document.getElementById('drum-position');
    var prev = document.getElementById('drum-prev');
    var next = document.getElementById('drum-next');
    var rule = document.querySelector('.phrase-rule');
    var index = 0;

    cylinder.replaceChildren();
    drum.dataset.drumTotal = String(dict.length);
    dict.forEach(function (item, n) {
      var face = document.createElement('span');
      face.className = 'drum-face';
      face.style.setProperty('--face', n);
      face.textContent = item.name.replace(/^["“]|["”]$/g, '');
      cylinder.appendChild(face);
    });
    var total = dict.length;
    var stepDeg = 360 / total;
    var faces = cylinder.querySelectorAll('.drum-face');
    var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    var turn = 0, angle = 0, target = 0, frame = 0;
    var animFrom = 0, animStart = 0, animDur = 420;
    var dragging = false, dragFrom = 0, dragAngle = 0, dragLastY = 0, dragLastT = 0, dragSpeed = 0, wheelAcc = 0;

    drum.setAttribute('aria-valuemax', String(total));
    if (rule) rule.textContent = total + ' 种说法，同一个转账门槛。';

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function wrapIndex(n) { return ((n % total) + total) % total; }
    function sync() {
      var shown = wrapIndex(Math.round(-angle / stepDeg));
      Array.prototype.forEach.call(faces, function (node, n) { node.classList.toggle('is-front', n === shown); });
      if (shown === index && drum.dataset.drumPainted) return;
      index = shown;
      var item = dict[index];
      explanation.textContent = item.name.replace(/^["“]|["”]$/g, '') + (item.rest || '');
      position.textContent = pad(index + 1) + ' / ' + pad(total);
      drum.setAttribute('aria-valuenow', String(index + 1));
      drum.setAttribute('aria-valuetext', item.name);
      drum.dataset.drumPainted = '1';
    }
    function render() { cylinder.style.transform = 'rotateX(' + angle + 'deg)'; sync(); }
    function settle() {
      // 整圈之后把角度折回 0，视觉连续、数字也不会越滚越大
      var whole = Math.floor(turn / total);
      if (!whole) return;
      turn -= whole * total;
      angle += whole * total * stepDeg;
      target += whole * total * stepDeg;
      render();
    }
    function tick(now) {
      frame = 0;
      if (dragging) return;
      var progress = Math.min(1, (now - animStart) / animDur);
      var eased = 1 - Math.pow(1 - progress, 3);
      angle = animFrom + (target - animFrom) * eased;
      render();
      if (progress < 1) { frame = requestAnimationFrame(tick); return; }
      angle = target; render(); settle();
    }
    function spinTo(nextTurn) {
      turn = nextTurn; target = -turn * stepDeg;
      if (motionQuery.matches) { angle = target; render(); settle(); return; }
      animFrom = angle; animStart = performance.now();
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function step(delta) { spinTo(turn + delta); }
    readDrumStep = step;

    // 拖：跟着指针滚，松手按惯性吸附到最近的一面
    drum.onpointerdown = function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragging = true;
      dragFrom = event.clientY; dragAngle = angle;
      dragLastY = event.clientY; dragLastT = performance.now(); dragSpeed = 0;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (drum.setPointerCapture) { try { drum.setPointerCapture(event.pointerId); } catch (err) {} }
    };
    drum.onpointermove = function (event) {
      if (!dragging) return;
      var now = performance.now(), dt = Math.max(1, now - dragLastT);
      dragSpeed = (event.clientY - dragLastY) / dt;
      dragLastY = event.clientY; dragLastT = now;
      angle = dragAngle + (event.clientY - dragFrom) * 1.1;
      render();
    };
    function releaseDrum() {
      if (!dragging) return;
      dragging = false;
      if (performance.now() - dragLastT > 120) dragSpeed = 0;
      spinTo(Math.round(-(angle + dragSpeed * 90) / stepDeg));
    }
    drum.onpointerup = releaseDrum;
    drum.onpointercancel = function () {
      if (!dragging) return;
      dragging = false;
      spinTo(Math.round(-angle / stepDeg));
    };

    // 滚轮：一格一格地滚，不抢整页滚动
    drum.onwheel = function (event) {
      if (!event.deltaY) return;
      event.preventDefault();
      wheelAcc += event.deltaY;
      if (Math.abs(wheelAcc) < 24) return;
      step(wheelAcc > 0 ? 1 : -1);
      wheelAcc = 0;
    };

    drum.onkeydown = function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { step(1); event.preventDefault(); }
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { step(-1); event.preventDefault(); }
      else if (event.key === 'Home') { spinTo(0); event.preventDefault(); }
    };
    prev.onclick = function () { step(-1); };
    next.onclick = function () { step(1); };

    delete drum.dataset.drumPainted;
    render();
  }

})();
