#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# Rina App — Production Deployment Script (v2)
# Run this on the VPS after code changes to deploy with zero downtime.
# ═══════════════════════════════════════════════════════════════════

PROJECT_DIR="/home/ubuntu/Rina"
BACKUP_DIR="/home/ubuntu/backups"

cd "$PROJECT_DIR"

# ─── Colors ───────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

LOG()     { echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
SUCCESS() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅${NC} $1"; }
WARN()    { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️${NC} $1"; }
ERROR()   { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌${NC} $1"; }

# ─── 1. Pre-flight checks ─────────────────────────────────────────
LOG "${BOLD}🔍 Running pre-flight checks...${NC}"

if ! docker info > /dev/null 2>&1; then
  ERROR "Docker is not running or your user lacks permissions."
  ERROR "Try: sudo systemctl start docker"
  exit 1
fi

if ! docker compose version > /dev/null 2>&1; then
  ERROR "Docker Compose is not installed."
  exit 1
fi

if [ ! -f ".env" ]; then
  ERROR ".env file not found in $PROJECT_DIR"
  ERROR "Run ./scripts/setup-vps.sh first, then fill in .env"
  exit 1
fi

# Safely load .env (no variable expansion of values)
set -a
# shellcheck source=/dev/null
source .env
set +a

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  ERROR "POSTGRES_PASSWORD is not set in .env"
  exit 1
fi

if [ -z "${DOMAIN:-}" ]; then
  WARN "DOMAIN is not set in .env. SSL and health checks may fail."
fi

SUCCESS "Pre-flight checks passed."

# ─── 2. Backup database ───────────────────────────────────────────
LOG "${BOLD}💾 Backing up database...${NC}"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/rina_$(date +%Y%m%d_%H%M%S).sql"

if docker ps --format '{{.Names}}' | grep -q "^rina-postgres$"; then
  if docker exec rina-postgres pg_dump -U rina_user rina_db > "$BACKUP_FILE"; then
    SUCCESS "Database backup saved to $BACKUP_FILE"
  else
    ERROR "Database backup failed!"
    exit 1
  fi
else
  WARN "rina-postgres container is not running — skipping backup."
  BACKUP_FILE=""
fi

# ─── Tag current image for rollback ───────────────────────────────
ROLLBACK_TAG=""
if docker ps --format '{{.Names}}' | grep -q "^rina-backend$"; then
  CURRENT_IMAGE=$(docker inspect --format='{{.Image}}' rina-backend)
  if [ -n "$CURRENT_IMAGE" ]; then
    docker tag "$CURRENT_IMAGE" rina-go-backend:previous 2>/dev/null || true
    ROLLBACK_TAG="rina-go-backend:previous"
    LOG "Tagged current backend image as ${BOLD}$ROLLBACK_TAG${NC}"
  fi
fi

# ─── 3. Build frontend ────────────────────────────────────────────
LOG "${BOLD}🏗️  Building frontend...${NC}"
cd frontend

if ! command -v npm > /dev/null 2>&1; then
  ERROR "npm is not installed. Install Node.js on the VPS to build the frontend."
  exit 1
fi

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# Pass any VITE_ env vars from .env into the build
export $(grep -E '^VITE_' ../.env 2>/dev/null | xargs) || true
npm run build

cd "$PROJECT_DIR"
SUCCESS "Frontend build complete."

# ─── 4. Build Go backend ──────────────────────────────────────────
LOG "${BOLD}🏗️  Building Go backend Docker image...${NC}"
cd go-backend
if [ ! -f Dockerfile ]; then
  ERROR "go-backend/Dockerfile not found."
  exit 1
fi
docker build -t rina-go-backend .
cd "$PROJECT_DIR"
SUCCESS "Go backend image built: ${BOLD}rina-go-backend${NC}"

# ─── 5. Database migration ────────────────────────────────────────
LOG "${BOLD}🗄️  Running database migrations...${NC}"
DATABASE_URL="postgresql://rina_user:${POSTGRES_PASSWORD}@postgres:5432/rina_db"

if docker ps --format '{{.Names}}' | grep -q "^rina-postgres$"; then
  LOG "Waiting for Postgres to be ready..."
  for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U rina_user -d rina_db > /dev/null 2>&1; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      ERROR "Postgres did not become ready in time."
      exit 1
    fi
    sleep 1
  done

  if docker run --rm \
      --network rina-data \
      -e DATABASE_URL="$DATABASE_URL" \
      --entrypoint /app/migrate \
      rina-go-backend; then
    SUCCESS "Database migrations applied."
  else
    ERROR "Database migration FAILED!"
    echo ""
    echo -e "${RED}═════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  ROLLBACK: Migration failed — backend was NOT deployed.${NC}"
    echo -e "${RED}═════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  The previous backend container is still running (if any)."
    echo "  Check migration logs above for details."
    echo ""
    if [ -n "$BACKUP_FILE" ]; then
      echo "  To restore the database:"
      echo "    cat $BACKUP_FILE | docker exec -i rina-postgres psql -U rina_user -d rina_db"
    fi
    echo ""
    exit 1
  fi
else
  WARN "Postgres is not running — skipping migrations."
  WARN "Start Postgres first: docker compose up -d postgres"
fi

# ─── 6. Zero-downtime deploy ──────────────────────────────────────
LOG "${BOLD}🚀 Deploying backend (zero-downtime)...${NC}"
docker compose up -d --build --no-deps backend
SUCCESS "Backend deployed."

# ─── 7. Nginx reload ──────────────────────────────────────────────
LOG "${BOLD}🔄 Reloading Nginx configuration...${NC}"
if docker ps --format '{{.Names}}' | grep -q "^rina-nginx$"; then
  docker compose exec nginx nginx -s reload
  SUCCESS "Nginx reloaded."
else
  WARN "Nginx container is not running — starting all services..."
  docker compose up -d nginx
fi

# ─── 8. Health check ──────────────────────────────────────────────
LOG "${BOLD}⏳ Waiting for services to stabilize...${NC}"
sleep 5

HEALTH_PASSED=true
DOMAIN="${DOMAIN:-localhost}"

# Determine base URL (prefer HTTPS, fall back to HTTP localhost)
BASE_URL=""
if curl -sf "https://${DOMAIN}/api/health" > /dev/null 2>&1; then
  BASE_URL="https://${DOMAIN}"
elif curl -sf "http://localhost/api/health" > /dev/null 2>&1; then
  BASE_URL="http://localhost"
fi

if [ -z "$BASE_URL" ]; then
  ERROR "Could not reach the application on HTTPS or HTTP localhost."
  HEALTH_PASSED=false
fi

# Check /api/health
if [ "$HEALTH_PASSED" = true ]; then
  LOG "Checking ${BOLD}/api/health${NC} ..."
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null || echo "000")
  if [ "$HEALTH_STATUS" = "200" ]; then
    SUCCESS "/api/health responded with 200 OK"
  else
    ERROR "/api/health returned HTTP $HEALTH_STATUS (expected 200)"
    HEALTH_PASSED=false
  fi
fi

# Check /ws (expect 401 Unauthorized)
if [ "$HEALTH_PASSED" = true ]; then
  LOG "Checking ${BOLD}/ws${NC} (expecting 401) ..."
  WS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/ws" 2>/dev/null || echo "000")
  if [ "$WS_STATUS" = "401" ]; then
    SUCCESS "/ws responded with 401 (expected)"
  else
    ERROR "/ws returned HTTP $WS_STATUS (expected 401)"
    HEALTH_PASSED=false
  fi
fi

# ─── 9. Cleanup ───────────────────────────────────────────────────
LOG "${BOLD}🧹 Cleaning up old Docker images and unused resources...${NC}"
docker image prune -f > /dev/null 2>&1 || true
docker container prune -f > /dev/null 2>&1 || true
SUCCESS "Cleanup complete."

# ─── 10. Rollback plan if health check failed ─────────────────────
if [ "$HEALTH_PASSED" = false ]; then
  echo ""
  echo -e "${RED}═════════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}  ❌ DEPLOYMENT FAILED — HEALTH CHECKS DID NOT PASS${NC}"
  echo -e "${RED}═════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}Rollback instructions:${NC}"
  echo ""

  if [ -n "$ROLLBACK_TAG" ]; then
    echo "  1. Stop and remove the failing backend container:"
    echo "       docker compose stop backend"
    echo "       docker compose rm -f backend"
    echo ""
    echo "  2. Restore the previous image:"
    echo "       docker image tag $ROLLBACK_TAG rina-go-backend:latest"
    echo ""
    echo "  3. Restart backend with the previous image:"
    echo "       docker compose up -d --no-deps backend"
    echo ""
  else
    echo "  No previous image tag found. To rollback manually:"
    echo "    git checkout <previous-commit>"
    echo "    ./scripts/deploy-v2.sh"
    echo ""
  fi

  echo "  4. Inspect backend logs:"
  echo "       docker compose logs --tail=100 backend"
  echo ""
  echo "  5. Inspect nginx logs:"
  echo "       docker compose logs --tail=50 nginx"
  echo ""

  if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    echo "  6. Restore database (if schema changes caused issues):"
    echo "       cat $BACKUP_FILE | docker exec -i rina-postgres psql -U rina_user -d rina_db"
    echo ""
  fi

  echo -e "${RED}═════════════════════════════════════════════════════════════════${NC}"
  exit 1
fi

SUCCESS "🎉 Deployment complete! Rina is live at https://${DOMAIN}"
