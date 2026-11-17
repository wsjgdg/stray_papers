#!/usr/bin/env node
/* Dump remaining (unvoiced) who-lines to remaining-voices.json */
const fs = require("fs");
const path = require("path");

global.window = {};
eval(
  fs
    .readFileSync(path.join(HERE0(), "..", "..", "scenario.js"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n")
);
function HERE0() {
  return __dirname;
}
const S = global.window.SCENARIO;

const VOICES = { yu: "zh-CN-YunxiNeural", mian: "zh-CN-XiaoxiaoNeural", lin: "zh-CN-XiaoyiNeural", qi: "zh-CN-YunxiaNeural" };

// already-voiced keys from voice-data.js
let voiced = [];
const vdPath = path.join(__dirname, "..", "..", "props", "voice-data.js");
if (fs.existsSync(vdPath)) {
  // keys are quoted since the unquoted-identifier fix ("call_lin.0" is not a
  // valid JS property name) — tolerate both forms. Read once: the file is
  // ~23MB and re-reading it per exec iteration OOMs the default heap.
  const vd = fs.readFileSync(vdPath, "utf8");
  const re = /^\s+"?([a-z_0-9]+\.[0-9]+)"?:/gm;
  let m;
  while ((m = re.exec(vd))) voiced.push(m[1]);
}

const jobs = [];
Object.keys(S.scenes).forEach((sceneId) => {
  const scene = S.scenes[sceneId];
  if (!scene || !Array.isArray(scene.lines)) return;
  scene.lines.forEach((line, idx) => {
    if (!line || !line.who || !VOICES[line.who]) return;
    const key = sceneId + "." + idx;
    if (voiced.indexOf(key) !== -1) return;
    const text = String(line.text || "").replace(/「|」/g, "").trim();
    if (!text) return;
    jobs.push({ key: key, voice: VOICES[line.who], text: text });
  });
});

fs.writeFileSync(path.join(__dirname, "remaining-voices.json"), JSON.stringify(jobs, null, 1));
console.log("remaining:", jobs.length);
