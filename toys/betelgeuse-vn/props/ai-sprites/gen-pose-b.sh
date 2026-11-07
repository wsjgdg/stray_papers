#!/usr/bin/env bash
# gen-pose-b.sh — pose-B sprite set: 4 characters x 8 feelings, each in a
# distinct stance that reads clearly against pose A (the standing bust).
set -u
cd "$(dirname "$0")"
export AGNES_API_KEY=sk-DmOf2PY6hYrH8Cu3R8DImytfvUQCU166LjxRDs8y1YY93B0N
AG=~/Desktop/dsh/agnes-toolkit/bin/agnes.mjs

gen () { # gen <out> <ref> <bg> <prompt>
  local out="$1" ref="$2" bg="$3" prompt="$4"
  if [ -f "$out.webp" ]; then echo "SKIP $out"; return; fi
  local raw
  raw=$(node "$AG" image --out . --size 1K --ratio 2:3 --json --image "$ref" --prompt "$prompt. Same art style, cel shading and waist-up framing as the reference image. $bg" 2>/dev/null)
  echo "$out <- $(echo "$raw" | python -c "import sys,json;d=json.load(sys.stdin);print(d['files'][0]['path'] if d.get('ok') else 'ERR')" 2>/dev/null)"
}

GREEN="Isolated on a completely flat solid pure green background (#00FF00), no shadow, no ground, no text, centered"
MAG="Isolated on a completely flat solid pure magenta background (#FF00FF), no shadow, no ground, no text, centered"

YU_ID="Same exact character as the reference image: same young East Asian man in his early 20s, same messy short teal-blue hair, same thin rectangular glasses CLEARLY VISIBLE (glasses are essential identity, never remove them), same dark navy zip jacket over light gray shirt, same black binoculars on neck strap"
LIN_ID="Same exact character as the reference image: same young East Asian woman in her early 20s, same long wavy lavender-purple hair falling past her waist with a small star-shaped hairpin, same gentle violet eyes, same oversized dark-purple cardigan over a pale cream blouse"
QI_ID="Same exact character as the reference image: same ageless android woman, same sleek symmetric mint-teal bob haircut with straight bangs, same high-collar fitted dark suit, same faint glowing mint circuit tracery along her cheek jaw and neck, same luminous pale skin"
MIAN_ID="Same exact character as the reference image: same young East Asian woman in her early 20s, same loose wavy pale silver-lavender hair, same gentle grey-violet eyes, same loose pale hospital gown with a thin scarf around her neck, same soft ethereal presence"

YU_POSE="NOW IN A COMPLETELY DIFFERENT POSE from the reference: sitting casually on the edge of a desk, one hand resting flat on his knee, the other hand loose at his side, shoulders slouched and tired, legs visible to the knee at the bottom of the frame"
LIN_POSE="NOW IN A COMPLETELY DIFFERENT POSE from the reference: hugging a thick book against her chest with both arms crossed over it, shoulders drawn slightly inward, weight shifted onto one leg"
QI_POSE="NOW IN A COMPLETELY DIFFERENT POSE from the reference: hands clasped behind her back, chin level, perfectly upright formal posture, body angled a few degrees to the side"
MIAN_POSE="NOW IN A COMPLETELY DIFFERENT POSE from the reference: one hand holding her scarf close to her collar, the other arm wrapped across her waist, head tilted gently to one side"

declare -A REFS=( [yu]=agnes-image-20261107-134118-1.png [lin]=agnes-image-20261107-134626-1.png [qi]=agnes-image-20261107-134809-1.png [mian]=agnes-image-20261107-134822-1.png )
declare -A IDS=( [yu]="$YU_ID" [lin]="$LIN_ID" [qi]="$QI_ID" [mian]="$MIAN_ID" )
declare -A POSES=( [yu]="$YU_POSE" [lin]="$LIN_POSE" [qi]="$QI_POSE" [mian]="$MIAN_POSE" )
declare -A BGS=( [yu]="$GREEN" [lin]="$GREEN" [qi]="$MAG" [mian]="$MAG" )

declare -A FEELS=(
  [normal]="calm neutral expression, soft gaze"
  [happy]="gentle happy smile, eyes bright"
  [sad]="sorrowful downcast expression, brows tilted in grief"
  [surprised]="wide-eyed surprised expression, mouth slightly open"
  [angry]="stern angry glare, brows furrowed hard"
  [worried]="anxious worried expression, brows knitted upward, biting lip"
  [shy]="shy blushing embarrassed expression, cheeks red, looking away"
  [cry]="tearful crying expression, tears streaming down"
)

for char in yu lin qi mian; do
  echo "=== $char pose B ==="
  for feel in normal happy sad surprised angry worried shy cry; do
    gen "$char-b-$feel" "${REFS[$char]}" "${BGS[$char]}" "${IDS[$char]}. ${POSES[$char]}. Expression: ${FEELS[$feel]}"
  done
done
echo "=== ALL DONE ==="
