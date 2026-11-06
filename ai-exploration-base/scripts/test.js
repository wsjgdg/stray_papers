#!/usr/bin/env node
/* Regression checks for the offline site; no npm dependencies required.
   Run from anywhere: node ai-exploration-base/scripts/test.js */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');

function script(name) {
  return fs.readFileSync(path.join(ROOT, 'assets/js', name), 'utf8');
}

function progress(stored) {
  const data = { 'ai-base-progress': stored };
  let bursts = 0;
  const win = {
    localStorage: {
      getItem: (k) => data[k] || null,
      setItem: (k, v) => { data[k] = v; }
    },
    confetti: () => { bursts++; }
  };
  const ctx = vm.createContext({ window: win });
  vm.runInContext(script('progress.js'), ctx);
  return { P: win.AIProgress, data, bursts: () => bursts, win };
}

// Unknown/duplicated/stale storage must not fabricate six completed tasks.
{
  const { P, data, bursts } = progress(JSON.stringify([
    'trends', 'trends', 'unknown', 'x', 'x', 'x', 'x'
  ]));
  assert.equal(P.badge(), '1 / 6');
  assert.equal(P.isAllDone(), false);
  let changes = 0;
  P.onChange(() => { changes++; });
  P.mark('unknown');
  P.mark('trends');
  assert.equal(changes, 0);
  P.mark('lab');
  assert.equal(P.badge(), '2 / 6');
  assert.equal(changes, 1);
  assert.equal(bursts(), 1);
  assert.deepEqual(JSON.parse(data['ai-base-progress']), ['trends', 'lab']);
  for (const page of P.PAGES) P.mark(page.id);
  assert.equal(P.badge(), '6 / 6');
  assert.equal(P.isAllDone(), true);
}

// Progress still records under reduced motion, without firing particles.
{
  const { P, win, bursts } = progress(null);
  win.matchMedia = () => ({ matches: true });
  P.mark('trends');
  assert.equal(P.done('trends'), true);
  assert.equal(bursts(), 0);
}

// A blocked storage API must still allow navigation and in-memory check-in.
{
  const win = { localStorage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } };
  vm.runInNewContext(script('progress.js'), { window: win });
  win.AIProgress.mark('academy');
  assert.equal(win.AIProgress.done('academy'), true);
}

// Completion from inside a page must update its header button automatically.
// Reduced-motion users must never be given a GSAP scroll animation.
{
  const { P, win } = progress(null);
  const classes = new Set();
  const btn = {
    style: {}, textContent: '',
    classList: { add: (s) => classes.add(s), remove: (s) => classes.delete(s) },
    addEventListener: (name, fn) => { btn[name] = fn; }
  };
  const reveal = { classList: { add: (s) => { reveal.visible = s; } } };
  const doc = {
    documentElement: { classList: { add() {} } },
    querySelector: () => ({}), // chrome already mounted
    querySelectorAll: () => [reveal],
    getElementById: (id) => id === 'site-done-btn' ? btn : null
  };
  let animations = 0;
  Object.assign(win, {
    AIProgress: P,
    location: { pathname: '/pages/anti-scam.html' },
    matchMedia: () => ({ matches: true }),
    gsap: { registerPlugin() { animations++; }, fromTo() { animations++; } },
    ScrollTrigger: {}
  });
  vm.runInNewContext(script('site.js'), { window: win, document: doc, AIProgress: P });
  win.AISite.pageReady('anti-scam');
  assert.equal(reveal.visible, 'is-visible');
  assert.equal(animations, 0);
  assert.equal(btn.textContent, '完成打卡');
  P.mark('anti-scam');
  assert.equal(btn.textContent, '✓ 已打卡');
  assert.equal(classes.has('is-done'), true);
}

// Certificate's dynamically built links are relative to pages/graduation.html.
{
  const { P, win } = progress(null);
  const html = fs.readFileSync(path.join(ROOT, 'pages/graduation.html'), 'utf8');
  const inline = [...html.matchAll(/<script\s*>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const elements = Object.fromEntries(['certificate-block', 'progress-block', 'progress-count', 'remaining-list']
    .map((id) => [id, { style: {}, textContent: '', innerHTML: '' }]));
  Object.assign(win, { AIProgress: P, AISite: { pageReady() {}, motionOk: () => false } });
  vm.runInNewContext(inline, {
    window: win,
    document: { getElementById: (id) => elements[id], querySelector: () => null },
    localStorage: win.localStorage
  });
  assert.match(elements['remaining-list'].innerHTML, /href="\.\.\/pages\/what-ai-can-do\.html"/);
  assert.doesNotMatch(elements['remaining-list'].innerHTML, /pages\/pages\//);
  for (const page of P.PAGES) P.mark(page.id);
  assert.equal(elements['certificate-block'].style.display, '');
  assert.equal(elements['progress-block'].style.display, 'none');
}

// Redesign guardrails: all six offline chapters and their key activities stay present.
{
  const required = {
    'what-ai-can-do': ['case-poster', 'case-writing', 'case-finance', 'case-photo', 'case-phone'],
    trends: ['user-chart', 'data-count="5.15"', 'industry-grid'],
    lab: ['algorithm-lab-standalone.html', 'repo-grid'],
    'side-jobs': ['data-tier="1"', 'data-tier="2"', 'data-tier="3"'],
    'anti-scam': ['sim-chat', 'mechanisms', 'phrases', 'toolkit'],
    academy: ['quiz-answer', 'agent-flow', 'data-grade="bad"', 'data-grade="good"']
  };
  for (const [name, markers] of Object.entries(required)) {
    const html = fs.readFileSync(path.join(ROOT, `pages/${name}.html`), 'utf8');
    assert.match(html, /assets\/css\/chapter\.css/, name);
    assert.match(html, /class="chapter-intro"/, name);
    assert.match(html, /class="chapter-end"/, name);
    for (const marker of markers) assert.ok(html.includes(marker), `${name}: missing ${marker}`);
  }
  const showcase = fs.readFileSync(path.join(ROOT, 'pages/what-ai-can-do.html'), 'utf8');
  assert.equal((showcase.match(/class="case-study"/g) || []).length, 5);
  assert.equal((showcase.match(/<details class="method"/g) || []).length, 5);
  assert.equal(require('../assets/js/scam-script.js').SCAM_SCRIPT.length, 7);
}

console.log('REGRESSION: ALL PASS');
