(function () {
  'use strict';
  const buttons = Array.from(document.querySelectorAll('[data-note]'));
  const cards = Array.from(document.querySelectorAll('[data-note-content]'));
  const panel = document.getElementById('knowledge-panel');
  const toggle = document.getElementById('toggle-knowledge');

  function selectNote(name, moveFocus) {
    const button = buttons.find(item => item.dataset.note === name);
    if (!button) return;
    buttons.forEach(item => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    cards.forEach(card => { card.hidden = card.dataset.noteContent !== name; });
    if (moveFocus) {
      button.focus({ preventScroll: true });
      button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    document.dispatchEvent(new CustomEvent('lab:contentchange', { detail: { panel: 'knowledge' } }));
    document.dispatchEvent(new CustomEvent('atlas:notechange', { detail: { note: name } }));
  }

  buttons.forEach(button => button.addEventListener('click', () => selectNote(button.dataset.note, false)));
  document.querySelectorAll('[data-note-jump]').forEach(button => button.addEventListener('click', () => selectNote(button.dataset.noteJump, true)));
  document.querySelectorAll('.stability-detail').forEach(details => details.addEventListener('toggle', () => {
    document.dispatchEvent(new CustomEvent('lab:contentchange', { detail: { panel: 'knowledge' } }));
  }));

  // Preserve links to the previous page's field notes and source section.
  function restoreLegacyAnchor() {
    const hash = window.location.hash;
    if (!['#field-notes', '#growth-note', '#about'].includes(hash)) return;
    if (panel.hidden) toggle.click();
    if (hash === '#growth-note') selectNote('growth', false);
    requestAnimationFrame(() => {
      const target = hash === '#about' ? document.getElementById('about') : (hash === '#growth-note' ? document.getElementById('growth-note') : panel);
      target.scrollIntoView({ block: 'start', inline: 'nearest' });
    });
  }
  window.addEventListener('hashchange', restoreLegacyAnchor);
  restoreLegacyAnchor();
})();
