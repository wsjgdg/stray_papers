#!/usr/bin/env bash
# Build the delivery zip: ai-exploration-base-v1.zip at repo root.
# Contents: the whole ai-exploration-base folder (site + vendored libs
# + embedded algorithm lab + dev scripts). docs/ and .git/ stay out.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SITE="$ROOT/ai-exploration-base"
OUT="$ROOT/ai-exploration-base-v1.zip"

rm -f "$OUT"
python -I - "$SITE" "$OUT" <<'PY'
import os, sys, zipfile

site, out = sys.argv[1], sys.argv[2]
EXCLUDE_DIRS = {'.git', 'node_modules', '__pycache__'}
count = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk(site):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, os.path.dirname(site))
            z.write(full, rel)
            count += 1
print(f'packed {count} files -> {out}')
PY

# Verify: extract to a fresh temp dir and smoke-test the copy
TMP="$(mktemp -d)"
python -I - "$OUT" "$TMP" <<'PY'
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
print('extracted ok')
PY
cd "$TMP/ai-exploration-base"
node scripts/smoke.js
cd "$ROOT"
rm -rf "$TMP"
echo "DELIVERY OK: $OUT"
