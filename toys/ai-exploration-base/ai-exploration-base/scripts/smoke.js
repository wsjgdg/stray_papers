#!/usr/bin/env node
/* ============================================================
   AI Exploration Base - zero-dependency smoke test
   1) Every local script/css link in built HTML files must exist
   2) Every JS file in assets/js must pass `node --check`
   Run: node scripts/smoke.js   (exit 1 on failure)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function listHtml() {
  const dirs = [ROOT, path.join(ROOT, 'pages')];
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
  const refs = [];
  const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (/^(https?:)?\/\//.test(url)) continue; // external
    if (/^(#|mailto:|data:|javascript:)/.test(url)) continue;
    refs.push(url);
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

console.log(failures === 0 ? '\nSMOKE: ALL PASS' : `\nSMOKE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
