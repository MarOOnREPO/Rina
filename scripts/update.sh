#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

LOG() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

LOG "🔄 Updating Rina..."

# ─── Pull latest code ────────────────────────────────────────────
LOG "📥 Pulling latest code..."
git pull origin main

# ─── Load .env safely ────────────────────────────────────────────
_env_get() {
  grep "^$1=" .env 2>/dev/null | cut -d '=' -f2- | sed "s/^['\"]//;s/['\"]$//"
}

if [ ! -f ".env" ]; then
  LOG "❌ .env not found. Run ./scripts/deploy.sh for first-time setup."
  exit 1
fi

POSTGRES_PASSWORD=$(_env_get POSTGRES_PASSWORD)
DOMAIN=$(_env_get DOMAIN)

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  LOG "❌ POSTGRES_PASSWORD not set in .env"
  exit 1
fi

# ─── Build Frontend ──────────────────────────────────────────────
LOG "🏗️  Building frontend..."
cd frontend
npm install
VITE_MAPBOX_TOKEN="$(_env_get VITE_MAPBOX_TOKEN)" npm run build
cd "$PROJECT_DIR"

# ─── Build Backend ───────────────────────────────────────────────
LOG "🏗️  Building backend..."
cd backend
npm install
npm run build
cd "$PROJECT_DIR"

# ─── Run DB Migrations ───────────────────────────────────────────
LOG "🗄️  Running database migrations..."
docker compose run --rm backend npx prisma migrate deploy

# ─── Restart all services ────────────────────────────────────────
LOG "🐳 Restarting containers..."
docker compose up -d --build --remove-orphans

# ─── Cleanup ─────────────────────────────────────────────────────
LOG "🧹 Cleaning up old images..."
docker image prune -f > /dev/null 2>&1 || true

# ─── Health Check ────────────────────────────────────────────────
LOG "⏳ Waiting for services..."
sleep 5

if [ -n "${DOMAIN:-}" ]; then
  if curl -sf "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    LOG "✅ Update complete — https://${DOMAIN} is live!"
  else
    LOG "⚠️  Health check failed. Check logs: docker compose logs backend"
  fi
else
  LOG "✅ Update complete!"
fi
