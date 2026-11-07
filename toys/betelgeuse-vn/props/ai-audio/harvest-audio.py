#!/usr/bin/env python3
"""Harvest queued free.ai audio jobs → download → ffmpeg → mp3.

Reads jobs-queued.txt (name|job_id), polls each job, downloads finished
audio, converts to mono 64k mp3 via ffmpeg, and appends completed names to
jobs-done.txt. Idempotent — already-converted names are skipped.
"""
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://api.free.ai"
JOBS = os.path.join(HERE, "jobs-queued.txt")
DONE = os.path.join(HERE, "jobs-done.txt")

# key from env (loaded by caller); never hardcode or print it
KEY = os.environ.get("freeai_key", "")


def auth_header():
    return {"Authorization": "Bearer " + KEY}


def poll_job(job_id):
    req = urllib.request.Request(
        BASE + f"/api/v1/jobs/{job_id}/", headers=auth_header()
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            import json

            return json.load(r)
    except Exception as e:
        return {"error": str(e)}


def find_url(d):
    if not isinstance(d, dict):
        return None
    for k in ("url", "audio_url", "output_url"):
        v = d.get(k)
        if isinstance(v, str) and v:
            return v
    res = d.get("result")
    if isinstance(res, dict):
        for k in ("url", "audio_url"):
            v = res.get(k)
            if isinstance(v, str) and v:
                return v
    return None


def download(url, raw_path):
    req = urllib.request.Request(url, headers=auth_header())
    with urllib.request.urlopen(req, timeout=120) as r, open(raw_path, "wb") as f:
        f.write(r.read())


def convert(raw_path, mp3_path, secs):
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-i", raw_path,
            "-ac", "1", "-ar", "44100", "-b:a", "64k", "-t", str(secs),
            mp3_path,
        ],
        check=True,
    )


def main():
    if not KEY:
        print("no freeai_key in env")
        sys.exit(1)
    if not os.path.exists(JOBS):
        print("no jobs-queued.txt")
        sys.exit(0)
    done = set()
    if os.path.exists(DONE):
        done = set(l.strip() for l in open(DONE, encoding="utf-8") if l.strip())
    secs_map = {}
    specs = []
    # duration map from make-audio.sh (name|...|secs pattern lives there)
    sh = open(os.path.join(HERE, "make-audio.sh"), encoding="utf-8").read()
    import re

    for m in re.finditer(r'"([a-z_]+)\|([^"]+)"', sh):
        pass
    # simpler: fixed durations by prefix
    for line in open(JOBS, encoding="utf-8"):
        line = line.strip()
        if not line or "|" not in line:
            continue
        name, job_id = line.split("|", 1)
        if name in done or not job_id:
            continue
        secs = 6 if name.startswith("sfx_") else 24
        status = poll_job(job_id)
        url = find_url(status)
        state = status.get("state") or status.get("status") or "?"
        if not url:
            print(f"{name}: {state} (no url yet)")
            continue
        raw = os.path.join(HERE, name + ".raw")
        mp3 = os.path.join(HERE, name + ".mp3")
        try:
            download(url, raw)
            convert(raw, mp3, secs)
            os.remove(raw)
            done.add(name)
            with open(DONE, "a", encoding="utf-8") as f:
                f.write(name + "\n")
            print(f"{name}: DONE -> {mp3} ({os.path.getsize(mp3)//1024} KB)")
        except Exception as e:
            print(f"{name}: harvest failed: {e}")
        time.sleep(1)
    print(f"done={len(done)}")


if __name__ == "__main__":
    main()
