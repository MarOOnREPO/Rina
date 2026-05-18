# Deploy Rina on AWS Lightsail (or any Ubuntu 22.04+ VPS)

This guide covers deploying Rina from a **fresh server** using the interactive shell script.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Server** | Ubuntu 22.04+ (1 vCPU, 2 GB RAM minimum) |
| **Domain** | A public domain with an **A-record** pointing to your server IP |
| **Docker** | Engine + Compose plugin installed |
| **Git** | Installed on the server |
| **AWS S3** | A bucket + IAM user with `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` |
| **Ports open** | 22 (SSH), 80 (HTTP), 443 (HTTPS) |

> 💡 **Tip:** For AWS Lightsail, open ports in the instance dashboard under **Networking → Firewall**.

---

## 1. Server Preparation

SSH into your server and update the system:

```bash
sudo apt update && sudo apt upgrade -y
```

Ensure Docker & Docker Compose are installed:

```bash
docker --version
docker compose version
```

If missing:

```bash
# Docker
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to the docker group (re-log afterwards)
sudo usermod -aG docker $USER
```

---

## 2. Clone the Repository

```bash
cd ~
git clone https://github.com/MarOOnREPO/Rina.git
cd Rina
```

---

## 3. Run the Install Script

The install script is fully interactive. It will ask for your domain, AWS credentials, desired login passwords, etc., then auto-generate all secrets, build the frontend, obtain an SSL certificate, and deploy everything.

```bash
./scripts/install.sh
```

### What the script does:

1. **Checks prerequisites** (Docker, Compose, Git, OpenSSL)
2. **Prompts you interactively** for required configuration
3. **Generates secrets** automatically:
   - `POSTGRES_PASSWORD` — 32-byte hex
   - `JWT_SECRET` / `COOKIE_SECRET` — 64-byte base64
   - `COTURN_SECRET` — 32-byte hex
4. **Hashes your passwords** with bcrypt (cost factor 12) using a temporary Node.js Docker container
5. **Generates VAPID keys** for Web Push notifications using a temporary Docker container
6. **Writes `.env`** with restricted permissions (`chmod 600`)
7. **Builds the frontend** inside a Docker container (no host Node.js required)
8. **Bootstraps a dummy SSL cert** so nginx can start
9. **Obtains a real Let's Encrypt certificate** via Certbot
10. **Runs `./scripts/deploy.sh`** which:
    - Starts Postgres & waits for it to be ready
    - Runs Prisma database migrations
    - Builds & starts all Docker services
    - Performs a health check

---

## 4. After Install

Once the script finishes, your app is live at:

```
https://your-domain.com
```

Verify the health endpoint:

```bash
curl -sf https://your-domain.com/api/health
```

Check running containers:

```bash
docker compose ps
docker compose logs -f backend
```

---

## 5. Schedule Automated Backups

Back up the Postgres database nightly to your S3 bucket:

```bash
crontab -e
```

Add:

```cron
0 3 * * * /home/ubuntu/Rina/scripts/backup-db.sh >> /home/ubuntu/Rina/backups/backup.log 2>&1
```

Test it once manually:

```bash
./scripts/backup-db.sh
```

---

## 6. Configure Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

**Do NOT** expose port 3000 (backend) to the public — Nginx is the only entrypoint.

---

## 7. Updating the App

### Option A: Git Push to VPS (simplest)

One-time setup on the **server**:

```bash
cd ~/Rina
./scripts/git-setup.sh
```

On your **local machine**:

```bash
git remote add vps ssh://ubuntu@YOUR_IP/home/ubuntu/rina.git
git push vps main
```

The `post-receive` hook automatically checks out the code and runs `./scripts/deploy.sh`.

### Option B: GitHub Actions

Push to `main`. The workflow (`.github/workflows/deploy.yml`) will:

1. Lint & type-check frontend and backend
2. Build the frontend
3. Rsync everything (including `frontend/build`) to the server
4. Run `./scripts/deploy.sh`
5. Verify the health endpoint

Required repository secrets:

- `SSH_PRIVATE_KEY`
- `REMOTE_HOST`
- `REMOTE_USER`

### Option C: Manual Update

```bash
ssh ubuntu@YOUR_IP
cd ~/Rina
git pull origin main
./scripts/deploy.sh
```

---

## 8. Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| **Blank white page** | `frontend/build` missing | The install script builds it. If updating manually, ensure you built locally and synced `frontend/build`. |
| **502 Bad Gateway** | Backend crashed | `docker compose logs -f backend` |
| **Login fails** | Wrong password hash or HTTP instead of HTTPS | Ensure SSL is active. Re-run `./scripts/install.sh` or edit `.env` directly. |
| **SSL certificate error** | Certs missing or expired | Re-run `./scripts/init-ssl.sh domain.com email@example.com`. Check `docker compose logs -f certbot`. |
| **Uploads fail** | Wrong AWS credentials or bucket policy | Verify IAM permissions and `S3_BUCKET_NAME` in `.env`. |
| **Disk full** | Logs or backups growing | `docker system df`. Logs auto-rotate at 10 MB × 3 files per container. |
| **Out of Memory** | Instance too small | Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| **SSL browser warning on first deploy** | Using dummy self-signed cert | Normal for a few seconds before `init-ssl.sh` finishes. Refresh after the script completes. |

---

## 9. Manual SSL (if needed later)

If you change domains or need to re-issue certificates:

```bash
cd ~/Rina
./scripts/init-ssl.sh your-domain.com your-email@example.com
```

Certbot auto-renewal is handled by the `certbot` container (checks every 12 hours).

---

## 10. Rollback

If a deploy breaks the app:

```bash
cd ~/Rina
docker compose logs backend
# Fix the code, then redeploy:
./scripts/deploy.sh
```

For a **complete reset** (delete everything and start over):

```bash
cd ~
docker compose -f Rina/docker-compose.yml down -v   # removes containers + volumes
sudo rm -rf Rina
# Then repeat from Step 2 (git clone)
```

> ⚠️ **Warning:** `down -v` deletes the Postgres volume. Back up your data first if you need it.

---

**End of Guide.**
