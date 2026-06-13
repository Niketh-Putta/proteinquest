#!/bin/bash
cd "$(dirname "$0")"
GOAL=150
LOG=ig-150-loop.log

sent() { python3 -c "import json; print(len(json.load(open('ig-dm-log.json'))['sent']))" 2>/dev/null || echo 0; }

while [ "$(sent)" -lt "$GOAL" ]; do
  N=$(sent)
  echo "=== LOOP $N/$GOAL $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"
  node ig-fast-run.mjs >> "$LOG" 2>&1
  node ig-quality-helper.mjs overnight 60 "$GOAL" >> "$LOG" 2>&1
  sleep 15
done
echo "=== GOAL $(sent)/$GOAL $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"
