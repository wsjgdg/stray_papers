#!/usr/bin/env python3
"""Full-catalog voice audition: generate samples for every available voice
(freetts.org Azure catalog + Baidu timbres) with per-character lines, then
rebuild docs/audition/voice.html from a manifest. Paced to dodge 429s."""
import asyncio
import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "audition", "voice")
os.makedirs(OUT, exist_ok=True)
DOCS = os.path.abspath(os.path.join(HERE, "..", "..", "docs", "audition"))

env = {}
for line in open(r"C:\Users\sibop\.secrets\tts.env", encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v
FREETTS_KEY = env.get("FREETTS_KEY", "")
UA = "curl/8.1.2"

LINES = {
    "yu": "三年前的今天，沈眠失踪。参宿四还亮着，可我已经三年没抬头了。",
    "mian": "参宿四暗过一次，又亮回来了。这次是我自己记住的。",
    "lin": "眠姐欠的那碗馄饨，我记了三年账。今天，当众销账。",
    "qi": "备注：风向，南风。这次是我自己想记的。",
}
# feel-derived prosody per character line (same mapping as gen-voices-emote)
PROSODY = {
    "yu": ("-4%", "-2Hz"),
    "mian": ("-12%", "-6Hz"),
    "lin": ("-10%", "-2Hz"),
    "qi": ("-6%", "-2Hz"),
}

# male voices: one yu line each
MALE = [
    ("azure", "zh-CN-YunxiNeural", "Yunxi·阳光青年（现用）"),
    ("azure", "zh-CN-YunjianNeural", "Yunjian·低沉热血"),
    ("azure", "zh-CN-YunyangNeural", "Yunyang·沉稳播音"),
    ("azure", "zh-CN-YunyeNeural", "Yunye·温厚男声"),
    ("azure", "zh-CN-YunzeNeural", "Yunze·成熟男声"),
    ("azure", "zh-CN-YunfengNeural", "Yunfeng·沉稳叙事"),
    ("azure", "zh-CN-YunhaoNeural", "Yunhao·大气男声"),
    ("baidu", 1, "度小宇"),
    ("baidu", 3, "度逍遥"),
    ("baidu", 106, "度博文"),
]
# female voices: three character lines each (mian / lin / qi)
FEMALE = [
    ("azure", "zh-CN-XiaoxiaoNeural", "Xiaoxiao·温暖（沈眠现用）"),
    ("azure", "zh-CN-XiaoyiNeural", "Xiaoyi·活泼（林晚现用）"),
    ("azure", "zh-CN-XiaomoNeural", "Xiaomo·冷冽低语"),
    ("azure", "zh-CN-XiaoxuanNeural", "Xiaoxuan·明亮清扬"),
    ("azure", "zh-CN-XiaohanNeural", "Xiaohan·沉静"),
    ("azure", "zh-CN-XiaoruiNeural", "Xiaorui·平静克制"),
    ("baidu", 0, "度小美"),
    ("baidu", 4, "度丫丫"),
    ("baidu", 5, "度小娇"),
    ("baidu", 5003, "度小鹿"),
    ("baidu", 4106, "度清"),
    ("baidu", 4118, "度小童"),
]

_tts_ok_until = 0.0  # freetts pacing state


def free_tts(text, voice):
    global _tts_ok_until
    wait = _tts_ok_until - time.time()
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(
        "https://freetts.org/api/v1/tts",
        data=json.dumps({"text": text, "voice": voice, "rate": "+0%",
                         "pitch": "+0Hz", "output_format": "mp3"}).encode(),
        headers={"x-api-key": FREETTS_KEY,
                 "Content-Type": "application/json; charset=utf-8",
                 "User-Agent": UA},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        file_id = json.load(r).get("file_id")
    if not file_id:
        raise RuntimeError("no file_id")
    req = urllib.request.Request(
        f"https://freetts.org/api/audio/{file_id}",
        headers={"x-api-key": FREETTS_KEY, "User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    _tts_ok_until = time.time() + 10  # keep ~10s between calls: dodge the 429
    return body


def baidu_tts(text, per):
    env = {}
    for line in open(r"C:\Users\sibop\.secrets\tts.env", encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v
    q = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": env["API_Key"], "client_secret": env["Secret_Key"]})
    req = urllib.request.Request(
        "https://aip.baidubce.com/oauth/2.0/token", data=q.encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        tok = json.load(r)["access_token"]
    tex = urllib.parse.quote_plus(text)
    req = urllib.request.Request(
        f"https://tsn.baidu.com/text2audio?tex={tex}&tok={tok}&cuid=betelgeuse-vn&ctp=1&lan=zh&per={per}&aue=6",
        data=b"", headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=60) as r:
        ct = r.headers.get("Content-Type", "")
        body = r.read()
    if not ct.startswith("audio"):
        raise RuntimeError(body.decode("utf-8", "replace")[:100])
    return body


def to_mp3(src, dst):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
         "-ac", "1", "-ar", "44100", "-b:a", "80k", dst], check=True)


manifest = []
for channel, voice, label in MALE:
    fname = f"yu-{channel}-{voice}.mp3"
    dst = os.path.join(OUT, fname)
    if os.path.exists(dst):
        manifest.append({"f": fname, "label": label, "who": "yu", "line": LINES["yu"]})
        continue
    try:
        if channel == "azure":
            body = free_tts(LINES["yu"], voice)
            raw = dst + ".src"
            with open(raw, "wb") as f:
                f.write(body)
            to_mp3(raw, dst)
            os.remove(raw)
        else:
            body = baidu_tts(LINES["yu"], voice)
            raw = dst + ".src"
            with open(raw, "wb") as f:
                f.write(body)
            to_mp3(raw, dst)
            os.remove(raw)
        manifest.append({"f": fname, "label": label, "who": "yu", "line": LINES["yu"]})
        print("ok", fname)
    except Exception as e:
        print("FAIL", fname, str(e)[:100])

for channel, voice, label in FEMALE:
    for who in ("mian", "lin", "qi"):
        fname = f"{who}-{channel}-{voice}.mp3"
        dst = os.path.join(OUT, fname)
        if os.path.exists(dst):
            manifest.append({"f": fname, "label": label, "who": who,
                             "line": LINES[who]})
            continue
        try:
            rate, pitch = PROSODY[who]
            if channel == "azure":
                body = free_tts(LINES[who], voice)
                raw = dst + ".src"
                with open(raw, "wb") as f:
                    f.write(body)
                to_mp3(raw, dst)
                os.remove(raw)
            else:
                body = baidu_tts(LINES[who], voice)
                raw = dst + ".src"
                with open(raw, "wb") as f:
                    f.write(body)
                to_mp3(raw, dst)
                os.remove(raw)
            manifest.append({"f": fname, "label": label, "who": who,
                             "line": LINES[who]})
            print("ok", fname)
        except Exception as e:
            print("FAIL", fname, str(e)[:100])

# rebuild the audition page from the manifest
rows = {"yu": [], "mian": [], "lin": [], "qi": []}
for item in manifest:
    rows[item["who"]].append(item)
NAMES = {"yu": "陈屿（男主）", "mian": "沈眠", "lin": "林晚", "qi": "栖（AI）"}
html = ["""<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>配音音色试听（全目录）</title>
<style>
body { background:#0a1122; color:#dbe6f6; font-family:system-ui,sans-serif; max-width:900px; margin:40px auto; padding:0 20px; }
h1 { font-size:22px; } h2 { font-size:17px; color:#9bd4e8; margin-top:34px; }
.card { background:#101a30; border-radius:10px; padding:14px 18px; margin:12px 0; }
.card.cur { border:1px solid #ff8c5a; }
label { font-size:13px; color:#8fa8cc; }
audio { width:100%; margin-top:8px; }
.cur-pill { display:inline-block; background:#ff8c5a; color:#05070f; border-radius:4px; padding:1px 8px; font-size:12px; margin-left:8px; }
</style></head><body>
<h1>配音音色试听（全目录 · 26 音色）</h1>
<p>男声 10 个（陈屿候选）、女声 16 个（沈眠/林晚/栖候选，每个音色配了三句角色台词）。
每张卡片标了渠道与音色名。听完回复格式：<code>yu: 名字 · mian: 名字 · lin: 名字 · qi: 名字</code>。
女声池已足够让三个女角色各得一个不同音色。</p>"""]
for who in ("yu", "mian", "lin", "qi"):
    html.append(f"<h2>{NAMES[who]}</h2>")
    for item in rows[who]:
        cur = " cur" if ("现用" in item["label"]) else ""
        pill = ('<span class="cur-pill">现用</span>'
                if "现用" in item["label"] else "")
        # page lives at docs/audition/, samples at props/ai-voice/audition/
        path = "../../props/ai-voice/audition/voice/" + item["f"]
        html.append(
            f'<div class="card{cur}"><label>{item["label"]}{pill}</label><br>'
            f'<audio controls src="{path}"></audio>'
            f'<div class="cur" style="font-size:12px;color:#6c82a8">{item["line"]}</div></div>'
        )
html.append("</body></html>")
open(os.path.join(DOCS, "voice.html"), "w", encoding="utf-8").write("\n".join(html))
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("manifest:", len(manifest), "samples; page rebuilt")
