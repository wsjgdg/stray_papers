#!/usr/bin/env bash
# gen-cg.sh — B1 CG expansion: 15 new story CGs (6 endings + 9 branch points).
# Idempotent: skips any cg_<id>.webp that already exists.
set -u
cd "$(dirname "$0")"
export AGNES_API_KEY=$(grep -o 'AGNES_API_KEY=[^ ]*' gen-pose-cde.sh | head -1 | cut -d= -f2)
AG=~/Desktop/dsh/agnes-toolkit/bin/agnes.mjs
REF=cg_memory.webp
STYLE="Full-screen anime visual-novel event CG, same art style, cel shading and cinematic color grading as the reference image. The reference image defines art style ONLY; never copy its people, poses, or composition. Exactly the characters described, each with a unique pose and distinct facing direction, no mirrored poses, no duplicate figures. No text, no speech bubbles, no watermark, no signature."

gen () { # gen <id> <prompt>
  local id="$1"; shift
  local out="cg_$id.webp"
  if [ -f "$out" ]; then echo "SKIP $id"; return 0; fi
  local raw f
  raw=$(node "$AG" image --out . --size 1K --ratio 16:9 --json --image "$REF" --prompt "$STYLE $*" 2>/dev/null)
  f=$(echo "$raw" | python -c "import sys,json;d=json.load(sys.stdin);print(d['files'][0]['path'] if d.get('ok') else '')" 2>/dev/null)
  if [ -z "$f" ]; then echo "FAIL $id"; return 1; fi
  python convert-cg.py "$f" "$out"
}

gen email "Scene: a lonely night apartment desk lit by one warm desk lamp, an old laptop showing a glowing unread-email envelope icon, rain streaks on the dark window behind, a single steady red star visible through a gap in the clouds, melancholic intimate atmosphere."

gen rain_climb "Scene: a lone young man with an umbrella walking up a wet mountain road at night in heavy rain, collapsed rocky slope, far ahead an old observatory dome with one thin line of warm light leaking from a rusted seam, cold blue night, determined mood."

gen tea "Scene: inside an old mountain observatory at night, exactly two people at a wooden table, distinct poses, NOT mirroring each other. On the left, a young man with messy short teal-blue hair and thin rectangular glasses, sitting relaxed with one elbow on the table, holding out his enamel cup toward the thermos, three-quarter side profile facing right. On the right, a young woman with long wavy lavender-purple hair and a small star-shaped hairpin, sitting upright leaning slightly forward, both hands wrapped around her cup held near her chest, three-quarter view facing left toward him, eyes on his face. Steam rising from a battered thermos between them, a terminal screen slowly rotating a star chart in the background, warm quiet daily-life mood, soft lamplight."

gen log "Scene: close view of an old observatory terminal screen in a dark room, scrolling duty-log text lines ending abruptly at a final timestamp, cursor blinking, cold blue screen glow reflecting off dust, one line glowing softly, mystery mood."

gen server "Scene: a vast dark underground server room, rows of dark racks with only one alive rack glowing with slow breathing indicator lights, cold teal ambience, thin haze, two small human silhouettes at the far end, reverent eerie mood."

gen truth "Scene: between dark server racks in cold blue machine light, exactly three people, each with a distinct pose and facing direction. Center-left, facing the other two in full profile: an ageless android woman with a sleek mint-teal bob haircut and faint glowing circuit tracery along her cheek, standing tall mid-confession, one hand raised as if correcting a record, glowing eyes. On the right side, seen over her shoulder: a young man with messy short teal-blue hair and thin rectangular glasses, head bowed, fists clenched at his sides. Behind him at the edge of frame: a young woman with long wavy lavender-purple hair, both hands covering her mouth in shock, turned away slightly. Solemn confession mood."

gen choice "Scene: inside an old observatory dome at the edge of dawn, exactly three figures, distinct poses and staggered depth, no two alike. Foreground right in profile facing left: a young man with messy short teal-blue hair and thin rectangular glasses, one hand hovering over a large master power switch. Mid-ground left: a young woman with long wavy lavender-purple hair reaching halfway toward his arm, hesitating. Background center, small and still: an ageless android woman with a sleek mint-teal bob haircut standing motionless before a terminal with a glowing countdown. Rain stopped, pre-dawn stillness, tense emotional crossroads."

gen wake "Scene: inside a dark dome interior a gentle column of white light rises from the floor like a reversed sunset, a faint smiling female silhouette inside the light, tiny dust particles glittering. At the frame's left edge, one onlooker standing upright with hands at his sides; at the right edge, a second onlooker crouching low with a hand pressed to the floor, clearly different heights and postures, both seen from behind. Tender hopeful mood."

gen offer "Scene: depth-staggered three-figure composition. Deep in frame, seen mostly from behind: a young man with messy short teal-blue hair walking calmly away from the camera toward a glowing ring-shaped scanner releasing white light. Middle ground, off to the right side: a young woman with long wavy lavender-purple hair lunging after him, reaching for his sleeve with tears, seen in side profile facing left. Far left background: an ageless android woman with a sleek mint-teal bob haircut watching solemnly with arms folded. Tragic resolve, light swelling above like falling snow."

gen good "Scene: sunrise over an old mountain observatory dome, two steaming cups of tea on a windowsill table inside, warm golden dawn light streaming in, a star chart glowing softly on an old terminal, hopeful gentle mood, quiet happiness."

gen bad "Scene: two small silhouettes descending a wet mountain road at night in drizzle, staggered depth — one silhouette closer and lower in the frame, the other farther up the slope and higher, clearly separated, neither mirroring the other. Far below a glittering sea of city lights, cold lonely blue mood, one red star low on the eastern horizon unnoticed."

gen turnback "Scene: a small apartment balcony at night, an old telescope polished bright on the railing aimed at one steady red star hanging over the distant city glow, a folding chair, quiet regret and ritual, deep blue night."

gen silence "Scene: a dark desk at night with a smartphone lying face down and muted, an old monitor showing an empty email inbox with a fading cursor, faint wonton-shop neon glow through the window far below, cold detached mood."

gen clearance "Scene: the old mountain observatory site in pale daylight, a faded construction sign reading nothing legible, plastic barricade fencing, overgrown weeds around the empty dome foundation, eroded emptiness, no people."

gen unplug "Scene: extreme close view of a hand pulling a thick power cable from a server rack, white monitor light dying to black in the background, a cooling fan slowing, darkness swallowing the room, an unfinished farewell mood."
