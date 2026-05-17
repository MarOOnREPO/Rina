# 🚀 Project Rina — Deployment Guide

## AWS Lightsail VPS (Ubuntu 22.04+)

### 1. Instance Setup

**Lightsail Ports to Open:**
| Port | Protocol | Purpose |
|------|----------|---------|
| 22   | TCP      | SSH access |
| 80   | TCP      | HTTP → redirects to HTTPS |
| 443  | TCP      | HTTPS (Nginx) |
| 3478 | UDP/TCP  | Coturn STUN/TURN (WebRTC NAT traversal) |
| 5349 | UDP/TCP  | Coturn TLS relay |
| 49152-65535 | UDP | Coturn media relay ports |

> **Do NOT open port 3000 or 9000 to the public.** These are internal Docker ports only.

### 2. Server Provisioning

SSH into your Lightsail instance and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

### 3. DNS Setup

Point your domain (e.g., `rina.yourdomain.com`) to your Lightsail **static IP** using an A record.

### 4. Build Frontend Locally

Nginx serves the pre-built frontend from `frontend/build`. You must build it on your local machine **before** syncing to the server:

```bash
cd frontend
npm ci
npm run build
cd ..
```

### 5. Copy Project to Server

```bash
# On your local machine — sync everything except dev artifacts
rsync -avz \
  --exclude='.git' \
  --exclude='**/node_modules' \
  --exclude='backend/dist' \
  ./ ubuntu@YOUR_LIGHTSAIL_IP:/home/ubuntu/rina

# SSH in
ssh ubuntu@YOUR_LIGHTSAIL_IP
cd /home/ubuntu/rina

# Create and edit environment file
cp .env.example .env
nano .env
```

### 6. Environment Variables (.env)

```env
# ─── Database ───
POSTGRES_PASSWORD=change_this_to_a_secure_random_string_64_chars

# ─── JWT Authentication ───
JWT_SECRET=generate_a_random_64_char_string_here_maroonlovesrina2026

# ─── Cookie Signing (must differ from JWT_SECRET) ───
COOKIE_SECRET=generate_another_random_64_char_string

# ─── CORS Origin ───
CORS_ORIGIN=https://rina.yourdomain.com

# ─── MinIO / S3-Compatible Storage ───
MINIO_ACCESS_KEY=rina_minio_access_32chars
MINIO_SECRET_KEY=rina_minio_secret_64chars_change_me
S3_BUCKET_NAME=rina-uploads
AWS_REGION=us-east-1

# ─── TMDB API (get free key at https://www.themoviedb.org/settings/api) ───
TMDB_API_KEY=your_tmdb_api_key_here

# ─── Mapbox (Frontend Build Variable) ───
# This goes in frontend/.env.local for build time:
# VITE_MAPBOX_TOKEN=pk.your_mapbox_token

# ─── Web Push VAPID Keys ───
# Generate with: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key

# ─── Coturn TURN Server (WebRTC) ───
COTURN_REALM=your-domain.com
COTURN_SECRET=generate_a_random_turn_secret_here

# ─── Application ───
NODE_ENV=production
```

### 7. Build & Run

**Option A — Use the deploy script (recommended):**

```bash
cd /home/ubuntu/rina
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

**Option B — Manual steps:**

```bash
cd /home/ubuntu/rina

# Build and start everything
docker compose up -d --build

# Wait for Postgres, then run migrations inside the Docker network
docker build --target builder -t rina-backend-builder ./backend
docker run --rm \
  --network rina-network \
  -e DATABASE_URL="postgresql://rina_user:${POSTGRES_PASSWORD}@postgres:5432/rina_db" \
  rina-backend-builder \
  npx prisma migrate deploy

# Check logs
docker compose logs -f backend
docker compose logs -f nginx
```

### 8. SSL / HTTPS (Let's Encrypt)

```bash
# Install Certbot
docker run -it --rm \
  -v certbot-data:/etc/letsencrypt \
  -v certbot-www:/var/www/certbot \
  certbot/certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  -d rina.yourdomain.com \
  --agree-tos --no-eff-email -m your-email@example.com

# Then update nginx/default.conf with your domain and uncomment the HTTPS block
# Reload Nginx:
docker compose exec nginx nginx -s reload
```

### 9. Auto-Renewal (CRON)

```bash
sudo crontab -e
# Add:
0 3 * * * docker run --rm -v certbot-data:/etc/letsencrypt -v certbot-www:/var/www/certbot certbot/certbot renew --quiet && docker compose exec nginx nginx -s reload
```

### 10. Updating After Code Changes

1. Build the frontend locally (`cd frontend && npm run build`).
2. Re-run the deploy script on the server:

```bash
cd /home/ubuntu/rina
git pull origin main   # or rsync again
./scripts/deploy.sh
```

---

## 🛡️ Security Checklist

- [ ] UFW firewall active: `sudo ufw enable && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`
- [ ] `.env` file has `chmod 600 .env`
- [ ] `POSTGRES_PASSWORD` is 32+ random characters
- [ ] `JWT_SECRET` is 32+ random characters
- [ ] `COOKIE_SECRET` is different from `JWT_SECRET`
- [ ] MinIO keys are changed from defaults
- [ ] SSH key auth only (disable password login)
- [ ] Automatic security updates: `sudo apt install -y unattended-upgrades`
- [ ] Coturn server uses `static-auth-secret` for TURN relay

---

## 🛠️ Troubleshooting

**Backend crashes with "Prisma Client could not be found"**
> The backend Dockerfile must generate the Prisma Client in the production stage. If the runner stage does not run `npx prisma generate` after `npm ci --omit=dev`, add the following line to `backend/Dockerfile` after the production `npm ci`:
> ```dockerfile
> RUN npx prisma generate
> ```

**Nginx serves a blank page**
> Ensure `frontend/build` exists on the server and was synced by rsync. The rsync command above explicitly keeps `frontend/build` while excluding `backend/dist`.

**Migrations fail with "connection refused"**
> Do not run `npx prisma migrate deploy` directly on the host — Postgres is not exposed to the host. Use the builder container method shown in Step 7 or run `./scripts/deploy.sh`.
