#!/usr/bin/env node
/* Voice generation v2: ALL who-lines across ALL scenes via free.ai TTS.
 * Output: props/ai-voice/assets/<scene>__<line>.wav + manifest.json
 * Idempotent: skips keys whose wav already exists (pilot 7 stay done).
 * Key sourcing: freeai_key from C:/Users/sibop/.secrets/audio.env (never printed). */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ASSETS = path.join(HERE, "assets");
fs.mkdirSync(ASSETS, { recursive: true });

const envSrc = fs.readFileSync("C:/Users/sibop/.secrets/audio.env", "utf8");
const KEY = (envSrc.match(/freeai_key=(\S+)/) || [])[1];
if (!KEY) {
  console.error("no freeai_key");
  process.exit(1);
}
const AUTH = { Authorization: "Bearer " + KEY };

global.window = {};
eval(fs.readFileSync(path.join(HERE, "..", "..", "scenario.js"), "utf8"));
const S = global.window.SCENARIO;

const VOICES = { yu: "zm_yunjian", mian: "zf_xiaobei", lin: "zf_xiaoni", qi: "zf_xiaoxiao" };

// collect all voiced lines
const jobs = [];
Object.keys(S.scenes).forEach((sceneId) => {
  const scene = S.scenes[sceneId];
  if (!scene || !Array.isArray(scene.lines)) return;
  scene.lines.forEach((line, idx) => {
    if (!line || !line.who || !VOICES[line.who]) return;
    const text = String(line.text || "").replace(/「|」/g, "").trim();
    if (!text) return;
    jobs.push({ key: sceneId + "__" + idx, who: line.who, text });
  });
});
console.log("total voiced lines:", jobs.length);

function post(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const manifestPath = path.join(ASSETS, "manifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : {};
  let ok = 0;
  let fail = 0;
  for (const job of jobs) {
    const wav = path.join(ASSETS, job.key + ".wav");
    if (fs.existsSync(wav)) {
      manifest[job.key] = job.who;
      ok++;
      continue;
    }
    const voice = VOICES[job.who];
    console.log("TTS:", job.key, voice, job.text.slice(0, 16) + "…");
    let url = null;
    let attempts = 0;
    while (attempts < 2 && !url) {
      attempts++;
      try {
        const resp = await post("https://api.free.ai/v1/tts/", {
          text: job.text,
          voice: voice,
          model: "kokoro",
        });
        url = resp.url || resp.audio_url;
        if (!url && resp.job_id) {
          for (let i = 0; i < 20 && !url; i++) {
            await sleep(3000);
            const st = await fetch("https://api.free.ai/v1/status/" + resp.job_id + "/", { headers: AUTH }).then((r) => r.json());
            url = st.url || st.audio_url;
          }
        }
        if (!url) {
          console.error("FAILED", job.key, JSON.stringify(resp).slice(0, 140));
        }
      } catch (e) {
        console.error("NET-ERR", job.key, "attempt", attempts, String(e).slice(0, 120));
        await sleep(2000);
      }
    }
    if (!url) {
      fail++;
      continue;
    }
    let buf = null;
    try {
      buf = Buffer.from(await fetch(url, { headers: AUTH }).then((r) => r.arrayBuffer()));
    } catch (e) {
      console.error("DL-ERR", job.key, String(e).slice(0, 120));
      fail++;
      continue;
    }
    fs.writeFileSync(wav, buf);
    manifest[job.key] = job.who;
    ok++;
    console.log("got", job.key, Math.round(buf.length / 1024) + "KB");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log("RESULT:", ok + "/" + jobs.length + " voiced, " + fail + " failed");
})();
