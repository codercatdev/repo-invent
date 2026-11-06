#!/usr/bin/env bash
# Serve the web demo on this machine, at a URL anyone on your network can open.
#
# Usage:
#   ./deploy/serve.sh [port] [bind-address]
#
# Default is 127.0.0.1 so nothing is exposed by accident. To reach it from a
# phone on the same network, pass your LAN address explicitly:
#   ./deploy/serve.sh 8080 0.0.0.0
#
# This is a local listener, not a public deployment: it stops when the process
# ends and nobody outside your network can reach it.

set -euo pipefail

PORT="${1:-8080}"
BIND="${2:-127.0.0.1}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

npm run build >/dev/null

echo "repo:Invent demo"
echo "  local:  http://127.0.0.1:${PORT}/"
[ "$BIND" != "127.0.0.1" ] && echo "  bound:  http://${BIND}:${PORT}/ (reachable on your network)"
if [ "$BIND" = "0.0.0.0" ]; then
  echo "  warning: listening on every interface. Anyone who can reach this host can use it."
fi

REPO_INVENT_PORT="$PORT" REPO_INVENT_BIND="$BIND" exec node dist/web.js
