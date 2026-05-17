declare module 'y-protocols/awareness' {
  import * as Y from 'yjs';
  export class Awareness {
    constructor(doc: Y.Doc);
    doc: Y.Doc;
    clientID: number;
    states: Map<number, Record<string, unknown>>;
    meta: Map<number, { clock: number; lastUpdated: number }>;
    getLocalState(): Record<string, unknown> | null;
    setLocalState(state: Record<string, unknown> | null): void;
    setLocalStateField(field: string, value: unknown): void;
    getStates(): Map<number, Record<string, unknown>>;
    on(event: 'update', handler: ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void): void;
    destroy(): void;
  }
  export const removeAwarenessStates: (awareness: Awareness, clients: number[], origin: unknown) => void;
  export const encodeAwarenessUpdate: (awareness: Awareness, clients: number[]) => Uint8Array;
  export const modifyAwarenessUpdate: (update: Uint8Array, modify: (state: Record<string, unknown>, clientID: number) => Record<string, unknown> | null) => Uint8Array;
  export const applyAwarenessUpdate: (awareness: Awareness, update: Uint8Array, origin: unknown) => void;
}

declare module 'y-protocols/sync' {
  import * as Y from 'yjs';
  export const syncProtocol: {
    messageYjsSyncStep1: number;
    messageYjsSyncStep2: number;
    messageYjsUpdate: number;
  };
  export const readSyncMessage: (decoder: any, encoder: any, doc: Y.Doc, transactionOrigin: unknown) => number;
  export const writeSyncStep1: (encoder: any, doc: Y.Doc) => void;
  export const writeSyncStep2: (encoder: any, doc: Y.Doc, store: any) => void;
  export const writeUpdate: (encoder: any, update: Uint8Array) => void;
}
