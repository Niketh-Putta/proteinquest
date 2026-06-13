#!/bin/bash
cd "$(dirname "$0")"
LOG=ig-overnight.log
GOAL=150
BATCH=25

sent_count() {
  python3 -c "import json; print(len(json.load(open('ig-dm-log.json'))['sent']))" 2>/dev/null || echo 0
}

while true; do
  CURRENT=$(sent_count)
  [ "$CURRENT" -ge "$GOAL" ] && { echo "=== GOAL $CURRENT/$GOAL $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"; exit 0; }
  echo "=== START $CURRENT/$GOAL $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"
  node ig-quality-helper.mjs overnight "$BATCH" "$GOAL" >> "$LOG" 2>&1
  CURRENT=$(sent_count)
  [ "$CURRENT" -ge "$GOAL" ] && exit 0
  echo "=== RESTART $CURRENT/$GOAL exit=$? $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"
  sleep 30
done
