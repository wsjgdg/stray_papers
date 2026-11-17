#!/usr/bin/env bash
# gen-gaze.sh — gaze variants: 4 characters x 2 directions x pose A normal.
#   gl = eyes/head slightly turned to HER right  (viewer's LEFT)
#   gr = eyes/head slightly turned to HER left   (viewer's RIGHT)
# Source images: <char>-a-normal-gl.webp / <char>-a-normal-gr.webp
# Pipeline: agnes generates on flat green/magenta bg -> make-sprite.py keys it.
set -u
cd "$(dirname "$0")"
export AGNES_API_KEY=$(grep -o 'AGNES_API_KEY=[^ ]*' gen-pose-cde.sh | head -1 | cut -d= -f2)
AG=~/Desktop/dsh/agnes-toolkit/bin/agnes.mjs

# agnes is fed PNG refs; convert each character's base webp once (idempotent).
ensure_png () { # ensure_png <webp-stem>
  local stem="$1"
  if [ ! -f "$stem-ref.png" ]; then
    python -c "from PIL import Image; Image.open('$stem.webp').convert('RGB').save('$stem-ref.png')"
    echo "CONVERTED $stem.webp -> $stem-ref.png"
  fi
}
for c in yu lin qi mian; do ensure_png "$c-normal"; done

gen () { # gen <out> <ref> <bg> <prompt>   (same idempotent pattern as gen-pose-cde.sh)
  local out="$1" ref="$2" bg="$3" prompt="$4"
  if [ -f "$out.webp" ]; then echo "SKIP $out"; return; fi
  local raw path
  raw=$(node "$AG" image --out . --size 1K --ratio 2:3 --json --image "$ref" --prompt "$prompt. Same art style, cel shading and waist-up framing as the reference image. $bg" 2>/dev/null)
  path=$(echo "$raw" | python -c "import sys,json;d=json.load(sys.stdin);print(d['files'][0]['path'] if d.get('ok') else 'ERR')" 2>/dev/null)
  echo "$out <- $path"
  if [ -n "$path" ] && [ "$path" != "ERR" ]; then
    echo "$out|$path" >> gaze-pairs.txt
  fi
}

GREEN="Isolated on a completely flat solid pure green background (#00FF00), no shadow, no ground, no text, centered"
MAG="Isolated on a completely flat solid pure magenta background (#FF00FF), no shadow, no ground, no text, centered"

YU_ID="Same exact character as the reference image: same young East Asian man in his early 20s, same messy short teal-blue hair, same thin rectangular glasses CLEARLY VISIBLE (glasses are essential identity, never remove them), same dark navy zip jacket over light gray shirt, same black binoculars on neck strap"
LIN_ID="Same exact character as the reference image: same young East Asian woman in her early 20s, same long wavy lavender-purple hair falling past her waist with a small star-shaped hairpin, same gentle violet eyes, same oversized dark-purple cardigan over a pale cream blouse"
QI_ID="Same exact character as the reference image: same ageless android woman, same sleek symmetric mint-teal bob haircut with straight bangs, same high-collar fitted dark suit, same faint glowing mint circuit tracery along her cheek jaw and neck, same luminous pale skin"
MIAN_ID="Same exact character as the reference image: same young East Asian woman in her early 20s, same loose wavy pale silver-lavender hair, same gentle grey-violet eyes, same loose pale hospital gown with a thin scarf around her neck, same soft ethereal presence"

declare -A REFS=( [yu]=yu-normal-ref.png [lin]=lin-normal-ref.png [qi]=qi-normal-ref.png [mian]=mian-normal-ref.png )
declare -A IDS=( [yu]="$YU_ID" [lin]="$LIN_ID" [qi]="$QI_ID" [mian]="$MIAN_ID" )
declare -A BGS=( [yu]="$GREEN" [lin]="$GREEN" [qi]="$MAG" [mian]="$MAG" )

declare -A GAZE_PROMPT=(
  [gl]="KEEP THE EXACT SAME POSE, ARMS, HANDS, CLOTHING, ACCESSORIES AND FACIAL EXPRESSION as the reference image. Do NOT redraw, restyle or reframe the character. ONLY the gaze direction changes: same exact character, same pose, ONLY the gaze direction changes: eyes and head slightly turned to HER right (viewer's left), looking off toward that side"
  [gr]="KEEP THE EXACT SAME POSE, ARMS, HANDS, CLOTHING, ACCESSORIES AND FACIAL EXPRESSION as the reference image. Do NOT redraw, restyle or reframe the character. ONLY the gaze direction changes: same exact character, same pose, ONLY the gaze direction changes: eyes and head slightly turned to HER left (viewer's right), looking off toward that side"
)

rm -f gaze-pairs.txt
for char in yu lin qi mian; do
  echo "=== $char gaze ==="
  for dir in gl gr; do
    gen "$char-a-normal-$dir" "${REFS[$char]}" "${BGS[$char]}" \
      "${IDS[$char]}. ${GAZE_PROMPT[$dir]}. Expression: calm neutral expression, soft gaze"
  done
done

echo "=== keying ==="
while IFS='|' read -r name png; do
  [ -f "$name.webp" ] && { echo "KEYED-EXISTS $name"; continue; }
  case "${name%%-*}" in
    yu|lin) bg=green ;;
    qi|mian) bg=magenta ;;
  esac
  python make-sprite.py "$png" "$name.webp" --bg "$bg" --height 560
done < gaze-pairs.txt
echo "=== ALL DONE ==="
