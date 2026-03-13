#!/bin/bash
# Restart Diagramatix dev server
# Usage: bash scripts/restart.sh

set -e

export PATH="$PATH:/c/Program Files/nodejs"
cd "$(dirname "$0")/.."

echo "Stopping any existing dev server on port 3000..."
PID=$(netstat -ano 2>/dev/null | grep ":3000.*LISTENING" | head -1 | awk '{print $NF}')
if [ -n "$PID" ] && [ "$PID" != "0" ]; then
  taskkill //PID "$PID" //T //F 2>/dev/null || true
  echo "Killed process $PID"
  sleep 2
else
  echo "No process found on port 3000"
fi

echo "Checking PGlite server on port 51214..."
PGLITE_PID=$(netstat -ano 2>/dev/null | grep ":51214.*LISTENING" | head -1 | awk '{print $NF}')
if [ -n "$PGLITE_PID" ] && [ "$PGLITE_PID" != "0" ]; then
  echo "PGlite already running (PID $PGLITE_PID)"
else
  echo "Starting PGlite server..."
  npx pglite-server -d "C:/Users/paul/AppData/Local/prisma-dev-nodejs/Data/default/.pglite" -p 51214 &
  sleep 3
  echo "PGlite server started"
fi

echo "Clearing .next cache..."
rm -rf .next

echo "Starting dev server..."
npm run dev
