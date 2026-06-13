#!/bin/bash
# One-shot deploy triggered by cron; removes itself after success.
set -euo pipefail
cd /Users/nikethputta/proteinlens
LOG=demo/deploy-cron.log
exec >>"$LOG" 2>&1
echo "=== deploy-cron $(date) ==="
if node scripts/deploy-prod.mjs --deploy-only; then
  crontab -l 2>/dev/null | grep -v 'deploy-cron-wrapper' | crontab - || true
  echo "=== cron job removed after success $(date) ==="
fi
