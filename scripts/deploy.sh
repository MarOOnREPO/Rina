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

# Ensure .env is restricted
chmod 600 .env 2>/dev/null || true

# Load .env (trusted file — must be owned by deploy user)
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

# ─── SSL Bootstrap (dummy cert so nginx can start) ─────────────
if [ -n "${DOMAIN:-}" ]; then
  CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  if ! docker compose run --rm -v certbot-data:/etc/letsencrypt nginx test -f "$CERT_FILE" >/dev/null 2>&1; then
    LOG "⚠️  SSL certificate not found for $DOMAIN."
    LOG "   Generating dummy self-signed cert so nginx can start..."
    ./scripts/bootstrap-ssl.sh "$DOMAIN"
    LOG "   Run ./scripts/init-ssl.sh $DOMAIN your-email@example.com for real certs."
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

# ─── Build Frontend ──────────────────────────────────────────────
LOG "🏗️  Building frontend..."

# Robustly load .env for VITE_MAPBOX_TOKEN
while IFS='=' read -r key value; do
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue
  export "$key=$value"
done < .env

docker run --rm \
  -v "${PROJECT_DIR}/frontend:/app" \
  -w /app \
  -e "VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}" \
  node:20-alpine \
  sh -c 'npm ci && npm run build'

LOG "✅ Frontend built."

# ─── Database migrations ─────────────────────────────────────────
LOG "🗄️ Running database migrations..."

# Build backend image first so the migration runs in the correct service context
docker compose build backend

# Run migrations via docker compose so networking & env vars are handled correctly
docker compose run --rm --no-deps backend npx prisma migrate deploy

# ─── Build & start all services ──────────────────────────────────
LOG "🏗️ Building and starting all services..."
docker compose up -d --build

# Nginx must be recreated (not just restarted) so its bind mount picks up
# the new frontend/build directory inode (SvelteKit deletes & recreates it).
LOG "🔄 Recreating nginx to pick up new frontend build..."
docker compose up -d --force-recreate nginx

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
