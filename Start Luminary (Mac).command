#!/bin/bash
# Double-click to start Luminary on macOS.
cd "$(dirname "$0")" || exit 1

pause_and_exit() { echo; read -r -p "Press Enter to close this window." _; exit "${1:-0}"; }

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed yet."
  echo "  Opening the download page: install the \"LTS\" version, then double-click this file again."
  open "https://nodejs.org"
  pause_and_exit 1
fi

if [ ! -d node_modules ]; then
  echo "Setting up Luminary - first time only, this takes a minute..."
  npm install || { echo "Setup failed. Check your internet connection and try again."; pause_and_exit 1; }
fi

export LUMINARY_OPEN=1

if [ ! -f .env ]; then
  echo
  echo "  To get real answers, paste your Anthropic API key and press Enter."
  echo "  (Get one at https://console.anthropic.com - it starts with sk-ant-)"
  echo "  Or just press Enter to try the demo with sample answers."
  echo
  read -r -s -p "API key (hidden as you type): " KEY
  echo
  if [ -n "$KEY" ]; then
    printf 'ANTHROPIC_API_KEY=%s\n' "$KEY" > .env
    chmod 600 .env
    echo "Key saved. To change it later, delete the hidden .env file in this folder."
  fi
fi

if [ -f .env ]; then npm start; else npm run demo; fi
pause_and_exit
