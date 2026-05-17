declare module 'y-websocket/bin/utils.js' {
  import type { WebSocket } from 'ws';
  import type { IncomingMessage } from 'http';

  export function setupWSConnection(
    ws: WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean }
  ): void;
}
