#!/usr/bin/env sh
# Lance Jarvis puis ouvre le navigateur. Clé API optionnelle dans cle-api.txt.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js est introuvable : installez-le depuis https://nodejs.org"; exit 1; }
[ -z "$ANTHROPIC_API_KEY" ] && [ -f cle-api.txt ] && ANTHROPIC_API_KEY=$(tr -d ' \r\n' < cle-api.txt) && export ANTHROPIC_API_KEY
PORT=${PORT:-3000}; export PORT
( sleep 1; URL="http://localhost:$PORT"; if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi ) >/dev/null 2>&1 &
exec node server.js
