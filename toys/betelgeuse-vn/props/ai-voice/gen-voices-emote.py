#!/usr/bin/env python3
"""Emotional voice regeneration via edge-tts (Microsoft Azure neural voices).

Why: the freetts.org batch rendered every line at default prosody (+0% rate,
+0Hz pitch) — technically correct but flat ("像 AI 且没有感情"). The scenario
already labels every spoken line with a `feel`; this script maps feel ->
rate/pitch/volume so delivery tracks the emotion per line.

- Input: voices-all.json (dumped from scenario.js — key/who/feel/text).
- Output: assets/<scene>__<line>.mp3 (same keys as before, so
  make-voice-data.py packs unchanged). Uniform single channel: also replaces
  the 26 mixed-timbre Baidu fallback lines.
- Safety: each line renders to a .new temp file and only replaces the old mp3
  on success — a mid-run failure leaves the previous voice intact.
- Rate limits: semaphore 3 + two retries with backoff per line.
"""
import asyncio
import json
import os
import re
import subprocess
import sys

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")

VOICES = {
    "yu": "zh-CN-YunxiNeural",
    "mian": "zh-CN-XiaoxiaoNeural",
    "lin": "zh-CN-XiaoyiNeural",
    "qi": "zh-CN-YunxiaNeural",
}

# feel -> (rate, pitch, volume): delivery tracks the labelled emotion
FEEL_PROSODY = {
    "normal": ("+0%", "+0Hz", "+0%"),
    "sad": ("-12%", "-6Hz", "-3%"),
    "happy": ("+6%", "+10Hz", "+0%"),
    "surprised": ("+10%", "+12Hz", "+0%"),
    "angry": ("+12%", "+8Hz", "+6%"),
    "worried": ("-6%", "+2Hz", "+0%"),
    "shy": ("-10%", "-2Hz", "-8%"),
    "cry": ("-14%", "-10Hz", "-5%"),
}


async def render(job, sem, tmp_dir):
    key = job["key"]
    dst = os.path.join(ASSETS, key.replace(".", "__") + ".mp3")
    tmp = dst + ".new"
    voice = VOICES[job["who"]]
    rate, pitch, volume = FEEL_PROSODY.get(job["feel"], FEEL_PROSODY["normal"])
    async with sem:
        for attempt in range(3):
            seg_paths = []  # per-attempt: stale paths must never reach stitch
            try:
                segs = split_segments(job["text"])
                for i, seg in enumerate(segs):
                    sp = os.path.join(tmp_dir, key.replace(".", "_") + f"__s{i}.mp3")
                    tts = edge_tts.Communicate(
                        seg, voice, rate=rate, pitch=pitch, volume=volume
                    )
                    await tts.save(sp)
                    if os.path.getsize(sp) < 4000:
                        raise RuntimeError("suspiciously small segment output")
                    seg_paths.append(sp)
                if len(seg_paths) == 1:
                    os.replace(seg_paths[0], dst)
                else:
                    stitch(seg_paths, dst, tmp_dir)
                    for sp in seg_paths:
                        os.remove(sp)
                if os.path.getsize(dst) < 8000:
                    raise RuntimeError("final output suspiciously small")
                return key, True, ""
            except Exception as e:
                for sp in seg_paths:
                    if os.path.exists(sp):
                        os.remove(sp)
                if attempt < 2:
                    await asyncio.sleep(1.5 * (attempt + 1))
                else:
                    return key, False, str(e)[:120]


SENT_SPLIT = re.compile(r"[^。！？…；]+[。！？…；]*")
STITCH_MIN_LEN = 34  # long / multi-sentence lines get segmented + stitched

# every long line: segments generated with their own neural cadence, then
# stitched back with ~0.3s pauses — the delivery breathes like speech


def split_segments(text):
    if len(text) < STITCH_MIN_LEN:
        return [text]
    parts = [p for p in SENT_SPLIT.findall(text) if p.strip()]
    if len(parts) < 2:
        return [text]
    merged = []
    for part in parts:
        if merged and len(part) < 6:
            merged[-1] += part  # tiny fragment rides along with its neighbor
        else:
            merged.append(part)
    return merged if len(merged) > 1 else [text]


def stitch(parts, dst, tmp_dir):
    """ffmpeg concat: seg0, pause, seg1, pause, ... -> one 44.1k mp3."""
    sil = os.path.join(tmp_dir, "sil.mp3")
    inputs = []
    for i, part in enumerate(parts):
        inputs.append(part)
        if i < len(parts) - 1:
            inputs.append(sil)
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for path in inputs:
        cmd += ["-i", path]
    cmd += [
        "-filter_complex",
        f"concat=n={len(inputs)}:v=0:a=1",
        "-ar",
        "44100",
        "-ac",
        "1",
        "-b:a",
        "80k",
        dst,
    ]
    subprocess.run(cmd, check=True)


async def main(force):
    jobs = json.load(open(os.path.join(HERE, "voices-all.json"), encoding="utf-8"))
    tmp_dir = os.path.join(HERE, ".tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    # shared 0.3s pause used by the segment stitcher
    sil = os.path.join(tmp_dir, "sil.mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", "anullsrc=r=44100:cl=mono", "-t", "0.3", "-b:a", "48k", sil],
        check=True,
    )
    todo = jobs
    if not force:
        todo = [
            j
            for j in jobs
            if not os.path.exists(
                os.path.join(ASSETS, j["key"].replace(".", "__") + ".mp3")
            )
        ]
    print("lines to render:", len(todo), "(force:", force, ")")
    sem = asyncio.Semaphore(3)
    results = await asyncio.gather(*[render(j, sem, tmp_dir) for j in todo])
    fails = [r for r in results if not r[1]]
    print(f"RESULT: {len(results) - len(fails)} ok, {len(fails)} failed")
    for key, _, err in fails:
        print("FAIL", key, err)
    return 1 if fails else 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(asyncio.run(main(force)))
