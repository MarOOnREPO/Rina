# Rina — Fresh Server Deployment Guide

**Target Environment:** AWS Lightsail (Ubuntu 22.04+) or any VPS with Docker support  
**Last Updated:** 2026-05-18  
**Prerequisites:** Domain with A-record → server IP, AWS S3 bucket + IAM user

---

## 0. Pre-Flight Checklist (Do These First)

Before touching the server, confirm:

1. [ ] **Domain DNS:** Your domain's A-record points to the Lightsail instance public IP.  
   Verify: `dig +short your-domain.com` should return your server IP.
2. [ ] **AWS S3:** Bucket exists. IAM user has `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`.
3. [ ] **Ports:** Lightsail networking firewall allows **22 (SSH), 80 (HTTP), 443 (HTTPS)**.
4. [ ] **GitHub Secrets (for CI/CD only):** `SSH_PRIVATE_KEY`, `REMOTE_HOST`, `REMOTE_USER`, `VITE_MAPBOX_TOKEN`.

---

## 1. Server Preparation

SSH into your fresh Ubuntu instance as `ubuntu` (or your default user):

```bash
ssh ubuntu@YOUR_SERVER_IP
```

### 1.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
```

**If this fails:** Check internet connectivity: `curl -I https://archive.ubuntu.com`. If blocked, check Lightsail firewall rules.

### 1.2 Install Docker & Docker Compose

```bash
# Install prerequisites
sudo apt install -y ca-certificates curl gnupg

# Add Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine + Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to docker group (REQUIRED — logout and SSH back in after this)
sudo usermod -aG docker $USER
```

**Verify:**
```bash
docker --version        # Should print 24.x or 25.x
docker compose version  # Should print 2.x
```

**If `docker compose` fails:** You may need to log out and SSH back in for the group change to take effect. Run `groups` — if `docker` is not listed, re-login.

### 1.3 Install Git & OpenSSL

```bash
sudo apt install -y git openssl
```

### 1.4 (Recommended) Configure Swap

Lightsail instances are small. Add 2GB swap to prevent OOM kills:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verify: `free -h` should show swap.

---

## 2. Clone the Repository

```bash
cd ~
git clone https://github.com/MarOOnREPO/Rina.git
cd Rina
```

**If you use a private repo:** Ensure SSH keys are configured or use a personal access token.

---

## 3. Run the Interactive Install Script

```bash
./scripts/install.sh
```

### 3.1 What the Script Will Ask For

| Prompt | What to Enter | Debug Note |
|--------|--------------|------------|
| Domain name | `your-domain.com` | Must match your DNS A-record exactly |
| Email address | `you@example.com` | For Let's Encrypt SSL registration |
| Maroon password | Your chosen password | Plain text — script hashes it with bcrypt |
| Rina password | Your chosen password | Plain text — script hashes it with bcrypt |
| AWS Access Key ID | From your IAM user | |
| AWS Secret Access Key | From your IAM user | Hidden input |
| S3 Bucket name | e.g. `rina-uploads` | |
| AWS Region | Press Enter for `us-east-1` | |
| TMDB API Key | Optional — press Enter to skip | |
| Mapbox Token | Optional — press Enter to skip | Required for the 3D map feature |

### 3.2 What the Script Does (Step-by-Step)

1. **Validates prerequisites** (Docker, Compose, Git, OpenSSL)
2. **Generates secrets** automatically:
   - `POSTGRES_PASSWORD` — 32-byte hex
   - `JWT_SECRET` / `COOKIE_SECRET` — 64-byte base64
   - `COTURN_SECRET` — 32-byte hex
3. **Hashes passwords** with bcrypt (cost factor 12) via temporary Node.js Docker container
4. **Generates VAPID keys** for Web Push via temporary Docker container
5. **Writes `.env`** with `chmod 600`
6. **Builds the frontend** inside a Docker container (outputs to `frontend/build/`)
7. **Bootstraps a dummy SSL certificate** so nginx can start immediately
8. **Obtains a real Let's Encrypt certificate** via Certbot
9. **Runs `./scripts/deploy.sh`** which starts all services

### 3.3 If `install.sh` Fails

**Failure at "Checking prerequisites":**
- Run `docker info` manually. If permission denied, you forgot to re-login after `usermod -aG docker`.

**Failure at "Hashing passwords":**
- The script runs `docker run --rm node:20-alpine ...`. If this hangs, check Docker daemon: `sudo systemctl status docker`.

