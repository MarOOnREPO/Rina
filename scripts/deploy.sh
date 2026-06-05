#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

LOG() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

LOG "🚀 Starting Rina deployment..."

# ─── Pre-flight checks ───────────────────────────────────────────
if ! docker info > /dev/null 2>&1; then
  LOG "❌ Docker is not running or your user lacks permissions."
  exit 1
fi

# ─── Wizard: Create .env if missing ──────────────────────────────
if [ ! -f ".env" ]; then
  LOG "📝 No .env found. Creating from template..."
  cp .env.example .env
  chmod 600 .env
fi

# Safely read specific values from .env without bash variable expansion
_env_get() {
  grep "^$1=" .env 2>/dev/null | cut -d '=' -f2- | sed "s/^['\"]//;s/['\"]$//"
}

_env_set() {
  local key="$1"
  local value="$2"
  if grep -q "^$key=" .env; then
    sed -i "s|^$key=.*|$key=$value|" .env
  else
    echo "$key=$value" >> .env
  fi
}

DOMAIN=$(_env_get DOMAIN)
FRONTEND_URL=$(_env_get FRONTEND_URL)
CORS_ORIGIN=$(_env_get CORS_ORIGIN)
POSTGRES_PASSWORD=$(_env_get POSTGRES_PASSWORD)
JWT_SECRET=$(_env_get JWT_SECRET)
COOKIE_SECRET=$(_env_get COOKIE_SECRET)
MAROON_PASSWORD_HASH=$(_env_get MAROON_PASSWORD_HASH)
RINA_PASSWORD_HASH=$(_env_get RINA_PASSWORD_HASH)
SPOTIFY_TOKEN_ENCRYPTION_KEY=$(_env_get SPOTIFY_TOKEN_ENCRYPTION_KEY)
BACKUP_ENCRYPTION_KEY=$(_env_get BACKUP_ENCRYPTION_KEY)
AWS_REGION=$(_env_get AWS_REGION)
AWS_ACCESS_KEY_ID=$(_env_get AWS_ACCESS_KEY_ID)
AWS_SECRET_ACCESS_KEY=$(_env_get AWS_SECRET_ACCESS_KEY)
S3_BUCKET_NAME=$(_env_get S3_BUCKET_NAME)
TMDB_API_KEY=$(_env_get TMDB_API_KEY)
VAPID_PUBLIC_KEY=$(_env_get VAPID_PUBLIC_KEY)
VAPID_PRIVATE_KEY=$(_env_get VAPID_PRIVATE_KEY)
COTURN_REALM=$(_env_get COTURN_REALM)
COTURN_SECRET=$(_env_get COTURN_SECRET)

