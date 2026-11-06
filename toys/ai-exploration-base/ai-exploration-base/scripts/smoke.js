#!/usr/bin/env node
/* ============================================================
   AI Exploration Base - zero-dependency smoke test
   1) Every local script/css/page/iframe link in built HTML files must exist
   2) Inline scripts and every JS file in assets/js must parse
   Run: node scripts/smoke.js   (exit 1 on failure)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function listHtml() {
  const dirs = [ROOT, path.join(ROOT, 'pages'), path.join(ROOT, 'prototype')];
  const files = [];
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir)
      .filter((f) => f.endsWith('.html'))
      .forEach((f) => files.push(path.join(dir, f)));
  });
  return files;
}

function extractLocalRefs(html) {
  /* Strip only block contents, not their tags: external script src
     attributes must still be checked. Inline JS may contain dynamic
     href strings ('...+ p.url + ...') that are not file references. */
  html = html.replace(/<(script|style)\b([^>]*)>[\s\S]*?<\/\1\s*>/gi, '<$1$2></$1>');
  const refs = [];
  const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (/^(https?:)?\/\//.test(url)) continue; // external
    if (/^(#|mailto:|data:|javascript:)/.test(url)) continue;
    refs.push(url.split('#')[0].split('?')[0]);
  }
  return refs;
}

let failures = 0;
const pages = listHtml();

if (pages.length === 0) {
  console.log('WARN: no HTML pages found yet');
}

pages.forEach((file) => {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8');
  const refs = extractLocalRefs(html);
  const missing = refs.filter((ref) => !fs.existsSync(path.resolve(path.dirname(file), ref)));
  if (missing.length) {
    failures++;
    console.log(`FAIL ${rel}: missing ${missing.length} local ref(s):`);
    missing.forEach((r) => console.log(`   - ${r}`));
  } else {
    console.log(`PASS ${rel} (${refs.length} local refs checked)`);
  }

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter((m) => !/\bsrc\s*=/.test(m[1]));
  scripts.forEach((m, i) => {
    try {
      new vm.Script(m[2], { filename: `${rel}:inline-${i + 1}` });
    } catch (e) {
      failures++;
      console.log(`FAIL inline-js ${rel} #${i + 1}: ${e.message}`);
    }
  });
});

// CSS artwork and fonts must exist for both the formal site and experiments.
[path.join(ROOT, 'assets', 'css'), path.join(ROOT, 'prototype')].forEach((cssDir) => {
  if (!fs.existsSync(cssDir)) return;
  fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')).forEach((f) => {
    const css = fs.readFileSync(path.join(cssDir, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Inline SVG may itself contain url(%23id); it is not a local file.
      .replace(/url\(\s*(['"])data:[\s\S]*?\1\s*\)/g, '');
    const refs = [...css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)]
      .map((m) => m[1]).filter((url) => !/^(data:|https?:|\/\/|#)/.test(url))
      .map((url) => url.split('?')[0].split('#')[0]);
    const missing = refs.filter((ref) => !fs.existsSync(path.resolve(cssDir, ref)));
    const label = path.relative(ROOT, path.join(cssDir, f));
    if (missing.length) {
      failures++;
      console.log(`FAIL css ${label}: missing artwork: ${missing.join(', ')}`);
    } else {
      console.log(`PASS css ${label} (${refs.length} local assets checked)`);
    }
  });
});

const jsDir = path.join(ROOT, 'assets', 'js');
if (fs.existsSync(jsDir)) {
  fs.readdirSync(jsDir)
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => {
      const full = path.join(jsDir, f);
      try {
        execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
        console.log(`PASS js-syntax ${f}`);
      } catch (e) {
        failures++;
        console.log(`FAIL js-syntax ${f}:\n${e.stderr}`);
      }
    });
} else {
  console.log('WARN: assets/js not found yet');
}

const prototypeDir = path.join(ROOT, 'prototype');
if (fs.existsSync(prototypeDir)) {
  fs.readdirSync(prototypeDir).filter((f) => f.endsWith('.js')).forEach((f) => {
    try {
      execFileSync(process.execPath, ['--check', path.join(prototypeDir, f)], { stdio: 'pipe' });
      console.log(`PASS js-syntax prototype/${f}`);
    } catch (e) {
      failures++;
      console.log(`FAIL js-syntax prototype/${f}:\n${e.stderr}`);
    }
  });
}

console.log(failures === 0 ? '\nSMOKE: ALL PASS' : `\nSMOKE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
