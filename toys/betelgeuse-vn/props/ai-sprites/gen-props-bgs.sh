#!/usr/bin/env bash
# gen-props-bgs.sh — AI-generate 9 scene props (green screen, 1:1) and
# 8 full-bleed backgrounds (16:9, 2K, no people) for the visual novel.
set -u
cd "$(dirname "$0")"
export AGNES_API_KEY=sk-DmOf2PY6hYrH8Cu3R8DImytfvUQCU166LjxRDs8y1YY93B0N
AG=~/Desktop/dsh/agnes-toolkit/bin/agnes.mjs
GREEN="Isolated on a completely flat solid pure green background (#00FF00), no shadow, no ground, no text, centered, single object only"
STYLE="detailed anime background art style, soft cel shading, cinematic lighting, no people, no characters, no text, no watermark, no subtitles"

echo "=== props (green screen, 1:1) ==="
gen() { local out="$1" ratio="$2" size="$3" prompt="$4"; if [ -f "$out.webp" ] || [ -f "$out.raw.webp" ]; then echo "SKIP $out"; return; fi; local raw; raw=$(node "$AG" image --out . --size "$size" --ratio "$ratio" --json --prompt "$prompt" 2>/dev/null); echo "$out <- $(echo "$raw" | python -c "import sys,json;d=json.load(sys.stdin);print(d['files'][0]['path'] if d.get('ok') else 'ERR')" 2>/dev/null)"; }

gen prop-crt      1:1 1K "A bulky vintage CRT computer monitor from 2003, beige-grey plastic casing darkened with age, screen glowing pale blue with soft blurred interface shapes, cables draping, slightly dusty, $GREEN"
gen prop-mug      1:1 1K "A small ceramic coffee mug, pale sky-blue glaze with a chipped rim, faint steam rising, cozy lived-in feel, $GREEN"
gen prop-calendar 1:1 1K "A wall calendar page for December pinned by a clip, one date circled in red pen, page corner curling, soft paper texture, $GREEN"
gen prop-keys     1:1 1K "A small keyring with two well-used brass and steel keys and a worn leather fob, warm metal highlights, $GREEN"
gen prop-umbrella 1:1 1K "A transparent plastic umbrella with a curved clear handle, rain droplets beading on the canopy, slight fog of moisture, night city reflections faintly on the surface, $GREEN"
gen prop-busstop  1:1 1K "A weathered metal bus stop sign on a pole, dark green schedule panel with blurred blurred out marking lines, rust at the joints, rain-wet surface, $GREEN"
gen prop-telescope 1:1 1K "A vintage brass and iron refractor telescope on a wooden tripod, patina on the brass, aimed upward at an angle, observatory instrument, $GREEN"
gen prop-badge    1:1 1K "An employee ID badge on a blue lanyard, white card with blurred unreadable print blocks and a silhouette photo placeholder, a red diagonal stripe across the corner, lanyard softly draped, $GREEN"
gen prop-sticky   1:1 1K "A yellow sticky note with a strip of translucent tape on one corner, faint handwritten pencil lines visible but unreadable, slightly curled, $GREEN"

echo "=== backgrounds (16:9, 2K) ==="
gen bg-apartment_night 16:9 2K "A cramped dark apartment room deep at night, desk with a glowing CRT computer casting pale blue light, rain-streaked window with distant city lights, bookshelf with astronomy books, unmade bed corner, moody deep blue tones, $STYLE"
gen bg-email_screen 16:9 2K "Extreme close-up atmosphere of a vintage CRT monitor glow filling a dark room, blue phosphor light bloom, soft scanline texture, blurred floating interface window shapes completely out of focus, reflections on the desk, $STYLE"
gen bg-streets_rain 16:9 2K "A mountain roadside at night in heavy rain, wet asphalt reflecting a pink neon sign, blurred city glow far below, a bus stop silhouette with a bench, rain streaks catching streetlight, deep blue night palette, $STYLE"
gen bg-observatory_night 16:9 2K "Interior of an old astronomical observatory dome at night, the long silhouette of a classic telescope aimed through the open dome slit, star charts pinned on curved walls, deep blue starlight spilling in, dust motes in the beam, $STYLE"
gen bg-server_room 16:9 2K "An underground server room, long rows of black server racks with thousands of tiny teal and green status LEDs, glossy floor reflecting the lights, thick cable trays overhead, humid dark atmosphere, $STYLE"
gen bg-memory_white 16:9 2K "An overexposed dreamlike memory space, blinding soft white light with warm golden light leaks at the edges, floating glowing dust motes, washed-out pastel horizon, ethereal and gentle, $STYLE"
gen bg-dawn_ending 16:9 2K "Dawn breaking over a hilltop old observatory, the dome silhouetted against a warm golden-orange sky gradient, last faint stars fading at the zenith, dew on grass in the foreground catching the light, $STYLE"
gen bg-finale_star 16:9 2K "A pre-dawn night sky dominated by the brilliant orange-red supergiant star Betelgeuse in Orion, breathtaking starfield with a soft red glow at the horizon fading into deep blue above, dark hilltop silhouette, the Milky Way faintly visible, $STYLE"

echo "=== ALL DONE ==="
