#!/bin/bash
set -euo pipefail

# Project Rina — Production Deploy Script
# Run this on your Lightsail server after receiving code updates.

LOG() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Resolve project root (scripts/ -> root)
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

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

# Load POSTGRES_PASSWORD for constructing DATABASE_URL
POSTGRES_PASSWORD=""
if grep -q '^POSTGRES_PASSWORD=' .env; then
  POSTGRES_PASSWORD="$(grep '^POSTGRES_PASSWORD=' .env | cut -d '=' -f 2-)"
fi

if [ -z "$POSTGRES_PASSWORD" ]; then
  LOG "❌ POSTGRES_PASSWORD is not set in .env."
  exit 1
fi

DATABASE_URL="postgresql://rina_user:${POSTGRES_PASSWORD}@postgres:5432/rina_db"

# ─── Stop old containers ─────────────────────────────────────────
LOG "📦 Stopping old containers..."
docker compose down

# ─── Start Postgres first (migrations need it) ───────────────────
LOG "🐘 Starting Postgres..."
docker compose up -d postgres

# ─── Wait for Postgres ───────────────────────────────────────────
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

# ─── Database migrations (before backend starts) ─────────────────
LOG "🗄️ Running database migrations..."

# Build the builder stage (reuses cache from the production build)
# and run Prisma migrations inside the Docker network.
docker build --target builder -t rina-backend-builder ./backend

if ! docker image inspect rina-backend-builder >/dev/null 2>&1; then
  LOG "❌ Failed to build migration image. Ensure backend/Dockerfile has a 'builder' stage."
  exit 1
fi

docker run --rm \
  --network rina-network \
  -e DATABASE_URL="$DATABASE_URL" \
  rina-backend-builder \
  npx prisma migrate deploy

# ─── Build & start all services ──────────────────────────────────
LOG "🏗️ Building and starting all services..."
docker compose up -d --build

# ─── Cleanup & status ────────────────────────────────────────────
LOG "🧹 Cleaning up dangling images..."
docker image prune -f

LOG "✅ Deployment complete!"
echo ""
docker compose ps
echo ""
LOG "View backend logs: docker compose logs -f backend"
LOG "View nginx logs:   docker compose logs -f nginx"
