<div align="center">

# Rina 💜 Long Distance App

**A Bespoke, Zero-Latency Relationship Ecosystem**

<br />

[![Svelte 5](https://img.shields.io/badge/Svelte_5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](#)
[![Fastify](https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white)](#)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](#)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](#)
[![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/Docker-0DB7ED?style=for-the-badge&logo=docker&logoColor=white)](#)

*Bridging the distance between Kenitra and Perm with absolute privacy, 60fps micro-interactions, and peer-to-peer synchronization.*

</div>

---

> **Project Rina** is not a standard web dashboard. It is an enterprise-grade, highly secure, private ecosystem designed to mimic the fluidity of a premium native iOS/Android application. Built from the ground up for two specific users, it leverages cutting-edge web technologies to eliminate distance.

## 🚀 The Optimized Stack

### 🎨 Frontend (Fluidity & Motion)
* **Framework:** `SvelteKit` (Svelte 5) utilizing **Runes** (`$state`, `$derived`) for fine-grained, compiler-level reactivity.
* **Styling:** `Tailwind CSS` (via PostCSS) leveraging custom utility classes for advanced Glassmorphism.
* **Animation:** Svelte Native Transitions + `GSAP` for buttery-smooth 60fps micro-interactions.

### 🧠 Backend (Type-Safety & Speed)
* **API Engine:** `Node.js` + `Fastify` for maximum JSON processing speed and strict schema validation.
* **Language:** 100% strictly typed `TypeScript`.
* **Database:** `PostgreSQL` managed by `Prisma ORM` for flawless relational integrity.
* **In-Memory Cache:** `Redis` for Socket.io session recovery and high-speed API caching.
* **Authentication:** Stateless JSON Web Tokens (JWT) stored in strict `HttpOnly` cookies.

### ⚡ Real-Time & Communications
* **Signaling & Sync:** `Socket.io` paired with Redis for instant UI state synchronization (chat, presence, notifications).
* **Conflict Resolution:** `Yjs` (CRDT Framework) ensuring mathematical precision for asynchronous shared canvas and game states.
* **P2P Video:** Native `WebRTC` API routing directly between devices.
* **NAT Traversal:** Self-hosted AWS `Coturn` server (STUN/TURN) configured to bypass strict firewalls and VLESS/Reality VPN tunnels.

### 🛠️ DevOps & Infrastructure
* **Hosting:** AWS Lightsail (Ubuntu VPS).
* **Containerization:** `Docker Compose` orchestrating isolated containers for Fastify, Postgres, Redis, and Nginx.
* **Proxy & Security:** `Nginx` reverse proxy with Let's Encrypt SSL certificates.
* **Media Pipeline:** `Tus Protocol` for resumable uploads streaming directly into `AWS S3`.

---

## 🖥️ Local Development

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- npm

### Quick Start

```bash
# 1. Clone and enter the repo
git clone https://github.com/MarOOnREPO/Rina.git && cd Rina

# 2. Install frontend dependencies
cd frontend && npm install && cd ..

# 3. Install backend dependencies
cd backend && npm install && cd ..

# 4. Copy environment template and fill in values
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD, JWT_SECRET, COOKIE_SECRET

# 5. Start infrastructure (Postgres, Redis) with exposed ports
#    so the backend dev server on the host can reach them.
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis

# 6. Run Prisma migrations (in backend directory)
cd backend
npx prisma migrate dev

# 7. Start the backend dev server
cd backend
npm run dev

# 8. In a new terminal, start the frontend dev server
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173` and the backend API at `http://localhost:3000`.

### Useful Commands

```bash
# Frontend
cd frontend
npm run dev        # Start dev server
npm run build      # Production build
npm run check      # Type-check with svelte-check
npm run lint       # Run ESLint
npm run format     # Format with Prettier

# Backend
cd backend
npm run dev        # Start dev server with hot reload
npm run build      # Compile TypeScript
npm run db:studio  # Open Prisma Studio
```

---

## ✨ Core Ecosystem Features

### 🔒 Absolute Privacy & Security
- **Environment-Locked Auth:** Application access is cryptographically locked to two exact identities via bcrypt hashes stored in environment variables.
- **Time Capsules:** Web Audio/Video recordings encrypted client-side using **AES-256-GCM (Web Crypto API)**, physically unlockable only upon server-validated timestamps.

### 🌐 Zero-Latency Connection
- **WebRTC Video & PIP:** Direct peer-to-peer video streaming featuring a Picture-in-Picture "Theater Mode" for watching live sports together.
- **The "Presence" Engine:** A Page Visibility API and Socket.io integration that renders a softly glowing orb, pulsing dynamically based on the partner's typing and screen activity.
- **Haptic Pings:** A glassmorphic interface that leverages the HTML5 Vibration API to send instant "Thinking of You" haptic feedback across the globe.

### 📅 Shared Daily Utilities
- **Dual-Timezone Dashboard:** Synchronized WET/WEST and YEKT clocks with animating Open-Meteo SVGs.
- **Smart Unified Calendar:** Real-time event synchronization featuring a specialized algorithmic cycle tracker.
- **Digital Scrapbook:** High-resolution media vault pinning EXIF photo data to an interactive 3D Mapbox globe.
- **Liquid Goal Tracker:** An animating SVG container that visually fills to track shared financial goals.

### 🎮 Interactive Multiplayer
- **Fightcade via Data Channels:** Retro arcade emulator utilizing WebRTC UDP Data Channels for frame-perfect, low-latency fighting game inputs.
- **Shared Glass Whiteboard:** Full-screen translucent `<canvas>` powered by Yjs to prevent stroke conflicts during simultaneous drawing.
- **Synchronized Media:** YouTube IFrame API integration ensuring play, pause, and seek commands fire at the exact same millisecond.
- **Dinner Date Roulette:** A synchronized spinning wheel to effortlessly decide on shared meal themes.

---

## 🎨 Design Philosophy

* **Materials:** Extensive use of translucency, frosted glass effects, and background blur against deep slate palettes with rose and indigo accents.
* **Motion:** Elements scale, bounce, and slide naturally. Nothing simply "appears" or "snaps" into the DOM.

---

<div align="center">
  <i>Architected and maintained by MarOOn</i>
</div>
