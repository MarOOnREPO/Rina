#!/bin/bash
set -euo pipefail

# Generate dummy self-signed SSL certificates so nginx and coturn can start
# before real Let's Encrypt certs are obtained.
# Run this on the host if services fail to start due to missing certs.

DOMAIN="${1:-}"
TURN_DOMAIN="${2:-turn.devopsya.com}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <web-domain> [turn-domain]"
  echo "Example: $0 rina.devopsya.com turn.devopsya.com"
  exit 1
fi

LOG() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

LOG "🔧 Bootstrapping dummy SSL certs for $DOMAIN and $TURN_DOMAIN..."

# Ensure certbot-data volume exists
docker volume inspect certbot-data >/dev/null 2>&1 || docker volume create certbot-data

# Generate dummy certs inside the named volume using nginx:alpine (has openssl)
docker run --rm \
  -v certbot-data:/etc/letsencrypt \
  -e "DOMAIN=$DOMAIN" \
  -e "TURN_DOMAIN=$TURN_DOMAIN" \
  nginx:alpine sh -c '
    apk add --no-cache openssl >/dev/null 2>&1
    for d in "$DOMAIN" "$TURN_DOMAIN"; do
      mkdir -p "/etc/letsencrypt/live/$d"
      if [ ! -f "/etc/letsencrypt/live/$d/fullchain.pem" ]; then
        openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
          -keyout "/etc/letsencrypt/live/$d/privkey.pem" \
          -out "/etc/letsencrypt/live/$d/fullchain.pem" \
          -subj "/CN=$d"
        cp "/etc/letsencrypt/live/$d/fullchain.pem" "/etc/letsencrypt/live/$d/chain.pem"
        echo "✅ Dummy cert generated for $d"
      else
        echo "ℹ️  Real cert already exists for $d, skipping"
      fi
    done
  '

LOG "✅ Nginx and Coturn can now start. You will see browser security warnings until real certs are installed."
LOG "   Run ./scripts/init-ssl.sh $DOMAIN your-email@example.com $TURN_DOMAIN to get real certs."
