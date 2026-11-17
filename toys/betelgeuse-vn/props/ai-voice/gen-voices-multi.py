#!/usr/bin/env python3
"""Multi-channel voice generation: freetts.org -> Baidu fallback (#tts.env 3
channels; DashScope probed 2026-11-14 — account in arrears, excluded).

- Refreshes remaining-voices.json via dump-remaining.js every run (a stale
  snapshot once made a whole run a silent no-op).
- Per job: freetts.org first (Azure neural voices, quota-limited); any
  failure falls back to Baidu TTS (PCM 16k -> ffmpeg -> mp3). Output files
  are identical in naming/format to gen-voices-freetts.py, so
  make-voice-data.py packs them unchanged.
- Baidu voice map: yu=1 度小宇, mian=4 度丫丫, lin=0 度小美, qi=5003 度小鹿.
- Keys from C:/Users/sibop/.secrets/tts.env (values are never printed;
  error bodies are redacted).
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
os.makedirs(ASSETS, exist_ok=True)

env = {}
for line in open(r"C:\Users\sibop\.secrets\tts.env", encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v
FREETTS_KEY = env.get("FREETTS_KEY", "")
BAIDU_KEY = env.get("API_Key", "")
BAIDU_SECRET = env.get("Secret_Key", "")
SECRETS = [v for v in (FREETTS_KEY, BAIDU_KEY, BAIDU_SECRET) if v]
if not FREETTS_KEY or not BAIDU_KEY:
    print("missing channel keys in tts.env")
    sys.exit(1)


def redact(text):
    t = str(text)
    for s in SECRETS:
        if s:
            t = t.replace(s, "***")
    return t[:200]


UA = "curl/8.1.2"  # Cloudflare blocks the default python urllib UA
FREE_VOICES = {
    "yu": "zh-CN-YunxiNeural",
    "mian": "zh-CN-XiaoxiaoNeural",
    "lin": "zh-CN-XiaoyiNeural",
    "qi": "zh-CN-YunxiaNeural",
}
BAIDU_PER = {"yu": 1, "mian": 4, "lin": 0, "qi": 5003}

# refresh the job list from the current scenario + voice coverage
subprocess.run(
    ["node", os.path.join(HERE, "dump-remaining.js")], check=True, cwd=HERE
)
jobs = json.load(open(os.path.join(HERE, "remaining-voices.json"), encoding="utf-8"))
print("remaining lines to voice:", len(jobs))


def free_tts(text, voice):
    """freetts.org: POST job -> GET audio. Raises on any failure."""
    req = urllib.request.Request(
        "https://freetts.org/api/v1/tts",
        data=json.dumps(
            {"text": text, "voice": voice, "rate": "+0%", "pitch": "+0Hz",
             "output_format": "mp3"}
        ).encode("utf-8"),
        headers={
            "x-api-key": FREETTS_KEY,
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": UA,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        file_id = json.load(r).get("file_id")
    if not file_id:
        raise RuntimeError("no file_id")
    req = urllib.request.Request(
        f"https://freetts.org/api/audio/{file_id}",
        headers={"x-api-key": FREETTS_KEY, "User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


_baidu_tok = None


def baidu_token():
    global _baidu_tok
    if _baidu_tok:
        return _baidu_tok
    q = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": BAIDU_KEY,
            "client_secret": BAIDU_SECRET,
        }
    )
    req = urllib.request.Request(
        "https://aip.baidubce.com/oauth/2.0/token",
        data=q.encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        _baidu_tok = json.load(r)["access_token"]
    return _baidu_tok


def baidu_tts(text, per):
    """Baidu TTS: returns raw PCM (16k mono s16le) bytes. Raises on failure."""
    tok = baidu_token()
    q = urllib.parse.urlencode(
        {
            "tex": text,
            "tok": tok,
            "cuid": "betelgeuse-vn",
            "ctp": 1,
            "lan": "zh",
            "per": per,
            "aue": 6,
        }
    )
    req = urllib.request.Request(
        f"https://tsn.baidu.com/text2audio?{q}",
        data=b"",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        ct = r.headers.get("Content-Type", "")
        body = r.read()
    if not ct.startswith("audio"):
        raise RuntimeError("baidu error: " + body.decode("utf-8", "replace")[:120])
    return body


def to_mp3(src_path, dst_path, fmt):
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "s16le", "-ar", "16000", "-ac", "1" if fmt == "pcm" else "2",
            "-i", src_path,
            "-ac", "1", "-ar", "44100", "-b:a", "80k", dst_path,
        ],
        check=True,
    )


def save_wav_bytes(body, tmp_path):
    # Baidu aue=6 returns WAV (headered); write as-is for ffmpeg
    with open(tmp_path, "wb") as f:
        f.write(body)


ok = 0
fail = []
for job in jobs:
    key = job["key"]
    dst = os.path.join(ASSETS, key.replace(".", "__") + ".mp3")
    if os.path.exists(dst):
        ok += 1
        continue
    text = job["text"]
    who = key.rsplit(".", 1)[0]
    who = re.sub(r"_.*$", "", who)  # scene ids carry no underscores in cast
    # scene ids like ending_true contain "_"; cast names don't — map via voice
    voice_key = None
    # jobs carry the voice name already (from dump-remaining.js)
    for who_id, vname in FREE_VOICES.items():
        if job["voice"] == vname:
            voice_key = who_id
    if voice_key is None:
        voice_key = "mian"
    raw = os.path.join(ASSETS, key.replace(".", "__") + ".src")
    try:
        body = free_tts(text, job["voice"])
        with open(raw, "wb") as f:
            f.write(body)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", raw,
             "-ac", "1", "-ar", "44100", "-b:a", "80k", dst],
            check=True,
        )
        os.remove(raw)
        ok += 1
        print("free", key, os.path.getsize(dst) // 1024, "KB")
        continue
    except Exception as e:
        print("free FAIL", key, redact(e))
    # fallback: Baidu
    try:
        body = baidu_tts(text, BAIDU_PER.get(voice_key, 4))
        save_wav_bytes(body, raw)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", raw,
             "-ac", "1", "-ar", "44100", "-b:a", "80k", dst],
            check=True,
        )
        os.remove(raw)
        ok += 1
        print("baidu", key, os.path.getsize(dst) // 1024, "KB")
    except Exception as e:
        fail.append(key)
        print("baidu FAIL", key, redact(e))

print(f"RESULT: {ok} ok, {len(fail)} failed")
if fail:
    print("failed keys:", fail[:10], "..." if len(fail) > 10 else "")
