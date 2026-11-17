#!/usr/bin/env bash
# gen-bg-final.sh — the last 8 zero-reuse backgrounds: scenes that still
# reused a location's base painting (opening / email_first / went_solo /
# obsv_night / descend / memory_dive / ending_good / ending_true in
# scenario.js). One unique variant per scene, same location + camera angle
# as the base painting, lit/staged for that scene's story moment only.
# Naming: bg-<loc>__<scene>.webp. Idempotent: existing outputs are skipped.
set -u
cd "$(dirname "$0")"
export AGNES_API_KEY=$(grep -o 'AGNES_API_KEY=[^ ]*' gen-pose-cde.sh | head -1 | cut -d= -f2)
AG=~/Desktop/dsh/agnes-toolkit/bin/agnes.mjs

gen () { # gen <scene-id> <base-webp> <variation description>
  local id="$1" base="$2" prompt="$3"
  local loc="${base%.webp}"; loc="${loc#bg-}"
  local out="bg-${loc}__${id}.webp"
  if [ -f "$out" ]; then echo "SKIP $id ($out exists)"; return; fi
  local raw path
  raw=$(node "$AG" image --out . --size 1K --ratio 16:9 --json --image "$base" --prompt "Same exact location, same camera angle, same composition and framing as the reference image. This is the same room/place seen at a different story moment. Changes ONLY these things: $prompt. Same painterly visual-novel background style, no text, no people, no watermark." 2>/dev/null)
  path=$(echo "$raw" | python -c "import sys,json;d=json.load(sys.stdin);print(d['files'][0]['path'] if d.get('ok') else 'ERR')" 2>/dev/null)
  if [ -n "$path" ] && [ "$path" != "ERR" ]; then
    python convert-cg.py "$path" "$out"
    echo "OK $id <- $path"
  else
    echo "FAIL $id"
  fi
}

# --- opening (23:47, screen the room's only light, email just arrived) ---
gen opening "bg-apartment_night.webp" \
"the moment a scheduled email arrives at 23:47: the desk lamp off, the monitor screen the room's only light, a fresh email notification window just popped up on the screen, the chair still pulled up close to the desk as if someone is seated there, rain falling steady and unhurried on the window, city lights outside at their usual brightness"

# --- email_first (reading the short letter itself) ---
gen email_first "bg-email_screen.webp" \
"the finished letter itself opened across the screen in a clean full-screen reading view, only a few short sparse lines of text centered on the dark page, the cursor blinking at the end of the last line, the screen slightly brighter, everything around it dim and still"

# --- went_solo (taxi drop-off, climbing with a flashlight) ---
gen went_solo "bg-streets_rain.webp" \
"just past the taxi drop-off on the wet mountain road: a flashlight beam cutting through the slanting rain, the bus-stop shelter just behind and still close, the observatory dome far uphill with a thin line of light glowing through its slit, the city lights already far below and smaller"

# --- obsv_night (first entry: steaming cup, star-map screensaver) ---
gen obsv_night "bg-observatory_night.webp" \
"the moment of first entry: two cups on the desk, one of them still steaming, a terminal glowing at the end of the hall showing a slowly rotating star map as its screensaver, fresh wet footprints on the floor, the telescope uncovered and ready, the room lived-in but tense"

# --- descend (stairwell door open, access light just turned green) ---
gen descend "bg-server_room.webp" \
"the moment of entry: the heavy door at the top of a short flight of stairs standing open, its access-reader light freshly switched from red to green, cold mist like breath-fog creeping along the floor, racks beyond mostly dark with only a few standby LEDs, deep cold stillness"

# --- memory_dive (white light surging, surveillance ghosts) ---
gen memory_dive "bg-memory_white.webp" \
"the white light surging upward like a rising tide washing over everything, faint translucent surveillance-monitor frames floating ghost-like inside the glow, dust and shadows caught in the bloom, the frame brighter and more overwhelming than the reference"

# --- ending_good (first light climbing the star chart, two cups warming) ---
gen ending_good "bg-dawn_ending.webp" \
"earliest morning at dawn: the sun still low, first pale gold light just beginning to climb the star chart on the wall, two cups of tea steaming gently on the windowsill table, the room quiet and hopeful, soft pink-gold horizon outside the window"

# --- ending_true (dawn breaking, the red star fading into daylight) ---
gen ending_true "bg-finale_star.webp" \
"dawn breaking over the hilltop: the red supergiant still visible but softening into a brightening blue-gold dawn sky, the last stars fading out, warm morning light washing over the telescope silhouette, hopeful end-of-night mood"

echo "=== ALL DONE ==="
