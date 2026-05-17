import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { prisma } from '../services/prisma.js';
import { redis } from '../services/redis.js';
import { s3Client, BUCKET_NAME } from '../services/s3.js';

export default async function setupRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/status', async (_request, reply) => {
    const result = {
      timestamp: new Date().toISOString(),
      healthy: true,
      environment: {
        domain: process.env.DOMAIN || null,
        corsOrigin: process.env.CORS_ORIGIN || null,
        bucketName: BUCKET_NAME,
        nodeEnv: process.env.NODE_ENV || 'development'
      },
      checks: {
        database: false,
        redis: false,
        s3: false
      }
    };

    // Database check
    try {
      await prisma.$queryRaw`SELECT 1`;
      result.checks.database = true;
    } catch (err) {
      result.healthy = false;
      fastify.log.warn(`[Setup] Database check failed: ${err}`);
    }

    // Redis check
    try {
      const pong = await redis.ping();
      result.checks.redis = pong === 'PONG';
      if (!result.checks.redis) result.healthy = false;
    } catch (err) {
      result.healthy = false;
      fastify.log.warn(`[Setup] Redis check failed: ${err}`);
    }

    // S3 check
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
      result.checks.s3 = true;
    } catch (err) {
      result.healthy = false;
      fastify.log.warn(`[Setup] S3 check failed: ${err}`);
    }

    return reply.status(200).send(result);
  });
}
