import React, { useEffect, useRef, useState } from 'react';
import { Excalidraw, type ExcalidrawImperativeAPI } from '@excalidraw/excalidraw';
import { ExcalidrawBinding } from 'y-excalidraw';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface Props {
  wsUrl: string;
  roomName: string;
  onConnectionChange?: (connected: boolean) => void;
}

export default function ExcalidrawBoard({ wsUrl, roomName, onConnectionChange }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const bindingRef = useRef<ExcalidrawBinding | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    const ydoc = new Y.Doc();

    const provider = new WebsocketProvider(wsUrl, roomName, ydoc, {
      connect: true,
      params: { room: roomName }
    });
    providerRef.current = provider;

    provider.on('status', (event: { status: string }) => {
      onConnectionChange?.(event.status === 'connected');
    });

    return () => {
      bindingRef.current?.destroy();
      provider.destroy();
      ydoc.destroy();
    };
  }, [wsUrl, roomName, onConnectionChange]);

  useEffect(() => {
    if (!api || !providerRef.current) return;

    const ydoc = providerRef.current.doc;
    const yElements = ydoc.getArray<Y.Map<unknown>>('elements');
    const yAssets = ydoc.getMap('assets');

    const binding = new ExcalidrawBinding(
      yElements,
      yAssets,
      api,
      providerRef.current.awareness
    );
    bindingRef.current = binding;

    return () => {
      binding.destroy();
      bindingRef.current = null;
    };
  }, [api]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Excalidraw
        excalidrawAPI={(excalidrawApi) => setApi(excalidrawApi)}
        theme="dark"
        UIOptions={{
          canvasActions: {
            saveToActiveFile: false,
            loadScene: false,
            export: { saveFileToDisk: false }
          }
        }}
      />
    </div>
  );
}
