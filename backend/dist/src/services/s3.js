import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
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
export async function getPresignedUploadUrl(key, contentType, expiresIn = 300) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType
    });
    return getSignedUrl(s3Client, command, { expiresIn });
}
export async function getPresignedDownloadUrl(key, expiresIn = 300) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
    });
    return getSignedUrl(s3Client, command, { expiresIn });
}
export { BUCKET_NAME };
//# sourceMappingURL=s3.js.map