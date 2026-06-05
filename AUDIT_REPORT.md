# RINA PROJECT — FULL AUDIT REPORT

**Date:** 2026-05-17  
**Auditor:** Kimi Code CLI  
**Environment:** AWS Lightsail (Single Instance), Docker & Docker Compose  
**Scope:** Full-stack application (Frontend, Backend, Infrastructure, CI/CD, Security)

---

## Remediation Report — 2026-06-05

All Critical and Warning findings from the 2026-06-05 security audit have been addressed across 4 phases.

### Phase 1 — Critical Infra & Frontend Security
- Fixed SSL certbot volume name mismatch
- Removed dangerous backend `.:/host:rw` mount
- Fixed Mapbox stored XSS with HTML escaping
- Moved Spotify Client ID and Playwright secrets to environment variables
- Added CSP and Referrer-Policy meta tags
- Added `rel="noopener noreferrer"` to external links

### Phase 2 — Critical Backend Hardening
- Isolated `webtorrent` into dedicated `cinema-worker` Docker container
- Added TUS upload guards (500MB max, extension allowlist)
- Implemented AES-256-GCM encryption for Spotify tokens at rest
- Added per-user Socket.IO and per-IP Yjs connection limits
- Redacted PII from production logs

### Phase 3 — Infra & CI/CD Hardening
- Pinned all Docker images to patch versions
- Hardened nginx: XFF proxy chain, OCSP stapling, WebSocket rate limits, SSL session cache
- Added nginx healthcheck in Docker Compose
- Encrypted DB backups with GPG before S3 upload
- Secured `install.sh` and `deploy.sh` against secret leaks and unsafe parsing
- Hardened GitHub Actions with least-privilege permissions, SHA-pinned actions, Playwright tests, and deployment environments

### Phase 4 — Frontend Quality
- Removed unused `bcryptjs` dependency
- Fixed SSR API base URL hardcoding
- Gated `vite host: true` behind non-production env
- Added service worker logout cache invalidation
- Added SSR security headers fallback in `hooks.server.ts`
- Added MIT `LICENSE`

### Remaining Recommendations
- Run periodic `npm audit` in CI
- Consider adding Sentry or similar APM for production error tracking
- Document API contract (OpenAPI) for future maintainers

---

## 1. EXECUTIVE SUMMARY

The project is a **couple-focused personal application** ("Rina") built with a modern stack: SvelteKit SPA, Fastify/Node.js backend, PostgreSQL, Redis, MinIO, and Nginx. The codebase is generally well-organized and uses current technologies.

**Overall Maturity: 6.5 / 10** — Solid foundation, but **not production-ready** without addressing critical deployment and security gaps.

### Top 5 Critical Findings
1. **🚨 BROKEN DEPLOYMENT PIPELINE:** GitHub Actions explicitly excludes `frontend/build` from server sync. Your frontend will never deploy (blank page).
2. **🔑 HARDCODED PASSWORD HASHES:** Two bcrypt hashes for `maroon` and `rina` are committed in `backend/src/routes/auth.ts`. Anyone with repo access can offline-crack them.
3. **🔒 HTTPS IS NOT CONFIGURED:** Nginx only listens on HTTP (port 80). The backend sets `secure: true` on cookies. **Authentication will fail entirely** in production without manual Certbot setup.
4. **⏱️ FULL DOWNTIME ON EVERY DEPLOY:** `scripts/deploy.sh` stops all containers before rebuilding. There is zero-downtime strategy.
5. **💾 NO DATABASE BACKUP STRATEGY:** On a single Lightsail instance, disk failure or accidental `docker volume rm` means total data loss.

---

## 2. ARCHITECTURE OVERVIEW

| Component | Technology | Role |
|---|---|---|
| **Frontend** | SvelteKit 5 (Static Adapter) | SPA served by Nginx |
| **Reverse Proxy** | Nginx (Alpine) | TLS termination, rate limiting, static assets |
| **Backend** | Fastify 4 (Node 20) | REST API, WebSocket (Socket.IO), TUS uploads |
| **Database** | PostgreSQL 16 | Primary data store (Prisma ORM) |
| **Cache / PubSub** | Redis 7 | Socket.IO adapter, rate-limit store, presence |
| **Object Storage** | MinIO | S3-compatible file storage |
| **Realtime Collab** | Yjs | Shared whiteboard via raw WebSocket |
| **Push Notifications** | Web Push (VAPID) | Browser push |
| **Deployment** | GitHub Actions + Bash | Rsync + SSH remote deploy script |

