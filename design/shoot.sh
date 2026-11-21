#!/usr/bin/env bash
# Usage: design/shoot.sh <path> <name> [width] [height]
# Captures one screen of the running dev server (default port 3187) with headless Chrome into design/mockups/.
PORT="${PORT:-3187}"; W="${3:-1440}"; H="${4:-900}"
HERE="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$HERE/mockups"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
PROF="$(mktemp -d)"
timeout 70 "$CHROME" --headless=new --enable-unsafe-swiftshader --hide-scrollbars --mute-audio --no-first-run --user-data-dir="$PROF" \
  --window-size="$W,$H" --timeout=14000 --screenshot="$(cygpath -w "$HERE/mockups/$2.png")" "http://localhost:$PORT$1" >/dev/null 2>&1
rm -rf "$PROF"; ls -la "$HERE/mockups/$2.png"
