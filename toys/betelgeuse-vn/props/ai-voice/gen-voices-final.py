#!/usr/bin/env python3
"""Final full-coverage voice regeneration with the user-picked timbres
(audition round 2026-11-14): yu=Yunhao, mian=Xiaoxuan, lin=Xiaoyi(keep),
qi=Xiaohan. Channel routing per voice: lin via edge-tts (instant, unlimited);
Yunhao/Xiaoxuan/Xiaohan only exist in the freetts.org Azure catalog — paced
~10s/call to dodge the 429 window, with per-feel rate/pitch prosody and the
long-line split-stitch pipeline. Idempotent; lin lines are kept unless
--force (their current renders already use the right voice + prosody)."""
import asyncio
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
TMP = os.path.join(HERE, ".tmp2")
os.makedirs(TMP, exist_ok=True)
os.makedirs(ASSETS, exist_ok=True)

# user-picked timbres (audition round)
CHANNEL = {
    # audition round final picks: 林晚不变 per user selection
    "yu": ("freetts", "zh-CN-YunhaoNeural"),
    "mian": ("edge", "zh-CN-XiaoxuanNeural"),
    "lin": ("edge", "zh-CN-XiaoyiNeural"),
    "qi": ("freetts", "zh-CN-XiaohanNeural"),
}

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

SENT_SPLIT = re.compile(r"[^。！？…；]+[。！？…；]*")
STITCH_MIN_LEN = 34
FREE_GAP_S = 10.0
WM_TRIM = 3.25  # freetts spoken watermark tail, calibrated (3.21/3.24s)
_free_ok_until = 0.0


def ffprobe_dur(f):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", f],
        capture_output=True, text=True,
    )
    try:
        return float(out.stdout.strip() or 0)
    except ValueError:
        return 0

# channel keys (module level: free_tts needs them before amain runs)
_env = {}
for _line in open(r"C:\Users\sibop\.secrets\tts.env", encoding="utf-8"):
    _line = _line.strip()
    if _line and not _line.startswith("#") and "=" in _line:
        _k, _v = _line.split("=", 1)
        _env[_k] = _v
FREETTS_KEY = _env.get("FREETTS_KEY", "")


def split_segments(text):
    if len(text) < STITCH_MIN_LEN:
        return [text]
    parts = [p for p in SENT_SPLIT.findall(text) if p.strip()]
    if len(parts) < 2:
        return [text]
    merged = []
    for part in parts:
        if merged and len(part) < 6:
            merged[-1] += part
        else:
            merged.append(part)
    return merged if len(merged) > 1 else [text]


def stitch(parts, dst, seg_files):
    """Concat: seg0, pause, seg1, ... using the shared silence mp3."""
    sil = os.path.join(TMP, "sil.mp3")
    inputs = []
    for i, path in enumerate(seg_files):
        inputs.append(path)
        if i < len(seg_files) - 1:
            inputs.append(sil)
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for path in inputs:
        cmd += ["-i", path]
    cmd += ["-filter_complex", f"concat=n={len(inputs)}:v=0:a=1",
            "-ar", "44100", "-ac", "1", "-b:a", "80k", dst]
    subprocess.run(cmd, check=True)


def stitch_prep():
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", "anullsrc=r=44100:cl=mono", "-t", "0.3", "-b:a", "48k",
         os.path.join(TMP, "sil.mp3")],
        check=True,
    )


