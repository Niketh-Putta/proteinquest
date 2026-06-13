#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
LOG=demo/deploy-now.log
exec > >(tee -a "$LOG") 2>&1

echo "=== deploy-now $(date) ==="
npm run deploy:prod

echo "=== verifying production ==="
HTML=$(curl -sL "https://proteinquest.vercel.app/")
echo "$HTML" | grep -o 'entry-[a-f0-9]*\.js' | head -1
curl -sL "https://proteinquest.vercel.app/intro" | head -5 || true

if curl -sL "https://proteinquest.vercel.app/_expo/static/js/web/$(echo "$HTML" | grep -o 'entry-[a-f0-9]*\.js' | head -1)" | grep -q 'EAT\.'; then
  echo "SUCCESS: new intro is live at https://proteinquest.vercel.app"
else
  echo "WARN: deploy finished but intro strings not confirmed in bundle"
fi
