#!/usr/bin/env bash
# retry loop: queue + harvest every 15 min until all 16 assets converted,
# then pack, rebuild the single file, commit and push.
cd "$(dirname "$0")"
for round in $(seq 1 40); do
  echo "=== round $round $(date +%H:%M) ==="
  bash make-audio.sh
  set -a; source /c/Users/sibop/.secrets/audio.env; set +a
  python harvest-audio.py
  n=$(ls *.mp3 2>/dev/null | wc -l)
  echo "mp3 count: $n/16"
  if [ "$n" -ge 16 ]; then
    python make-audio-data.py
    cd ../.. || exit 1
    python -I build.py
    git add -A
    git commit -m "add AI-generated BGM and SFX (free.ai pipeline, 16 tracks)"
    git push origin main
    echo "AUDIO PIPELINE COMPLETE"
    exit 0
  fi
  sleep 900
done
echo "gave up after 40 rounds"
