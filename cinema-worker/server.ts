import { mkdir, readdir, readFile, rm, stat, appendFile } from 'fs/promises';
import { Readable, Transform } from 'stream';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import WebTorrent from 'webtorrent';
import Fastify from 'fastify';
import cors from '@fastify/cors';

ffmpeg.setFfmpegPath(typeof ffmpegPath === 'string' ? ffmpegPath : 'ffmpeg');

const TMP_ROOT = path.join('/tmp', 'rina-cinema');

interface CinemaSource {
  type: 'torrent' | 'direct';
  uri: string;
}

interface CinemaSession {
  id: string;
  source: CinemaSource;
  outputDir: string;
  playlistPath: string;
  status: 'starting' | 'ready' | 'error' | 'completed';
  error?: string;
  createdAt: number;
  completedAt?: number;
  torrentInterval?: NodeJS.Timeout;
  ffmpegStartTime?: number;
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

function createBufferTransform(targetBytes: number) {
  const chunks: Buffer[] = [];
  let buffered = 0;
  let ready = false;
  return new Transform({
    transform(chunk, encoding, callback) {
      if (!ready) {
        chunks.push(chunk);
        buffered += chunk.length;
        if (buffered >= targetBytes) {
          ready = true;
          for (const c of chunks) this.push(c);
          chunks.length = 0;
        }
        callback();
      } else {
        callback(null, chunk);
      }
    },
    flush(callback) {
      if (!ready) {
        for (const c of chunks) this.push(c);
        chunks.length = 0;
      }
      callback();
    }
  });
}

function startFfmpegWithRetry(
  session: CinemaSession,
  getInputStream: () => Promise<NodeJS.ReadableStream>,
  retryCount = 0
): void {
  session.ffmpegStartTime = Date.now();
  getInputStream()
    .then((inputStream) => {
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
          path.join(session.outputDir, 'segment_%03d.m4s')
        ])
        .on('start', (cmd) => console.log(`[Cinema ${session.id}] FFmpeg started:`, cmd))
        .on('error', (err) => {
          if (err.message.includes('Exiting normally')) return;
          console.error(`[Cinema ${session.id}] FFmpeg error:`, err.message);

          if (err.message.includes('Invalid data found when processing input') && retryCount < 3) {
            console.log(`[Cinema ${session.id}] Retrying ffmpeg in 5s... (attempt ${retryCount + 1}/3)`);
            session.status = 'starting';
            setTimeout(() => {
              startFfmpegWithRetry(session, getInputStream, retryCount + 1);
            }, 5000);
            return;
          }

          session.status = 'error';
          session.error = err.message;
        })
        .on('end', () => {
          console.log(`[Cinema ${session.id}] FFmpeg finished`);
          session.status = 'completed';
          session.completedAt = Date.now();
          appendEndlist(session.playlistPath).catch(() => {});
        })
        .save(session.playlistPath);
    })
    .catch((err) => {
      console.error(`[Cinema ${session.id}] Failed to get input stream:`, err.message);
      session.status = 'error';
      session.error = err.message;
    });
}

