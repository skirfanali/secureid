#!/usr/bin/env bash
# Starts SecureID (frontend + backend, one process, one port).
# Usage: ./start.sh   (from the project root, after unzipping)
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from the example file."
fi

echo ""
echo "Starting SecureID..."
echo "Once you see 'SecureID running at ...', open that URL (default http://localhost:4001)"
echo ""
npm start
