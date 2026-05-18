#!/bin/bash
set -euo pipefail

# Generate a dummy self-signed SSL certificate so nginx can start
# before real Let's Encrypt certs are obtained.
# Run this on the host if nginx fails to start due to missing certs.

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <domain>"
  echo "Example: $0 rina.example.com"
  exit 1
fi

LOG() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

LOG "🔧 Bootstrapping dummy SSL cert for $DOMAIN..."

# Ensure certbot-data volume exists
docker volume inspect rina_certbot-data >/dev/null 2>&1 || docker volume create rina_certbot-data

# Generate dummy cert inside the named volume using nginx:alpine (has openssl)
docker run --rm \
  -v rina-certbot-data:/etc/letsencrypt \
  -e "DOMAIN=$DOMAIN" \
  nginx:alpine sh -c '
    mkdir -p "/etc/letsencrypt/live/$DOMAIN"
    if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
      openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
        -keyout "/etc/letsencrypt/live/$DOMAIN/privkey.pem" \
        -out "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" \
        -subj "/CN=$DOMAIN"
      echo "✅ Dummy cert generated"
    else
      echo "ℹ️  Real cert already exists, skipping bootstrap"
    fi
  '

LOG "✅ Nginx can now start. You will see a browser security warning until real certs are installed."
LOG "   Run ./scripts/init-ssl.sh $DOMAIN your-email@example.com to get real certs."
