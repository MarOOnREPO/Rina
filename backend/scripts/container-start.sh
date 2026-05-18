#!/bin/sh
set -e

# Run database migrations before starting the server
# This ensures the schema is up-to-date on every container start
npx prisma migrate deploy

exec node dist/server.js
