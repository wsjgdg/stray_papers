(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const workbench = $('workbench');
  const topbar = $('lab-topbar');
  const nav = $('lab-navigation');
  const navToggle = $('nav-toggle');
  const navList = $('nav-scroll-list');
  const navPosition = $('nav-position');
  // When panels would squeeze the model (including tall tablet windows), use
  // the one-drawer layout instead of hiding the initial bobs behind a panel.
  const compact = window.matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)');
  const chinese = document.documentElement.lang.toLowerCase().startsWith('zh');
  const words = chinese
    ? { controls: '控制台', knowledge: '知识卡片', collapse: '收起', expand: '展开', gap: '' }
    : { controls: 'Controls', knowledge: 'Field notes', collapse: 'Collapse', expand: 'Expand', gap: ' ' };
  const panels = {
    controls: { shell: $('controls-shell'), panel: $('control-panel'), toggle: $('toggle-controls'), label: words.controls, open: true },
    knowledge: { shell: $('knowledge-shell'), panel: $('knowledge-panel'), toggle: $('toggle-knowledge'), label: words.knowledge, open: true }
  };

  function updateScrollHint(item) {
    const remaining = item.panel.scrollHeight - item.panel.scrollTop - item.panel.clientHeight;
    item.shell.classList.toggle('has-more', item.open && remaining > 3);
  }

  function setPanel(name, open) {
    const item = panels[name];
    if (open && compact.matches) {
      const other = name === 'controls' ? 'knowledge' : 'controls';
      if (panels[other].open) setPanel(other, false);
    }
    if (!open && item.panel.contains(document.activeElement)) item.toggle.focus({ preventScroll: true });
    item.open = open;
    item.panel.hidden = !open;
    item.shell.classList.toggle('closed', !open);
    item.toggle.setAttribute('aria-expanded', String(open));
    const label = (open ? words.collapse : words.expand) + words.gap + item.label;
    item.toggle.setAttribute('aria-label', label);
    item.toggle.title = label;
    item.toggle.querySelector('span').textContent = open ? words.collapse : item.label;
    workbench.classList.toggle(name + '-closed', !open);
    document.dispatchEvent(new CustomEvent('lab:panelchange', { detail: { panel: name, open: open } }));
    requestAnimationFrame(() => updateScrollHint(item));
  }

  function syncNavPosition() {
    if (!navList || !navPosition || nav.hidden) return;
    const max = Math.max(0, navList.scrollHeight - navList.clientHeight);
    navPosition.disabled = max < 1;
    navPosition.value = max ? String(Math.round(navList.scrollTop / max * 100)) : '0';
    const track = navPosition.clientHeight;
    const size = navList.scrollHeight ? track * navList.clientHeight / navList.scrollHeight : track;
    navPosition.style.setProperty('--nav-thumb-height', Math.max(18, Math.min(track, size)) + 'px');
  }

  function setNav(open) {
    nav.hidden = !open;
    navToggle.setAttribute('aria-expanded', String(open));
    if (open) { syncNavPosition(); requestAnimationFrame(syncNavPosition); }
  }

  if (navList && navPosition) {
    navList.addEventListener('scroll', syncNavPosition, { passive: true });
    navPosition.addEventListener('input', () => {
      const max = Math.max(0, navList.scrollHeight - navList.clientHeight);
      navList.scrollTop = max * Number(navPosition.value) / 100;
    });
    navPosition.addEventListener('wheel', event => {
      navList.scrollTop += event.deltaY;
      event.preventDefault();
    }, { passive: false });
    navPosition.addEventListener('keydown', event => {
      const row = navList.querySelector('a');
      const gap = parseFloat(getComputedStyle(navList).rowGap) || 0;
      const step = (row ? row.getBoundingClientRect().height : 40) + gap;
      let next = navList.scrollTop;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next += step;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next -= step;
      else if (event.key === 'PageDown') next += navList.clientHeight;
      else if (event.key === 'PageUp') next -= navList.clientHeight;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = navList.scrollHeight;
      else return;
      event.preventDefault(); navList.scrollTop = next; syncNavPosition();
    });
    if ('ResizeObserver' in window) new ResizeObserver(syncNavPosition).observe(navList);
    window.addEventListener('resize', syncNavPosition);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncNavPosition);
  }

  panels.controls.toggle.addEventListener('click', () => setPanel('controls', !panels.controls.open));
  panels.knowledge.toggle.addEventListener('click', () => setPanel('knowledge', !panels.knowledge.open));
  // On a small screen, reveal the focused model immediately. If closing the
  // drawer moved keyboard focus to its toggle, move it to the visible exit.
  const focusBob = $('focus-bob');
  if (focusBob) focusBob.addEventListener('click', () => {
    if (!compact.matches) return;
    setPanel('controls', false);
    requestAnimationFrame(() => {
      if (!$('exit-focus').hidden && document.activeElement === panels.controls.toggle) $('exit-focus').focus({ preventScroll: true });
    });
  });
  Object.values(panels).forEach(item => {
    item.panel.addEventListener('scroll', () => updateScrollHint(item), { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(() => updateScrollHint(item)).observe(item.panel);
  });
  window.addEventListener('resize', () => Object.values(panels).forEach(updateScrollHint));
  document.addEventListener('lab:contentchange', () => requestAnimationFrame(() => Object.values(panels).forEach(updateScrollHint)));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => Object.values(panels).forEach(updateScrollHint));
  navToggle.addEventListener('click', () => setNav(nav.hidden));
  document.addEventListener('pointerdown', event => {
    if (!nav.hidden && !topbar.contains(event.target)) setNav(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    // A native modal must receive Escape before any drawer underneath it.
    if (document.querySelector('dialog[open]')) return;
    if (!nav.hidden) {
      event.preventDefault(); setNav(false); navToggle.focus({ preventScroll: true });
    } else if (compact.matches && (panels.controls.open || panels.knowledge.open)) {
      event.preventDefault();
      setPanel(panels.controls.open ? 'controls' : 'knowledge', false);
    }
  });
  document.querySelectorAll('[data-jump]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const target = link.dataset.jump;
    setNav(false);
    if (target === 'stage') {
      if (compact.matches) { setPanel('controls', false); setPanel('knowledge', false); }
      (document.querySelector('[data-lab-canvas]') || $('pendulum-scene')).focus({ preventScroll: true });
    } else {
      setPanel(target, true);
      panels[target].panel.focus({ preventScroll: true });
    }
  }));

  function resetForViewport() {
    // Individual immersive workbenches can start with a clear, full-width
    // stage without changing the defaults of the earlier experiments.
    const expanded = !compact.matches && workbench.dataset.initialPanels !== 'closed';
    setPanel('controls', expanded);
    setPanel('knowledge', expanded);
  }
  if (compact.addEventListener) compact.addEventListener('change', resetForViewport);
  else compact.addListener(resetForViewport);
  resetForViewport();
})();
