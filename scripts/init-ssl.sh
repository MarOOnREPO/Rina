#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

DOMAIN="${1:-}"
EMAIL="${2:-}"
TURN_DOMAIN="${3:-turn.devopsya.com}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: $0 <web-domain> <email> [turn-domain]"
  echo "Example: $0 rina.devopsya.com admin@example.com turn.devopsya.com"
  exit 1
fi

LOG() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

LOG "🔒 Initializing SSL for $DOMAIN (web) and $TURN_DOMAIN (TURN)..."

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
if [ -f "nginx/default.conf" ] && [ ! -f "nginx/default.conf.bak" ]; then
  cp nginx/default.conf nginx/default.conf.bak
fi
if [ -f "nginx/nginx.conf" ] && [ ! -f "nginx/nginx.conf.bak" ]; then
  cp nginx/nginx.conf nginx/nginx.conf.bak
fi

# Temporarily disable stream block so nginx can start on port 80 for ACME
cat > /tmp/nginx-http-only.conf <<'EOF'
user nginx;
worker_processes auto;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    server {
        listen 80;
        server_name _;
        location ^~ /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        location / { return 200 "OK"; }
    }
}
EOF
cp /tmp/nginx-http-only.conf nginx/nginx.conf

LOG "🌐 Starting temporary nginx on HTTP (port 80) for ACME challenge..."
docker compose up -d nginx

# Wait for nginx to be ready
for i in {1..15}; do
  if curl -sf http://localhost/.well-known/acme-challenge/test >/dev/null 2>&1 || curl -sf http://localhost >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

LOG "📜 Requesting certificates from Let's Encrypt..."

# Remove dummy certs so certbot can create real ones
for d in "$DOMAIN" "$TURN_DOMAIN"; do
  docker run --rm -v certbot-data:/etc/letsencrypt nginx:alpine sh -c \
    "rm -rf /etc/letsencrypt/live/$d /etc/letsencrypt/archive/$d 2>/dev/null; echo 'Cleaned old cert for $d'" || true
done

# Web domain certificate
docker compose run --rm --entrypoint certbot certbot certonly --webroot \
  -w /var/www/certbot \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  --agree-tos \
  --no-eff-email

# TURN domain certificate
docker compose run --rm --entrypoint certbot certbot certonly --webroot \
  -w /var/www/certbot \
  --email "$EMAIL" \
  -d "$TURN_DOMAIN" \
  --agree-tos \
  --no-eff-email

LOG "🔁 Restoring full nginx configs and restarting..."
cp nginx/default.conf.bak nginx/default.conf 2>/dev/null || true
cp nginx/nginx.conf.bak nginx/nginx.conf 2>/dev/null || true
docker compose restart nginx

LOG "✅ SSL initialized!"
LOG "   https://$DOMAIN should be active shortly."
LOG "   TURN TLS on $TURN_DOMAIN:443 should be active shortly."
LOG "   The certbot container will auto-renew certificates every 12 hours."
