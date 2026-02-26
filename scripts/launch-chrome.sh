#!/usr/bin/env bash
# launch-chrome.sh — Start Chrome Canary with remote debugging
# Run this once. Log in to Google/X/etc. Sessions persist via profile.

CHROME_CANARY="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
CHROME_STABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT="${1:-9222}"
PROFILE="${HOME}/.chrome-mariner-profile"

# Pick Canary > Stable
if [ -f "$CHROME_CANARY" ]; then
  CHROME="$CHROME_CANARY"
  echo "Using Chrome Canary"
elif [ -f "$CHROME_STABLE" ]; then
  CHROME="$CHROME_STABLE"
  echo "Using Chrome Stable"
else
  echo "Error: Chrome not found"
  exit 1
fi

echo "Starting Chrome with remote debugging on port $PORT..."
echo "Profile: $PROFILE"
echo ""
echo "Log in to your accounts now — sessions persist."
echo "Press Ctrl+C to stop."
echo ""

"$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions-except \
  --window-size=1280,900
