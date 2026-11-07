#!/usr/bin/env bash
# serve.sh — self-healing dev server for the visual novel.
# Usage: bash serve.sh [port]     (default 8797)
# The python http.server used for testing kept dying between sessions,
# blanking every open tab. This wrapper restarts it automatically so the
# game URL never goes dark. Stop with Ctrl+C.
PORT="${1:-8797}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1
echo "serving $DIR on http://127.0.0.1:$PORT/ (auto-restart on crash)"
while true; do
  python -m http.server "$PORT" --bind 127.0.0.1
  echo "server exited — restarting in 1s…"
  sleep 1
done
