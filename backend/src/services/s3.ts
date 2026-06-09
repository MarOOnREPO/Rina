import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

export const isS3Configured = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);

if (!isS3Configured) {
  console.warn('[S3] AWS credentials not configured — S3 features disabled');
}

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'rina-uploads';

// ─── AWS S3 Client ───────────────────────────────────────────────
export const s3Client = isS3Configured
  ? new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID!,
        secretAccessKey: AWS_SECRET_ACCESS_KEY!
      }
    })
  : null as any; // Cast for type compatibility; guard with isS3Configured before use

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

export async function listObjects(prefix?: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const objects: Array<{ key: string; size: number; lastModified: Date }> = [];
  let continuationToken: string | undefined;
  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000
    });
    const response = await s3Client.send(command);
    for (const obj of response.Contents || []) {
      if (obj.Key && obj.Size && obj.LastModified) {
        objects.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  return objects;
}

export { BUCKET_NAME };
