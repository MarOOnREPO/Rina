<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Hls from 'hls.js';
  import { socketStore } from '$lib/stores/socket.svelte';
  import { currentUser } from '$lib/stores/auth.svelte';

  interface Props {
    sessionId: string;
    playlistUrl: string;
  }

  let { sessionId, playlistUrl }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let hls = $state<Hls | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let buffered = $state(0);
  let showControls = $state(true);
  let controlsTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  let isRemoteControl = $state(false);
  let syncLatency = $state(0);
  let waitingForSync = $state(false);

  onMount(() => {
    socketStore.emit('cinema:join', { sessionId });
    setupVideo();
    setupSocketListeners();
    showControlsTemporarily();
    return () => {
      socketStore.emit('cinema:leave', { sessionId });
      hls?.destroy();
      if (controlsTimeout) clearTimeout(controlsTimeout);
    };
  });

  function setupVideo() {
    if (!videoEl) return;

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(playlistUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl?.play().catch(() => {});
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = playlistUrl;
    }

    videoEl.addEventListener('play', handleLocalPlay);
    videoEl.addEventListener('pause', handleLocalPause);
    videoEl.addEventListener('seeked', handleLocalSeek);
    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    videoEl.addEventListener('volumechange', () => {
      volume = videoEl?.volume ?? 1;
    });
  }

  function handleTimeUpdate() {
    if (!videoEl) return;
    currentTime = videoEl.currentTime;
    duration = videoEl.duration || 0;
    buffered = videoEl.buffered.length ? videoEl.buffered.end(videoEl.buffered.length - 1) : 0;
  }

  function handleLocalPlay() {
    if (isRemoteControl || waitingForSync) return;
    isPlaying = true;
    emitControl('play', videoEl!.currentTime);
  }

  function handleLocalPause() {
    if (isRemoteControl || waitingForSync) return;
    isPlaying = false;
    emitControl('pause', videoEl!.currentTime);
  }

  function handleLocalSeek() {
    if (isRemoteControl || waitingForSync) return;
    emitControl('seek', videoEl!.currentTime);
  }

  function emitControl(action: 'play' | 'pause' | 'seek', time: number) {
    socketStore.emit('cinema:control', {
      sessionId,
      action,
      time,
      clientTime: Date.now()
    });
  }

  function setupSocketListeners() {
    socketStore.on('cinema:sync', (data: any) => {
      if (data.sender === currentUser()?.username) return;
      applyRemoteSync(data);
    });
  }

  function applyRemoteSync(data: {
    action: 'play' | 'pause' | 'seek';
    time: number;
    serverTime: number;
  }) {
    if (!videoEl) return;

    const now = Date.now();
    const latency = now - data.serverTime;
    syncLatency = latency;
    const targetTime = data.time + latency / 1000 + 0.15;

    isRemoteControl = true;
    waitingForSync = true;

    if (data.action === 'play') {
      videoEl.currentTime = targetTime;
      videoEl.play().then(() => {
        isPlaying = true;
        setTimeout(() => { waitingForSync = false; }, 300);
      }).catch(() => {
        waitingForSync = false;
      });
    } else if (data.action === 'pause') {
      videoEl.currentTime = targetTime;
      videoEl.pause();
      isPlaying = false;
      setTimeout(() => { waitingForSync = false; }, 300);
    } else if (data.action === 'seek') {
      videoEl.currentTime = targetTime;
      setTimeout(() => { waitingForSync = false; }, 300);
    }

    setTimeout(() => { isRemoteControl = false; }, 500);
  }

  function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) videoEl.play();
    else videoEl.pause();
  }

  function seekTo(ratio: number) {
    if (!videoEl || !duration || !isFinite(duration)) return;
    videoEl.currentTime = ratio * duration;
  }

  function toggleFullscreen() {
    if (!videoEl) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else videoEl.requestFullscreen();
  }

  function formatTime(t: number) {
    if (!t || !isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function showControlsTemporarily() {
    showControls = true;
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => { showControls = false; }, 3000);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      if (videoEl) videoEl.currentTime += 5;
    } else if (e.code === 'ArrowLeft') {
      if (videoEl) videoEl.currentTime -= 5;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="relative w-full aspect-video bg-black rounded-2xl overflow-hidden group select-none ring-1 ring-white/5"
  onmousemove={showControlsTemporarily}
  onclick={showControlsTemporarily}
  role="button"
  tabindex="0"
  aria-label="Cinema player"
>
  <video
    bind:this={videoEl}
    class="w-full h-full object-contain"
    playsinline
    preload="auto"
    crossorigin="anonymous"
  ></video>

  <!-- Buffering / Sync Overlay -->
  {#if waitingForSync}
    <div class="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
      <div class="w-8 h-8 border-2 border-rina-rose border-t-transparent rounded-full animate-spin"></div>
    </div>
  {/if}

  <!-- Controls Overlay -->
  {#if showControls}
    <div
      class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 flex flex-col justify-end p-4 transition-opacity duration-200"
      onclick={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Player controls"
    >
      <!-- Progress Bar -->
      <div class="w-full h-2 bg-white/15 rounded-full mb-3 cursor-pointer overflow-hidden relative group/progress"
        onclick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          seekTo((e.clientX - rect.left) / rect.width);
        }}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
      >
        <div class="absolute inset-0 bg-white/10 rounded-full" style="width: {(buffered / duration) * 100}%"></div>
        <div class="h-full bg-rina-rose rounded-full relative transition-[width] duration-75" style="width: {(currentTime / duration) * 100}%">
          <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/progress:opacity-100 transition-opacity"></div>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button
            onclick={togglePlay}
            class="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {#if isPlaying}
              <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
            {:else}
              <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </button>
          <span class="text-xs text-white/80 font-mono tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
          {#if syncLatency > 0}
            <span class="text-[10px] text-rina-rose/80 bg-black/40 px-1.5 rounded tabular-nums">sync {syncLatency}ms</span>
          {/if}
        </div>

        <div class="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            oninput={(e) => { if (videoEl) videoEl.volume = parseFloat(e.currentTarget.value); }}
            class="w-20 accent-rina-rose cursor-pointer"
            aria-label="Volume"
          />
          <button
            onclick={toggleFullscreen}
            class="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition"
            aria-label="Fullscreen"
          >
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
