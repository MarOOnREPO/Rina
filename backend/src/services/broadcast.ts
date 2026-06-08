import type { Server as SocketIOServer } from 'socket.io';
import { presence } from './redis.js';
import { getPartner } from './partnership.js';

let io: SocketIOServer | null = null;

export function setBroadcastServer(socketIo: SocketIOServer) {
  io = socketIo;
}

export interface BroadcastPayload {
  type: string;
  action: 'created' | 'updated' | 'deleted' | 'cleared';
  data: unknown;
  senderId: string;
  senderUsername: string;
  timestamp: string;
}

export async function broadcastToPartner(
  senderId: string,
  payload: Omit<BroadcastPayload, 'senderId' | 'senderUsername' | 'timestamp'>
): Promise<void> {
  if (!io) return;

  const partner = await getPartner(senderId);
  if (!partner) return;

  const partnerSocketId = await presence.getSocket(partner.username);
  if (!partnerSocketId) return;

  const fullPayload: BroadcastPayload = {
    ...payload,
    senderId,
    senderUsername: partner.username,
    timestamp: new Date().toISOString()
  };

  io.to(partnerSocketId).emit('sync:update', fullPayload);
}

export async function broadcastToUser(
  username: string,
  event: string,
  payload: unknown
): Promise<void> {
  if (!io) return;
  const socketId = await presence.getSocket(username);
  if (socketId) {
    io.to(socketId).emit(event, payload);
  }
}
