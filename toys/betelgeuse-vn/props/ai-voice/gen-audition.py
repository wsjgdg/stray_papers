#!/usr/bin/env python3
"""Generate voice audition samples (6 zh-CN voices x representative lines)
and a listening page, plus a BGM audition page for cue reassignment."""
import asyncio
import json
import os
import re
import subprocess

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "audition")
os.makedirs(os.path.join(OUT, "voice"), exist_ok=True)
os.makedirs(os.path.join(OUT, "bgm"), exist_ok=True)

VOICES = {
    "yunxi": ("zh-CN-YunxiNeural", "阳光青年（陈屿现用）"),
    "yunjian": ("zh-CN-YunjianNeural", "热血低沉男（备选·陈屿）"),
    "yunyang": ("zh-CN-YunyangNeural", "沉稳播音男（备选·陈屿/栖）"),
    "xiaoxiao": ("zh-CN-XiaoxiaoNeural", "温暖女（沈眠现用）"),
    "xiaoyi": ("zh-CN-XiaoyiNeural", "活泼女（林晚现用）"),
    "yunxia": ("zh-CN-YunxiaNeural", "空灵童声（栖现用）"),
}

LINES = {
    "yu": "三年前的今天，沈眠失踪。定时邮件。日期，是三年后的今天。",
    "mian": "参宿四暗过一次，又亮回来了。这次是我自己记住的。",
    "lin": "眠姐欠的那碗馄饨，我记了三年账。今天，当众销账。",
    "qi": "备注：风向，南风。这次是我自己想记的。",
}

# voice -> whose representative line to use
SAMPLE = {
    "yunxi": LINES["yu"],
    "yunjian": LINES["yu"],
    "yunyang": LINES["qi"],
    "xiaoxiao": LINES["mian"],
    "xiaoyi": LINES["lin"],
    "yunxia": LINES["qi"],
}
# per-line feel prosody to match delivery
PROSODY = {
    "yu": ("-4%", "-2Hz"),
    "mian": ("+6%", "+10Hz"),
    "lin": ("-10%", "-2Hz"),
    "qi": ("-6%", "-2Hz"),
}
WHO_OF = {"yunxi": "yu", "yunjian": "yu", "yunyang": "qi",
          "xiaoxiao": "mian", "xiaoyi": "lin", "yunxia": "qi"}


async def gen_all():
    for key, (voice, _desc) in VOICES.items():
        who = WHO_OF[key]
        rate, pitch = PROSODY[who]
        out = os.path.join(OUT, "voice", key + ".mp3")
        await edge_tts.Communicate(SAMPLE[key], voice, rate=rate, pitch=pitch).save(out)
        print("voice sample:", key)


asyncio.run(gen_all())

# BGM samples: copy the ai-audio mp3s into the audition dir with sizes
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BGMDIR = os.path.join(ROOT, "props", "ai-audio")
copied = []
for f in sorted(os.listdir(BGMDIR)):
    if f.endswith(".mp3") and not f.startswith("amb_"):
        src = os.path.join(BGMDIR, f)
        dst = os.path.join(OUT, "bgm", f)
        with open(src, "rb") as a, open(dst, "wb") as b:
            b.write(a.read())
        copied.append(f)
print("bgm tracks copied:", len(copied))

# usage map for the bgm audition page
scenario = open(os.path.join(ROOT, "scenario.js"), encoding="utf-8").read()
usage = {}
for m in re.finditer(r'bgm: "(bgm_[a-z_]+)"', scenario):
    usage[m.group(1)] = usage.get(m.group(1), 0) + 1
json.dump(usage, open(os.path.join(OUT, "bgm-usage.json"), "w", encoding="utf-8"), indent=1)
print("usage:", usage)
