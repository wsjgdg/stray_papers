#!/usr/bin/env bash
# make-audio.sh — generate VN BGM + SFX via the free.ai API (AudioLDM 2).
# Idempotent: finished + converted assets are skipped. Exit codes:
#   0 = all assets present/converted   2 = music queue still full (retry later)
# Key is sourced from C:/Users/sibop/.secrets/audio.env (freeai_key), never printed.
set -u
cd "$(dirname "$0")"
set -a
source /c/Users/sibop/.secrets/audio.env
set +a
AUTH="Authorization: Bearer $freeai_key"
FF="ffmpeg"

BGM_SPECS=(
  "title|contemplative main theme for a visual novel, delicate piano and warm analog pad, starlit night sky atmosphere, bittersweet and emotional, no drums"
  "bgm_apartment|gentle melancholic piano with soft synth pad, quiet night ambience, distant rain, emotional lofi, no drums"
  "bgm_observatory|vast contemplative ambient, slow strings and soft starlight chimes, old observatory dome at night, spacious reverb, no drums"
  "bgm_server|cold electronic drones, faint server hum, sparse digital blips, dark teal atmosphere, minimal ambient"
  "bgm_memory|ethereal bright airy pad, overexposed dreamlike warmth, soft music-box notes, tender and fragile, no drums"
  "bgm_rain|melancholic night city ambience, soft rain, distant neon hum, sparse lofi piano, no drums"
  "bgm_dawn|warm hopeful piano with soft strings, sunrise atmosphere, gentle build, emotional but optimistic, no drums"
  "bgm_star|majestic ambient swell, deep red supergiant grandeur, slow evolving pad, awe and wonder, no drums"
)
SFX_SPECS=(
  "sfx_email|a single soft email notification chime, two gentle bell tones, clean"
  "sfx_door|an old metal observatory door creaking slowly open, rusty hinge"
  "sfx_keyboard|quiet typing on an old mechanical keyboard, a short burst"
  "sfx_telescope|a vintage brass telescope crank and gear mechanism turning"
  "sfx_night|quiet night crickets and soft wind, rural hillside ambience"
  "sfx_rain|rain pattering on a window pane, steady, indoor perspective"
  "sfx_whoosh|a soft airy transition whoosh, gentle, not harsh"
  "sfx_hum|a low electronic archive drone, cold hum with faint data blips"
)

QUEUE_FULL=0
DONE_N=0
TOTAL=$((${#BGM_SPECS[@]} + ${#SFX_SPECS[@]}))

gen_one () { # gen_one <name> <prompt> <seconds>
  local name="$1" prompt="$2" secs="$3"
  if [ -f "$name.mp3" ]; then DONE_N=$((DONE_N + 1)); return 0; fi
  local body resp job url
  resp=$(curl -s -m 120 -X POST "https://api.free.ai/v1/music/generate/" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"prompt\":\"$prompt\",\"duration\":$secs}")
  case "$resp" in
    *queue_at_capacity*) QUEUE_FULL=1; return 1;;
    *error*) echo "$name GEN-ERR: $(echo "$resp" | head -c 160)"; return 1;;
  esac
  # job flow: {job_id, url/audio_url} — url may arrive immediately or via status
  job=$(echo "$resp" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('job_id',''))" 2>/dev/null)
  url=$(echo "$resp" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('url') or d.get('audio_url') or '')" 2>/dev/null)
  if [ -n "$job" ] && [ -z "$url" ]; then
    # jobs come back {"queued":true,"job_id":...,"poll_url":"/api/v1/jobs/<id>/"}
    # record and return; harvest-audio.sh polls recorded jobs later
    echo "$name|$job" >> jobs-queued.txt
    echo "$name: queued as $job"
    return 0
  fi
  if [ -z "$url" ]; then echo "$name: no url after polling: $(echo "$resp" | head -c 160)"; return 1; fi
  curl -s -m 120 -o "$name.raw" "$url" -H "$AUTH" || { echo "$name: download failed"; return 1; }
  $FF -y -loglevel error -i "$name.raw" -ac 1 -ar 44100 -b:a 64k -t "$secs" "$name.mp3" \
    && rm -f "$name.raw" && echo "$name: converted ($(du -k "$name.mp3" | cut -f1) KB)"
  DONE_N=$((DONE_N + 1))
}

for spec in "${BGM_SPECS[@]}"; do
  IFS='|' read -r name prompt <<< "$spec"
  gen_one "$name" "$prompt" 24 || true
done
for spec in "${SFX_SPECS[@]}"; do
  IFS='|' read -r name prompt <<< "$spec"
  gen_one "$name" "$prompt" 6 || true
done

echo "progress: $DONE_N/$TOTAL converted"
if [ "$QUEUE_FULL" = "1" ]; then
  echo "MUSIC QUEUE FULL — retry later"
  exit 2
fi
exit 0
