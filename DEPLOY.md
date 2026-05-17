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

### 4. Application Deploy

```bash
# On your local machine, copy the project to the server
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='build' \
  ./ ubuntu@YOUR_LIGHTSAIL_IP:/home/ubuntu/rina

# SSH in
cd /home/ubuntu/rina

# Create environment file
cp .env.example .env
nano .env
```

### 5. Environment Variables (.env)

```env
# ─── Database ───
POSTGRES_PASSWORD=change_this_to_a_secure_random_string_64_chars

# ─── JWT Authentication ───
JWT_SECRET=generate_a_random_64_char_string_here_maroonlovesrina2026

# ─── MinIO / S3-Compatible Storage ───
MINIO_ACCESS_KEY=rina_minio_access_32chars
MINIO_SECRET_KEY=rina_minio_secret_64chars_change_me
S3_BUCKET_NAME=rina-uploads
AWS_REGION=us-east-1

# ─── TMDB API (get free key at https://www.themoviedb.org/settings/api) ───
TMDB_API_KEY=your_tmdb_api_key_here

# ─── Mapbox (get token at https://account.mapbox.com) ───
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

### 6. Build & Run

```bash
cd /home/ubuntu/rina

# Build and start everything
docker compose up -d --build

# Check logs
docker compose logs -f backend
docker compose logs -f nginx

# Create database tables and seed
 cd backend && npx prisma migrate deploy && npx prisma db seed
```

### 7. SSL / HTTPS (Let's Encrypt)

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

### 8. Auto-Renewal (CRON)

```bash
sudo crontab -e
# Add:
0 3 * * * docker run --rm -v certbot-data:/etc/letsencrypt -v certbot-www:/var/www/certbot certbot/certbot renew --quiet && docker compose exec nginx nginx -s reload
```

### 9. Updating After Code Changes

```bash
cd /home/ubuntu/rina
git pull origin main  # or rsync again
docker compose down
docker compose up -d --build
cd backend && npx prisma migrate deploy
```

---

## 🛡️ Security Checklist

- [ ] UFW firewall active: `sudo ufw enable && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`
- [ ] `.env` file has `chmod 600 .env`
- [ ] `POSTGRES_PASSWORD` is 32+ random characters
- [ ] `JWT_SECRET` is 32+ random characters
- [ ] MinIO keys are changed from defaults
- [ ] SSH key auth only (disable password login)
- [ ] Automatic security updates: `sudo apt install -y unattended-upgrades`
- [ ] Coturn server uses `static-auth-secret` for TURN relay
