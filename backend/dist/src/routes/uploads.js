import { Server as TusServer } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { authenticateJWT } from '../middleware/auth.js';
import { getPresignedDownloadUrl } from '../services/s3.js';
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'rina-uploads';
// ─── Tus Server with S3 Store ────────────────────────────────────
const s3Store = new S3Store({
    s3ClientConfig: {
        region: process.env.AWS_REGION || 'us-east-1',
        endpoint: `http${MINIO_USE_SSL ? 's' : ''}://${MINIO_ENDPOINT}:${MINIO_PORT}`,
        credentials: {
            accessKeyId: MINIO_ACCESS_KEY,
            secretAccessKey: MINIO_SECRET_KEY
        },
        forcePathStyle: true,
        bucket: BUCKET_NAME
    },
    partSize: 8 * 1024 * 1024 // 8MB multipart chunks
});
const tusServer = new TusServer({
    path: '/api/upload',
    datastore: s3Store,
    namingFunction: () => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        return id;
    }
});
export default async function uploadRoutes(fastify, _opts) {
    // Proxy all methods for Tus protocol
    fastify.all('/*', { preValidation: [authenticateJWT] }, async (request, reply) => {
        // Hijack Fastify response so Tus can handle it directly
        reply.hijack();
        await tusServer.handle(request.raw, reply.raw);
    });
    // Presigned download URL helper
    fastify.get('/url/:key', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const params = request.params;
            const url = await getPresignedDownloadUrl(params.key, 300);
            return reply.send({ url });
        }
        catch (error) {
            console.error('[Upload URL Error]', error);
            return reply.status(500).send({ error: 'Failed to generate presigned URL' });
        }
    });
}
//# sourceMappingURL=uploads.js.map