#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# Rina App — VPS Initial Setup Script
# Run this once on a fresh Ubuntu VPS to prepare the environment.
# ═══════════════════════════════════════════════════════════════════

PROJECT_DIR="/home/ubuntu/Rina"
BACKUP_DIR="/home/ubuntu/backups"

cd "$PROJECT_DIR" 2>/dev/null || true

# ─── Colors ───────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

LOG()     { echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
SUCCESS() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅${NC} $1"; }
WARN()    { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️${NC} $1"; }
ERROR()   { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌${NC} $1"; }

# ─── 1. Install Docker and Docker Compose if missing ──────────────
LOG "${BOLD}🔧 Checking Docker installation...${NC}"

if ! command -v docker &> /dev/null; then
  LOG "Docker not found. Installing Docker CE..."

  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  # Add current user to docker group (requires re-login)
  sudo usermod -aG docker "${USER}" || true
  SUCCESS "Docker installed. ${BOLD}Log out and back in for group changes to take effect.${NC}"
else
  SUCCESS "Docker is already installed."
fi

if ! docker compose version &> /dev/null; then
  LOG "Installing Docker Compose plugin..."
  sudo apt-get install -y -qq docker-compose-plugin
  SUCCESS "Docker Compose plugin installed."
else
  SUCCESS "Docker Compose is already installed."
fi

# ─── Install Node.js (required for frontend build) ────────────────
LOG "${BOLD}🔧 Checking Node.js installation...${NC}"
if ! command -v node &> /dev/null; then
  LOG "Node.js not found. Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt-get install -y -qq nodejs
  SUCCESS "Node.js $(node --version) installed."
else
  SUCCESS "Node.js $(node --version) is already installed."
fi

if ! command -v npm &> /dev/null; then
  ERROR "npm is missing even though Node.js is present."
  exit 1
fi

# ─── 2. Create necessary directories ──────────────────────────────
LOG "${BOLD}📁 Creating directories...${NC}"
mkdir -p "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
SUCCESS "Directories created:"
SUCCESS "  $PROJECT_DIR"
SUCCESS "  $BACKUP_DIR"

# ─── 3. Setup .env from .env.example if missing ───────────────────
LOG "${BOLD}📝 Checking environment configuration...${NC}"
cd "$PROJECT_DIR"

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    chmod 600 .env
    SUCCESS ".env created from .env.example"
    WARN "${BOLD}IMPORTANT:${NC} Edit .env and fill in ALL secrets before deploying!"
  else
    ERROR ".env.example not found in $PROJECT_DIR"
    ERROR "Cannot create .env automatically."
    exit 1
  fi
else
  SUCCESS ".env already exists."
fi

chmod 600 .env 2>/dev/null || true

# ─── 4. Create Docker networks ────────────────────────────────────
LOG "${BOLD}🌐 Creating Docker networks...${NC}"
docker network inspect rina-network >/dev/null 2>&1 || docker network create rina-network

# rina-data is internal (no external access) — ignore error if already exists
# with different properties
docker network inspect rina-data >/dev/null 2>&1 || \
  docker network create rina-data --internal || true

SUCCESS "Docker networks ready: ${BOLD}rina-network${NC}, ${BOLD}rina-data${NC}"

# ─── 5. Initial SSL setup with Certbot ────────────────────────────
LOG "${BOLD}🔒 Setting up SSL...${NC}"

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  WARN "Domain and email not provided as arguments."
  WARN "Usage: $0 <domain> <email>"
  WARN "Skipping automatic Let's Encrypt certificate request."
  echo ""

  # Try to bootstrap a dummy cert so nginx can at least start
  DOMAIN_FROM_ENV=""
  if [ -f ".env" ]; then
    DOMAIN_FROM_ENV=$(grep "^DOMAIN=" .env | cut -d '=' -f2- | sed "s/^['\"]//;s/['\"]$//" || true)
  fi

  if [ -n "$DOMAIN_FROM_ENV" ] && [ "$DOMAIN_FROM_ENV" != "your-domain.com" ]; then
    if [ -f "./scripts/bootstrap-ssl.sh" ]; then
      LOG "Bootstrapping dummy SSL certificate for ${BOLD}$DOMAIN_FROM_ENV${NC}..."
      ./scripts/bootstrap-ssl.sh "$DOMAIN_FROM_ENV"
      SUCCESS "Dummy SSL certificate created."
    else
      WARN "bootstrap-ssl.sh not found — cannot create dummy certificate."
    fi
  else
    WARN "No valid DOMAIN in .env — skipping SSL bootstrap."
  fi

  echo ""
  WARN "To obtain a real certificate later, run:"
  WARN "  ./scripts/init-ssl.sh <domain> <email>"
  echo ""
else
  if [ -f "./scripts/init-ssl.sh" ]; then
    # Ensure DOMAIN is set in .env before running init-ssl
    if grep -q "^DOMAIN=" .env 2>/dev/null; then
      sed -i "s|^DOMAIN=.*|DOMAIN='$DOMAIN'|" .env
    else
      echo "DOMAIN='$DOMAIN'" >> .env
    fi

    LOG "Requesting SSL certificate for ${BOLD}$DOMAIN${NC}..."
    ./scripts/init-ssl.sh "$DOMAIN" "$EMAIL"
    SUCCESS "SSL certificate obtained for $DOMAIN."
  else
    ERROR "init-ssl.sh not found — cannot initialize SSL."
    exit 1
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────
echo ""
SUCCESS "🎉 VPS setup complete!"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Review and update $PROJECT_DIR/.env with your secrets"
echo "  2. Ensure your code is in $PROJECT_DIR"
echo "  3. Run the deployment script:"
echo -e "     ${BOLD}./scripts/deploy-v2.sh${NC}"
echo ""
