<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createRoot, type Root } from 'react-dom/client';
  import ExcalidrawBoard from './ExcalidrawBoard';
  import React from 'react';

  let container: HTMLDivElement | undefined = $state();
  let root: Root | null = null;
  let connected = $state(false);

  const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${typeof window !== 'undefined' ? window.location.host : ''}`;
  const roomName = 'rina-whiteboard';

  onMount(() => {
    if (!container) return;
    root = createRoot(container);
    root.render(
      React.createElement(ExcalidrawBoard, {
        wsUrl,
        roomName,
        onConnectionChange: (c: boolean) => { connected = c; }
      })
    );
  });

  onDestroy(() => {
    if (root) {
      root.unmount();
      root = null;
    }
  });
</script>

<div class="relative w-full h-full">
  <div bind:this={container} class="w-full h-full"></div>
  {#if !connected}
    <div class="absolute bottom-4 left-4 z-10 px-3 py-1.5 rounded-lg glass text-xs text-rina-slate">
      🔄 Connecting to collaborative session...
    </div>
  {/if}
</div>