async function createCinemaSession(source: CinemaSource): Promise<string> {
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

  (async () => {
    try {
      let getInputStream: () => Promise<NodeJS.ReadableStream>;

      if (source.type === 'torrent') {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Could not find torrent metadata (no seeders?)')), 120000);
          const opts = {
            announce: [
              'udp://tracker.openbittorrent.com:80',
              'udp://tracker.opentrackr.org:1337',
              'udp://tracker.coppersurfer.tk:6969',
              'udp://tracker.leechers-paradise.org:6969',
              'wss://tracker.openwebtorrent.com',
              'wss://tracker.files.fm:7073/announce'
            ]
          };
          webtorrentClient.add(source.uri, opts, (torrent: import('webtorrent').Torrent) => {
            clearTimeout(timeout);
            const file = torrent.files.find((f: import('webtorrent').TorrentFile) => /\.(mkv|mp4|avi|mov|webm|mpeg|mpg)$/i.test(f.name));
            if (!file) {
              torrent.destroy();
              return reject(new Error('No video file found in this torrent'));
            }

            const progressInterval = setInterval(() => {
              console.log(`[Cinema ${id}] Torrent progress: ${(torrent.progress * 100).toFixed(1)}%, speed: ${(torrent.downloadSpeed / 1024).toFixed(1)} KB/s, peers: ${torrent.numPeers}`);
            }, 5000);
            session.torrentInterval = progressInterval;
            torrent.on('done', () => clearInterval(progressInterval));
            torrent.on('error', () => clearInterval(progressInterval));

            getInputStream = async () => {
              const fileStream = file.createReadStream();
              const bufferTransform = createBufferTransform(1024 * 1024);
              fileStream.pipe(bufferTransform);
              return bufferTransform;
            };

            resolve();
          });
        });
      } else {
        getInputStream = async () => {
          const res = await fetch(source.uri);
          if (!res.body) throw new Error('Failed to fetch direct link: no body');
          return Readable.fromWeb(res.body as any);
        };
      }

      startFfmpegWithRetry(session, getInputStream!);
      await waitForPlaylistReady(session, playlistPath, outputDir);
      session.status = 'ready';
    } catch (err: any) {
      session.status = 'error';
      session.error = err.message;
    }
  })();

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
      if (st.size > 0 && st.mtime.getTime() >= (session.ffmpegStartTime || 0)) {
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

function getSession(id: string): CinemaSession | undefined {
  return sessions.get(id);
}

async function getPlaylist(id: string): Promise<Buffer | null> {
  const session = sessions.get(id);
  if (!session) return null;
  try {
    return await readFile(session.playlistPath);
  } catch {
    return null;
  }
}

async function getSegment(id: string, filename: string): Promise<Buffer | null> {
  const session = sessions.get(id);
  if (!session) return null;

  // File-type whitelist
  if (!/\.(m4s|mp4|m3u8)$/.test(filename)) {
    return null;
  }

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

async function destroySession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  if (session.torrentInterval) clearInterval(session.torrentInterval);
  sessions.delete(id);
  try {
    await rm(session.outputDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`[Cinema ${id}] Failed to cleanup:`, err);
  }
}

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, { origin: true, credentials: true });

  app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });

  app.post('/session', async (request, reply) => {
    const body = request.body as { type: 'torrent' | 'direct'; uri: string };
    const id = await createCinemaSession({ type: body.type, uri: body.uri });
    const session = getSession(id)!;
    return {
      id: session.id,
      status: session.status,
      playlistUrl: '/stream/' + id + '/playlist.m3u8'
    };
  });

  app.get('/session/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return {
      id: session.id,
      status: session.status,
      source: session.source,
      createdAt: session.createdAt,
      error: session.error
    };
  });

  app.get('/stream/:id/playlist.m3u8', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getPlaylist(id);
    if (!data) {
      return reply.status(404).send({ error: 'Playlist not found' });
    }
    return reply
      .header('Content-Type', 'application/vnd.apple.mpegurl')
      .send(data);
  });

  app.get('/stream/:id/:filename', async (request, reply) => {
    const { id, filename } = request.params as { id: string; filename: string };
    const data = await getSegment(id, filename);
    if (!data) {
      return reply.status(404).send({ error: 'Segment not found' });
    }
    const contentType = filename.endsWith('.m3u8')
      ? 'application/vnd.apple.mpegurl'
      : 'video/iso.segment';
    return reply
      .header('Content-Type', contentType)
      .send(data);
  });

  app.delete('/session/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await destroySession(id);
    return { ok: true };
  });

  try {
    await app.listen({ port: 4000, host: '0.0.0.0' });
    console.log('Cinema worker listening on port 4000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
