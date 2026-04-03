#!/usr/bin/env bash
set -euo pipefail

DEFAULT_CONFIG="$HOME/Library/Application Support/ngrok/ngrok.yml"
TEMP_CONFIG="/tmp/druta-ngrok.yml"

if [[ ! -f "$DEFAULT_CONFIG" ]]; then
  echo "ngrok config not found at: $DEFAULT_CONFIG"
  echo "Run: ngrok config add-authtoken <YOUR_TOKEN>"
  exit 1
fi

AUTHTOKEN="$(awk -F'authtoken:' '/authtoken:/{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2; exit}' "$DEFAULT_CONFIG")"

if [[ -z "$AUTHTOKEN" ]]; then
  echo "No ngrok authtoken found in $DEFAULT_CONFIG"
  echo "Run: ngrok config add-authtoken <YOUR_TOKEN>"
  exit 1
fi

cat > "$TEMP_CONFIG" <<EOF
version: "3"
agent:
  authtoken: $AUTHTOKEN
EOF

echo "Starting ngrok tunnel to 127.0.0.1:3000 using free-tier-safe config..."
echo "Config: $TEMP_CONFIG"
ngrok http 127.0.0.1:3000 --config "$TEMP_CONFIG"
