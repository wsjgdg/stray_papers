#!/usr/bin/env python3
"""Generate remaining line voices via freetts.org (Azure neural voices).

- Loads scenario, finds who-lines whose voice mp3 doesn't exist yet.
- POST /api/v1/tts (x-api-key) -> file_id -> GET /api/audio/{file_id}
- Converts to mono 44.1k 80k mp3 via ffmpeg.
- Chinese voice map: yu=Yunxi, mian=Xiaoxiao, lin=Xiaoyi, qi=Yunxia.
- Key from C:/Users/sibop/.secrets/tts.env (FREETTS_KEY, never printed).
"""
import io
import json
import os
import re
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
os.makedirs(ASSETS, exist_ok=True)

# load key (not printed)
env = {}
for line in open(r"C:\Users\sibop\.secrets\tts.env", encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v
KEY = env.get("FREETTS_KEY", "")
if not KEY:
    print("no FREETTS_KEY")
    sys.exit(1)

# refresh remaining-voices.json from the current scenario every run — a stale
# snapshot here once made the whole run a silent no-op ("ok" on already-voiced
# keys); dump-remaining.js re-derives jobs from scenario.js + voice-data.js
subprocess.run(
    ["node", os.path.join(HERE, "dump-remaining.js")],
    check=True,
    cwd=HERE,
)
jobs = json.load(
    open(os.path.join(HERE, "remaining-voices.json"), encoding="utf-8")
)

# already-voiced keys from voice-data.js
voiced = set()
vd = os.path.join(ROOT, "props", "voice-data.js")
if os.path.exists(vd):
    for m in re.finditer(r"^\s+([a-z_0-9]+\.[0-9]+):", open(vd, encoding="utf-8").read(), re.M):
        voiced.add(m.group(1))

print(f"remaining lines to voice: {len(jobs)}")


UA = "curl/8.1.2"  # Cloudflare blocks default python urllib UA


def api_tts(payload):
    req = urllib.request.Request(
        "https://freetts.org/api/v1/tts",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "x-api-key": KEY,
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": UA,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def api_audio(file_id, dest):
    req = urllib.request.Request(
        f"https://freetts.org/api/audio/{file_id}",
        headers={"x-api-key": KEY, "User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())


def ffmpeg_mono(src, dest):
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-i", src,
            "-ac", "1", "-ar", "44100", "-b:a", "80k", dest,
        ],
        check=True,
    )


ok = 0
fail = 0
for job in jobs:
    mp3 = os.path.join(ASSETS, job["key"].replace(".", "__") + ".mp3")
    if os.path.exists(mp3):
        ok += 1
        continue
    try:
        resp = api_tts(
            {
                "text": job["text"],
                "voice": job["voice"],
                "rate": "+0%",
                "pitch": "+0Hz",
                "output_format": "mp3",
            }
        )
        file_id = resp.get("file_id")
        if not file_id:
            print("FAILED", job["key"], str(resp)[:140])
            fail += 1
            continue
        raw = os.path.join(ASSETS, job["key"].replace(".", "__") + ".src")
        api_audio(file_id, raw)
        ffmpeg_mono(raw, mp3)
        os.remove(raw)
        ok += 1
        print("got", job["key"], os.path.getsize(mp3) // 1024, "KB")
    except Exception as e:
        print("FAILED", job["key"], str(e)[:140])
        fail += 1

print(f"RESULT: {ok} ok, {fail} failed")
