import { mkdir, readdir, readFile, rm, stat, appendFile } from 'fs/promises';
import { Readable } from 'stream';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import WebTorrent from 'webtorrent';

ffmpeg.setFfmpegPath(typeof ffmpegPath === 'string' ? ffmpegPath : 'ffmpeg');

const TMP_ROOT = path.join('/tmp', 'rina-cinema');

export interface CinemaSource {
  type: 'torrent' | 'direct';
  uri: string;
}

export interface CinemaSession {
  id: string;
  source: CinemaSource;
  outputDir: string;
  playlistPath: string;
  status: 'starting' | 'ready' | 'error' | 'completed';
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const sessions = new Map<string, CinemaSession>();
const webtorrentClient = new WebTorrent();

// Cleanup old sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.status === 'error' && now - session.createdAt > 1000 * 60 * 10) {
      destroySession(id).catch(() => {});
    }
    if (session.status === 'completed' && now - (session.completedAt || session.createdAt) > 1000 * 60 * 60 * 4) {
      destroySession(id).catch(() => {});
    }
  }
}, 1000 * 60 * 5);

export async function createCinemaSession(source: CinemaSource): Promise<string> {
  const id = `cinema-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const outputDir = path.join(TMP_ROOT, id);
  await mkdir(outputDir, { recursive: true });

  const playlistPath = path.join(outputDir, 'playlist.m3u8');
  const session: CinemaSession = {
    id,
    source,
    outputDir,
    playlistPath,
    status: 'starting',
    createdAt: Date.now()
  };
  sessions.set(id, session);

  try {
    let inputStream: NodeJS.ReadableStream;

    if (source.type === 'torrent') {
      inputStream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Torrent metadata timeout')), 120000);
        webtorrentClient.add(source.uri, (torrent: import('webtorrent').Torrent) => {
          clearTimeout(timeout);
          const file = torrent.files.find((f: import('webtorrent').TorrentFile) => /\.(mkv|mp4|avi|mov|webm|mpeg|mpg)$/i.test(f.name));
          if (!file) {
            torrent.destroy();
            return reject(new Error('No video file found in torrent'));
          }
          resolve(file.createReadStream());
        });
      });
    } else {
      const res = await fetch(source.uri);
      if (!res.body) throw new Error('Failed to fetch direct link: no body');
      inputStream = Readable.fromWeb(res.body as any);
    }

    ffmpeg(inputStream as any)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset ultrafast',
        '-tune zerolatency',
        '-g 48',
        '-keyint_min 48',
        '-sc_threshold 0',
        '-pix_fmt yuv420p',
        '-f hls',
        '-hls_time 4',
        '-hls_playlist_type event',
        '-hls_flags independent_segments+omit_endlist',
        '-hls_segment_type fmp4',
        '-hls_segment_filename',
        path.join(outputDir, 'segment_%03d.m4s')
      ])
      .on('start', (cmd) => console.log(`[Cinema ${id}] FFmpeg started:`, cmd))
      .on('error', (err) => {
        if (err.message.includes('Exiting normally')) return;
        console.error(`[Cinema ${id}] FFmpeg error:`, err.message);
        session.status = 'error';
        session.error = err.message;
      })
      .on('end', () => {
        console.log(`[Cinema ${id}] FFmpeg finished`);
        session.status = 'completed';
        session.completedAt = Date.now();
        appendEndlist(playlistPath).catch(() => {});
      })
      .save(playlistPath);

    // Wait for playlist and first segment
    await waitForPlaylistReady(session, playlistPath, outputDir);
    session.status = 'ready';
  } catch (err: any) {
    session.status = 'error';
    session.error = err.message;
    throw err;
  }

  return id;
}

async function waitForPlaylistReady(
  session: CinemaSession,
  playlistPath: string,
  outputDir: string
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    if (session.status === 'error') throw new Error(session.error || 'Session failed during startup');
    try {
      const st = await stat(playlistPath);
      if (st.size > 0) {
        const files = await readdir(outputDir);
        const segments = files.filter((f) => f.startsWith('segment_') && f.endsWith('.m4s'));
        if (segments.length >= 1) return;
      }
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Playlist generation timeout');
}

async function appendEndlist(playlistPath: string): Promise<void> {
  try {
    const data = await readFile(playlistPath, 'utf-8');
    if (!data.includes('#EXT-X-ENDLIST')) {
      await appendFile(playlistPath, '\n#EXT-X-ENDLIST\n');
    }
  } catch (err) {
    console.error('Failed to append ENDLIST:', err);
  }
}

export function getSession(id: string): CinemaSession | undefined {
  return sessions.get(id);
}

export async function getPlaylist(id: string): Promise<Buffer | null> {
  const session = sessions.get(id);
  if (!session) return null;
  try {
    return await readFile(session.playlistPath);
  } catch {
    return null;
  }
}

export async function getSegment(id: string, filename: string): Promise<Buffer | null> {
  const session = sessions.get(id);
  if (!session) return null;
  const filePath = path.join(session.outputDir, filename);
  // Security: ensure resolved path stays inside outputDir
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(session.outputDir);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    return null;
  }
  try {
    return await readFile(resolved);
  } catch {
    return null;
  }
}

export async function destroySession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  try {
    await rm(session.outputDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`[Cinema ${id}] Failed to cleanup:`, err);
  }
}
