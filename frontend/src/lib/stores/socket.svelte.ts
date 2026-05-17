import { browser } from '$app/environment';
import { io, type Socket } from 'socket.io-client';
import { currentUser } from './auth.svelte';

// ─── Types ───────────────────────────────────────────────────────
export type PresenceStatus = 'online' | 'away' | 'typing' | 'offline';

export interface PresenceState {
  username: string;
  displayName: string;
  status: PresenceStatus;
  lastSeen?: string;
}

export interface PingEvent {
  from: string;
  fromUsername: string;
  timestamp: string;
}

export interface MediaSyncEvent {
  action: 'play' | 'pause' | 'seek';
  time: number;
  videoId: string;
  sender: string;
  senderDisplayName: string;
  serverTime: number;
}

export interface WebRTCOfferEvent {
  sender: string;
  senderDisplayName: string;
  offer: RTCSessionDescriptionInit;
}

export interface WebRTCAnswerEvent {
  sender: string;
  senderDisplayName: string;
  answer: RTCSessionDescriptionInit;
}

export interface WebRTCIceEvent {
  sender: string;
  candidate: RTCIceCandidateInit;
}

// ─── Socket State ────────────────────────────────────────────────
let socket: Socket | null = null;

let socketState = $state<{
  connected: boolean;
  connecting: boolean;
  error: string | null;
}>({
  connected: false,
  connecting: false,
  error: null
});

export const socketStore = {
  get connected() { return socketState.connected; },
  get connecting() { return socketState.connecting; },
  get error() { return socketState.error; },

  connect() {
    if (!browser || socket?.connected) return;
    socketState.connecting = true;
    socketState.error = null;

    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id);
      socketState.connected = true;
      socketState.connecting = false;
      socketState.error = null;
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      socketState.connected = false;
      socketState.connecting = false;
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      socketState.error = err.message;
      socketState.connected = false;
      socketState.connecting = false;
    });
  },

  disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    socketState.connected = false;
    socketState.connecting = false;
    socketState.error = null;
  },

  getSocket(): Socket | null {
    return socket;
  },

  emit(event: string, ...args: unknown[]) {
    socket?.emit(event, ...args);
  },

  on<T = unknown>(event: string, callback: (data: T) => void) {
    socket?.on(event, callback as (...args: unknown[]) => void);
  },

  off(event: string, callback?: (...args: unknown[]) => void) {
    socket?.off(event, callback);
  }
};

// ─── Presence State ──────────────────────────────────────────────
let presenceState = $state<Record<string, PresenceState>>({});

export const presence = {
  get state() { return presenceState; },

  setPresence(data: PresenceState) {
    presenceState[data.username] = data;
  },

  getPresence(username: string): PresenceState | undefined {
    return presenceState[username];
  },

  clear() {
    presenceState = {};
  },

  init(socket: Socket) {
    socket.on('presence:update', (data: PresenceState) => {
      this.setPresence(data);
    });
  }
};

// ─── Partner Presence ─────────────────────────────────────────────
export const partnerPresence = () => {
  const user = currentUser();
  if (!user) return undefined;
  const partnerUsername = user.username === 'maroon' ? 'rina' : 'maroon';
  return presenceState[partnerUsername];
};

// ─── Ping State ───────────────────────────────────────────────────
let pingState = $state<PingEvent | null>(null);
let pingTimeout: ReturnType<typeof setTimeout> | null = null;

export const pingReceived = {
  get value() { return pingState; },

  trigger(data: PingEvent) {
    pingState = data;
    if (pingTimeout) clearTimeout(pingTimeout);
    pingTimeout = setTimeout(() => { pingState = null; }, 4000);
  },

  init(socket: Socket) {
    socket.on('ping:received', (data: PingEvent) => {
      this.trigger(data);
    });
  }
};

// ─── Media Sync State ─────────────────────────────────────────────
let mediaSyncState = $state<MediaSyncEvent | null>(null);
let mediaTimeout: ReturnType<typeof setTimeout> | null = null;

export const mediaSync = {
  get value() { return mediaSyncState; },

  receive(data: MediaSyncEvent) {
    mediaSyncState = data;
    if (mediaTimeout) clearTimeout(mediaTimeout);
    mediaTimeout = setTimeout(() => { mediaSyncState = null; }, 100);
  },

  emit(data: Omit<MediaSyncEvent, 'sender' | 'senderDisplayName' | 'serverTime'>) {
    socketStore.emit('media:sync', data);
  },

  init(socket: Socket) {
    socket.on('media:sync', (data: MediaSyncEvent) => {
      this.receive(data);
    });
  }
};

// ─── Typing State ─────────────────────────────────────────────────
let typingState = $state<{ username: string; displayName: string } | null>(null);
let typingTimeout: ReturnType<typeof setTimeout> | null = null;

export const typing = {
  get value() { return typingState; },

  start(data: { username: string; displayName: string }) {
    typingState = data;
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { typingState = null; }, 3000);
  },

  stop() {
    typingState = null;
    if (typingTimeout) clearTimeout(typingTimeout);
  },

  init(socket: Socket) {
    socket.on('typing:start', (data: { username: string; displayName: string }) => {
      this.start(data);
    });
    socket.on('typing:stop', () => {
      this.stop();
    });
  }
};

// ─── Global Socket Initialization ─────────────────────────────────
export function initializeSockets() {
  if (!browser) return;

  const sock = socketStore.getSocket();
  if (!sock || !sock.connected) {
    socketStore.connect();
  }

  let retries = 0;
  const maxRetries = 50;
  const checkAndInit = () => {
    const s = socketStore.getSocket();
    if (s?.connected) {
      presence.init(s);
      pingReceived.init(s);
      mediaSync.init(s);
      typing.init(s);
      return;
    }
    if (++retries < maxRetries) {
      setTimeout(checkAndInit, 100);
    } else {
      console.error('[Socket] Failed to initialize listeners after max retries');
    }
  };

  checkAndInit();
}
