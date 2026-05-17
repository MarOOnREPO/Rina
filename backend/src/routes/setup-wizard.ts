import { exec } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { promisify } from 'util';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

const execAsync = promisify(exec);
const ENV_PATH = '/host/.env';

const SENSITIVE_KEYS = [
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
  'COOKIE_SECRET',
  'AWS_SECRET_ACCESS_KEY',
  'MAROON_PASSWORD_HASH',
  'RINA_PASSWORD_HASH',
  'VAPID_PRIVATE_KEY',
  'COTURN_SECRET'
];

function maskValue(key: string, value: string): string {
  if (!value) return '';
  if (SENSITIVE_KEYS.includes(key)) {
    if (value.length <= 8) return '****';
    return value.slice(0, 4) + '****' + value.slice(-4);
  }
  return value;
}

function parseEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.slice(0, idx);
      let value = trimmed.slice(idx + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

function serializeEnv(env: Record<string, string>): string {
  const lines: string[] = [];
  lines.push('# ─────────────────────────────────────────────────────────────────');
  lines.push('# Project Rina — Environment Configuration');
  lines.push('# Copy this file to .env and fill in ALL values before deploying.');
  lines.push('# WARNING: Never commit .env to version control. Keep file permissions at 600.');
  lines.push('# ─────────────────────────────────────────────────────────────────');
  lines.push('');

  const groups = [
    { title: 'Domain', keys: ['DOMAIN'] },
    { title: 'Database', keys: ['POSTGRES_PASSWORD'] },
    { title: 'JWT Authentication', keys: ['JWT_SECRET'] },
    { title: 'Cookie Signing', keys: ['COOKIE_SECRET'] },
    { title: 'CORS Origin', keys: ['CORS_ORIGIN'] },
    { title: 'Redis', keys: ['REDIS_URL'] },
    { title: 'AWS S3 Storage', keys: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME'] },
    { title: 'Auth Password Hashes', keys: ['MAROON_PASSWORD_HASH', 'RINA_PASSWORD_HASH'] },
    { title: 'TMDB API', keys: ['TMDB_API_KEY'] },
    { title: 'Mapbox', keys: ['VITE_MAPBOX_TOKEN'] },
    { title: 'Web Push VAPID Keys', keys: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] },
    { title: 'Coturn TURN Server', keys: ['COTURN_REALM', 'COTURN_SECRET'] },
    { title: 'Application', keys: ['NODE_ENV', 'PORT'] }
  ];

  const handled = new Set<string>();

  for (const group of groups) {
    const hasAny = group.keys.some((k) => env[k] !== undefined);
    if (!hasAny) continue;
    lines.push(`# ─── ${group.title} ${'─'.repeat(Math.max(1, 62 - group.title.length))}`);
    for (const key of group.keys) {
      if (env[key] !== undefined) {
        lines.push(`${key}=${env[key]}`);
        handled.add(key);
      }
    }
    lines.push('');
  }

  const remaining = Object.entries(env).filter(([k]) => !handled.has(k));
  if (remaining.length > 0) {
    lines.push('# ─── Additional Variables ────────────────────────────────────────');
    for (const [key, value] of remaining) {
      lines.push(`${key}=${value}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export default async function setupWizardRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /api/setup-wizard/env
  fastify.get('/env', async (_request, reply) => {
    try {
      const content = await readFile(ENV_PATH, 'utf-8');
      const parsed = parseEnv(content);
      const masked: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        masked[key] = maskValue(key, value);
      }
      return reply.send({ env: masked, exists: true });
    } catch {
      return reply.send({ env: {}, exists: false });
    }
  });

  // POST /api/setup-wizard/env
  fastify.post('/env', async (request, reply) => {
    const body = request.body as Record<string, string>;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid body' });
    }

    try {
      let existing: Record<string, string> = {};
      try {
        const content = await readFile(ENV_PATH, 'utf-8');
        existing = parseEnv(content);
      } catch {
        // File doesn't exist yet
      }

      const merged = { ...existing, ...body };
      await writeFile(ENV_PATH, serializeEnv(merged), { mode: 0o600 });
      return reply.send({ success: true, message: '.env saved successfully' });
    } catch (err) {
      fastify.log.error(`Failed to write .env: ${err}`);
      return reply.status(500).send({ error: 'Failed to write .env' });
    }
  });

  // POST /api/setup-wizard/ssl
  fastify.post('/ssl', async (request, reply) => {
    const { domain, email } = request.body as { domain?: string; email?: string };
    if (!domain || !email) {
      return reply.status(400).send({ error: 'domain and email are required' });
    }

    try {
      const { stdout, stderr } = await execAsync(
        `cd /host && ./scripts/init-ssl.sh "${domain}" "${email}"`,
        { timeout: 120000, maxBuffer: 5 * 1024 * 1024 }
      );
      return reply.send({ success: true, output: stdout + stderr });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        output: (err.stdout || '') + (err.stderr || ''),
        error: err.message
      });
    }
  });

  // POST /api/setup-wizard/deploy
  fastify.post('/deploy', async (_request, reply) => {
    try {
      const { stdout, stderr } = await execAsync('cd /host && ./scripts/deploy.sh', {
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });
      return reply.send({ success: true, output: stdout + stderr });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        output: (err.stdout || '') + (err.stderr || ''),
        error: err.message
      });
    }
  });

  // POST /api/setup-wizard/backup
  fastify.post('/backup', async (_request, reply) => {
    try {
      const { stdout, stderr } = await execAsync('cd /host && ./scripts/backup-db.sh', {
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024
      });
      return reply.send({ success: true, output: stdout + stderr });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        output: (err.stdout || '') + (err.stderr || ''),
        error: err.message
      });
    }
  });

  // POST /api/setup-wizard/generate-vapid
  fastify.post('/generate-vapid', async (_request, reply) => {
    try {
      const webPush = await import('web-push');
      const keys = webPush.generateVAPIDKeys();
      return reply.send({ success: true, publicKey: keys.publicKey, privateKey: keys.privateKey });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /api/setup-wizard/status
  fastify.get('/status', async (_request, reply) => {
    const result = {
      timestamp: new Date().toISOString(),
      healthy: false,
      checks: {
        env: false,
        database: false,
        redis: false,
        s3: false
      }
    };

    let parsed: Record<string, string> = {};
    try {
      const content = await readFile(ENV_PATH, 'utf-8');
      parsed = parseEnv(content);
      if (parsed.JWT_SECRET && parsed.COOKIE_SECRET && parsed.DOMAIN && parsed.AWS_ACCESS_KEY_ID) {
        result.checks.env = true;
      }
    } catch {
      return reply.send(result);
    }

    // DB check via docker
    try {
      await execAsync('docker compose -f /host/docker-compose.yml exec -T postgres pg_isready -U rina_user -d rina_db', {
        timeout: 10000
      });
      result.checks.database = true;
    } catch {
      result.checks.database = false;
    }

    // Redis check via docker
    try {
      await execAsync('docker compose -f /host/docker-compose.yml exec -T redis redis-cli ping', {
        timeout: 10000
      });
      result.checks.redis = true;
    } catch {
      result.checks.redis = false;
    }

    // S3 check (best-effort: credentials present)
    result.checks.s3 = !!(
      parsed.AWS_ACCESS_KEY_ID &&
      parsed.AWS_SECRET_ACCESS_KEY &&
      parsed.S3_BUCKET_NAME
    );

    result.healthy = result.checks.database && result.checks.redis && result.checks.s3;
    return reply.send(result);
  });
}
