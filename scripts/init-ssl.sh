#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: $0 <domain> <email>"
  echo "Example: $0 rina.example.com admin@example.com"
  exit 1
fi

LOG() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

LOG "🔒 Initializing SSL for $DOMAIN..."

# Ensure domain is set in .env
if ! grep -q "^DOMAIN=" .env 2>/dev/null; then
  echo "DOMAIN='$DOMAIN'" >> .env
  LOG "✅ Added DOMAIN=$DOMAIN to .env"
else
  sed -i "s/^DOMAIN=.*/DOMAIN='$DOMAIN'/" .env
  LOG "✅ Updated DOMAIN in .env"
fi

# Ensure networks exist
docker network inspect rina-network >/dev/null 2>&1 || docker network create rina-network
docker network inspect rina-data >/dev/null 2>&1 || docker network create rina-data --internal 2>/dev/null || true

# Backup current template and use HTTP-only bootstrap
if [ -f "nginx/default.conf.template" ]; then
  cp nginx/default.conf.template nginx/default.conf.template.bak
fi
cp nginx/default.http.conf nginx/default.conf.template

LOG "🌐 Starting temporary nginx on HTTP (port 80) for ACME challenge..."
docker compose up -d nginx

# Wait for nginx to be ready
for i in {1..15}; do
  if curl -sf http://localhost/.well-known/acme-challenge/test >/dev/null 2>&1 || curl -sf http://localhost >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

LOG "📜 Requesting certificate from Let's Encrypt..."
docker compose run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  --agree-tos \
  --no-eff-email

LOG "🔁 Restoring full nginx template and restarting..."
cp nginx/default.conf.template.bak nginx/default.conf.template
docker compose restart nginx

LOG "✅ SSL initialized! https://$DOMAIN should be active shortly."
LOG "   The certbot container will auto-renew the certificate every 12 hours."
