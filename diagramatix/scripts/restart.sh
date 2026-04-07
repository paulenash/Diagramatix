#!/bin/bash
# Restart Diagramatix dev server (and PGlite if needed)
# Usage:
#   bash scripts/restart.sh             # restart dev server, leave PGlite alone if already running
#   bash scripts/restart.sh --pglite    # also force-restart PGlite

set -e

export PATH="$PATH:/c/Program Files/nodejs"
cd "$(dirname "$0")/.."

FORCE_PGLITE=0
for arg in "$@"; do
  case "$arg" in
    --pglite) FORCE_PGLITE=1 ;;
  esac
done

echo "Stopping any existing dev server on port 3000..."
PID=$(netstat -ano 2>/dev/null | grep ":3000.*LISTENING" | head -1 | awk '{print $NF}')
if [ -n "$PID" ] && [ "$PID" != "0" ]; then
  taskkill //PID "$PID" //T //F 2>/dev/null || true
  echo "Killed dev server (PID $PID)"
  sleep 2
else
  echo "No dev server found on port 3000"
fi

PGLITE_PID=$(netstat -ano 2>/dev/null | grep ":51214.*LISTENING" | head -1 | awk '{print $NF}')

if [ "$FORCE_PGLITE" = "1" ] && [ -n "$PGLITE_PID" ] && [ "$PGLITE_PID" != "0" ]; then
  echo "Stopping PGlite (PID $PGLITE_PID) for forced restart..."
  taskkill //PID "$PGLITE_PID" //T //F 2>/dev/null || true
  sleep 2
  PGLITE_PID=""
fi

if [ -n "$PGLITE_PID" ] && [ "$PGLITE_PID" != "0" ]; then
  echo "PGlite already running (PID $PGLITE_PID) on port 51214"
else
  echo "Starting PGlite server..."
  # Use the LOCAL pglite-server (not 'prisma dev' — its bundled @electric-sql/pglite
  # version is incompatible with the existing data directory).
  nohup npx pglite-server \
    -d "C:/Users/paul/AppData/Local/prisma-dev-nodejs/Data/default/.pglite" \
    -p 51214 \
    > /tmp/pglite-server.log 2>&1 &
  disown 2>/dev/null || true
  sleep 3
  PGLITE_PID=$(netstat -ano 2>/dev/null | grep ":51214.*LISTENING" | head -1 | awk '{print $NF}')
  if [ -n "$PGLITE_PID" ] && [ "$PGLITE_PID" != "0" ]; then
    echo "PGlite started (PID $PGLITE_PID). Log: /tmp/pglite-server.log"
  else
    echo "ERROR: PGlite failed to start. See /tmp/pglite-server.log"
    exit 1
  fi
fi

echo "Clearing .next cache..."
rm -rf .next

echo "Starting dev server..."
npm run dev
