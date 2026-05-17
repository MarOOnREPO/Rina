# Deploy Rina on AWS Lightsail (Docker-only)

This guide assumes a fresh Ubuntu 22.04+ Lightsail instance with only **Docker** and **Docker Compose** installed.

---

## Prerequisites

- AWS Lightsail instance (minimum 1 vCPU, 2GB RAM recommended)
- Domain name with A-record pointing to your Lightsail public IP
- AWS S3 bucket created for file uploads and database backups
- AWS IAM user with programmatic access and the following S3 permissions:
  - `s3:PutObject`
  - `s3:GetObject`
  - `s3:DeleteObject`
- GitHub repository secrets configured (for CI/CD):
  - `SSH_PRIVATE_KEY`
  - `REMOTE_HOST` (your domain or IP)
  - `REMOTE_USER` (e.g., `ubuntu`)

---

## 1. Server Setup

SSH into your Lightsail instance and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Ensure Docker & Docker Compose are installed
docker --version
docker compose version

# Create project directory
mkdir -p ~/rina
cd ~/rina
```

---

## 2. Deploy Code to Server

**Option A: GitHub Actions (Recommended)**
Push to `main`. The workflow will rsync code to `/home/ubuntu/rina` and run `./scripts/deploy.sh`.

**Option B: Manual**
```bash
cd ~/rina
# Copy files from your local machine
rsync -avz --exclude='node_modules' --exclude='.git' ./ ubuntu@YOUR_IP:~/rina
```

---

## 3. Configure Environment

```bash
cd ~/rina
cp .env.example .env
chmod 600 .env
nano .env
```

**You MUST fill in every value.** Critical fields:

| Variable | How to set |
|----------|------------|
| `DOMAIN` | Your public domain (e.g., `rina.example.com`) |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
| `JWT_SECRET` | `openssl rand -base64 64 \| tr -d '\n'` |
| `COOKIE_SECRET` | Different from JWT_SECRET, same generation command |
| `AWS_ACCESS_KEY_ID` | From AWS IAM user |
| `AWS_SECRET_ACCESS_KEY` | From AWS IAM user |
| `S3_BUCKET_NAME` | Name of your S3 bucket |
| `MAROON_PASSWORD_HASH` | `node -e "require('bcryptjs').hash('your_password', 12).then(console.log)"` |
| `RINA_PASSWORD_HASH` | Same as above for the second user |
| `CORS_ORIGIN` | `https://your-domain.com` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

---

## 4. Initialize SSL Certificates

**Do this BEFORE the first deploy.** The app requires HTTPS for authentication.

```bash
cd ~/rina
./scripts/init-ssl.sh your-domain.com your-email@example.com
```

What this does:
1. Starts a temporary nginx on HTTP (port 80) to serve ACME challenges.
2. Runs Certbot (Let's Encrypt) via Docker.
3. Restores the full HTTPS nginx template and restarts nginx.
4. Adds your `DOMAIN` to `.env`.

The `certbot` container in `docker-compose.yml` will automatically renew the certificate every 12 hours.

---

## 5. Deploy the Application

```bash
cd ~/rina
./scripts/deploy.sh
```

What this does:
1. Starts Postgres and waits for it to be ready.
2. Builds the backend builder image and runs Prisma migrations.
3. Builds and starts all services (`docker compose up -d --build`).
4. Performs a health check on `https://your-domain.com/api/health`.
5. Cleans up dangling Docker images.

---

## 6. Verify

Open your browser:
- App: `https://your-domain.com`
- Health: `https://your-domain.com/api/health`

Check container status:
```bash
cd ~/rina
docker compose ps
docker compose logs -f backend
```

---

## 7. Setup Automated Backups

Your database runs inside Docker. Back it up nightly to S3.

```bash
crontab -e
```

Add this line:
```cron
0 3 * * * /home/ubuntu/rina/scripts/backup-db.sh >> /home/ubuntu/rina/backups/backup.log 2>&1
```

This runs at 3 AM daily:
- Dumps Postgres to a gzip file.
- Uploads to `s3://your-bucket/backups/`.
- Keeps only the last 7 local backup files.

Test it manually first:
```bash
./scripts/backup-db.sh
```

---

## 8. Firewall (UFW)

Only open what you need:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh      # or 'sudo ufw allow 22'
sudo ufw allow http     # port 80
sudo ufw allow https    # port 443
sudo ufw enable
```

**Do NOT** open port 3000 (backend) or 9000/9001 (old MinIO) to the public. Nginx is the only entrypoint.

---

## 9. Updating the App

Simply push to `main`. GitHub Actions will:
1. Lint and type-check frontend and backend.
2. Build the frontend.
3. Rsync everything (including `frontend/build`) to the server.
4. Run `./scripts/deploy.sh`.
5. Verify the health endpoint.

For manual updates, run `./scripts/deploy.sh` again on the server.

---

## 10. Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| **Blank white page** | `frontend/build` missing or not synced | Check CI logs. Run `ls ~/rina/frontend/build` on server. |
| **502 Bad Gateway** | Backend crashed or unhealthy | `docker compose logs -f backend` |
| **Login fails** | HTTP instead of HTTPS, or wrong password hash | Ensure SSL is active. Check `MAROON_PASSWORD_HASH` / `RINA_PASSWORD_HASH`. |
| **SSL certificate error** | Certs missing or expired | Re-run `./scripts/init-ssl.sh`. Check `docker compose logs -f certbot`. |
| **Uploads fail** | Wrong AWS credentials or bucket policy | Verify IAM permissions and `S3_BUCKET_NAME`. |
| **Disk full** | Logs or backups growing | Check `docker system df`. Logs auto-rotate at 10MB x 3 files per container. |
| **Out of Memory** | Lightsail instance too small | Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |

---

## 11. Rollback

If a deploy breaks the app:

```bash
cd ~/rina
docker compose logs backend
# To revert to the previous Docker image:
docker compose pull   # if using registry images
docker image tag rina-backend:previous rina-backend:latest  # if you tagged manually
```

Since this is a single-instance setup, the fastest recovery is usually to fix the code, push again, and re-deploy.

---

**End of Guide.**
