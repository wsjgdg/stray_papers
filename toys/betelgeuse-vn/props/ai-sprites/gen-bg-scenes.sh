#!/usr/bin/env bash
# gen-bg-scenes.sh — zero-reuse backgrounds (#bg-variants): one unique image
# per scene, same location + camera angle as the location's base painting,
# but lit/staged for that scene's story moment. 36 variants; the 8 base
# images stay with their flagship scenes. Idempotent.
set -u
cd "$(dirname "$0")"
export AGNES_API_KEY=$(grep -o 'AGNES_API_KEY=[^ ]*' gen-pose-cde.sh | head -1 | cut -d= -f2)
AG=~/Desktop/dsh/agnes-toolkit/bin/agnes.mjs

gen () { # gen <scene-id> <base-webp> <variation description>
  local id="$1" base="$2" prompt="$3"
  local out="bg-${base}__${id}.webp"
  if [ -f "$out" ]; then echo "SKIP $id"; return; fi
  local png="${base_id}__${id}.png"
  local raw path
  raw=$(node "$AG" image --out . --size 1K --ratio 16:9 --json --image "$base" --prompt "Same exact location, same camera angle, same composition and framing as the reference image. This is the same room seen at a different story moment. Changes ONLY these things: $prompt. Same painterly visual-novel background style, no text, no people, no watermark." 2>/dev/null)
  path=$(echo "$raw" | python -c "import sys,json;d=json.load(sys.stdin);print(d['files'][0]['path'] if d.get('ok') else 'ERR')" 2>/dev/null)
  if [ -n "$path" ] && [ "$path" != "ERR" ]; then
    python convert-cg.py "$path" "$out"
    echo "OK $id <- $path"
  else
    echo "FAIL $id"
  fi
}

# --- apartment_night ---
gen night_thoughts "bg-apartment_night.webp" "later that same night: the desk lamp turned off, the room lit only by the cold monitor glow, rain heavier against the window, city lights outside dimmer, the chair pushed back"

# --- email_screen ---
gen reply_email "bg-email_screen.webp" "a reply compose window open instead of the inbox, the cursor blinking inside the message body, the screen slightly brighter, an unanswered call waiting on the phone beside the keyboard"
gen ending_silence "bg-email_screen.webp" "the inbox emptied and the whole screen dimmed to near-dark, the cursor gone, the monitor powering down into a thin horizontal glow, cold and final"

# --- streets_rain ---
gen call_lin "bg-streets_rain.webp" "standing under the bus-stop shelter instead of out in the open, the phone screen glowing in hand, the neon sign reflections closer and larger on the wet asphalt"
gen climb_rain "bg-streets_rain.webp" "farther up the wet mountain slope, mid-climb, the bus stop now far behind and small, rain heavier, the city lights far below and fewer"
gen ending_turnback "bg-streets_rain.webp" "the rain stopped: dry road surface gleaming pale, no rain streaks, puddles sharper, the sky clearing to deep blue with faint stars, pale dawn light on the horizon"
gen ending_bad "bg-streets_rain.webp" "descending toward the city: the glittering sea of city lights larger and closer below, the road turning toward town, drizzle thinning, the neon sign farther behind"

# --- observatory_night ---
gen obsv_daily "bg-observatory_night.webp" "deeper into the night: a battered thermos and two enamel cups on a side table, the telescope parked and covered, the room homier and quieter, starlight steadier"
gen converge_talk "bg-observatory_night.webp" "pre-dawn: pale cold light beginning to leak through the dome slit, the starfield fading at the edges, the room colder, the night ending"
gen keeper_before "bg-observatory_night.webp" "a countdown glowing red on the main terminal, tense late-night stillness at its deepest, everything else dark, the weight of a decision in the air"
gen gate_approach "bg-observatory_night.webp" "pre-dawn pale blue light strengthening through the dome slit, the telescope silhouetted against the brightening slit, stars nearly gone"
gen wake_check "bg-observatory_night.webp" "morning: warm golden daylight streaming through the dome slit, dust motes in the beam, the night sky completely gone, dawn colors on the walls"

