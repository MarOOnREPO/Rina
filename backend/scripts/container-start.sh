#!/bin/sh
if [ -f /host/.env ]; then
  if grep -q '^JWT_SECRET=' /host/.env && grep -q '^COOKIE_SECRET=' /host/.env && grep -q '^DOMAIN=' /host/.env; then
    echo "[Container] .env complete — starting main application..."
    node dist/server.js
    exit 0
  fi
fi
echo "[Container] .env incomplete — starting setup wizard..."
node dist/setup-server.js
