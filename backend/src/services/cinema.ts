import type { CinemaSource, CinemaSession, CinemaTmdbMetadata } from '../types/cinema.js';

const WORKER_URL = process.env.CINEMA_WORKER_URL || 'http://cinema-worker:4000';

// In-memory metadata cache for cinema sessions (backend supplements worker state)
const cinemaMetadata = new Map<string, { filename?: string; s3Key?: string; metadata?: CinemaTmdbMetadata }>();

export function setCinemaMetadata(
  sessionId: string,
  data: { filename?: string; s3Key?: string; metadata?: CinemaTmdbMetadata }
): void {
  cinemaMetadata.set(sessionId, data);
}

export function getCinemaMetadata(
  sessionId: string
): { filename?: string; s3Key?: string; metadata?: CinemaTmdbMetadata } | undefined {
  return cinemaMetadata.get(sessionId);
}

export function clearCinemaMetadata(sessionId: string): void {
  cinemaMetadata.delete(sessionId);
}

export async function createCinemaSession(source: CinemaSource): Promise<string> {
  const workerSource: { type: 'torrent' | 'direct'; uri: string } =
    source.type === 'upload'
      ? { type: 'direct', uri: source.uri }
      : { type: source.type, uri: source.uri };

  const res = await fetch(`${WORKER_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workerSource)
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      typeof body.error === 'string'
        ? body.error
        : `Cinema worker failed to start session (${res.status})`
    );
  }
  const data = await res.json() as { id: string };
  return data.id;
}

export async function getSession(id: string): Promise<CinemaSession | undefined> {
  const res = await fetch(`${WORKER_URL}/session/${id}`);
  if (!res.ok) return undefined;
  const session = (await res.json()) as CinemaSession;
  const meta = cinemaMetadata.get(id);
  if (meta) {
    session.source = {
      ...session.source,
      filename: meta.filename,
      s3Key: meta.s3Key,
      metadata: meta.metadata
    };
  }
  return session;
}

export async function getPlaylist(id: string): Promise<Buffer | null> {
  const res = await fetch(`${WORKER_URL}/stream/${id}/playlist.m3u8`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function getSegment(id: string, filename: string): Promise<Buffer | null> {
  const res = await fetch(`${WORKER_URL}/stream/${id}/${encodeURIComponent(filename)}`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function destroySession(id: string): Promise<void> {
  await fetch(`${WORKER_URL}/session/${id}`, { method: 'DELETE' });
  cinemaMetadata.delete(id);
}
