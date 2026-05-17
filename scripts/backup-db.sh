#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [ ! -f ".env" ]; then
  echo "❌ .env not found."
  exit 1
fi

set -a
source .env
set +a

if [ -z "${POSTGRES_PASSWORD:-}" ] || [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ] || [ -z "${S3_BUCKET_NAME:-}" ]; then
  echo "❌ Required vars missing: POSTGRES_PASSWORD, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="rina_backup_${TIMESTAMP}.sql.gz"

mkdir -p backups

echo "🐘 Dumping database..."
docker compose exec -T postgres pg_dump -U rina_user -d rina_db | gzip > "backups/$BACKUP_FILE"

echo "☁️  Uploading to S3..."
docker run --rm \
  -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  -e AWS_REGION="${AWS_REGION:-us-east-1}" \
  -v "$PROJECT_DIR/backups:/backups" \
  amazon/aws-cli \
  s3 cp "/backups/$BACKUP_FILE" "s3://${S3_BUCKET_NAME}/backups/${BACKUP_FILE}"

# Keep only last 7 local backups
ls -1t backups/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "✅ Backup uploaded: s3://${S3_BUCKET_NAME}/backups/${BACKUP_FILE}"
