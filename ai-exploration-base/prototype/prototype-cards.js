/* ① 卡片铸造台：五张卡真的会翻、会压印、会把提示词一个字一个字打出来。
   依赖 ../assets/vendor/gsap.min.js + ScrollTrigger + TextPlugin（缺失时全部降级）。 */
(() => {
  const floor = document.querySelector('.castfloor');
  if (!floor) return;

  const cards = Array.from(floor.querySelectorAll('.fcard'));
  const meter = floor.querySelector('[data-flip-count]');
  const fill = floor.querySelector('[data-meter-fill]');
  const done = floor.querySelector('[data-flip-done]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsap = window.gsap;
  const motion = !!(gsap && !reduce);

  if (motion && window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
  if (motion && window.TextPlugin) gsap.registerPlugin(window.TextPlugin);

  /* ---------------- 进场：台面亮起，卡片一张张落位 ---------------- */
  if (motion) {
    const head = floor.querySelectorAll('.castfloor-head > *');
    gsap.from(head, {
      autoAlpha: 0, y: 16, duration: .7, ease: 'power2.out', stagger: .08,
      ...(window.ScrollTrigger ? {
        scrollTrigger: { trigger: floor, start: 'top 88%', once: true }
      } : {}),
    });

    const groupHeads = floor.querySelectorAll('.floor-group-head, .honest-tile, .floor-summary');
    if (groupHeads.length) {
      gsap.from(groupHeads, {
        autoAlpha: 0, y: 14, duration: .6, ease: 'power2.out', stagger: .08,
        ...(window.ScrollTrigger ? {
          scrollTrigger: { trigger: floor, start: 'top 70%', once: true }
        } : {}),
      });
    }

    cards.forEach((card, i) => {
      gsap.from(card, {
        autoAlpha: 0, y: 46, rotate: i % 2 ? 1.2 : -1.2, duration: .85,
        ease: 'power3.out', delay: i * .07,
        ...(window.ScrollTrigger ? {
          scrollTrigger: { trigger: card, start: 'top 92%', once: true }
        } : {}),
      });

      const bits = card.querySelectorAll(
        '.poster-sheet > *, .mom-head, .mom-body p, .ledger-top, .bubble-row, .wx-bar, .ph-pane, .art-lead'
      );
      if (bits.length) {
        gsap.from(bits, {
          autoAlpha: 0, y: 12, duration: .5, ease: 'power2.out', stagger: .035, delay: .18,
          ...(window.ScrollTrigger ? {
            scrollTrigger: { trigger: card, start: 'top 85%', once: true }
          } : {}),
        });
      }
    });
  }

  /* ---------------- 进度：已压印几张 ---------------- */
  const total = cards.length;
  const sync = () => {
    const n = cards.filter(c => c.classList.contains('is-flipped')).length;
    if (meter) meter.textContent = String(n);
    if (fill) {
      const w = total ? (n / total) * 100 : 0;
      if (motion) gsap.to(fill, { width: w + '%', duration: .5, ease: 'power2.out' });
      else fill.style.width = w + '%';
    }
    if (done) {
      if (n >= total) {
        done.hidden = false;
        if (motion) gsap.fromTo(done, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .5 });
      } else {
        done.hidden = true;
      }
    }
    sync.called = true;
  };

  /* ---------------- 翻面：3D 转过来 + 压印 + 打字机 ---------------- */
  const flip = (card, force) => {
    const btn = card.querySelector('.fcard-flip');
    const inner = card.querySelector('.fcard-inner');
    const back = card.querySelector('.fcard-back');
    const on = typeof force === 'boolean' ? force : !card.classList.contains('is-flipped');
    card.classList.toggle('is-flipped', on);
    if (btn) {
      btn.setAttribute('aria-expanded', String(on));
      const label = btn.querySelector('.fcard-flip-label');
      if (label) {
        if (!label.dataset.front) label.dataset.front = label.textContent;
        label.textContent = on ? '收起来，看正面' : label.dataset.front;
      }
    }
    if (!motion || !inner) { sync(); return; }

    gsap.to(inner, {
      rotationY: on ? 180 : 0,
      duration: .85,
      ease: 'power3.inOut',
      overwrite: 'auto',
      onComplete: sync,
    });

    if (!on) { gsap.to(back, { autoAlpha: 1, duration: .2 }); return; }

    const stamp = card.querySelector('.stamp');
    if (stamp) {
      gsap.fromTo(stamp,
        { autoAlpha: 0, scale: 1.55, rotation: -26 },
        { autoAlpha: 1, scale: 1, rotation: -14, duration: .5, delay: .42, ease: 'back.out(2.2)' });
    }

    const kids = card.querySelectorAll('.back-scroll > *');
    gsap.from(kids, {
      autoAlpha: 0, y: 10, duration: .35, ease: 'power2.out', stagger: .05, delay: .3,
    });

    const typed = card.querySelector('[data-typewriter]');
    if (typed && window.TextPlugin && !typed.dataset.typed) {
      const full = typed.textContent.trim();
      typed.dataset.typed = '1';
      typed.textContent = '';
      gsap.to(typed, {
        duration: Math.min(2.6, Math.max(.9, full.length * .045)),
        text: { value: full },
        ease: 'none',
        delay: .55,
      });
    }
  };

  cards.forEach(card => {
    const btn = card.querySelector('.fcard-flip');
    if (btn) btn.addEventListener('click', () => flip(card));
    // 正面也可以点（点在链接或按钮上时不接管）
    const front = card.querySelector('.fcard-front');
    if (front) {
      front.addEventListener('click', e => {
        if (e.target.closest('a, button')) return;
        flip(card, true);
      });
      front.style.cursor = 'pointer';
    }
  });

  /* ---------------- 照抄提示词 ---------------- */
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
  };

  floor.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const block = btn.closest('.back-prompt');
      const typed = block ? block.querySelector('[data-typewriter]') : null;
      const full = block ? (block.querySelector('.back-plain') || typed) : null;
      if (!full) return;
      const ok = await copy(full.textContent.trim());
      if (typed && !typed.dataset.typed) {
        typed.dataset.typed = '1';
        typed.textContent = full.textContent.trim();
      }
      const was = btn.textContent;
      btn.textContent = ok ? '已复制' : '请手动选中';
      btn.classList.toggle('is-done', ok);
      setTimeout(() => {
        btn.textContent = was;
        btn.classList.remove('is-done');
      }, 1800);
    });
  });

  /* ---------------- 页尾链接表：一行行落下来 ---------------- */
  const rows = document.querySelectorAll('.ktable tbody tr');
  if (motion && rows.length && window.ScrollTrigger) {
    gsap.from(rows, {
      autoAlpha: 0, y: 10, duration: .4, ease: 'power2.out', stagger: .03,
      scrollTrigger: { trigger: '.ktable-sec', start: 'top 88%', once: true },
    });
  }

  /* ---------------- 初始状态 ---------------- */
  fill && (fill.style.width = '0%');
  sync();
})();
