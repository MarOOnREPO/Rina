import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';

if (!MINIO_ENDPOINT) {
  console.error('[Fatal] MINIO_ENDPOINT must be set');
  process.exit(1);
}

if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  console.error('[Fatal] MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set');
  process.exit(1);
}

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'rina-uploads';

// ─── S3-Compatible Client (MinIO / AWS S3) ───────────────────────
export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: `http${MINIO_USE_SSL ? 's' : ''}://${MINIO_ENDPOINT}:${MINIO_PORT}`,
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY
  },
  forcePathStyle: true // Required for MinIO
});

// ─── Presigned URL Helpers ───────────────────────────────────────
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 300
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });
  await s3Client.send(command);
}

export { BUCKET_NAME };
