<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade } from 'svelte/transition';
  import * as Y from 'yjs';
  import { WebsocketProvider } from 'y-websocket';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let drawing = false;
  let color = '#fb7185';
  let brushSize = 3;
  let ydoc: Y.Doc;
  let yArray: Y.Array<{ x: number; y: number; color: string; size: number; type: 'start' | 'move' | 'end' }>;
  let provider: WebsocketProvider | null = null;

  const COLORS = ['#fb7185', '#818cf8', '#34d399', '#fbbf24', '#ffffff'];

  function initCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }

  function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startStroke(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    drawing = true;
    const { x, y } = getPos(e);
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
    }
    if (yArray) {
      yArray.push([{ x, y, color, size: brushSize, type: 'start' }]);
    }
  }

  function moveStroke(e: MouseEvent | TouchEvent) {
    if (!drawing || !ctx) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (yArray) {
      yArray.push([{ x, y, color, size: brushSize, type: 'move' }]);
    }
  }

  function endStroke() {
    drawing = false;
    if (ctx) ctx.closePath();
    if (yArray) {
      yArray.push([{ x: 0, y: 0, color, size: brushSize, type: 'end' }]);
    }
  }

  function clearCanvas() {
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (yArray) {
      yArray.delete(0, yArray.length);
    }
  }

  function saveCanvas() {
    const link = document.createElement('a');
    link.download = `rina-whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }

  function redrawFromYArray() {
    if (!ctx || !yArray) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    let currentPath: { x: number; y: number }[] = [];
    let currentColor = '#fb7185';
    let currentSize = 3;

    for (const stroke of yArray.toArray()) {
      if (stroke.type === 'start') {
        currentColor = stroke.color;
        currentSize = stroke.size;
        currentPath = [{ x: stroke.x, y: stroke.y }];
      } else if (stroke.type === 'move' && currentPath.length > 0) {
        currentPath.push({ x: stroke.x, y: stroke.y });
      } else if (stroke.type === 'end') {
        if (currentPath.length > 0) {
          ctx.beginPath();
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = currentSize;
          ctx.moveTo(currentPath[0].x, currentPath[0].y);
          for (let i = 1; i < currentPath.length; i++) {
            ctx.lineTo(currentPath[i].x, currentPath[i].y);
          }
          ctx.stroke();
          ctx.closePath();
        }
        currentPath = [];
      }
    }
  }

  // Redirect if not authenticated (wait for auth loading to finish)
  $effect(() => {
    if (!isLoading && !isAuthenticated && typeof window !== 'undefined') {
    goto('/login');
    }
  });

  onMount(() => {
    initCanvas();
    window.addEventListener('resize', initCanvas);

    // Setup Yjs with WebSocket provider
    ydoc = new Y.Doc();
    yArray = ydoc.getArray('strokes');

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    provider = new WebsocketProvider(wsUrl, 'rina-whiteboard', ydoc, {
      connect: true,
      params: { room: 'rina-whiteboard' }
    });

    yArray.observe(() => {
      redrawFromYArray();
    });

    return () => {
      window.removeEventListener('resize', initCanvas);
    };
  });

  onDestroy(() => {
    if (provider) {
      provider.destroy();
      provider = null;
    }
    if (ydoc) ydoc.destroy();
  });
</script>

{#if isAuthenticated}
  <div class="fixed inset-0 pt-14 pb-16 md:pb-0 flex flex-col" in:fade>
    <!-- Toolbar -->
    <div class="glass border-b border-rina-border px-4 py-2 flex items-center gap-3 shrink-0 z-10">
      <div class="flex items-center gap-1.5">
        {#each COLORS as c}
          <button
            on:click={() => color = c}
            class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110
              {color === c ? 'border-white scale-110' : 'border-transparent'}"
            style="background-color: {c};"
            aria-label="Select color {c}"
          ></button>
        {/each}
      </div>
      <div class="w-px h-6 bg-rina-border"></div>
      <input
        type="range"
        min="1"
        max="20"
        bind:value={brushSize}
        class="w-24 accent-rina-rose"
      />
      <span class="text-xs text-rina-slate w-4">{brushSize}</span>
      <div class="w-px h-6 bg-rina-border"></div>
      <button
        on:click={clearCanvas}
        class="px-3 py-1.5 rounded-lg text-xs font-medium glass hover:bg-white/5 transition-colors"
      >
        Clear
      </button>
      <button
        on:click={saveCanvas}
        class="px-3 py-1.5 rounded-lg text-xs font-medium bg-rina-rose/20 text-rina-rose hover:bg-rina-rose/30 transition-colors"
      >
        Save
      </button>
      {#if provider}
        <div class="ml-auto flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full {provider.wsconnected ? 'bg-green-400' : 'bg-red-400'}"></span>
          <span class="text-xs text-rina-slate">
            {provider.wsconnected ? 'Synced' : 'Offline'}
          </span>
        </div>
      {/if}
    </div>

    <!-- Canvas -->
    <div class="flex-1 relative bg-transparent">
      <canvas
        bind:this={canvas}
        class="absolute inset-0 w-full h-full cursor-crosshair touch-none"
        on:mousedown={startStroke}
        on:mousemove={moveStroke}
        on:mouseup={endStroke}
        on:mouseleave={endStroke}
        on:touchstart={startStroke}
        on:touchmove={moveStroke}
        on:touchend={endStroke}
      ></canvas>
      <div class="absolute bottom-4 left-4 pointer-events-none">
        <p class="text-xs text-rina-slate-dark">Draw together • Yjs synced</p>
      </div>
    </div>
  </div>
{/if}
