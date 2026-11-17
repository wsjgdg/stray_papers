#!/usr/bin/env bash
# gen-bg-variants.sh — same-location background variants (#bg-variants):
# identical camera angle and composition, different lighting / hour /
# props state. Each variant id = "<loc>__<tag>" (engine strips the suffix
# for fx/props/ambience). Idempotent: existing webp files are skipped.
set -u
cd "$(dirname "$0")"
export AGNES_API_KEY=$(grep -o 'AGNES_API_KEY=[^ ]*' gen-pose-cde.sh | head -1 | cut -d= -f2)
AG=~/Desktop/dsh/agnes-toolkit/bin/agnes.mjs

gen () { # gen <variant-id> <base-webp> <variation description>
  local id="$1" base="$2" prompt="$3"
  local out="bg-${id}.webp"
  if [ -f "$out" ]; then echo "SKIP $id"; return; fi
  local png="${id}.png"
  local raw
  raw=$(node "$AG" image --out . --size 1K --ratio 16:9 --json --image "$base" --prompt "Same exact location, same camera angle, same composition and framing as the reference image. This is the same room seen at a different moment. Changes ONLY these things: $prompt. Same painterly visual-novel background style, no text, no people, no watermark." 2>/dev/null)
  local path
  path=$(echo "$raw" | python -c "import sys,json;d=json.load(sys.stdin);print(d['files'][0]['path'] if d.get('ok') else 'ERR')" 2>/dev/null)
  if [ -n "$path" ] && [ "$path" != "ERR" ]; then
    python convert-cg.py "$path" "$out"
    echo "OK $id <- $path"
  else
    echo "FAIL $id"
  fi
}

# --- server_room (11 scenes): dusk original + 3 phase variants ---
gen "server_room__blue" "bg-server_room.webp" "the room lit in brighter cold blue machine light, more rack LEDs blinking actively, monitor screens glowing, the truth-reveal moment, slightly more illuminated than the reference"
gen "server_room__dark" "bg-server_room.webp" "the room much darker, rack lights mostly off after a power shutdown, only one faint emergency strip glowing, deep shadows, late-night desolation"
gen "server_room__dawn" "bg-server_room.webp" "faint warm morning light leaking from a high vents, racks powered down and dark, dust in the air catching pale dawn glow, quiet abandoned feeling"

# --- observatory_night (6 scenes): dusk original + 2 ---
gen "observatory_night__late" "bg-observatory_night.webp" "deeper night: the dome darker and quieter, starlight slightly dimmer, the telescope parked and covered, cups and papers left on a side table, hours have passed"
gen "observatory_night__dawn" "bg-observatory_night.webp" "pre-dawn: faint cold blue-white daylight beginning to leak through the dome slit, stars fading, the room catching pale first light"

# --- streets_rain (4 scenes): rain original + 1 ---
gen "streets_rain__norain" "bg-streets_rain.webp" "the rain stopped: dry road surface, no rain streaks, puddles reflecting the neon sign more sharply, sky clearing to deep blue with faint stars, later that night"

# --- memory_white (5 scenes): white original + 2 ---
gen "memory_white__glow" "bg-memory_white.webp" "the white light much stronger and more overwhelming, edges of the frame blooming into pure white, memory playback at full intensity"
gen "memory_white__dim" "bg-memory_white.webp" "the white glow faded to a weak cold shimmer, edges darkening into shadow, the memory running out of power, melancholy"

# --- apartment_night (2 scenes): original + 1 ---
gen "apartment_night__deep" "bg-apartment_night.webp" "deeper into the night: the desk lamp turned off, room lit only by the monitor glow, city lights outside dimmer, rain heavier against the window"

# --- finale_star (4 scenes): ember original + 2 ---
gen "finale_star__after" "bg-finale_star.webp" "calmer and gentler: the red supergiant softer and dimmer, sky settling into peaceful deep blue with the star as a single warm point, epilogue tranquility"
gen "finale_star__cold" "bg-finale_star.webp" "colder and more distant: the red star smaller and paler against a colder darker sky, a lonely quiet mood, slight haze on the horizon"

# --- email_screen (3 scenes): inbox original + 2 ---
gen "email_screen__reply" "bg-email_screen.webp" "a reply compose window open instead of the inbox, cursor blinking in the message body, screen slightly brighter, the same late-night desk"
gen "email_screen__empty" "bg-email_screen.webp" "the inbox emptied and the screen dimmed to near-dark, cursor gone, monitor powering down, cold and final"
