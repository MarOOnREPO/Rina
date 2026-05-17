import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { io, type Socket } from 'socket.io-client';
import { auth } from './auth';

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

// ─── Store State ─────────────────────────────────────────────────
interface SocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

function createSocketStore() {
  const { subscribe, set, update } = writable<SocketState>({
    connected: false,
    connecting: false,
    error: null
  });

  let socket: Socket | null = null;

  return {
    subscribe,

    connect() {
      if (!browser || socket?.connected) return;

      update(s => ({ ...s, connecting: true, error: null }));

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
        update(s => ({ ...s, connected: true, connecting: false, error: null }));
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        update(s => ({ ...s, connected: false, connecting: false }));
      });

      socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
        update(s => ({ ...s, connected: false, connecting: false, error: err.message }));
      });
    },

    disconnect() {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      set({ connected: false, connecting: false, error: null });
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
}

export const socketStore = createSocketStore();

// ─── Presence Store ──────────────────────────────────────────────
function createPresenceStore() {
  const { subscribe, set, update } = writable<Record<string, PresenceState>>({});

  return {
    subscribe,

    setPresence(data: PresenceState) {
      update(p => ({ ...p, [data.username]: data }));
    },

    getPresence(username: string): PresenceState | undefined {
      const state = get({ subscribe });
      return state[username];
    },

    clear() {
      set({});
    },

    init(socket: Socket) {
      socket.on('presence:update', (data: PresenceState) => {
        this.setPresence(data);
      });
    }
  };
}

export const presence = createPresenceStore();

// ─── Partner Presence (derived) ──────────────────────────────────
export const partnerPresence = derived(
  [presence, auth],
  ([$presence, $auth]) => {
    if (!$auth.user) return undefined;
    const partnerUsername = $auth.user.username === 'maroon' ? 'rina' : 'maroon';
    return $presence[partnerUsername];
  }
);

// ─── Ping Store ──────────────────────────────────────────────────
function createPingStore() {
  const { subscribe, set } = writable<PingEvent | null>(null);

  return {
    subscribe,

    trigger(data: PingEvent) {
      set(data);
      // Auto-clear after animation duration
      if (this._timeout) clearTimeout(this._timeout);
      this._timeout = setTimeout(() => set(null), 4000);
    },
    _timeout: null as ReturnType<typeof setTimeout> | null,

    init(socket: Socket) {
      socket.on('ping:received', (data: PingEvent) => {
        this.trigger(data);
      });
    }
  };
}

export const pingReceived = createPingStore();

// ─── Media Sync Store ────────────────────────────────────────────
function createMediaSyncStore() {
  const { subscribe, set } = writable<MediaSyncEvent | null>(null);

  return {
    subscribe,

    receive(data: MediaSyncEvent) {
      set(data);
      if (this._timeout) clearTimeout(this._timeout);
      this._timeout = setTimeout(() => set(null), 100); // Brief pulse
    },
    _timeout: null as ReturnType<typeof setTimeout> | null,

    emit(data: Omit<MediaSyncEvent, 'sender' | 'senderDisplayName' | 'serverTime'>) {
      socketStore.emit('media:sync', data);
    },

    init(socket: Socket) {
      socket.on('media:sync', (data: MediaSyncEvent) => {
        this.receive(data);
      });
    }
  };
}

export const mediaSync = createMediaSyncStore();

// ─── Typing Store ────────────────────────────────────────────────
function createTypingStore() {
  const { subscribe, set } = writable<{ username: string; displayName: string } | null>(null);
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return {
    subscribe,

    start(data: { username: string; displayName: string }) {
      set(data);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => set(null), 3000);
    },

    stop() {
      set(null);
      if (timeout) clearTimeout(timeout);
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
}

export const typing = createTypingStore();

// ─── Global Socket Initialization ────────────────────────────────
export function initializeSockets() {
  if (!browser) return;

  const sock = socketStore.getSocket();
  if (!sock || !sock.connected) {
    socketStore.connect();
  }

  // Wait for socket to be ready, then attach listeners
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