**Network Flow:** User → Nginx (80/443) → Backend (3000 internal) / Static Files. Only Nginx is exposed to the host.

---

## 3. CRITICAL ISSUES (IMMEDIATE ACTION REQUIRED)

### 3.1 CI/CD Pipeline Is Broken
**File:** `.github/workflows/deploy.yml` (Line 56)  
**Problem:** The `EXCLUDE` list contains `frontend/build`.
- The workflow runs `npm run build` in the frontend step.
- Then `rsync` skips the `build/` folder.
- Nginx mounts `./frontend/build` into the container.
- **Result:** The server has an empty or stale `build` directory. Users see a 404 or blank white screen.

**Fix:** Remove `frontend/build` from the `EXCLUDE` list.

### 3.2 Hardcoded Credentials in Source Code
**File:** `backend/src/routes/auth.ts` (Lines 11-22)  
**Problem:** Two authorized users (`maroon`, `rina`) have bcrypt password hashes hardcoded in the source code and committed to Git.
```ts
passwordHash: '$2a$12$uuyxtsi5WMRosmaTC2SO6urMOzB5HMu.DOL6.TihhNn0sgkT9A2yC'
passwordHash: '$2a$12$E1hGSTE7Zc0HYrgRFYZ6suuIH4LWNoIpnn6.W3QKhTa7w64OT/dqa'
```
**Risk:** Offline dictionary attack. If either password is weak, it will be cracked.

**Fix:** Move these to environment variables or (better) store users in the database and seed them securely.

### 3.3 HTTPS Is Not Active
**File:** `nginx/default.conf`  
**Problem:** The active server block only listens on `listen 80;`. The HTTPS block (lines 162-174) is entirely commented out. The config even warns: *"Auth cookies use 'secure: true' — login WILL FAIL over HTTP in production."*  
**Risk:** Complete auth failure; credentials sent in plaintext.

