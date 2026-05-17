import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Server as TusServer } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { authenticateJWT } from '../middleware/auth.js';
import { getPresignedDownloadUrl } from '../services/s3.js';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'rina-uploads';

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error('[Fatal] AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set');
  process.exit(1);
}

// ─── Tus Server with S3 Store ────────────────────────────────────
const s3Store = new S3Store({
  s3ClientConfig: {
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    },
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

const KEY_REGEX = /^[a-zA-Z0-9!_.*'()-/]+$/;

export default async function uploadRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // Proxy all methods for Tus protocol
  fastify.all('/*', { preValidation: [authenticateJWT] }, async (request, reply) => {
    // Hijack Fastify response so Tus can handle it directly
    reply.hijack();
    try {
      await tusServer.handle(request.raw, reply.raw);
    } catch (err) {
      console.error('[Tus Error]', err);
      if (!reply.raw.writableEnded) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: 'Upload processing failed' }));
      }
    }
  });

  // Presigned download URL helper
  fastify.get('/url/:key', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const params = request.params as { key: string };
      const key = decodeURIComponent(params.key);

      if (!KEY_REGEX.test(key) || key.includes('..')) {
        return reply.status(400).send({ error: 'Invalid key format' });
      }

      const url = await getPresignedDownloadUrl(key, 300);
      return reply.send({ url });
    } catch (error) {
      console.error('[Upload URL Error]', error);
      return reply.status(500).send({ error: 'Failed to generate presigned URL' });
    }
  });
}
