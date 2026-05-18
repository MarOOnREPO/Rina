# Rina — Fresh Server Deployment Guide

**Target:** AWS Lightsail Ubuntu 22.04+ (or any VPS with Docker)  
**When to use this:** You have a completely blank server and want to deploy Rina from scratch.  
**Time required:** ~15–20 minutes  
**Last updated:** 2026-05-18

---

## Table of Contents

1. [What This Guide Covers](#what-this-guide-covers)
2. [Pre-Flight Checklist](#pre-flight-checklist)
3. [Server Setup](#server-setup)
4. [First-Time Installation](#first-time-installation)
5. [Post-Install Verification](#post-install-verification)
6. [Automated Backups](#automated-backups)
7. [Firewall](#firewall)
8. [Updating the App](#updating-the-app)
9. [Complete Reset](#complete-reset)
10. [Troubleshooting](#troubleshooting)
11. [Quick Command Reference](#quick-command-reference)

---

## What This Guide Covers

This guide assumes you are starting from a **fresh, empty Ubuntu server** with nothing installed. It covers:

- Installing Docker, Git, and OpenSSL
- Cloning the repository
- Running the interactive install script
- Verifying every component works
- Setting up automated database backups
- Configuring the firewall
- Updating the app via git push or CI/CD

**If you are updating an existing deployment,** skip to [Updating the App](#updating-the-app).

---

## Pre-Flight Checklist

Do these **before** you SSH into the server. Every item here is a hard requirement.

| # | Requirement | How to Verify |
|---|-------------|---------------|
| 1 | **Domain DNS** — A-record points to your server IP | `dig +short your-domain.com` returns your Lightsail IP |
| 2 | **AWS S3 Bucket** — Exists and is accessible | Check AWS Console → S3 |
| 3 | **AWS IAM User** — Has `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` | Check IAM → Policies |
| 4 | **Lightsail Firewall** — Ports 2222 (SSH), 80, 443 are open | Lightsail Console → Networking → Firewall |
| 5 | **GitHub Secrets (CI/CD only)** — `SSH_PRIVATE_KEY`, `REMOTE_HOST`, `REMOTE_USER`, `VITE_MAPBOX_TOKEN` | Repo Settings → Secrets and variables → Actions |

**If any item is missing, stop here and fix it.** The install script cannot succeed without these.

---

## Server Setup

### 1. Connect to Your Server

```bash
ssh -p 2222 ubuntu@YOUR_SERVER_IP
```

> **Note:** Lightsail's default user is `ubuntu`. If you changed it during instance creation, use that username instead.

### 2. Update the System

```bash
sudo apt update && sudo apt upgrade -y
```

**If this hangs or fails:**
```bash
# Test internet connectivity
curl -I https://archive.ubuntu.com

# If that fails, check DNS
nslookup archive.ubuntu.com

# If DNS fails, check Lightsail networking firewall allows ALL outbound
```

### 3. Install Docker & Docker Compose

Run these commands **exactly as written:**

```bash
sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
```

**Critical:** After `usermod`, you **must** log out and SSH back in. Docker commands will fail with "permission denied" until you do.

**Verify Docker works:**
```bash
# Run this AFTER re-logging in
docker --version
docker compose version
docker run hello-world
```

Expected output:
- `docker --version` → `Docker version 24.x.x` or `25.x.x`
- `docker compose version` → `v2.x.x`
- `docker run hello-world` → prints "Hello from Docker!"

**If `docker run hello-world` fails with permission denied:** You did not log out after `usermod`. Exit your SSH session and reconnect.

### 4. Install Git & OpenSSL

```bash
sudo apt install -y git openssl
```

### 5. Add Swap (Strongly Recommended)

Lightsail instances are small. Without swap, the Linux OOM killer will randomly kill containers.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make it permanent across reboots
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verify: `free -h` should show a `Swap:` line with ~2.0G.

---

## First-Time Installation

### 1. Clone the Repository

```bash
cd ~
git clone https://github.com/MarOOnREPO/Rina.git
cd Rina
```

If this is a private repository, use SSH instead:
```bash
git clone git@github.com:MarOOnREPO/Rina.git
```

### 2. Run the Install Script

```bash
./scripts/install.sh
```

The script is fully interactive. Below is exactly what you will see and what to enter.

#### Interactive Prompts

| Prompt | Example Input | Notes |
|--------|--------------|-------|
| Domain name | `rina.example.com` | Must match your DNS A-record **exactly** |
| Email address | `you@example.com` | Let's Encrypt will email you about expiry |
| Maroon login password | `your-secret-password` | Plain text — script hashes it automatically |
| Rina login password | `your-secret-password` | Plain text — script hashes it automatically |
| AWS Access Key ID | `AKIA...` | From your IAM user credentials |
| AWS Secret Access Key | `wJalrXUtnFEMI...` | Hidden while typing |
| S3 Bucket name | `rina-uploads` | Must already exist in AWS |
| AWS Region | *(press Enter)* | Defaults to `us-east-1` |
| TMDB API Key | *(press Enter)* | Optional — for movie watchlist |
| Mapbox Token | `pk.eyJ1...` | Optional — **required for 3D map to work** |

#### What the Script Does Internally

1. Validates Docker, Compose, Git, and OpenSSL are present
2. Generates cryptographically secure secrets:
   - `POSTGRES_PASSWORD` (32-byte hex)
   - `JWT_SECRET` / `COOKIE_SECRET` (64-byte base64)
   - `COTURN_SECRET` (32-byte hex)
3. Hashes both passwords with bcrypt (cost factor 12) using a temporary Docker container
4. Generates Web Push VAPID keys using a temporary Docker container
5. Writes `.env` with `chmod 600` (only owner can read)
6. Builds the frontend inside Docker (`frontend/build/` is created)
7. Creates a dummy SSL certificate so nginx can start without real certs
8. Requests a real Let's Encrypt certificate via Certbot
9. Runs `./scripts/deploy.sh` to start all services

#### If `install.sh` Fails

**Stops at "Checking prerequisites":**
```bash
docker info
# If "permission denied", you forgot to re-login after usermod
# If "Cannot connect to daemon", Docker is not running:
sudo systemctl start docker
```

**Stops at "Hashing passwords":**
- The script runs `docker run --rm node:20-alpine ...`. If this hangs >2 minutes:
  ```bash
  sudo systemctl status docker
  # Check if Docker can reach the internet:
  docker run --rm alpine ping -c 3 8.8.8.8
  ```

**Stops at "Building frontend":**
```bash
# Check if frontend directory is writable
ls -ld frontend/
# Should show drwxr-xr-x and be owned by ubuntu:ubuntu

# If permission denied, fix with:
sudo chown -R $USER:$USER frontend/
```

**Stops at "Requesting real Let's Encrypt certificate":**

This is the #1 failure point on fresh deploys.

```bash
# 1. Verify DNS has propagated (run from your local machine)
dig +short your-domain.com
# MUST return your server IP. If not, wait and retry.

# 2. Verify port 80 is reachable from the internet
# From your LOCAL machine:
curl -I http://your-domain.com
# Should return HTTP 200 or 301, NOT "connection refused"

# 3. Check Certbot logs for the exact error
docker compose logs certbot

# 4. If rate limited, wait 1 hour then manually retry:
./scripts/init-ssl.sh your-domain.com you@example.com
```

**Stops at "Running first deploy":**
See the [Troubleshooting `deploy.sh`](#troubleshooting-deploysh) section below.

---

## Post-Install Verification

Run every check below. Do not skip any.

### Check 1: All Containers Are Running

```bash
cd ~/Rina
docker compose ps
```

Expected output — all rows show `Up` or `healthy`:
```
NAME            STATUS
rina-backend    Up 30 seconds (healthy)
rina-nginx      Up 30 seconds
rina-postgres   Up 30 seconds (healthy)
rina-redis      Up 30 seconds (healthy)
rina-certbot    Up 30 seconds
```

**If any container shows `Restarting` or ` unhealthy`:**
```bash
docker compose logs --tail 50 <service-name>
# Example:
docker compose logs --tail 50 backend
```

### Check 2: Health Endpoint Responds

```bash
curl -sf https://your-domain.com/api/health
```

Expected: `{"status":"healthy","timestamp":"..."}`

**If `curl: (6) Could not resolve host`:**
- Your DNS A-record has not propagated. Wait 5–30 minutes and retry.

**If `curl: (7) Failed to connect`:**
- Nginx is not running: `docker compose ps | grep nginx`
- Firewall is blocking 443: `sudo ufw status`

**If `curl: (60) SSL certificate problem`:**
- Real certs were not obtained. Run: `./scripts/init-ssl.sh your-domain.com you@example.com`

**If HTTP 502 Bad Gateway:**
- Backend is down. See Check 3.

### Check 3: Backend Logs Are Clean

```bash
docker compose logs --tail 30 backend
```

Expected: No `[Fatal]` or `Error` lines. You should see:
```
[Prisma] Database connected successfully
[Server] HTTP server running on port 3000 (production)
[Socket.io] WebSocket server initialized at path /socket.io
[Yjs] WebSocket server initialized at path /yjs
```

**If you see `[Fatal] JWT_SECRET must be set`:**
- `.env` is missing or corrupted. Re-run `./scripts/install.sh` or manually recreate `.env` from `.env.example`.

**If you see Prisma migration errors:**
```bash
# Run migrations manually:
docker build --target builder -t rina-backend-builder ./backend
docker run --rm --network rina-data \
  -e DATABASE_URL="postgresql://rina_user:YOUR_PASSWORD@postgres:5432/rina_db" \
  rina-backend-builder npx prisma migrate deploy
```

### Check 4: Login Works Over HTTPS

1. Open `https://your-domain.com` in a browser.
2. Log in as `maroon` with the password you entered during install.
3. Log out and log in as `rina`.

**If login fails / immediately redirects back to login:**
1. **You MUST use `https://`.** Auth cookies are `secure: true` and are rejected over HTTP.
2. Check `CORS_ORIGIN` in `.env` matches exactly: `https://your-domain.com` (no trailing slash).
3. Check backend logs for bcrypt comparison errors.

### Check 5: Real-Time Features Work

Open the **Chat** page in two different browsers (or incognito windows). Log in as different users.

- Send a message — it should appear instantly on the other side.
- Check the browser console for `[Socket.io] Connected`.

**If chat messages do not appear:**
```bash
# Check nginx WebSocket headers
docker compose logs nginx | grep -i "upgrade"

# Check browser Network tab for /socket.io/ requests
# Look for 400 or 403 status codes
```

### Check 6: Map Page Loads (If You Provided Mapbox Token)

Open `https://your-domain.com/map`. The 3D globe should render.

**If the map is blank / gray:**
- The token was either not provided during install or is invalid.
- You must rebuild the frontend after adding the token:
  ```bash
  cd ~/Rina/frontend
  docker run --rm -v "$PWD:/app" -w /app -e VITE_MAPBOX_TOKEN="YOUR_TOKEN" node:20-alpine sh -c 'npm ci && npm run build'
  cd ..
  ./scripts/deploy.sh
  ```

---

## Automated Backups

The app includes `scripts/backup-db.sh` which dumps Postgres to S3.

### 1. Schedule with Cron

```bash
crontab -e
```

Add this line:
```cron
0 3 * * * /home/ubuntu/Rina/scripts/backup-db.sh >> /home/ubuntu/Rina/backups/backup.log 2>&1
```

This runs every night at 03:00.

### 2. Test the Backup Script

```bash
cd ~/Rina
./scripts/backup-db.sh
```

Expected output:
```
🐘 Dumping database...
☁️  Uploading to S3...
✅ Backup uploaded: s3://your-bucket/backups/rina_backup_YYYYMMDD_HHMMSS.sql.gz
```

**If it fails:**
- Verify `.env` contains `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`.
- Verify the IAM policy allows `s3:PutObject` on `arn:aws:s3:::your-bucket/backups/*`.
- Check `backups/` directory exists: `mkdir -p backups`

---

## Firewall

Expose only the ports Nginx needs. Never expose port 3000 (backend) directly.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

Verify:
```bash
sudo ufw status
```

Expected:
```
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
```

---

## Updating the App

### Method A: Git Push-to-Deploy (Fastest)

**One-time server setup:**
```bash
cd ~/Rina
./scripts/git-setup.sh
```

**On your local machine:**
```bash
git remote add vps ssh://ubuntu@YOUR_SERVER_IP:2222/home/ubuntu/rina.git
git push vps main
```

The server automatically checks out the code and runs `./scripts/deploy.sh`.

**If push fails:**
```bash
# Test SSH connectivity from your local machine:
ssh -p 2222 ubuntu@YOUR_SERVER_IP

# If that works, test git access:
ssh -p 2222 ubuntu@YOUR_SERVER_IP "ls -la /home/ubuntu/rina.git"
```

### Method B: GitHub Actions CI/CD

Push to `main`. The workflow at `.github/workflows/deploy.yml` handles the rest.

**Required GitHub Secrets:**

| Secret | Value |
|--------|-------|
| `SSH_PRIVATE_KEY` | Full private key content (including `-----BEGIN OPENSSH PRIVATE KEY-----`) |
| `REMOTE_HOST` | `your-domain.com` |
| `REMOTE_USER` | `ubuntu` |
| `VITE_MAPBOX_TOKEN` | Your Mapbox public token (required for map to work) |

**If the GitHub Action fails:**
1. Go to Actions tab → click the failed run → expand the failed step.
2. **"Lint & Type Check Frontend" failed** → Fix the code and push again.
3. **"Deploy to Server (rsync)" failed** → SSH key is wrong or `REMOTE_USER` cannot write to `/home/ubuntu/rina`. SSH to the server and run `ls -ld /home/ubuntu/rina`.
4. **"Post-deploy Health Check" failed** → The app deployed but crashed. SSH to the server and run `docker compose logs backend`.

### Method C: Manual Update

```bash
ssh -p 2222 ubuntu@YOUR_SERVER_IP
cd ~/Rina
git pull origin main
./scripts/deploy.sh
```

---

## Complete Reset

**⚠️ This deletes all data including the database. Only do this if you truly want to start from zero.**

```bash
cd ~

# Stop containers and DELETE volumes (including Postgres data)
docker compose -f Rina/docker-compose.yml down -v

# Delete the application code
sudo rm -rf Rina

# Now repeat from "Clone the Repository" above
```

> **Before resetting:** If you have data you want to keep, run `./scripts/backup-db.sh` first.

---

## Troubleshooting

### `deploy.sh` Failures

#### "Postgres did not become ready in time"

```bash
# View Postgres logs
docker compose logs postgres

# Most common cause: existing volume with wrong password
# If you changed POSTGRES_PASSWORD in .env but the old volume exists,
# Postgres refuses to start. You must delete the volume:
docker compose down -v
# Then re-run ./scripts/deploy.sh
# WARNING: This deletes all database data.
```

#### "Health check failed" after deploy

```bash
# The backend crashed during startup. Get the exact error:
docker compose logs --tail 50 backend

# Common causes and fixes:
# - Missing env var → check .env and re-run install.sh
# - Prisma engine not found → rebuild backend image: docker compose up -d --build --no-deps backend
# - Port 3000 already in use → sudo lsof -i :3000 && sudo kill <PID>
```

#### 502 Bad Gateway in Browser

```bash
# 1. Check if backend is running
docker compose ps backend

# 2. Check if backend is healthy inside its container
docker compose exec backend wget -qO- http://localhost:3000/api/health

# 3. If the above returns "healthy", the issue is nginx → backend networking.
#    Check nginx error logs:
docker compose logs nginx

# 4. If backend is not running, check why:
docker compose logs --tail 100 backend
```

### SSL / HTTPS Issues

#### Browser shows "Your connection is not private"

```bash
# Check if real certs exist
docker compose run --rm -v certbot-data:/etc/letsencrypt nginx \
  ls -la /etc/letsencrypt/live/your-domain.com/

# Expected files:
# fullchain.pem  privkey.pem  chain.pem

# If files are missing, re-run:
./scripts/init-ssl.sh your-domain.com you@example.com

# If files exist but nginx still serves dummy cert:
docker compose restart nginx
```

#### Certbot rate limit error

Let's Encrypt allows **5 failed attempts per hour** per domain. If you hit this:

```bash
# Wait 1 hour, then retry:
./scripts/init-ssl.sh your-domain.com you@example.com
```

### Login Issues

#### "Invalid credentials" even with correct password

```bash
# Check that the password hashes in .env were generated correctly.
# The hashes should start with $2a$12$...
grep PASSWORD_HASH .env

# If they look wrong (empty, or not starting with $2a$), re-run install.sh
# or manually regenerate:
docker run --rm node:20-alpine sh -c \
  "npm install bcryptjs@2.4.3 --no-save && node -e 'require(\"bcryptjs\").hash(\"YOUR_PASSWORD\", 12).then(console.log)'"
```

#### Login works but immediately logs out on page refresh

1. Ensure you are accessing via `https://` (not `http://`).
2. Check `CORS_ORIGIN` in `.env` is exactly `https://your-domain.com` with no trailing slash.
3. Check browser DevTools → Application → Cookies. The `rina_auth_token` cookie should have `Secure` and `SameSite=Strict`. If missing, the backend is not setting it correctly — check backend logs.

### File Upload Issues

```bash
# Test AWS credentials from inside the backend container
docker compose exec backend sh -c \
  "npm install @aws-sdk/client-s3 --no-save && node -e 'new (require(\"@aws-sdk/client-s3\").S3Client)({region:\"us-east-1\"}).send(new (require(\"@aws-sdk/client-s3\").ListBucketsCommand)({})).then(console.log).catch(console.error)'"

# If this fails, your AWS credentials in .env are wrong.
```

### Out of Memory

Symptoms: Containers randomly restart, backend logs show `Killed`, or `dmesg` shows OOM killer activity.

```bash
# Check if swap exists
free -h

# If swap is 0, add it (see Server Setup step 5)

# Check current memory usage
docker stats --no-stream

# If consistently near limits, upgrade your Lightsail plan.
```

---

## Quick Command Reference

```bash
# === Logs ===
docker compose logs -f                    # All services
docker compose logs -f backend            # Backend only
docker compose logs -f nginx              # Nginx only
docker compose logs -f postgres           # Postgres only
docker compose logs -f certbot            # Certbot only

# === Container Management ===
docker compose ps                         # List containers
docker compose restart backend            # Restart one service
docker compose up -d --build              # Rebuild and start all
docker compose down                       # Stop all (keep data)
docker compose down -v                    # Stop all (DELETE data)

# === Debug Inside Containers ===
docker compose exec backend sh            # Shell into backend
docker compose exec backend env           # View env vars
docker compose exec backend wget -qO- http://localhost:3000/api/health

# === Database ===
docker compose exec postgres psql -U rina_user -d rina_db
docker build --target builder -t rina-backend-builder ./backend
docker run --rm --network rina-data -e DATABASE_URL="postgresql://rina_user:PASSWORD@postgres:5432/rina_db" rina-backend-builder npx prisma migrate deploy

# === SSL ===
docker compose run --rm -v certbot-data:/etc/letsencrypt nginx openssl x509 -in /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem -noout -dates
./scripts/init-ssl.sh YOUR_DOMAIN you@example.com

# === Backup ===
./scripts/backup-db.sh
```

---

## Environment Variables Reference

These are written to `.env` by `install.sh`. You should rarely need to edit them manually.

| Variable | Set By | Purpose |
|----------|--------|---------|
| `DOMAIN` | You | Public domain for SSL and CORS |
| `POSTGRES_PASSWORD` | Auto-generated | Database password |
| `JWT_SECRET` | Auto-generated | JWT signing key (≥32 chars) |
| `COOKIE_SECRET` | Auto-generated | Cookie signing key (must differ from JWT) |
| `CORS_ORIGIN` | Script (`https://${DOMAIN}`) | Production CORS origin |
| `REDIS_URL` | Hardcoded | `redis://redis:6379` |
| `AWS_REGION` | You | S3 region |
| `AWS_ACCESS_KEY_ID` | You | S3 IAM key |
| `AWS_SECRET_ACCESS_KEY` | You | S3 IAM secret |
| `S3_BUCKET_NAME` | You | S3 bucket for uploads |
| `MAROON_PASSWORD_HASH` | Auto-generated | Bcrypt hash of Maroon's password |
| `RINA_PASSWORD_HASH` | Auto-generated | Bcrypt hash of Rina's password |
| `TMDB_API_KEY` | You | Optional — movie database API |
| `VITE_MAPBOX_TOKEN` | You | Optional — required for 3D map |
| `VAPID_PUBLIC_KEY` | Auto-generated | Web Push public key |
| `VAPID_PRIVATE_KEY` | Auto-generated | Web Push private key |
| `COTURN_REALM` | Script (`${DOMAIN}`) | TURN server realm |
| `COTURN_SECRET` | Auto-generated | TURN server shared secret |
| `NODE_ENV` | Hardcoded | `production` |
| `PORT` | Hardcoded | `3000` |

---

**End of Guide.**
