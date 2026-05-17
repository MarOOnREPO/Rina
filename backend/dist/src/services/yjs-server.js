import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
// ─── Message Types (y-websocket protocol) ────────────────────────
const messageSync = 0;
const messageAwareness = 1;
// ─── Document Store ──────────────────────────────────────────────
const docs = new Map();
const awarenessMap = new Map();
function getDoc(room) {
    if (!docs.has(room)) {
        const doc = new Y.Doc();
        docs.set(room, doc);
    }
    return docs.get(room);
}
function getAwareness(room) {
    if (!awarenessMap.has(room)) {
        const doc = getDoc(room);
        const awareness = new awarenessProtocol.Awareness(doc);
        awarenessMap.set(room, awareness);
        awareness.on('update', ({ added, updated, removed }, origin) => {
            const changedClients = added.concat(updated).concat(removed);
            const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
            const message = new Uint8Array(1 + update.length);
            message[0] = messageAwareness;
            message.set(update, 1);
            broadcast(room, message, origin);
        });
    }
    return awarenessMap.get(room);
}
const connections = new Map();
function getConnections(room) {
    if (!connections.has(room)) {
        connections.set(room, new Set());
    }
    return connections.get(room);
}
function broadcast(room, message, origin) {
    const conns = getConnections(room);
    conns.forEach((ws) => {
        if (ws !== origin && ws.readyState === WebSocket.OPEN) {
            send(ws, message);
        }
    });
}
function send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
    }
}
function updateHandler(update, origin, _doc, room) {
    const message = new Uint8Array(1 + update.length);
    message[0] = messageSync;
    message.set(update, 1);
    broadcast(room, message, origin);
}
// ─── Setup Yjs WebSocket Server ──────────────────────────────────
export function createYjsWSS() {
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (ws, req) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const room = url.searchParams.get('room') || 'default';
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
        const docUpdateHandler = (update, origin) => updateHandler(update, origin, doc, room);
        doc.on('update', docUpdateHandler);
        ws.on('message', (data) => {
            try {
                const message = new Uint8Array(data);
                if (message.length === 0)
                    return;
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
                }
                else if (messageType === messageAwareness) {
                    awarenessProtocol.applyAwarenessUpdate(awareness, payload, ws);
                }
            }
            catch (err) {
                console.error('[Yjs] Message error:', err);
            }
        });
        ws.on('close', () => {
            conns.delete(ws);
            doc.off('update', docUpdateHandler);
            awarenessProtocol.removeAwarenessStates(awareness, [ws], ws);
        });
        ws.on('error', (err) => {
            console.error('[Yjs] WebSocket error:', err);
        });
    });
    return wss;
}
//# sourceMappingURL=yjs-server.js.map