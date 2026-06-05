import type { CinemaSource, CinemaSession } from '../types/cinema.js';

const WORKER_URL = process.env.CINEMA_WORKER_URL || 'http://cinema-worker:4000';

export async function createCinemaSession(source: CinemaSource): Promise<string> {
  const res = await fetch(`${WORKER_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source)
  });
  if (!res.ok) throw new Error('Cinema worker failed to start session');
  const data = await res.json() as { id: string };
  return data.id;
}

export async function getSession(id: string): Promise<CinemaSession | undefined> {
  const res = await fetch(`${WORKER_URL}/session/${id}`);
  if (!res.ok) return undefined;
  return (await res.json()) as CinemaSession;
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
}
