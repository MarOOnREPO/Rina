<div align="center">

# 💜 Rina — A Private Sanctuary for Two

**A secure, real-time long-distance relationship ecosystem.**

*Bridging Kenitra and Perm with end-to-end privacy, 60fps micro-interactions, and peer-to-peer synchronization.*

<br />

[![Svelte 5](https://img.shields.io/badge/Svelte_5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Fastify](https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://www.fastify.io)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-0DB7ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)

</div>

---

## ✨ What is Rina?

Rina is not a generic chat app. It is a **bespoke, security-hardened ecosystem** engineered for two people. Every pixel, every protocol, and every encryption key exists to make long distance feel like zero distance.

Built with **Svelte 5**, **Fastify**, and **WebRTC**, it runs as a fully containerized stack on a single VPS — giving you complete data sovereignty. No third-party trackers. No telemetry. Just you, your partner, and a glassmorphic universe that stays in sync across timezones.

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (Alpine)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Static SPA │  │  API Proxy  │  │  WebSocket Upgrade  │  │
│  │   (Port 80/443)  │  (Rate Limited)  │  (Socket.IO / Yjs)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐          ┌─────▼─────┐        ┌────▼────┐
   │ Backend │          │  Cinema   │        │ Postgres│
   │ Fastify │◄────────►│  Worker   │        │   16    │
   │ Node 20 │          │(Isolated) │        │(Internal│
   └────┬────┘          └───────────┘        │ Network)│
        │                                     └────┬────┘
   ┌────▼────┐                                ┌───▼────┐
   │  Redis  │                                │  S3    │
   │    7    │                                │(Backups│
   │(Pub/Sub)│                                │& Media)│
   └─────────┘                                └────────┘
```

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | SvelteKit 2 + Svelte 5 Runes + TailwindCSS | SPA with glassmorphism design system, compiled to static HTML |
| **Reverse Proxy** | Nginx 1.27 (Alpine) | TLS termination, rate limiting, static asset serving, security headers |
| **API** | Fastify 4 (Node 20) | REST API, JWT auth, TUS uploads, push notifications |
| **Realtime** | Socket.IO + Redis Adapter | Chat, presence, typing indicators, Spotify Jam sync |
| **Collaboration** | Yjs + WebSocket | Shared whiteboard with CRDT conflict resolution |
| **Cinema** | Isolated Worker (FFmpeg + WebTorrent) | HLS streaming for co-watching; runs in dedicated container with no DB access |
| **Database** | PostgreSQL 16 + Prisma ORM | Relational data, connection pooling, migrations |
| **Cache / PubSub** | Redis 7 | Session store, rate-limit backend, Socket.IO adapter |
| **Storage** | AWS S3 / MinIO | Resumable file uploads via TUS, encrypted DB backups |
| **CI/CD** | GitHub Actions | Lint, type-check, Playwright E2E tests, rsync deploy |

---

## 🔐 Security Highlights

Rina has been through a full-stack security audit. Key protections include:

- **Cookie-based JWT Auth** — `HttpOnly`, `Secure`, `SameSite=Strict` cookies. Tokens are never exposed to JavaScript.
- **AES-256-GCM Encryption at Rest** — Spotify OAuth tokens are encrypted before touching the database.
- **XSS Hardening** — Mapbox popups are HTML-escaped; Svelte's default interpolation protects against injection.
- **Rate Limiting** — Redis-backed limits on API (100 req / 15 min), login (10 req / 15 min), and nginx-layer burst controls.
- **WebSocket Limits** — Max 10 concurrent Socket.IO connections per user; max 10 Yjs connections per IP.
- **Upload Guards** — 500 MB cap, extension allowlist, path-traversal prevention.
- **Isolated Cinema Worker** — The torrent/FFmpeg pipeline runs in its own container with no access to the internal data network.
- **Encrypted Backups** — Database dumps are GPG-encrypted with AES256 before leaving the server for S3.
- **Hardened Infrastructure** — Pinned Docker images, OCSP stapling, CSP headers, X-Frame-Options, HSTS preload.

---

## 🚀 Features

### 💬 Chat & Presence
- Real-time messaging with Socket.IO
- Typing indicators and online presence orb
- "Thinking of You" haptic ping
- Reply threads and media attachments

### 📅 Shared Life
- **Dual-Timezone Dashboard** — WET/WEST & YEKT clocks with live weather
- **Smart Calendar** — Event sync with cycle tracking
- **Countdowns** — Shared visit timers with location pinning
- **Financial Goals** — Animated liquid-fill tracker for savings

### 🎮 Play Together
- **Co-Video** — WebRTC peer-to-peer video calls with PiP theater mode
- **Cinema** — Synchronized HLS streaming (direct links or torrent-isolated worker)
- **Spotify Jam** — Shared playback control via Spotify Connect
- **Whiteboard** — Full-screen glass canvas with Yjs real-time collaboration
- **Roulette** — Synchronized spin wheel for dinner decisions

### 🔒 Private Vault
- **Time Capsules** — AES-256-GCM encrypted audio/video messages that unlock on a future date
- **Digital Scrapbook** — EXIF-aware photo map on a 3D Mapbox globe
- **Movie Watchlist** — TMDB-integrated shared queue with ratings

---

## 🛠️ Local Development

### Prerequisites
- **Node.js** `>=20.0.0`
- **Docker** & **Docker Compose**
- **npm**

### Quick Start

```bash
# 1. Clone and enter the repo
git clone https://github.com/MarOOnREPO/Rina.git && cd Rina

# 2. Install dependencies
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

# 3. Configure environment
cp .env.example .env
# Edit .env — at minimum set:
#   POSTGRES_PASSWORD, JWT_SECRET, COOKIE_SECRET,
#   MAROON_PASSWORD_HASH, RINA_PASSWORD_HASH,
#   SPOTIFY_TOKEN_ENCRYPTION_KEY, BACKUP_ENCRYPTION_KEY

# 4. Start infrastructure (Postgres, Redis)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis

# 5. Run migrations
cd backend && npx prisma migrate dev && cd ..

# 6. Start backend dev server (Terminal 1)
cd backend && npm run dev

# 7. Start frontend dev server (Terminal 2)
cd frontend && npm run dev
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **Prisma Studio:** `cd backend && npx prisma studio`

---

## ☁️ Production Deployment

### One-Command Install (Fresh VPS)

Requires Ubuntu 22.04+, Docker, Docker Compose, Git, and OpenSSL.

```bash
git clone https://github.com/MarOOnREPO/Rina.git && cd Rina
cp .env.example .env
# Fill in all production values
./scripts/install.sh
```

This script will:
1. Validate prerequisites
2. Build the frontend
3. Bootstrap dummy SSL certs
4. Obtain real Let's Encrypt certificates
5. Run the first deploy

### Update an Existing VPS

```bash
cd ~/rina
git pull origin main
./scripts/deploy.sh
```

### Manual SSL Initialization

If installing on a new domain:
```bash
./scripts/bootstrap-ssl.sh your-domain.com
./scripts/init-ssl.sh your-domain.com your-email@example.com
```

---

## ⚙️ Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DOMAIN` | Your public domain | `rina.example.com` |
| `FRONTEND_URL` | Public HTTPS URL | `https://rina.example.com` |
| `POSTGRES_PASSWORD` | Database password | *(strong random)* |
| `JWT_SECRET` | Signing key for tokens | `min 32 chars` |
| `COOKIE_SECRET` | Cookie encryption key | `min 32 chars` |
| `MAROON_PASSWORD_HASH` | Bcrypt hash for user "maroon" | `$2a$12$...` |
| `RINA_PASSWORD_HASH` | Bcrypt hash for user "rina" | `$2a$12$...` |
| `SPOTIFY_TOKEN_ENCRYPTION_KEY` | AES key for Spotify tokens | `min 32 chars` |
| `BACKUP_ENCRYPTION_KEY` | GPG passphrase for DB backups | `min 32 chars` |
| `AWS_ACCESS_KEY_ID` | S3 credentials | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | S3 credentials | `...` |
| `S3_BUCKET_NAME` | S3 bucket for uploads/backups | `rina-uploads` |
| `VAPID_PUBLIC_KEY` | Web Push public key | `BPY...` |
| `VAPID_PRIVATE_KEY` | Web Push private key | `...` |
| `CORS_ORIGIN` | Allowed origin | `https://rina.example.com` |

Generate hashes and keys:
```bash
# Bcrypt hash (run in Node)
node -e "require('bcryptjs').hash('your_password', 12).then(console.log)"

# Random secrets
openssl rand -base64 32
```

---

## 🧪 Testing

```bash
# Backend build check
cd backend && npm run build

# Frontend type-check & lint
cd frontend && npm run check && npm run lint

# E2E tests (requires dev servers running)
cd frontend && npx playwright test
```

---

## 📁 Project Structure

```
Rina/
├── frontend/           # SvelteKit SPA
│   ├── src/routes/     # Page components
│   ├── src/lib/        # Utils, stores, API client
│   └── static/         # Assets, manifest
├── backend/            # Fastify API
│   ├── src/routes/     # Route handlers
│   ├── src/services/   # Business logic, Prisma, Redis
│   ├── src/middleware/ # Auth, validation
│   └── prisma/         # Schema & migrations
├── cinema-worker/      # Isolated torrent/FFmpeg worker
├── nginx/              # Reverse proxy templates
├── scripts/            # Deploy, backup, SSL helpers
├── docker-compose.yml  # Production stack
└── docker-compose.dev.yml  # Local dev overrides
```

---

## 🎨 Design Philosophy

- **Glassmorphism** — Translucency, frosted blur, and deep slate palettes with rose & indigo accents.
- **Motion** — Every element enters with intent. Scale, bounce, and slide instead of abrupt snaps.
- **Privacy by Design** — No analytics, no trackers, no third-party cookies. Your data stays on your server.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <i>Architected with care by <b>MarOOn</b> 💜</i>
</div>
