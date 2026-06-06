import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { Server as TusServer } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { authenticateJWT } from '../middleware/auth.js';
import { getPresignedDownloadUrl } from '../services/s3.js';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'rina-uploads';

const isUploadsEnabled = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
let tusServer: TusServer | null = null;

if (isUploadsEnabled) {
  const s3Store = new S3Store({
    s3ClientConfig: {
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      },
      bucket: BUCKET_NAME
    },
    partSize: 50 * 1024 * 1024 // 50MB S3 parts — matches frontend chunk size
  });

  tusServer = new TusServer({
    path: '/api/upload',
    datastore: s3Store,
    namingFunction: () => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      return id;
    },
    maxSize: 5 * 1024 * 1024 * 1024, // 5GB
    respectForwardedHeaders: true,
    relativeLocation: true
  });
} else {
  console.warn('[Uploads] AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY missing — uploads disabled');
}

const KEY_REGEX = /^[a-zA-Z0-9!_.*'()-/]+$/;

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm', '.mp3', '.wav', '.m4a', '.ogg', '.pdf', '.txt', '.mkv', '.avi', '.mpeg', '.mpg'];

function getFilenameFromMetadata(header: string): string | null {
  const pairs = header.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.trim().split(' ');
    if (key === 'filename' && value) {
      return Buffer.from(value, 'base64').toString('utf-8');
    }
  }
  return null;
}

async function tusProxyHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!isUploadsEnabled || !tusServer) {
    return reply.status(503).send({ error: 'Uploads not configured' });
  }
  const uploadMetadata = request.headers['upload-metadata'] as string | undefined;
  if (uploadMetadata) {
    const filename = getFilenameFromMetadata(uploadMetadata);
    if (filename) {
      const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return reply.status(400).send({ error: 'Invalid file type' });
      }
    }
  }

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
}

export default async function uploadRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // Allow TUS PATCH content type through Fastify's parser
  fastify.addContentTypeParser('application/offset+octet-stream', (_request, payload, done) => {
    done(null, payload);
  });

  // TUS creation endpoint: POST /api/upload
  fastify.all('/', { preValidation: [authenticateJWT] }, tusProxyHandler);
  // TUS continuation endpoints: HEAD/PATCH/DELETE /api/upload/:id
  fastify.all('/*', { preValidation: [authenticateJWT] }, tusProxyHandler);

  // Presigned download URL helper
  fastify.get('/url/:key', { preValidation: [authenticateJWT] }, async (request, reply) => {
    if (!isUploadsEnabled) {
      return reply.status(503).send({ error: 'Uploads not configured' });
    }
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
