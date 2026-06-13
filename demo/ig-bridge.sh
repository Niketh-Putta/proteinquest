#!/bin/bash
# WebBridge helper for protein-quest-outreach
SESSION="protein-quest-outreach"
BRIDGE="http://127.0.0.1:10086/command"
bridge() {
  local action="$1"
  local args="$2"
  curl -s -X POST "$BRIDGE" -H 'Content-Type: application/json' \
    -d "{\"action\":\"$action\",\"args\":$args,\"session\":\"$SESSION\"}"
}
export -f bridge
export SESSION BRIDGE
