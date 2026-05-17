import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { IncomingMessage } from 'http';
import { prisma } from './prisma.js';

// ─── Message Types (y-websocket protocol) ────────────────────────
const messageSync = 0;
const messageAwareness = 1;

// ─── Document Store ──────────────────────────────────────────────
const docs = new Map<string, Y.Doc>();
const awarenessMap = new Map<string, awarenessProtocol.Awareness>();
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Track which awareness client IDs belong to each WebSocket
const wsClientIds = new Map<WebSocket, Set<number>>();

async function loadDocState(room: string, doc: Y.Doc): Promise<void> {
  try {
    const session = await prisma.whiteboardSession.findFirst({
      where: { name: room },
      select: { ydocState: true }
    });
    if (session?.ydocState) {
      const update = new Uint8Array(session.ydocState);
      Y.applyUpdate(doc, update);
      console.log(`[Yjs] Loaded persisted state for room: ${room}`);
    }
  } catch (err) {
    console.error(`[Yjs] Failed to load state for room ${room}:`, err);
  }
}

async function saveDocState(room: string, doc: Y.Doc, userId?: string): Promise<void> {
  try {
    const update = Y.encodeStateAsUpdate(doc);
    await prisma.whiteboardSession.upsert({
      where: { name: room },
      update: { ydocState: Buffer.from(update), updatedAt: new Date() },
      create: {
        name: room,
        createdBy: userId || 'system',
        ydocState: Buffer.from(update)
      }
    });
    console.log(`[Yjs] Persisted state for room: ${room}`);
  } catch (err) {
    console.error(`[Yjs] Failed to save state for room ${room}:`, err);
  }
}

function debouncedSave(room: string, doc: Y.Doc, userId?: string): void {
  const existing = saveTimers.get(room);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    saveDocState(room, doc, userId);
    saveTimers.delete(room);
  }, 2000);
  saveTimers.set(room, timer);
}

function getDoc(room: string): Y.Doc {
  if (!docs.has(room)) {
    const doc = new Y.Doc();
    docs.set(room, doc);
    // Load persisted state asynchronously
    loadDocState(room, doc);
  }
  return docs.get(room)!;
}

function getAwareness(room: string): awarenessProtocol.Awareness {
  if (!awarenessMap.has(room)) {
    const doc = getDoc(room);
    const awareness = new awarenessProtocol.Awareness(doc);
    awarenessMap.set(room, awareness);

    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      // Track client IDs per WebSocket for cleanup on disconnect
      if (origin instanceof WebSocket) {
        const set = wsClientIds.get(origin) || new Set();
        for (const id of added) set.add(id);
        for (const id of removed) set.delete(id);
        wsClientIds.set(origin, set);
      }

      const changedClients = added.concat(updated).concat(removed);
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
      const message = new Uint8Array(1 + update.length);
      message[0] = messageAwareness;
      message.set(update, 1);
      broadcast(room, message, origin);
    });
  }
  return awarenessMap.get(room)!;
}

const connections = new Map<string, Set<WebSocket>>();

function getConnections(room: string): Set<WebSocket> {
  if (!connections.has(room)) {
    connections.set(room, new Set());
  }
  return connections.get(room)!;
}

function broadcast(room: string, message: Uint8Array, origin: unknown) {
  const conns = getConnections(room);
  conns.forEach((ws) => {
    if (ws !== origin && ws.readyState === WebSocket.OPEN) {
      send(ws, message);
    }
  });
}

function send(ws: WebSocket, message: Uint8Array) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
}

function updateHandler(update: Uint8Array, origin: unknown, doc: Y.Doc, room: string, userId?: string) {
  const message = new Uint8Array(1 + update.length);
  message[0] = messageSync;
  message.set(update, 1);
  broadcast(room, message, origin);
  debouncedSave(room, doc, userId);
}

// ─── Setup Yjs WebSocket Server ──────────────────────────────────
export function createYjsWSS(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const room = url.searchParams.get('room') || 'default';
    const userId = (ws as unknown as Record<string, unknown>).userId as string | undefined;

    const doc = getDoc(room);
    const awareness = getAwareness(room);
    const conns = getConnections(room);
    conns.add(ws);

    // Send sync step 1 to new client
    const encoder = encoding.createEncoder();
    syncProtocol.writeSyncStep1(encoder, doc);
    const syncMessage = new Uint8Array(1 + encoding.length(encoder));
    syncMessage[0] = messageSync;
    syncMessage.set(encoding.toUint8Array(encoder), 1);
    send(ws, syncMessage);

    // Send current awareness state
    const awarenessStates = awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys()));
    const awarenessMessage = new Uint8Array(1 + awarenessStates.length);
    awarenessMessage[0] = messageAwareness;
    awarenessMessage.set(awarenessStates, 1);
    send(ws, awarenessMessage);

    const docUpdateHandler = (update: Uint8Array, origin: unknown) => updateHandler(update, origin, doc, room, userId);
    doc.on('update', docUpdateHandler);

    ws.on('message', (data: Buffer) => {
      try {
        const message = new Uint8Array(data);
        if (message.length === 0) return;

        const messageType = message[0];
        const payload = message.slice(1);

        if (messageType === messageSync) {
          const replyEncoder = encoding.createEncoder();
          const decoder = decoding.createDecoder(payload);
          syncProtocol.readSyncMessage(decoder, replyEncoder, doc, ws);
          if (encoding.length(replyEncoder) > 0) {
            const reply = new Uint8Array(1 + encoding.length(replyEncoder));
            reply[0] = messageSync;
            reply.set(encoding.toUint8Array(replyEncoder), 1);
            send(ws, reply);
          }
        } else if (messageType === messageAwareness) {
          awarenessProtocol.applyAwarenessUpdate(awareness, payload, ws);
        }
      } catch (err) {
        console.error('[Yjs] Message error:', err);
      }
    });

    ws.on('close', () => {
      conns.delete(ws);
      doc.off('update', docUpdateHandler);

      const clientIds = wsClientIds.get(ws);
      if (clientIds && clientIds.size > 0) {
        awarenessProtocol.removeAwarenessStates(awareness, Array.from(clientIds), ws);
      }
      wsClientIds.delete(ws);

      // Save immediately when the last client leaves, then clean up memory
      if (conns.size === 0) {
        const timer = saveTimers.get(room);
        if (timer) clearTimeout(timer);
        saveTimers.delete(room);
        saveDocState(room, doc, userId);

        // Unbind handlers and free memory
        doc.destroy();
        awareness.destroy();
        docs.delete(room);
        awarenessMap.delete(room);
        connections.delete(room);
      }
    });

    ws.on('error', (err) => {
      console.error('[Yjs] WebSocket error:', err);
    });
  });

  return wss;
}
