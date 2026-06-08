import { browser } from '$app/environment';

interface WSMessage {
  event: string;
  payload: unknown;
}

type PresenceStatus = 'online' | 'away' | 'typing' | 'offline';

interface PresenceData {
  username: string;
  status: PresenceStatus;
  displayName: string;
  timestamp: string;
}

class SocketStore {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private url: string;
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  connected = $state(false);
  connecting = $state(false);
  error = $state<string | null>(null);

  presence = $state<Record<string, PresenceData>>({});
  typing = $state<{ username: string; displayName: string } | null>(null);
  pingReceived = $state<{ from: string } | null>(null);
  mediaSync = $state<WSMessage | null>(null);
  globalSync = $state<WSMessage | null>(null);

  getPartnerPresence() {
    const user = (typeof window !== 'undefined' && (window as any).__user) || null;
    if (!user) return null;
    const partnerName = user.username === 'maroon' ? 'rina' : 'maroon';
    return this.presence[partnerName] || null;
  }

  constructor() {
    const protocol = browser && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = browser ? window.location.host : 'localhost:8080';
    this.url = `${protocol}//${host}/ws`;
  }

  connect() {
    if (!browser || this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return;

    this.connecting = true;
    this.error = null;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        this.connecting = false;
        this.error = null;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage;
          this.handleMessage(msg);
        } catch {
          // ignore invalid messages
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.connecting = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.error = 'Connection error';
        this.connecting = false;
      };
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Connection failed';
      this.connecting = false;
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  send(event: string, payload?: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, payload }));
    }
  }

  on(event: string, callback: (payload: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (payload: any) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  private handleMessage(msg: WSMessage) {
    switch (msg.event) {
      case 'presence:update': {
        const data = msg.payload as PresenceData;
        this.presence[data.username] = data;
        break;
      }
      case 'typing:start': {
        const data = msg.payload as { username: string; displayName: string };
        this.typing = data;
        break;
      }
      case 'typing:stop': {
        this.typing = null;
        break;
      }
      case 'sync:update':
        this.globalSync = msg;
        setTimeout(() => (this.globalSync = null), 100);
        break;
      case 'media:sync':
        this.mediaSync = msg;
        setTimeout(() => (this.mediaSync = null), 100);
        break;
      case 'heartbeat:pong':
        // handled implicitly
        break;
    }
    // Dispatch to any registered listeners for this event
    this.listeners.get(msg.event)?.forEach((cb) => cb(msg.payload));
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send('heartbeat:ping');
    }, 10000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}

export const socketStore = new SocketStore();

export function initializeSockets() {
  if (browser) {
    socketStore.connect();
  }
}

export function sendTyping(start: boolean) {
  socketStore.send(start ? 'typing:start' : 'typing:stop');
}

export function sendChatMessage(msg: { id: string; content: string; type: string; mediaUrl?: string; replyToId?: string }) {
  socketStore.send('chat:message', msg);
}

export function sendMediaSync(payload: unknown) {
  socketStore.send('media:sync', payload);
}

export function sendWebRTCSignal(event: 'offer' | 'answer' | 'ice', payload: unknown) {
  socketStore.send(`webrtc:${event}`, payload);
}
