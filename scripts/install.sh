#!/bin/bash
set -euo pipefail

# =============================================================================
# Rina — One-Command Install Script
# =============================================================================
# Run this on a fresh Ubuntu 22.04+ server AFTER cloning the repo:
#
#   git clone https://github.com/MarOOnREPO/Rina.git
#   cd Rina
#   ./scripts/install.sh
#
# Prerequisites: Docker, Docker Compose, Git, OpenSSL
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

LOG() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

# ─── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Host temp directory (mounted into Docker for visibility/debugging) ──────
HOST_TMP="/home/ubuntu/.rina-install-tmp"
mkdir -p "$HOST_TMP"

# ─── Progress / Resume ──────────────────────────────────────────────────────
PROGRESS_FILE=".install-progress.env"

save_progress() {
  local var_name="$1"
  if declare -p "$var_name" &>/dev/null; then
    declare -p "$var_name" >> "$PROGRESS_FILE"
  fi
}

load_progress() {
  if [ -f "$PROGRESS_FILE" ]; then
    source "$PROGRESS_FILE"
    return 0
  fi
  return 1
}

offer_resume() {
  if [ -f "$PROGRESS_FILE" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Previous installation attempt detected.${NC}"
    read -rp "Resume with saved values? [Y/n]: " resume_choice
    if [[ "${resume_choice:-Y}" =~ ^[Nn]$ ]]; then
      rm -f "$PROGRESS_FILE"
      return 0
    fi
    load_progress
  fi
  return 0
}

# ─── Prerequisites ──────────────────────────────────────────────────────────
LOG "🔍 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  echo -e "${RED}❌ Docker is not installed.${NC}"
  echo "   https://docs.docker.com/engine/install/ubuntu/"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo -e "${RED}❌ Docker Compose is not installed.${NC}"
  exit 1
fi

if ! command -v git &> /dev/null; then
  echo -e "${RED}❌ Git is not installed.${NC}"
  echo "   sudo apt update && sudo apt install -y git"
  exit 1
fi

if ! command -v openssl &> /dev/null; then
  echo -e "${RED}❌ OpenSSL is not installed.${NC}"
  echo "   sudo apt update && sudo apt install -y openssl"
  exit 1
fi

LOG "✅ Prerequisites OK."

# ─── Prompt Helper ──────────────────────────────────────────────────────────
prompt_required() {
  local var_name="$1"
  local message="$2"
  local is_secret="${3:-false}"
  local input
  local current_value=""

  if declare -p "$var_name" &>/dev/null; then
    current_value="${!var_name:-}"
  fi

  while true; do
    local display_msg="$message"
    if [ -n "$current_value" ]; then
      if [ "$is_secret" = "true" ]; then
        display_msg="${message} [press Enter to keep saved]"
      else
        display_msg="${message} [${current_value}]"
      fi
    fi

    if [ "$is_secret" = "true" ]; then
      read -rsp "${display_msg}: " input
      echo ""
    else
      read -rp "${display_msg}: " input
    fi

    if [ -n "$input" ]; then
      printf -v "$var_name" '%s' "$input"
      save_progress "$var_name"
      break
    elif [ -n "$current_value" ]; then
      printf -v "$var_name" '%s' "$current_value"
      break
    else
      echo -e "${RED}This field is required.${NC}"
    fi
  done
}

prompt_optional() {
  local var_name="$1"
  local message="$2"
  local input
  local current_value=""

  if declare -p "$var_name" &>/dev/null; then
    current_value="${!var_name:-}"
  fi

  local display_msg="$message"
  if [ -n "$current_value" ]; then
    display_msg="${message} [${current_value}]"
  fi

  read -rp "${display_msg}: " input

  if [ -n "$input" ]; then
    printf -v "$var_name" '%s' "$input"
  elif [ -n "$current_value" ]; then
    printf -v "$var_name" '%s' "$current_value"
  else
    printf -v "$var_name" '%s' ""
  fi
  save_progress "$var_name"
}

# ─── Interactive Configuration ──────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Rina — Interactive Setup${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

offer_resume

prompt_required DOMAIN   "🔷 Domain name (e.g., rina.example.com)"
prompt_required EMAIL    "📧 Email address (for Let's Encrypt SSL)"
prompt_required MAROON_PW "🔐 Maroon login password (plain text → bcrypt hash)" true
prompt_required RINA_PW   "🔐 Rina login password (plain text → bcrypt hash)" true
prompt_required AWS_ACCESS_KEY_ID     "☁️  AWS Access Key ID"
prompt_required AWS_SECRET_ACCESS_KEY "☁️  AWS Secret Access Key" true
prompt_required S3_BUCKET_NAME        "🪣 S3 Bucket name"
prompt_optional AWS_REGION            "🌎 AWS Region [us-east-1]"
AWS_REGION="${AWS_REGION:-us-east-1}"
save_progress "AWS_REGION"

prompt_optional TMDB_API_KEY       "🎬 TMDB API Key (optional — press Enter to skip)"
prompt_optional VITE_MAPBOX_TOKEN  "🗺️  Mapbox Token (optional — press Enter to skip)"

CORS_ORIGIN="https://${DOMAIN}"
COTURN_REALM="${DOMAIN}"

# ─── Secret Generation ──────────────────────────────────────────────────────
LOG "🔑 Generating cryptographically secure secrets..."

POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
COOKIE_SECRET=$(openssl rand -base64 64 | tr -d '\n')
COTURN_SECRET=$(openssl rand -hex 32)

# ─── Bcrypt Hash Generation (no npm CLI — download tarball directly) ────────
LOG "🧬 Hashing passwords with bcrypt (cost factor 12)..."

generate_hash() {
  local password="$1"
  local b64pw
  b64pw=$(printf '%s' "$password" | base64 -w0)
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -v "$HOST_TMP:/work" \
    -w /work \
    node:20 \
    sh -c "
      mkdir -p /work/bcryptjs &&
      curl -fsSL https://registry.npmjs.org/bcryptjs/-/bcryptjs-2.4.3.tgz | tar -xz -C /work/bcryptjs --strip-components=1 &&
      node -e '
        const bcrypt = require(\"/work/bcryptjs\");
        const pw = Buffer.from(\"$b64pw\", \"base64\").toString(\"utf8\");
        bcrypt.hash(pw, 12).then(console.log);
      '
    "
}

MAROON_PASSWORD_HASH=$(generate_hash "$MAROON_PW")
RINA_PASSWORD_HASH=$(generate_hash "$RINA_PW")

# ─── VAPID Key Generation (pure Node.js crypto — no packages needed) ────────
LOG "📡 Generating Web Push VAPID keys..."

VAPID_RESULT=$(docker run --rm node:20-alpine node -e "
  const crypto = require('crypto');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const pub = ecdh.getPublicKey('base64url', 'uncompressed');
  const priv = ecdh.getPrivateKey('base64url');
  console.log(pub + '|' + priv);
")
VAPID_PUBLIC_KEY=$(printf '%s' "$VAPID_RESULT" | cut -d'|' -f1)
VAPID_PRIVATE_KEY=$(printf '%s' "$VAPID_RESULT" | cut -d'|' -f2)

# ─── Write .env ─────────────────────────────────────────────────────────────
LOG "📝 Writing .env file..."

cat > .env <<EOF
# ─────────────────────────────────────────────────────────────────
# Project Rina — Environment Configuration
# Generated by install.sh on $(date '+%Y-%m-%d %H:%M:%S')
# WARNING: Never commit this file. Keep permissions at 600.
# ─────────────────────────────────────────────────────────────────

# ─── Domain ──────────────────────────────────────────────────────
DOMAIN=${DOMAIN}

# ─── Database ────────────────────────────────────────────────────
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# ─── JWT Authentication ──────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}

# ─── Cookie Signing (MUST be different from JWT_SECRET) ──────────
COOKIE_SECRET=${COOKIE_SECRET}

# ─── CORS Origin (required in production) ────────────────────────
CORS_ORIGIN=${CORS_ORIGIN}

# ─── Redis ───────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ─── AWS S3 Storage ──────────────────────────────────────────────
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
S3_BUCKET_NAME=${S3_BUCKET_NAME}

# ─── Auth Password Hashes ────────────────────────────────────────
MAROON_PASSWORD_HASH=${MAROON_PASSWORD_HASH}
RINA_PASSWORD_HASH=${RINA_PASSWORD_HASH}

# ─── TMDB API ────────────────────────────────────────────────────
TMDB_API_KEY=${TMDB_API_KEY:-}

# ─── Mapbox (Frontend Build Variable) ────────────────────────────
VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}

# ─── Web Push VAPID Keys ─────────────────────────────────────────
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}

# ─── Coturn TURN Server (WebRTC) ─────────────────────────────────
COTURN_REALM=${COTURN_REALM}
COTURN_SECRET=${COTURN_SECRET}

# ─── Application ─────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
EOF

chmod 600 .env

# Clean up progress file on success
rm -f "$PROGRESS_FILE"

LOG "✅ .env created with restricted permissions (600)."

# ─── Build Frontend ─────────────────────────────────────────────────────────
LOG "🏗️  Building frontend (this may take 1–2 minutes)..."

docker run --rm \
  -v "$PROJECT_DIR/frontend:/app" \
  -w /app \
  -e "VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}" \
  node:20-alpine \
  sh -c 'npm ci && npm run build'

LOG "✅ Frontend built into frontend/build/."

# ─── Initialize SSL ─────────────────────────────────────────────────────────
LOG "🔒 Bootstrapping dummy SSL certificate so nginx can start..."
./scripts/bootstrap-ssl.sh "$DOMAIN"

LOG "🔒 Requesting real Let's Encrypt certificate for ${DOMAIN}..."
./scripts/init-ssl.sh "$DOMAIN" "$EMAIL"

# ─── First Deploy ───────────────────────────────────────────────────────────
LOG "🚀 Running first deploy..."
./scripts/deploy.sh

# ─── Cleanup temp directory ─────────────────────────────────────────────────
LOG "🧹 Cleaning up install temp directory..."
rm -rf "$HOST_TMP"

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Rina is deployed!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "🌐 App URL:      ${CYAN}https://${DOMAIN}${NC}"
echo -e "💓 Health Check: ${CYAN}https://${DOMAIN}/api/health${NC}"
echo ""
echo -e "${YELLOW}Post-install checklist:${NC}"
echo "  1. Open https://${DOMAIN} in your browser and test both logins."
echo "  2. Schedule nightly DB backups:"
echo "       crontab -e"
echo "       0 3 * * * ${PROJECT_DIR}/scripts/backup-db.sh >> ${PROJECT_DIR}/backups/backup.log 2>&1"
echo "  3. Configure firewall (UFW):"
echo "       sudo ufw default deny incoming"
echo "       sudo ufw default allow outgoing"
echo "       sudo ufw allow 2222/tcp"
echo "       sudo ufw allow http"
echo "       sudo ufw allow https"
echo "       sudo ufw enable"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  Logs:     docker compose logs -f backend"
echo "  Restart:  ./scripts/deploy.sh"
echo "  Backup:   ./scripts/backup-db.sh"
echo "  .env:     ${PROJECT_DIR}/.env"
echo ""
