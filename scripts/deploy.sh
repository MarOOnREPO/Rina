#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

LOG() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

LOG "🚀 Starting Rina deployment..."

# ─── Pre-flight checks ───────────────────────────────────────────
if [ ! -f ".env" ]; then
  LOG "❌ .env file not found. Run: cp .env.example .env and configure it."
  exit 1
fi

if ! docker info > /dev/null 2>&1; then
  LOG "❌ Docker is not running or your user lacks permissions."
  exit 1
fi

# Robustly load .env
set -a
source .env
set +a

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  LOG "❌ POSTGRES_PASSWORD is not set in .env."
  exit 1
fi

if [ -z "${DOMAIN:-}" ]; then
  LOG "⚠️  DOMAIN is not set in .env. Set it for SSL and health checks."
fi

DATABASE_URL="postgresql://rina_user:${POSTGRES_PASSWORD}@postgres:5432/rina_db"

# ─── SSL Check (warn only) ───────────────────────────────────────
if [ -n "${DOMAIN:-}" ]; then
  CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  if ! docker compose run --rm -v certbot-data:/etc/letsencrypt nginx test -f "$CERT_FILE" >/dev/null 2>&1; then
    LOG "⚠️  SSL certificate not found for $DOMAIN."
    LOG "   Run: ./scripts/init-ssl.sh $DOMAIN your-email@example.com"
  fi
fi

# ─── Start Postgres first (migrations need it) ───────────────────
LOG "🐘 Starting Postgres..."
docker compose up -d postgres

LOG "⏳ Waiting for Postgres to be ready..."
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U rina_user -d rina_db >/dev/null 2>&1; then
    LOG "✅ Postgres is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    LOG "❌ Postgres did not become ready in time."
    exit 1
  fi
  sleep 2
done

# ─── Database migrations ─────────────────────────────────────────
LOG "🗄️ Running database migrations..."

docker build --target builder -t rina-backend-builder ./backend

docker run --rm \
  --network rina-data \
  -e DATABASE_URL="$DATABASE_URL" \
  rina-backend-builder \
  npx prisma migrate deploy

# ─── Build & start all services ──────────────────────────────────
LOG "🏗️ Building and starting all services..."
docker compose up -d --build

# ─── Health Check ────────────────────────────────────────────────
if [ -n "${DOMAIN:-}" ]; then
  LOG "⏳ Waiting for services to stabilize..."
  sleep 5
  if curl -sf "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    LOG "✅ Health check passed: https://${DOMAIN}/api/health"
  else
    LOG "⚠️  Health check failed. Check logs: docker compose logs -f backend"
  fi
fi

# ─── Cleanup ─────────────────────────────────────────────────────
LOG "🧹 Cleaning up dangling images..."
docker image prune -f

LOG "✅ Deployment complete!"
echo ""
docker compose ps
echo ""
LOG "View backend logs: docker compose logs -f backend"
LOG "View nginx logs:   docker compose logs -f nginx"
