#!/usr/bin/env sh
# Lance Jarvis puis ouvre le navigateur. Clé API optionnelle dans cle-api.txt.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js est introuvable : installez-le depuis https://nodejs.org"; exit 1; }
[ -z "$ANTHROPIC_API_KEY" ] && [ -f cle-api.txt ] && ANTHROPIC_API_KEY=$(tr -d ' \r\n' < cle-api.txt) && export ANTHROPIC_API_KEY
exec node server.js --ouvrir
