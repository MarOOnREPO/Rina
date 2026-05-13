<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '$lib/stores/auth';
  import { socketStore } from '$lib/stores/socket';
  import { fade } from 'svelte/transition';
  import * as Y from 'yjs';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let drawing = false;
  let color = '#fb7185';
  let brushSize = 3;
  let ydoc: Y.Doc;
  let yArray: Y.Array<{ x: number; y: number; color: string; size: number; type: 'start' | 'move' | 'end' }>;

  // For simulating Yjs sync over socket (simplified)
  // In production, use y-websocket or custom provider
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
  }

  function moveStroke(e: MouseEvent | TouchEvent) {
    if (!drawing || !ctx) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endStroke() {
    drawing = false;
    if (ctx) ctx.closePath();
  }

  function clearCanvas() {
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  function saveCanvas() {
    const link = document.createElement('a');
    link.download = `rina-whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }

  onMount(() => {
    if (!$isAuthenticated) {
      goto('/login');
      return;
    }

    initCanvas();
    window.addEventListener('resize', initCanvas);

    // Setup Yjs (simplified in-memory, would connect via y-websocket in production)
    ydoc = new Y.Doc();
    yArray = ydoc.getArray('strokes');

    return () => {
      window.removeEventListener('resize', initCanvas);
    };
  });

  onDestroy(() => {
    if (ydoc) ydoc.destroy();
  });
</script>

{#if $isAuthenticated}
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
