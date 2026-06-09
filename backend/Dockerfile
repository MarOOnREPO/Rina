# ─── Build Stage ───
FROM node:20.14.0-slim AS builder
WORKDIR /app

# Prisma needs openssl for engine detection & runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cache layer)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy source and build
COPY . .
RUN npm run db:generate
RUN npm run build

# ─── Production Stage ───
FROM node:20.14.0-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Use the existing non-root 'node' user provided by the base image (uid 1000)
# Do NOT create a new user — 'node' already exists in node:20-slim

# Install openssl (required by Prisma), curl for healthcheck, and ca-certificates
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy only necessary artifacts
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Install only production dependencies & regenerate Prisma Client engine bindings
RUN npm ci --omit=dev && npm cache clean --force
RUN npx prisma generate

COPY --chown=node:node scripts/container-start.sh ./container-start.sh
RUN chmod +x container-start.sh

# Ensure node user owns everything (Prisma may need to write engines at runtime)
RUN chown -R node:node /app

USER node

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:8080/api/health || exit 1

CMD ["sh", "container-start.sh"]
