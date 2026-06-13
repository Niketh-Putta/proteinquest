#!/bin/bash
set -uo pipefail
cd /Users/nikethputta/proteinlens
LOG=demo/cursor-run-all.log
exec > >(tee -a "$LOG") 2>&1
echo "=== START $(date) ==="

set -a
source .env
set +a

echo "--- deploy:prod ---"
npm run deploy:prod
DEPLOY_EC=$?
echo "DEPLOY_EXIT:$DEPLOY_EC"

echo "--- eas whoami ---"
npx eas whoami
WHOAMI_EC=$?
echo "WHOAMI_EXIT:$WHOAMI_EC"

echo "--- test-analyze ---"
node demo/test-analyze.mjs
ANALYZE_EC=$?
echo "ANALYZE_EXIT:$ANALYZE_EC"

if [ "$DEPLOY_EC" -eq 0 ]; then
  echo "--- generate-feature-graphic ---"
  node demo/generate-feature-graphic.mjs
  echo "--- generate-play-screenshots ---"
  node demo/generate-play-screenshots.mjs
fi

if [ "$WHOAMI_EC" -eq 0 ]; then
  echo "--- eas build:list ---"
  npx eas build:list --limit 3 --non-interactive
  echo "--- eas build (conditional) ---"
  # start builds only if no recent successful production builds
  npx eas build --platform all --profile production --non-interactive || true
fi

echo "=== END $(date) ==="
