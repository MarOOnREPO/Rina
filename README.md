<div align="center">

# 🌹 Project Rina

**A Bespoke, Zero-Latency Relationship Ecosystem**

<br />

[![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](#)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](#)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](#)
[![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](#)
[![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-aws&logoColor=white)](#)

An enterprise-grade, fully encrypted real-time web application engineered exclusively to bridge the distance between Kenitra and Perm.

</div>

---

> **Project Rina** is not a standard web dashboard. It is a highly secure, zero-latency, private ecosystem designed to mimic the fluidity of a premium native iOS/Android application. Built from the ground up for two specific users, it prioritizes absolute privacy, 60fps micro-interactions, and flawless peer-to-peer synchronization over custom VPN tunnels.

## 🚀 The Architecture

### 🎨 Frontend (Fluidity & Motion)
* **Framework:** `SvelteKit` (Svelte 5) + `Vite` for compiler-level optimization and zero virtual DOM overhead.
* **Styling:** `Tailwind CSS` (via PostCSS) leveraging custom utility classes for advanced Glassmorphism.
* **Animation:** Svelte Native Transitions + `GSAP` for buttery-smooth 60fps micro-interactions.

### 🧠 Backend (Type-Safety & Logic)
* **Environment:** `Node.js` + `Express.js`.
* **Language:** 100% strictly typed `TypeScript`.
* **Database:** `PostgreSQL` managed by `Prisma ORM` for flawless relational integrity.
* **Authentication:** Stateless JSON Web Tokens (JWT) stored in strict `HttpOnly` cookies.

### ⚡ Real-Time & Communications
* **Signaling & Sync:** `Socket.io` for instant UI state synchronization (chat, presence, notifications).
* **Conflict Resolution:** `Yjs` (CRDT Framework) ensuring mathematical precision for asynchronous shared canvas and game states.
* **P2P Video:** Native `WebRTC` API routing directly between devices.
* **NAT Traversal:** Self-hosted AWS `Coturn` server (STUN/TURN) configured to bypass strict firewalls and VLESS/Reality VPN tunnels.

### 🛠️ DevOps & Infrastructure
* **Hosting:** AWS Lightsail (Ubuntu VPS).
* **Containerization:** `Docker` & `Docker Compose` for isolated, reproducible environments.
* **Proxy & Security:** `Nginx` reverse proxy with Let's Encrypt SSL certificates.
* **Storage:** AWS S3 / Dockerized MinIO for high-resolution, uncompressed media.

---

## ✨ Core Ecosystem Features

### 🔒 Absolute Privacy & Security
- **Hardcoded Auth:** Application access is cryptographically locked to two exact identities.
- **Time Capsules:** Web Audio/Video recordings encrypted client-side using **AES-256 (Web Crypto API)**, physically unlockable only upon server-validated timestamps.

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
