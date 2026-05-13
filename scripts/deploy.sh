#!/bin/bash
set -e

# Project Rina — Quick Deploy Script
# Run this on your Lightsail server after code updates

echo "🚀 Starting Rina deployment..."

cd "$(dirname "$0")/.."

echo "📦 Building containers..."
docker compose down
docker compose up -d --build

echo "🗄️ Running database migrations..."
cd backend
npx prisma migrate deploy
npx prisma generate
cd ..

echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Deployment complete!"
echo ""
echo "Check status: docker compose ps"
echo "View logs:    docker compose logs -f backend"
