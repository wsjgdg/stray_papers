#!/usr/bin/env bash
# gen-pose-cde.sh — pose C/D/E sets: 4 characters x 3 new stances x 8 feelings.
# Stances are chosen to read distinctly at VN sprite scale and to give scenes
# mid-conversation variety (a pose switch = a silent acting beat).
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

declare -A REFS=( [yu]=agnes-image-20261107-134118-1.png [lin]=agnes-image-20261107-134626-1.png [qi]=agnes-image-20261107-134809-1.png [mian]=agnes-image-20261107-134822-1.png )
declare -A IDS=( [yu]="$YU_ID" [lin]="$LIN_ID" [qi]="$QI_ID" [mian]="$MIAN_ID" )
declare -A BGS=( [yu]="$GREEN" [lin]="$GREEN" [qi]="$MAG" [mian]="$MAG" )

# three distinct stances per character
declare -A POSE_C=( \
  [yu]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: both arms crossed over his chest, head tilted back slightly, skeptical guarded stance" \
  [lin]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: both hands clasped together in front of her waist, nervous upright stance, elbows tucked in" \
  [qi]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: both arms crossed elegantly under her chest, weight on one hip, cool composed stance" \
  [mian]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: sitting down with both hands folded in her lap, knees together, small and quiet" )

declare -A POSE_D=( \
  [yu]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: both hands in his jacket pockets, head turned to the side looking away, withdrawn stance" \
  [lin]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: one arm stretched out holding a glowing smartphone screen toward the viewer, the other hand at her collar, urgent stance" \
  [qi]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: one hand extended forward with palm up in a presenting gesture, faint holographic light above her palm, other hand at her side" \
  [mian]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: body turned away glancing back over her shoulder toward the viewer, one hand at her scarf" )

declare -A POSE_E=( \
  [yu]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: holding the black binoculars up to his eyes with both hands, actively observing through them, elbow raised" \
  [lin]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: one hand wiping at her eye with her cardigan sleeve, head bowed, the other arm across her stomach" \
  [qi]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: seated sideways at an invisible console, both hands poised over it as if typing, fingers hovering, focused downward gaze" \
  [mian]="NOW IN A COMPLETELY DIFFERENT POSE from the reference: one hand reaching gently out toward the viewer with an open palm, the other at her heart, faintly translucent, tender hopeful expression body language" )

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
  for pose in c d e; do
    eval "STANCE=\${POSE_${pose^^}[$char]}"
    echo "=== $char pose $pose ==="
    for feel in normal happy sad surprised angry worried shy cry; do
      gen "$char-$pose-$feel" "${REFS[$char]}" "${BGS[$char]}" "${IDS[$char]}. $STANCE. Expression: ${FEELS[$feel]}"
    done
  done
done
echo "=== ALL DONE ==="
