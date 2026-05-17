# ─── Build Stage ───
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy source and build
COPY . .
RUN npm run db:generate
RUN npm run build

# ─── Production Stage ───
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S node -u 1001

# Copy only necessary artifacts
COPY --from=builder --chown=node:nodejs /app/dist ./dist
COPY --from=builder --chown=node:nodejs /app/package*.json ./
COPY --from=builder --chown=node:nodejs /app/prisma ./prisma

# Install only production dependencies & regenerate Prisma Client engine bindings
RUN npm ci --omit=dev && npm cache clean --force
RUN npx prisma generate

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.js"]