# --- server_room ---
gen hall_quiet "bg-server_room.webp" "darker: the main lights off, only one faint emergency light strip and a single monitor glowing, deeper shadows between the racks"
gen server_hall "bg-server_room.webp" "the wide central rack corridor fully visible and lit, more rack LEDs actively blinking in cold blue, the main aisle perspective, the room's primary state"
gen liar_reveal "bg-server_room.webp" "brighter cold blue machine light flooding the corridor, monitor screens on and glowing, higher contrast, the confession moment, every rack LED alive"
gen lin_grief "bg-server_room.webp" "colder and dimmer aftermath: most rack LEDs dark, a single distant monitor glow, heavy quiet, the corridor feeling emptied out"
gen qi_converse "bg-server_room.webp" "intimate softer lighting: one rack glowing gently warm, a quiet one-on-one talk deep in the room, warm-cool light mix, everything else dim"
gen cut_path "bg-server_room.webp" "a large master power switch glowing red in the near foreground, countdown digits visible on a terminal screen, shutdown imminent, harsh red accents"
gen substitute_before "bg-server_room.webp" "a white glow rising from a scanning ring in the center of the room, white reflections on every rack face, the room brighter with climbing light"
gen clearance_before "bg-server_room.webp" "cold procedural light: cardboard boxes and evidence labels on the racks, pale daylight leaking from the stairwell, the room being packed up"
gen qi_watch "bg-server_room.webp" "almost totally dark: a single rack glowing warm like a lamp in the blackness, a vigil by dim light, everything else fallen into shadow"
gen qi_dawn "bg-server_room.webp" "faint warm morning light from high vents, the racks powered down and dark, dust drifting in pale glow, a quiet abandoned dawn"
gen ending_clearance "bg-server_room.webp" "pale flat daylight, racks sealed with evidence tape and labels, drawers open and emptied, the room stripped and final"

# --- memory_white ---
gen log_last "bg-email_screen.webp" "the inbox scrolled to an older log export attached at the top, the screen text denser, a faint blue highlight on one line"
gen diverge "bg-observatory_night.webp" "pre-dawn deepest point: the dome slit barely glowing, the starfield almost gone, the room at its darkest and coldest, the countdown about to start"
gen finale_gate "bg-server_room.webp" "after the power shutdown: every rack and light dead, the room lit only by a weak red emergency glow, cables still, finality"
gen ending_unplug "bg-memory_white.webp" "the white light cut off mid-bloom: a hard dark frame with one thin dying rim of glow, silence, the memory severed"
gen ending_qi "bg-server_room.webp" "the long vigil years later: a warm small lamp glowing beside the racks, the space tidy and cared for, soft and peaceful"
gen wake_path "bg-memory_white.webp" "the white glow much stronger and rising, a bright light column at the center, the frame edges blooming into pure white, full memory playback"
gen wake_talk "bg-memory_white.webp" "the glow steady and warm, dust particles glittering densely, the light softened at the edges, a held gentle moment"
gen old_fight "bg-memory_white.webp" "the glow faded and flickering, the frame edges darkened into shadow, the light failing, unstable and dying"
gen unplug_before "bg-memory_white.webp" "the glow nearly dead: most of the frame sunk into shadow, only a thin rim of white light left around one fading shape"

# --- dawn_ending ---
gen morning_table "bg-dawn_ending.webp" "later morning: the sun higher and the light warmer and brighter, breakfast dishes and cups added to the windowsill table, the room fully awake"

# --- finale_star ---
gen ending_substitute "bg-finale_star.webp" "colder and lonelier: the red supergiant smaller, paler and more distant against a darker sky, haze on the horizon, a watching-from-far-away mood"
gen extras_1 "bg-finale_star.webp" "gentle epilogue calm: the red star softer and warmer, the sky settled into peaceful deep blue, the telescope silhouette small and steady"
gen extras_2 "bg-finale_star.webp" "deep-night serenity: the red star the single brightest point in a darker, quieter sky, everything still and eternal"