**Failure at "Building frontend":**
- The script mounts `frontend/` into a container and runs `npm ci && npm run build`.
- If it fails with "permission denied", check that `frontend/` is writable: `ls -la frontend/`.
- If Mapbox token was provided but the map doesn't work later, the token was passed correctly — verify the token itself at Mapbox dashboard.

**Failure at "Requesting real Let's Encrypt certificate":**
- **Most common cause:** Domain DNS A-record has not propagated yet. Verify: `dig +short your-domain.com`
- **Second most common:** Port 80 is not open in Lightsail firewall. Certbot needs HTTP access for ACME challenges.
- Check Certbot logs: `docker compose logs certbot`
- If it fails repeatedly, you may have hit Let's Encrypt rate limits. Wait 1 hour and re-run: `./scripts/init-ssl.sh your-domain.com you@example.com`

**Failure at "Running first deploy":**
- See Section 4 (Troubleshooting `deploy.sh`).

---

## 4. Understanding `deploy.sh`

The install script calls `deploy.sh` at the end. You will also run this script manually for every update.

### 4.1 What `deploy.sh` Does

1. Checks `.env` exists and `POSTGRES_PASSWORD` is set
2. Checks Docker is running
3. If SSL certs are missing, bootstraps dummy certs
4. Starts Postgres and waits for it to be ready (max 60 seconds)
5. **Runs Prisma migrations** using a temporary builder container
6. Builds and starts all services via `docker compose up -d --build`
7. Performs a health check on `https://YOUR_DOMAIN/api/health`
8. Prunes dangling Docker images

### 4.2 Run It Manually

```bash
cd ~/Rina
./scripts/deploy.sh
```

### 4.3 If `deploy.sh` Fails

**"Postgres did not become ready in time":**
```bash
# Check Postgres logs
docker compose logs postgres

# Common causes:
# - Corrupt volume: docker compose down -v (DELETES DATA — backup first!)
# - Wrong password in .env vs existing volume: delete volume and retry
```

**"Health check failed" after deploy:**
```bash
# Check backend logs — this is where the real error is
docker compose logs -f backend

# Common causes:
# - Missing env vars: docker compose exec backend env | grep JWT
# - Prisma migration failure: docker compose logs backend | grep -i prisma
# - Port conflict: sudo lsof -i :3000
```

**"502 Bad Gateway" in browser:**
```bash
# Nginx is running but backend is not healthy or not reachable
docker compose ps          # Check backend status
docker compose logs backend

# Verify backend is listening inside the container:
docker compose exec backend wget -qO- http://localhost:3000/api/health
```

**SSL certificate errors in browser:**
```bash
# Check if real certs exist:
docker compose run --rm -v certbot-data:/etc/letsencrypt nginx ls -la /etc/letsencrypt/live/YOUR_DOMAIN/

# If missing or expired, re-run:
./scripts/init-ssl.sh YOUR_DOMAIN you@example.com
```

---

## 5. Post-Install Verification

Run these commands in order. Every single one should succeed before you consider the deploy complete.

### 5.1 Container Health

```bash
cd ~/Rina
docker compose ps
```

Expected: All containers show `healthy` or `up`.

### 5.2 API Health Endpoint

```bash
curl -sf https://YOUR_DOMAIN/api/health && echo "✅ OK"
```

Expected: `{"status":"healthy","timestamp":"..."}`

**If this fails:**
- `curl: (6) Could not resolve host` → DNS not propagated yet
- `curl: (7) Failed to connect` → Firewall blocking 443 or nginx not running
- `curl: (60) SSL certificate problem` → Certs not ready; check `init-ssl.sh`
- HTTP 502 → Backend is down; check `docker compose logs backend`

### 5.3 Login Test

Open `https://YOUR_DOMAIN` in a browser and log in with both accounts.

**If login fails:**
1. Check you're on `https://` not `http://`. Cookies are `secure: true` and will not work over HTTP.
2. Check password hashes in `.env` match what you entered during install.
3. Check backend logs for "Invalid credentials" or bcrypt errors.

### 5.4 WebSocket Test

Open the browser console on the chat page. Look for:
```
[Socket.io] Connected
```

**If WebSocket fails:**
- Check nginx WebSocket proxy headers: `docker compose logs nginx | grep -i upgrade`
- Check browser Network tab for `/socket.io/` requests returning 400 or 403.

---

## 6. Automated Backups

Edit crontab:
```bash
crontab -e
```