# ─── Interactive Wizard ──────────────────────────────────────────
WIZARD_NEEDED=false
if [ -z "$DOMAIN" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$JWT_SECRET" ] || [ -z "$COOKIE_SECRET" ] || [ -z "$MAROON_PASSWORD_HASH" ] || [ -z "$RINA_PASSWORD_HASH" ]; then
  WIZARD_NEEDED=true
fi

if [ "$WIZARD_NEEDED" = true ]; then
  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo "  🔮 Rina Deployment Wizard"
  echo "════════════════════════════════════════════════════════════════"
  echo ""
  echo "  Some required environment variables are missing."
  echo "  I'll ask you for each one. Press Enter to accept defaults."
  echo ""

  prompt() {
    local var_name="$1"
    local description="$2"
    local default_value="${3:-}"
    local current_value
    current_value=$(_env_get "$var_name")
    if [ -n "$current_value" ]; then
      default_value="$current_value"
    fi
    echo ""
    echo "  $description"
    if [ -n "$default_value" ]; then
      read -rp "  $var_name [$default_value]: " input
      input="${input:-$default_value}"
    else
      read -rp "  $var_name: " input
    fi
    _env_set "$var_name" "$input"
    echo "$input"
  }

  prompt_secret() {
    local var_name="$1"
    local description="$2"
    local auto_gen="${3:-false}"
    local current_value
    current_value=$(_env_get "$var_name")
    if [ -n "$current_value" ]; then
      echo "  ✅ $var_name already set (hidden)."
      return
    fi
    echo ""
    echo "  $description"
    if [ "$auto_gen" = true ]; then
      read -rp "  Auto-generate $var_name? [Y/n]: " gen
      if [ "${gen:-Y}" = "Y" ] || [ "${gen:-Y}" = "y" ]; then
        local secret
        secret=$(openssl rand -hex 32 | tr -d '\n')
        _env_set "$var_name" "$secret"
        echo "  ✅ Generated and saved."
        return
      fi
    fi
    read -rsp "  $var_name: " input
    echo ""
    _env_set "$var_name" "$input"
  }

  prompt_bcrypt() {
    local var_name="$1"
    local user_label="$2"
    local current_value
    current_value=$(_env_get "$var_name")
    if [ -n "$current_value" ]; then
      echo "  ✅ $var_name already set (hidden)."
      return
    fi
    echo ""
    echo "  $user_label login password"
    read -rsp "  Enter plaintext password: " plain_pass
    echo ""
    local hash
    if command -v node >/dev/null 2>&1; then
      hash=$(node -e "require('bcryptjs').hash('$plain_pass', 12).then(h => { console.log(h); process.exit(0); })")
    else
      hash=$(docker run --rm node:20-alpine sh -c "node -e \"require('bcryptjs').hash('$plain_pass', 12).then(h => { console.log(h); process.exit(0); })\"" 2>/dev/null)
    fi
    if [ -z "$hash" ]; then
      echo "  ⚠️  Could not auto-generate hash. Please provide the bcrypt hash manually:"
      read -rp "  $var_name: " hash
    fi
    _env_set "$var_name" "$hash"
    echo "  ✅ Hash saved."
  }

  prompt_vapid() {
    local current_pk
    local current_sk
    current_pk=$(_env_get VAPID_PUBLIC_KEY)
    current_sk=$(_env_get VAPID_PRIVATE_KEY)
    if [ -n "$current_pk" ] && [ -n "$current_sk" ]; then
      echo "  ✅ VAPID keys already set."
      return
    fi
    echo ""
    echo "  Web Push VAPID Keys"
    read -rp "  Auto-generate VAPID keys? [Y/n]: " gen
    if [ "${gen:-Y}" = "Y" ] || [ "${gen:-Y}" = "y" ]; then
      local keys
      if command -v npx >/dev/null 2>&1; then
        keys=$(npx -y web-push generate-vapid-keys --json 2>/dev/null)
      else
        keys=$(docker run --rm node:20-alpine sh -c "npm install -g web-push 2>/dev/null && npx web-push generate-vapid-keys --json" 2>/dev/null)
      fi
      if [ -n "$keys" ]; then
        local pk sk
        pk=$(echo "$keys" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4)
        sk=$(echo "$keys" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4)
        _env_set VAPID_PUBLIC_KEY "$pk"
        _env_set VAPID_PRIVATE_KEY "$sk"
        echo "  ✅ Generated and saved."
      else
        echo "  ⚠️  Could not auto-generate. Please enter manually:"
        prompt VAPID_PUBLIC_KEY "VAPID Public Key"
        prompt VAPID_PRIVATE_KEY "VAPID Private Key"
      fi
    else
      prompt VAPID_PUBLIC_KEY "VAPID Public Key"
      prompt VAPID_PRIVATE_KEY "VAPID Private Key"
    fi
  }

  # ─── Run wizard prompts ────────────────────────────────────────
  prompt DOMAIN "Your public domain" "rina.devopsya.com"
  _env_set FRONTEND_URL "https://$(_env_get DOMAIN)"
  _env_set CORS_ORIGIN "https://$(_env_get DOMAIN)"
  _env_set COTURN_REALM "$(_env_get DOMAIN)"

  prompt_secret POSTGRES_PASSWORD "Database password" true
  prompt_secret JWT_SECRET "JWT signing secret (min 32 chars)" true
  prompt_secret COOKIE_SECRET "Cookie encryption secret (min 32 chars)" true
  prompt_secret SPOTIFY_TOKEN_ENCRYPTION_KEY "Spotify token encryption key" true
  prompt_secret BACKUP_ENCRYPTION_KEY "Backup GPG encryption key" true

  prompt_bcrypt MAROON_PASSWORD_HASH "MarOOn"
  prompt_bcrypt RINA_PASSWORD_HASH "Rina"

  prompt AWS_ACCESS_KEY_ID "AWS Access Key ID"
  prompt AWS_SECRET_ACCESS_KEY "AWS Secret Access Key"
  prompt S3_BUCKET_NAME "S3 Bucket Name" "rina-maroon"
  _env_set AWS_REGION "us-east-1"

  prompt TMDB_API_KEY "TMDB API Key (get free at themoviedb.org/settings/api)"

  prompt_vapid

  prompt_secret COTURN_SECRET "Coturn TURN server secret" true

  _env_set NODE_ENV "production"
  _env_set PORT "3000"

  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo "  ✅ Wizard complete! All values saved to .env"
  echo "════════════════════════════════════════════════════════════════"
  echo ""

  # Reload values after wizard
  DOMAIN=$(_env_get DOMAIN)
  FRONTEND_URL=$(_env_get FRONTEND_URL)
  CORS_ORIGIN=$(_env_get CORS_ORIGIN)
  POSTGRES_PASSWORD=$(_env_get POSTGRES_PASSWORD)
  JWT_SECRET=$(_env_get JWT_SECRET)
  COOKIE_SECRET=$(_env_get COOKIE_SECRET)
  MAROON_PASSWORD_HASH=$(_env_get MAROON_PASSWORD_HASH)
  RINA_PASSWORD_HASH=$(_env_get RINA_PASSWORD_HASH)
  SPOTIFY_TOKEN_ENCRYPTION_KEY=$(_env_get SPOTIFY_TOKEN_ENCRYPTION_KEY)
  BACKUP_ENCRYPTION_KEY=$(_env_get BACKUP_ENCRYPTION_KEY)
fi

# Ensure .env is restricted
chmod 600 .env 2>/dev/null || true

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
cd frontend
npm install
VITE_MAPBOX_TOKEN="$(_env_get VITE_MAPBOX_TOKEN)" npm run build
cd "$PROJECT_DIR"

# ─── Run DB Migrations ───────────────────────────────────────────
LOG "🗄️  Running database migrations..."
docker compose run --rm backend npx prisma migrate deploy

# ─── Deploy all services ─────────────────────────────────────────
LOG "🐳 Starting all services..."
docker compose up -d --build --remove-orphans

# ─── Cleanup old images ──────────────────────────────────────────
LOG "🧹 Cleaning up old Docker images..."
docker image prune -f > /dev/null 2>&1 || true

# ─── Health Check ────────────────────────────────────────────────
LOG "⏳ Waiting for services to stabilize..."
sleep 5

if [ -n "${DOMAIN:-}" ]; then
  if curl -sf "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    LOG "✅ Health check passed — https://${DOMAIN} is live!"
  else
    LOG "⚠️  Health check failed. Check logs: docker compose logs backend"
  fi
else
  LOG "⚠️  DOMAIN not set, skipping health check."
fi

LOG "🎉 Deployment complete!"