**Fix:** 
1. Obtain a certificate (Let's Encrypt via Certbot).
2. Uncomment the HTTPS block.
3. Enable the HTTP→HTTPS redirect.
4. Add HSTS headers.

### 3.4 Total Downtime During Deployment
**File:** `scripts/deploy.sh` (Line 43)  
**Problem:** `docker compose down` stops Nginx, the backend, and all services. Then migrations run, then everything rebuilds. On a single instance, this means the app is completely offline for the duration of the deploy.

**Fix:** Remove `docker compose down`. Use `docker compose up -d --build` to let Compose recreate only changed containers. Clean up old images afterward.

### 3.5 Service Worker Caches Sensitive API Data
**File:** `frontend/src/service-worker.ts` (Lines 51-56)  
**Problem:** The service worker uses a "network-first" strategy for `/api/` and `/socket.io/`, but falls back to `caches.match(event.request)`. This means chat messages, user data, and auth state can be stored in the browser cache.

**Fix:** Never cache API responses. Remove the `caches.match` fallback for `/api/*`.

---

## 4. INFRASTRUCTURE & DOCKER AUDIT

### 4.1 Docker Compose (`docker-compose.yml`)
**Strengths:**
- Images are pinned to specific versions (good for reproducibility).
- Backend and MinIO use `expose` instead of `ports` (good isolation).
- Named volumes for all persistent data (Postgres, Redis, MinIO, Certbot).
- Health checks on backend, Postgres, and Redis.
- Backend waits for Postgres/Redis to be healthy before starting.

**Weaknesses:**
- **No resource limits.** On a Lightsail instance (likely 1-2GB RAM), a memory leak in backend or MinIO will OOM-kill the entire server or trigger the kernel OOM killer. Add `deploy.resources.limits` (memory and CPU).
- **No `condition: service_healthy` on Nginx.** Nginx starts immediately and may proxy to a backend that is still booting.
- **Single shared network.** All services can talk to each other. If Nginx is compromised, it has direct access to Postgres and MinIO.
- **MinIO has no health check.** Relying on `service_started` is weaker.
- **Certbot service is commented out.** SSL renewal is not automated within Compose.

### 4.2 Nginx Configuration (`nginx/default.conf`)
**Strengths:**
- Rate limiting zones for API (`10r/s`) and login (`5r/m`).
- Correct WebSocket upgrade headers for `/socket.io/` and `/yjs/`.
- Upload proxy disables buffering for TUS resumable uploads.
- ACME challenge location ready for Certbot.
- SPA fallback (`try_files`) correct for SvelteKit static adapter.

**Weaknesses:**
- **No HTTPS redirect or HSTS.**
- **No `Content-Security-Policy` header.** The backend sets CSP via Helmet, but Nginx serves the static SPA without one.
- **Deprecated `X-XSS-Protection` header.** Modern browsers ignore it; some old ones can be exploited with it. Remove it.
- **Repeated security headers** in the nested static assets location block. Hard to maintain. Use an included snippet.
- **MinIO console not proxied.** Port 9001 is internal only; accessing it requires SSH tunneling.

### 4.3 Backend Dockerfile
**Strengths:**
- Multi-stage build (`builder` + `runner`).
- Runs as non-root `node` user.
- Layer caching optimized (`package*.json` copied before source).
- Health check defined.

**Weaknesses:**
- No `tini` or `--init` for PID 1. Node.js does not reap zombie processes well.

---

## 5. BACKEND AUDIT

### 5.1 Stack & Code Quality
- **Framework:** Fastify 4.x with TypeScript strict mode. Good choice.
- **ORM:** Prisma 5.x with PostgreSQL. Schema is clean and normalized.
- **Validation:** Zod is used on routes.
- **Auth:** JWT + bcrypt + httpOnly/secure/sameSite cookies. Correct pattern.
- **Realtime:** Socket.IO with Redis adapter. Yjs on a separate WebSocket server.

### 5.2 Security Gaps
| Issue | Severity | Details |
|---|---|---|
| `trustProxy: 1` | Medium | If deployed without Nginx directly in front, IP spoofing is possible. Since you use Nginx, verify it is the *only* hop. |
| No Socket.IO/Yjs connection limits | Medium | A single IP could open thousands of WebSocket connections and exhaust memory. |
| TUS uploads lack limits | Medium | No global max file size, no MIME-type allowlist. |
| No request correlation IDs | Low | Hard to trace issues across logs. |

### 5.3 Missing Production Practices
- **No structured logging.** Uses `console.log` / `console.error`. Fastify has Pino built-in; it is not configured in production.
- **No database connection pooling configuration.** Prisma defaults may exhaust Postgres connections under load.
- **No metrics / observability.** No Prometheus, health metrics, or APM.
- **Environment validation is scattered.** No single schema (e.g., Zod) for all env vars at boot.
- **No tests.** CI builds the code but does not run any test suite.

---

## 6. FRONTEND AUDIT

### 6.1 Stack
- **SvelteKit 5** with runes (`$state`, `$effect`).
- **Adapter:** `@sveltejs/adapter-static` (SPA mode).
- **Styling:** TailwindCSS.
- **No frontend Docker container.** Built on CI/host and served by Nginx.

### 6.2 Security Gaps
- **Service Worker caches API data** (Critical — see 3.5).
- **No CSP on static assets.**
- **No HSTS.**
- **Mapbox token is public.** Embedded in the bundle at build time. Acceptable for Mapbox, but restrict the token by URL in the Mapbox dashboard.

### 6.3 Missing Practices
- **No `robots.txt`.** Search engines may index the app.
- **Manifest not linked.** `manifest.json` exists but is not referenced in `app.html`.
- **No tests.** No Vitest, Playwright, or Cypress.

---

## 7. DEPLOYMENT & CI/CD AUDIT

### 7.1 GitHub Actions Workflow
**Strengths:**
- Concurrency control (`cancel-in-progress`).
- Lint and type-check before deploy.
- Pinned action versions (security best practice).

**Weaknesses:**
- **Critical:** `frontend/build` excluded from rsync.
- **No tests executed.**
- **No post-deploy verification.** After SSH runs `deploy.sh`, the workflow does not curl the health endpoint to confirm the site is up.

### 7.2 Deploy Script (`scripts/deploy.sh`)
**Strengths:**
- Pre-flight checks (`.env`, Docker running).
- Runs migrations before backend starts.
- Migrations run inside Docker builder image (consistent environment).

**Weaknesses:**
- **Critical:** `docker compose down` causes downtime.
- **Fragile `.env` parsing.** `grep '^POSTGRES_PASSWORD=' .env | cut -d '=' -f 2-` breaks if the password contains `=` or quotes.
- **No rollback.** If migrations succeed but the new app crashes, the script exits. You must manually debug.
- **No frontend build check.** Assumes `frontend/build` exists (which it won't because of the CI bug).

---

## 8. LIGHTSAIL-SPECIFIC RISKS

Since you are constrained to a **single AWS Lightsail instance**, the following risks are amplified:

| Risk | Why It's Worse on Lightsail |
|---|---|
| **No High Availability** | Single instance = single point of failure. If the instance stops, Rina is down. |
| **Disk Space** | Lightsail SSDs are small (20GB-80GB typical). Postgres + MinIO + Docker logs will fill the disk. No backup strategy = data loss. |
| **Memory Pressure** | Small instances (512MB-2GB RAM). Without Docker resource limits, the OS OOM killer will randomly kill containers. |
| **No Managed Database** | You run Postgres in Docker. You are responsible for backups, vacuuming, and updates. |
| **IP Whitelisting** | You must manage UFW/firewall rules manually. The project docs cover this well, but one mistake exposes MinIO or Postgres. |

---

## 9. PRIORITIZED NEXT STEPS

### PHASE 1: STOP THE BLEEDING (Do Today)
1. **Fix CI/CD:** Remove `frontend/build` from the `EXCLUDE` list in `.github/workflows/deploy.yml`.
2. **Fix Deploy Script:** Remove `docker compose down` from `scripts/deploy.sh`. Replace with `docker compose up -d --build`.
3. **Remove Hardcoded Hashes:** Move the `AUTHORIZED_USERS` object in `backend/src/routes/auth.ts` to environment variables or seed them via Prisma `seed.ts`.
4. **Enable HTTPS:**
   - Run Certbot manually OR uncomment the Certbot service in `docker-compose.yml`.
   - Uncomment the HTTPS server block and HTTP→HTTPS redirect in `nginx/default.conf`.
   - Add `add_header Strict-Transport-Security ...` to Nginx.
5. **Fix Service Worker:** In `frontend/src/service-worker.ts`, remove the `caches.match` fallback for `/api/*` and `/socket.io/*`. Do not cache authenticated data.

### PHASE 2: HARDEN (Do This Week)
6. **Add Docker Resource Limits** to `docker-compose.yml` (e.g., backend: 512MB, Postgres: 256MB, Redis: 128MB, MinIO: 256MB).
7. **Add Database Backups:** Create a cron job or a small backup container that runs `pg_dump` nightly to an S3 bucket or local tar.
8. **Add Log Rotation:** Configure Docker daemon logging options (`max-size`, `max-file`) or `logrotate` for the host.
9. **Add Nginx `condition: service_healthy`:** Ensure Nginx waits for the backend to be ready.
10. **Centralize Env Validation:** Use Zod to validate all `process.env` variables at backend startup in one file.
11. **Add Post-Deploy Health Check to CI:** After SSH deploy, curl `https://your-domain.com/api/health` and fail the workflow if it's not 200.

### PHASE 3: OPTIMIZE (Do This Month)
12. **Structured Logging:** Replace `console.*` with Fastify's built-in Pino logger. Redact sensitive fields.
13. **Security Headers:** Add `Content-Security-Policy` to Nginx for the static SPA.
14. **Network Segmentation:** Create an internal Docker network for Postgres/Redis/MinIO. Attach backend to both networks; attach Nginx only to the public-facing network.
15. **Connection Limits:** Add Socket.IO and Yjs per-IP connection throttling.
16. **TUS Limits:** Enforce a max file size and MIME-type allowlist.
17. **Add Tests:** Even a small suite of backend API tests and frontend component tests will prevent regressions.
18. **Monitoring:** Add a simple uptime monitor (UptimeRobot, Pingdom, or even AWS CloudWatch) to alert you if the Lightsail instance goes down.

---

## 10. FINAL VERDICT

Rina is a **well-architected personal project** with a modern stack and good Docker hygiene. However, it currently has **two critical deployment blockers** (broken CI pipeline + HTTPS missing) and **one critical security flaw** (hardcoded hashes). 

**Do not deploy to production until Phase 1 is complete.**

After Phase 1 and 2, the project will be robust enough for a low-traffic, couple-only personal app on a single Lightsail instance. Phase 3 moves it from "working" to "professional."

---

**End of Report.**
