#!/bin/sh
set -e

# ── Auto-detect External IP ────────────────────────────────────
if [ -z "$EXTERNAL_IP" ]; then
    # AWS EC2/Lightsail metadata service
    EXTERNAL_IP=$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)

    # Generic fallback
    if [ -z "$EXTERNAL_IP" ]; then
        EXTERNAL_IP=$(curl -sf --max-time 2 https://checkip.amazonaws.com 2>/dev/null || true)
    fi
fi

if [ -z "$EXTERNAL_IP" ]; then
    echo "WARNING: EXTERNAL_IP not set and could not be auto-detected. TURN relay may fail behind NAT."
    EXTERNAL_IP="0.0.0.0"
fi

if [ -z "$COTURN_SECRET" ]; then
    echo "ERROR: COTURN_SECRET environment variable is required."
    exit 1
fi

export EXTERNAL_IP
export COTURN_SECRET

# ── Generate runtime config ────────────────────────────────────
envsubst < /etc/turnserver.conf.template > /etc/turnserver.conf

echo "[Coturn] Starting with external IP: $EXTERNAL_IP"
exec turnserver -c /etc/turnserver.conf -f -v
