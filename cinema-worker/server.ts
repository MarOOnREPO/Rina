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
  // Live progress for the frontend
  progress?: {
    type: 'torrent' | 'transcode';
    percent: number;
    speed?: string;
    peers?: number;
    message?: string;
  };
}

const sessions = new Map<string, CinemaSession>();
const webtorrentClient = new WebTorrent();

// Cleanup old sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.status === 'error' && now - session.createdAt > 1000 * 60 * 30) {
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

async function cleanupOutputDir(outputDir: string, playlistPath: string): Promise<void> {
  try {
    const files = await readdir(outputDir).catch(() => [] as string[]);
    for (const f of files) {
      if (f === 'playlist.m3u8' || f.startsWith('segment_') || f === 'init.mp4') {
        await rm(path.join(outputDir, f)).catch(() => {});
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

function startFfmpegWithRetry(
  session: CinemaSession,
  getInputStream: () => Promise<NodeJS.ReadableStream>,
  retryCount = 0
): void {
  session.ffmpegStartTime = Date.now();
  getInputStream()
    .then((inputStream) => {
      // Report transcode starting
      session.progress = { type: 'transcode', percent: 0, message: 'Starting transcoder...' };

      const ffmpegProc = ffmpeg(inputStream as any)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset ultrafast',
          '-tune zerolatency',
          '-profile:v baseline',
          '-level 3.1',
          '-g 48',
          '-keyint_min 48',
          '-sc_threshold 0',
          '-pix_fmt yuv420p',
          '-f hls',
          '-hls_time 4',
          '-hls_playlist_type event',
          '-hls_flags independent_segments+omit_endlist',
          '-hls_segment_filename',
          path.join(session.outputDir, 'segment_%03d.ts')
        ])
        .on('start', (cmd) => console.log(`[Cinema ${session.id}] FFmpeg started:`, cmd))
        .on('progress', (p) => {
          const percent = p.percent ? Math.min(Math.round(p.percent), 99) : 0;
          session.progress = {
            type: 'transcode',
            percent,
            message: percent > 0 ? `Transcoding ${percent}%` : 'Transcoding...'
          };
        })
        .on('error', async (err) => {
          if (err.message.includes('Exiting normally')) return;
          console.error(`[Cinema ${session.id}] FFmpeg error:`, err.message);

          if (err.message.includes('Invalid data found when processing input') && retryCount < 3) {
            console.log(`[Cinema ${session.id}] Retrying ffmpeg in 5s... (attempt ${retryCount + 1}/3)`);
            session.status = 'starting';
            session.progress = { type: 'transcode', percent: 0, message: `Retrying (${retryCount + 1}/3)...` };
            // Kill current ffmpeg process
            try { ffmpegProc.kill('SIGKILL'); } catch {}
            // Clean old output so waitForPlaylistReady doesn't get confused
            await cleanupOutputDir(session.outputDir, session.playlistPath);
            setTimeout(() => {
              startFfmpegWithRetry(session, getInputStream, retryCount + 1);
            }, 5000);
            return;
          }

          session.status = 'error';
          session.error = err.message;
          session.progress = { type: 'transcode', percent: 0, message: err.message };
        })
        .on('end', () => {
          console.log(`[Cinema ${session.id}] FFmpeg finished`);
          session.status = 'completed';
          session.completedAt = Date.now();
          session.progress = { type: 'transcode', percent: 100, message: 'Complete' };
          appendEndlist(session.playlistPath).catch(() => {});
        })
        .save(session.playlistPath);

      // Stall timeout: if ffmpeg makes no progress for 5 minutes, kill it
      // (torrents can be legitimately slow; uploads/direct links get 4 min)
      const stallTimeoutMs = session.source.type === 'torrent' ? 300000 : 240000;
      const stallTimeout = setTimeout(() => {
        if (session.status === 'starting' || session.status === 'ready') {
          console.error(`[Cinema ${session.id}] FFmpeg stall detected (>${stallTimeoutMs / 1000}s no progress), killing...`);
          try { ffmpegProc.kill('SIGKILL'); } catch {}
          session.status = 'error';
          session.error = 'Transcoding stalled: input stream too slow or unresponsive. Try a different torrent/link.';
          session.progress = { type: 'transcode', percent: 0, message: session.error };
        }
      }, stallTimeoutMs);

      ffmpegProc.on('end', () => clearTimeout(stallTimeout));
      ffmpegProc.on('error', () => clearTimeout(stallTimeout));
    })
    .catch((err) => {
      console.error(`[Cinema ${session.id}] Failed to get input stream:`, err.message);
      session.status = 'error';
      session.error = err.message;
      session.progress = { type: 'transcode', percent: 0, message: err.message };
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
    createdAt: Date.now(),
    progress: { type: 'transcode', percent: 0, message: 'Starting...' }
  };
  sessions.set(id, session);

  (async () => {
    try {
      let getInputStream: () => Promise<NodeJS.ReadableStream>;

      if (source.type === 'torrent') {
        session.progress = { type: 'torrent', percent: 0, message: 'Finding peers...' };
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
              const percent = Math.round(torrent.progress * 100);
              const speed = torrent.downloadSpeed;
              const speedStr = speed > 1024 * 1024
                ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
                : `${(speed / 1024).toFixed(1)} KB/s`;
              session.progress = {
                type: 'torrent',
                percent,
                speed: speedStr,
                peers: torrent.numPeers,
                message: `Torrent ${percent}% · ${speedStr} · ${torrent.numPeers} peers`
              };
              console.log(`[Cinema ${id}] ${session.progress!.message}`);
            }, 3000);
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
      session.progress = { type: 'transcode', percent: 100, message: 'Ready' };
    } catch (err: any) {
      session.status = 'error';
      session.error = err.message;
      session.progress = { type: 'transcode', percent: 0, message: err.message };
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
  while (Date.now() - start < 300000) {
    if (session.status === 'error') throw new Error(session.error || 'Session failed during startup');
    try {
      const st = await stat(playlistPath);
      // Check playlist was created AFTER current ffmpeg start AND has content + segments
      if (st.size > 0 && st.mtime.getTime() >= (session.ffmpegStartTime || 0)) {
        const files = await readdir(outputDir);
        const segments = files.filter((f) => f.startsWith('segment_') && f.endsWith('.ts'));
        if (segments.length >= 1) {
          console.log(`[Cinema ${session.id}] Playlist ready: ${segments.length} TS segments`);
          return;
        }
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

async function destroySession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  if (session.torrentInterval) clearInterval(session.torrentInterval);
  sessions.delete(id);
  try {
    await rm(session.outputDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ─── Fastify Server ─────────────────────────────────────────────────
const app = Fastify({ logger: true });

app.register(cors, {
  origin: true,
  credentials: true
});

app.post('/session', async (request, reply) => {
  const body = request.body as CinemaSource;
  if (!body || !body.type || !body.uri) {
    return reply.status(400).send({ error: 'Invalid source' });
  }
  const id = await createCinemaSession(body);
  return reply.status(201).send({ id });
});

app.get('/session/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const session = getSession(id);
  if (!session) return reply.status(404).send({ error: 'Session not found' });
  return reply.send({
    id: session.id,
    status: session.status,
    source: session.source,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    error: session.error || undefined,
    progress: session.progress
  });
});

app.delete('/session/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  await destroySession(id);
  return reply.send({ ok: true });
});

app.get('/stream/:id/playlist.m3u8', async (request, reply) => {
  const { id } = request.params as { id: string };
  const session = getSession(id);
  if (!session) return reply.status(404).send({ error: 'Session not found' });
  try {
    const data = await readFile(session.playlistPath);
    return reply.header('Content-Type', 'application/vnd.apple.mpegurl').send(data);
  } catch {
    return reply.status(404).send({ error: 'Playlist not ready' });
  }
});

app.get('/stream/:id/:filename', async (request, reply) => {
  const { id, filename } = request.params as { id: string; filename: string };
  const session = getSession(id);
  if (!session) return reply.status(404).send({ error: 'Session not found' });
  const safe = path.basename(filename);
  const filePath = path.join(session.outputDir, safe);
  if (!filePath.startsWith(session.outputDir)) {
    return reply.status(400).send({ error: 'Invalid filename' });
  }
  try {
    const data = await readFile(filePath);
    const ext = safe.split('.').pop()?.toLowerCase();
    const mime = ext === 'm3u8' ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
    return reply.header('Content-Type', mime).send(data);
  } catch {
    return reply.status(404).send({ error: 'Segment not found' });
  }
});

app.get('/health', async (_request, reply) => {
  return reply.send({ ok: true });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`[Cinema Worker] Listening on port ${PORT}`);
});
