import { prisma } from './prisma.js';

const CONFIG_CACHE = new Map<string, string>();
let CACHE_LOADED = false;

const ENV_DEFAULTS: Record<string, string> = {
  DOMAIN: process.env.DOMAIN || '',
  FRONTEND_URL: process.env.FRONTEND_URL || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
  YOUTUBE_INVIOUS_INSTANCE: process.env.YOUTUBE_INVIOUS_INSTANCE || 'vid.puffyan.us',
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  TMDB_API_KEY: process.env.TMDB_API_KEY || '',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || 'rina-uploads',
  COTURN_REALM: process.env.COTURN_REALM || '',
  COTURN_SECRET: process.env.COTURN_SECRET || '',
  BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY || '',
};

export const CONFIG_KEYS = [
  'DOMAIN',
  'FRONTEND_URL',
  'CORS_ORIGIN',
  'YOUTUBE_INVIOUS_INSTANCE',
  'SPOTIFY_TOKEN_ENCRYPTION_KEY',
  'VITE_SPOTIFY_CLIENT_ID',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'TMDB_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'S3_BUCKET_NAME',
  'COTURN_REALM',
  'COTURN_SECRET',
  'BACKUP_ENCRYPTION_KEY',
  'VITE_MAPBOX_TOKEN',
] as const;

export type ConfigKey = typeof CONFIG_KEYS[number];

async function loadCache(): Promise<void> {
  if (CACHE_LOADED) return;
  const rows = await prisma.config.findMany();
  for (const row of rows) {
    CONFIG_CACHE.set(row.key, row.value);
  }
  CACHE_LOADED = true;
}

export async function getConfig(key: ConfigKey): Promise<string> {
  await loadCache();
  return CONFIG_CACHE.get(key) ?? ENV_DEFAULTS[key] ?? '';
}

export async function getAllConfig(): Promise<Record<ConfigKey, string>> {
  await loadCache();
  const result = {} as Record<ConfigKey, string>;
  for (const key of CONFIG_KEYS) {
    result[key] = CONFIG_CACHE.get(key) ?? ENV_DEFAULTS[key] ?? '';
  }
  return result;
}

export async function setConfig(
  key: ConfigKey,
  value: string,
  updatedBy?: string
): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    update: { value, updatedAt: new Date(), updatedBy: updatedBy || null },
    create: { key, value, updatedAt: new Date(), updatedBy: updatedBy || null },
  });
  CONFIG_CACHE.set(key, value);
}

export async function deleteConfig(key: ConfigKey): Promise<void> {
  await prisma.config.deleteMany({ where: { key } });
  CONFIG_CACHE.delete(key);
}

export function isFeatureEnabled(key: ConfigKey): boolean {
  const val = CONFIG_CACHE.get(key) ?? ENV_DEFAULTS[key] ?? '';
  if (key === 'YOUTUBE_INVIOUS_INSTANCE') return val.length > 0;
  if (key === 'BACKUP_ENCRYPTION_KEY') return val.length >= 32;
  return val.length > 0 && !val.startsWith('your_') && val !== '<GENERATE_WITH_OPENSSL_RAND_HEX_32>';
}

export async function buildPublicConfig(): Promise<{
  features: {
    youtube: boolean;
    push: boolean;
    uploads: boolean;
    cinema: boolean;
    tmdb: boolean;
    backup: boolean;
    mapbox: boolean;
  };
  domain: string;
  frontendUrl: string;
  vapidPublicKey: string | null;
  mapboxToken: string | null;
  youtubeInstance: string;
}> {
  await loadCache();
  const youtubeInstance = await getConfig('YOUTUBE_INVIOUS_INSTANCE');
  const vapidPub = await getConfig('VAPID_PUBLIC_KEY');
  const vapidPriv = await getConfig('VAPID_PRIVATE_KEY');
  const awsId = await getConfig('AWS_ACCESS_KEY_ID');
  const awsSecret = await getConfig('AWS_SECRET_ACCESS_KEY');
  const tmdb = await getConfig('TMDB_API_KEY');
  const backup = await getConfig('BACKUP_ENCRYPTION_KEY');
  const mapboxToken = await getConfig('VITE_MAPBOX_TOKEN');

  return {
    features: {
      youtube: !!(youtubeInstance && !youtubeInstance.startsWith('your_')),
      push: !!(vapidPub && vapidPriv && !vapidPub.startsWith('your_')),
      uploads: !!(awsId && awsSecret && !awsId.startsWith('your_')),
      cinema: true,
      tmdb: !!(tmdb && !tmdb.startsWith('your_')),
      backup: backup.length >= 32,
      mapbox: !!(mapboxToken && !mapboxToken.startsWith('your_')),
    },
    domain: await getConfig('DOMAIN'),
    frontendUrl: await getConfig('FRONTEND_URL'),
    vapidPublicKey: vapidPub && !vapidPub.startsWith('your_') ? vapidPub : null,
    mapboxToken: mapboxToken && !mapboxToken.startsWith('your_') ? mapboxToken : null,
    youtubeInstance: youtubeInstance || 'vid.puffyan.us',
  };
}
