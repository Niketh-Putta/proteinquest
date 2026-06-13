#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
LOG=demo/deploy-osascript.log
exec >>"$LOG" 2>&1
echo "=== deploy-once-now $(date) ==="
node scripts/deploy-prod.mjs --deploy-only
echo "=== verify ==="
HTML=$(curl -sL "https://proteinquest.vercel.app/")
ENTRY=$(echo "$HTML" | grep -o 'entry-[a-f0-9]*\.js' | head -1)
echo "entry: $ENTRY"
if curl -sL "https://proteinquest.vercel.app/_expo/static/js/web/$ENTRY" | grep -q 'EAT\.'; then
  echo "SUCCESS: https://proteinquest.vercel.app"
else
  echo "WARN: deployed but EAT. not confirmed"
fi