Add:
```cron
0 3 * * * /home/ubuntu/Rina/scripts/backup-db.sh >> /home/ubuntu/Rina/backups/backup.log 2>&1
```

Test once manually:
```bash
./scripts/backup-db.sh
```

**If backup fails:**
- Check `.env` has `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
- Verify IAM permissions on the S3 bucket
- Check `backups/` directory exists and is writable

---

## 7. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

**Do NOT expose port 3000.** Nginx is the only public entrypoint.

---

## 8. Updating the Application

### Option A: Git Push-to-Deploy (Recommended)

**On the server (one-time setup):**
```bash
cd ~/Rina
./scripts/git-setup.sh
```

**On your local machine:**
```bash
git remote add vps ssh://ubuntu@YOUR_IP/home/ubuntu/rina.git
git push vps main
```

The `post-receive` hook auto-runs `deploy.sh`.

### Option B: GitHub Actions CI/CD

Push to `main`. The workflow (`.github/workflows/deploy.yml`) will:
1. Lint & type-check
2. Build frontend (with `VITE_MAPBOX_TOKEN` from secrets)
3. Rsync to server
4. Run `deploy.sh`
5. Curl health endpoint to verify

**Required GitHub Secrets:**
- `SSH_PRIVATE_KEY` — Private key for server access
- `REMOTE_HOST` — Your domain or IP
- `REMOTE_USER` — `ubuntu`
- `VITE_MAPBOX_TOKEN` — Required for map feature to work in the built frontend

**If CI deploy fails:**
- Check Actions logs for the specific failed step
- If rsync fails: verify SSH key is correct and user has write access to `/home/ubuntu/rina`
- If health check fails: SSH to server and run `docker compose logs backend`

### Option C: Manual Update

```bash
ssh ubuntu@YOUR_IP
cd ~/Rina
git pull origin main
./scripts/deploy.sh
```

---

## 9. Complete Reset (Delete Everything)

**⚠️ WARNING: This destroys all data.**

```bash
cd ~
docker compose -f Rina/docker-compose.yml down -v
sudo rm -rf Rina
# Then repeat from Step 2 (git clone)
```

---

## 10. Quick Reference: Debug Commands

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f postgres
docker compose logs -f certbot

# Restart a single service
docker compose restart backend

# Shell into backend container
docker compose exec backend sh

# Check env vars inside container
docker compose exec backend env

# Test database connectivity from backend
docker compose exec backend wget -qO- http://localhost:3000/api/health

# Manual database migration (if needed)
docker build --target builder -t rina-backend-builder ./backend
docker run --rm --network rina-data -e DATABASE_URL="postgresql://rina_user:PASSWORD@postgres:5432/rina_db" rina-backend-builder npx prisma migrate deploy

# Check SSL cert expiry
docker compose run --rm -v certbot-data:/etc/letsencrypt nginx openssl x509 -in /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem -noout -dates

# Force SSL renewal
docker compose run --rm certbot certonly --webroot -w /var/www/certbot --email you@example.com -d YOUR_DOMAIN --force-renewal
```

---

## 11. Common Errors & Exact Fixes

| Symptom | Root Cause | Exact Fix |
|---------|-----------|-----------|
| Blank white page | `frontend/build` missing or empty | Run `./scripts/install.sh` frontend build step, or build locally and rsync |
| 502 Bad Gateway | Backend crashed or not healthy | `docker compose logs backend` → fix error → `./scripts/deploy.sh` |
| Login fails / redirects to login | HTTP instead of HTTPS, or cookie issue | Ensure `https://` in URL. Check `CORS_ORIGIN=https://your-domain.com` in `.env` |
| SSL browser warning | Dummy cert still active | Run `./scripts/init-ssl.sh domain email` |
| Uploads fail | AWS credentials or bucket policy | Verify IAM user has S3 permissions. Check `S3_BUCKET_NAME` in `.env` |
| Map doesn't load | Missing `VITE_MAPBOX_TOKEN` at build time | Add token to `.env`, rebuild frontend, ensure CI secret is set |
| Whiteboard offline | Wrong WebSocket path | Should connect to `/yjs` — already fixed in codebase |
| Out of Memory | Instance too small | Add swap (Step 1.4) or upgrade Lightsail plan |
| "Migration failed" | Schema drift or locked migration | `docker compose exec postgres psql -U rina_user -d rina_db` → check `_prisma_migrations` table |

---

**End of Guide.**