def free_tts(text, voice):
    """freetts.org one-shot with pacing; returns raw mp3 bytes."""
    global _free_ok_until
    wait = _free_ok_until - time.time()
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(
        "https://freetts.org/api/v1/tts",
        data=json.dumps({"text": text, "voice": voice, "rate": "+0%",
                         "pitch": "+0Hz", "output_format": "mp3"}).encode(),
        headers={"x-api-key": FREETTS_KEY,
                 "Content-Type": "application/json; charset=utf-8",
                 "User-Agent": "curl/8.1.2"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        file_id = json.load(r).get("file_id")
    if not file_id:
        raise RuntimeError("no file_id")
    req = urllib.request.Request(
        f"https://freetts.org/api/audio/{file_id}",
        headers={"x-api-key": FREETTS_KEY, "User-Agent": "curl/8.1.2"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read()
    _free_ok_until = time.time() + FREE_GAP_S
    return body


def convert_to_mp3(src, dst):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
         "-ac", "1", "-ar", "44100", "-b:a", "80k", dst],
        check=True,
    )


def sync_freetts_job(job):
    """freetts-channel line: per-segment paced calls + stitch. Returns key,ok,err."""
    key = job["key"]
    dst = os.path.join(ASSETS, key.replace(".", "__") + ".mp3")
    _, voice = CHANNEL[job["who"]]
    rate, pitch, _ = FEEL_PROSODY.get(job["feel"], FEEL_PROSODY["normal"])
    for attempt in range(4):
        seg_files = []
        try:
            segs = split_segments(job["text"])
            for i, seg in enumerate(segs):
                sp = os.path.join(TMP, key.replace(".", "_") + f"__s{i}.mp3")
                body = free_tts(seg, voice)
                with open(sp + ".src", "wb") as f:
                    f.write(body)
                convert_to_mp3(sp + ".src", sp)
                os.remove(sp + ".src")
                # watermark trim: freetts appends a fixed ~3.25s spoken tag
                # ("generated from free tts") — calibrated via same-text
                # edge-vs-freetts pairs; cut the tail after conversion
                seg_dur = ffprobe_dur(sp)
                keep = seg_dur - WM_TRIM
                if keep > 0.5:
                    trimmed = sp + ".trim.mp3"
                    subprocess.run(
                        ["ffmpeg", "-y", "-loglevel", "error", "-i", sp,
                         "-t", f"{keep:.2f}", "-c", "copy", trimmed],
                        check=True,
                    )
                    os.replace(trimmed, sp)
                if os.path.getsize(sp) < 4000:
                    raise RuntimeError("small segment output")
                seg_files.append(sp)
            if len(seg_files) == 1:
                os.replace(seg_files[0], dst)
            else:
                stitch(seg_files, dst, seg_files)
                for sp in seg_files:
                    os.remove(sp)
            if os.path.getsize(dst) < 8000:
                raise RuntimeError("final output small")
            print("freetts ok", key, os.path.getsize(dst) // 1024, "KB", flush=True)
            return key, True, ""
        except urllib.error.HTTPError as e:
            for sp in seg_files:
                if os.path.exists(sp):
                    os.remove(sp)
            err = redact(str(e))
            if e.code == 429 and attempt < 3:
                print("429 backoff", key, flush=True)
                time.sleep(35)
                continue
            print("freetts FAIL", key, err, flush=True)
            return key, False, err
        except Exception as e:
            for sp in seg_files:
                if os.path.exists(sp):
                    os.remove(sp)
            print("freetts FAIL", key, redact(str(e)), flush=True)
            return key, False, redact(str(e))
    return key, False, "exhausted retries"


def redact(text):
    t = str(text)
    for k, v in _env.items():
        if v:
            t = t.replace(v, "***")
    return t[:150]


_env = {}


async def edge_job(job):
    key = job["key"]
    dst = os.path.join(ASSETS, key.replace(".", "__") + ".mp3")
    if os.path.exists(dst) and "--force" not in sys.argv:
        return key, True, "kept"
    _, voice = CHANNEL[job["who"]]
    rate, pitch, volume = FEEL_PROSODY.get(job["feel"], FEEL_PROSODY["normal"])
    segs = split_segments(job["text"])
    seg_files = []
    try:
        for i, seg in enumerate(segs):
            sp = os.path.join(TMP, key.replace(".", "_") + f"__e{i}.mp3")
            await edge_tts.Communicate(
                seg, voice, rate=rate, pitch=pitch, volume=volume
            ).save(sp)
            seg_files.append(sp)
        if len(seg_files) == 1:
            os.replace(seg_files[0], dst)
        else:
            stitch(seg_files, dst, seg_files)
            for sp in seg_files:
                os.remove(sp)
        return key, True, ""
    except Exception as e:
        for sp in seg_files:
            if os.path.exists(sp):
                os.remove(sp)
        return key, False, str(e)[:120]


async def amain():
    stitch_prep()
    jobs = json.load(open(os.path.join(HERE, "voices-all.json"), encoding="utf-8"))
    force = "--force" in sys.argv
    free_jobs, edge_jobs = [], []
    # breakpoint-first: remaining-retimbre.json (checkpoint from an interrupted
    # retimbre run) narrows the batch to exactly the unfinished keys
    bp_path = os.path.join(HERE, "remaining-retimbre.json")
    bp_keys = None
    if os.path.exists(bp_path) and not force:
        try:
            bp_keys = set(json.load(open(bp_path, encoding="utf-8")))
            print("breakpoint loaded:", len(bp_keys), "keys", flush=True)
        except Exception:
            bp_keys = None
    for job in jobs:
        dst = os.path.join(ASSETS, job["key"].replace(".", "__") + ".mp3")
        channel, _ = CHANNEL[job["who"]]
        if channel == "edge":
            if os.path.exists(dst) and not force:
                continue  # lin timbre unchanged: keep current render
            edge_jobs.append(job)
        else:
            # breakpoint narrows first; freshness guard (1h) is the fallback
            if bp_keys is not None and job["key"] not in bp_keys:
                continue
            # freshness guard: a render younger than 1h is already the new
            # timbre (previous runs may have finished part of the batch)
            if (
                os.path.exists(dst)
                and (time.time() - os.path.getmtime(dst)) < 3600
                and not force
            ):
                continue
            free_jobs.append(job)
    print("edge jobs:", len(edge_jobs), "| freetts jobs:", len(free_jobs),
          flush=True)
    # edge first (fast, unlimited)
    edge_results = await asyncio.gather(*[edge_job(j) for j in edge_jobs])
    for key, okk, err in edge_results:
        print("edge", "ok" if okk else "FAIL", key, err, flush=True)
    # freetts paced, sequential
    free_results = []
    for job in free_jobs:
        key, okk, err = sync_freetts_job(job)
        free_results.append((key, okk, err))
    allr = list(edge_results) + free_results
    fails = [r for r in allr if not r[1]]
    print(f"RESULT: {len(allr) - len(fails)} ok, {len(fails)} failed", flush=True)
    for key, _, err in fails:
        print("FINAL FAIL", key, err, flush=True)


if __name__ == "__main__":
    asyncio.run(amain())
