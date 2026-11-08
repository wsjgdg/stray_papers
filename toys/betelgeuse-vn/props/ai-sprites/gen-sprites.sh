#!/usr/bin/env bash
# gen-sprites.sh — batch-generate all remaining VN character sprites via Agnes.
# yu normal/happy already exist. Reference-image diffs keep identity; every
# prompt re-locks the identity anchors (glasses for yu, hairpin for lin...).
set -u
cd "$(dirname "$0")"
export AGNES_API_KEY=sk-DmOf2PY6hYrH8Cu3R8DImytfvUQCU166LjxRDs8y1YY93B0N
AG=~/Desktop/dsh/agnes-toolkit/bin/agnes.mjs
GREEN="Isolated on a completely flat solid pure green background (#00FF00), no shadow, no ground, no text, waist-up portrait framing like the reference, centered"
MAGENTA="Isolated on a completely flat solid pure magenta background (#FF00FF), no shadow, no ground, no text, waist-up portrait framing like the reference, centered"

gen () { # gen <outfile-base> <reference-or-NONE> <prompt>
  local base="$1" ref="$2" prompt="$3"
  if [ -f "$base.webp" ]; then echo "SKIP $base"; return; fi
  local raw
  if [ "$ref" = "NONE" ]; then
    raw=$(node "$AG" image --out . --size 1K --ratio 2:3 --json --prompt "$prompt $GREEN" 2>/dev/null)
  else
    raw=$(node "$AG" image --out . --size 1K --ratio 2:3 --json --image "$ref" --prompt "$prompt. Same art style, cel shading and waist-up framing as the reference image. $GREEN" 2>/dev/null)
  fi
  local f
  f=$(echo "$raw" | python -c "import sys,json;d=json.load(sys.stdin);print(d['files'][0]['path'] if d.get('ok') else 'ERR')" 2>/dev/null)
  echo "$base -> $f"
}

YU="Same exact character as the reference image: same young East Asian man in his early 20s, same messy short teal-blue hair, same thin rectangular glasses (do NOT remove the glasses), same dark navy zip jacket over light gray shirt, same black binoculars on neck strap"
LIN="Same exact character as the reference image: same young East Asian woman in her early 20s, same long wavy lavender-purple hair falling past her waist with a small star-shaped hairpin, same gentle violet eyes, same oversized dark-purple cardigan over a pale cream blouse"
QI="Same exact character as the reference image: same ageless android woman, same sleek symmetric mint-teal bob haircut with straight bangs, same high-collar fitted dark suit, same faint glowing mint circuit tracery along her cheek jaw and neck, same luminous pale skin, calm perfectly symmetric posture"
MIAN="Same exact character as the reference image: same young East Asian woman in her early 20s, same loose wavy pale silver-lavender hair, same loose pale hospital gown with a thin scarf, same gentle melancholic ethereal presence"

echo "=== yu diffs ==="
gen yu-sad       agnes-image-20261107-134118-1.png "$YU. Now with a sad expression: gaze averted down and to the side, brows tilted up in sorrow, faint frown, head tilted slightly down"
gen yu-surprised agnes-image-20261107-134118-1.png "$YU. Now with a surprised expression: eyes wide open, eyebrows raised high, mouth slightly open in shock, upper body leaning back a little"
gen yu-angry     agnes-image-20261107-134118-1.png "$YU. Now with an angry expression: brows furrowed in a hard glare, jaw clenched, one hand raised pushing up his glasses, intense stare forward"

echo "=== lin base + diffs ==="
LINBASE="Anime visual novel character sprite, waist-up portrait, young East Asian woman in her early 20s, long wavy lavender-purple hair falling past her waist with a small star-shaped hairpin, gentle violet eyes, soft shy demeanor, oversized dark-purple cardigan over a pale cream blouse, hands half hidden in the cardigan sleeves. Soft cel shading, clean lineart, high quality anime illustration"
gen lin-normal NONE "$LINBASE"
LINREF=$(ls -t lin-normal*.png 2>/dev/null | head -1)
[ -z "$LINREF" ] && LINREF=$(ls -t agnes-image-*.png | head -1)
gen lin-happy     "$LINREF" "$LIN. Now with a happy expression: warm closed-eye smile, cheeks slightly blushed, head tilted a little, eyes closed in joy"
gen lin-sad       "$LINREF" "$LIN. Now with a sad expression: teary violet eyes looking down, brows tilted up in sorrow, arms wrapped around herself hugging her own sleeves"
gen lin-surprised "$LINREF" "$LIN. Now with a surprised expression: eyes wide open, a sleeve-covered hand raised to her mouth, eyebrows high, small gasp"
gen lin-angry     "$LINREF" "$LIN. Now with an angry expression: pouting firmly with brows furrowed, cheeks puffed slightly, fists clenched at her sides, trying to look stern"

echo "=== qi base + diffs (magenta screen) ==="
QIBASE="Anime visual novel character sprite, waist-up portrait, ageless android woman with a sleek symmetric mint-teal bob haircut with straight bangs, calm teal eyes, high-collar fitted dark suit, faint glowing mint circuit tracery along her cheek jaw and neck, luminous pale skin, perfectly symmetric posture. Soft cel shading, clean lineart, high quality anime illustration"
gen qi-normal NONE "$QIBASE"
QIREF=$(ls -t qi-normal*.png 2>/dev/null | head -1)
gen qi-happy     "$QIREF" "$QI. Now with a happy expression: bright open smile, eyes sparkling, chest status light glowing bright cyan. Same magenta background. Isolated on a completely flat solid pure magenta background (#FF00FF), no shadow, no text"
gen qi-sad       "$QIREF" "$QI. Now with a subdued sad expression: gaze lowered, dimmed chest status light, circuit tracery faint, slight downturned mouth. Same magenta background. Isolated on a completely flat solid pure magenta background (#FF00FF), no shadow, no text"
gen qi-surprised "$QIREF" "$QI. Now with a surprised expression: eyes wide, mouth a small o, chest status light blinking double-dot. Same magenta background. Isolated on a completely flat solid pure magenta background (#FF00FF), no shadow, no text"
gen qi-angry     "$QIREF" "$QI. Now with an angry expression: cold glaring eyes, brows angled sharply, circuit tracery flaring bright, chest status light glowing amber orange. Same magenta background. Isolated on a completely flat solid pure magenta background (#FF00FF), no shadow, no text"

echo "=== mian base + diffs ==="
MIANBASE="Anime visual novel character sprite, waist-up portrait, young East Asian woman in her early 20s, loose wavy pale silver-lavender hair, gentle grey-violet eyes, soft melancholic expression, loose pale hospital gown with a thin scarf around her neck, ethereal slightly transparent ghostly presence rendered softly. Soft cel shading, clean lineart, high quality anime illustration"
gen mian-normal NONE "$MIANBASE"
MIANREF=$(ls -t mian-normal*.png 2>/dev/null | head -1)
gen mian-happy     "$MIANREF" "$MIAN. Now with a happy expression: soft warm smile, eyes gently curved, slightly brighter and warmer presence"
gen mian-sad       "$MIANREF" "$MIAN. Now with a deeply sad expression: eyes downcast with a tear at the corner, brows tilted in sorrow, one hand pressed to her chest, very faint and ghostly"
gen mian-surprised "$MIANREF" "$MIAN. Now with a surprised expression: eyes wide, a hand raised to her chest, mouth slightly open"
gen mian-angry     "$MIANREF" "$MIAN. Now with a stern angry expression: brows furrowed, lips pressed in a firm line, an unusual resolute fire in her eyes"

echo "=== ALL DONE ==="
