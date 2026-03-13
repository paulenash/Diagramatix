#!/bin/bash
# Shutdown Diagramatix completely (dev server + PGlite)
# Usage: bash scripts/shutdown.sh

export PATH="$PATH:/c/Program Files/nodejs"

echo "Stopping dev server on port 3000..."
PID=$(netstat -ano 2>/dev/null | grep ":3000.*LISTENING" | head -1 | awk '{print $NF}')
if [ -n "$PID" ] && [ "$PID" != "0" ]; then
  taskkill //PID "$PID" //T //F 2>/dev/null || true
  echo "Killed dev server (PID $PID)"
else
  echo "No dev server found on port 3000"
fi

echo "Stopping PGlite server on port 51214..."
PGLITE_PID=$(netstat -ano 2>/dev/null | grep ":51214.*LISTENING" | head -1 | awk '{print $NF}')
if [ -n "$PGLITE_PID" ] && [ "$PGLITE_PID" != "0" ]; then
  taskkill //PID "$PGLITE_PID" //T //F 2>/dev/null || true
  echo "Killed PGlite server (PID $PGLITE_PID)"
else
  echo "No PGlite server found on port 51214"
fi

echo "Diagramatix shut down."
