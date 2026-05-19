<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { socketStore, mediaSync } from '$lib/stores/socket.svelte';
  import { fade, scale } from 'svelte/transition';
  import GlassCard from '$lib/components/GlassCard.svelte';

  let videoInput = $state('');
  let player: YT.Player | null = null;
  let playerReady = $state(false);
  let apiLoaded = $state(false);
  let apiError = $state(false);
  let isSyncing = $state(false);
  let currentVideoId = $state('');
  let currentVideoTitle = $state('');
  let lastReportedTime = $state(0);
  let syncStatus = $state<'idle' | 'syncing'>('idle');
  let playerContainerId = $state(`yt-player-${Math.random().toString(36).slice(2, 9)}`);

  // ─── Robust YouTube IFrame API Loader ──────────────────────────
  // Global promise ensures we never inject the script twice and handle
  // race conditions between multiple components or fast unmount/remount.
  let ytApiPromise: Promise<void> | null = null;

  function loadYouTubeAPI(): Promise<void> {
    if (typeof window === 'undefined') return Promise.reject(new Error('Not in browser'));
    if (window.YT && window.YT.Player) {
      apiLoaded = true;
      return Promise.resolve();
    }
    if (apiError) {
      return Promise.reject(new Error('YouTube API previously failed'));
    }
    if (ytApiPromise) {
      return ytApiPromise;
    }

    ytApiPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (existing) {
        // Script already in DOM, wait for callback
        const check = setInterval(() => {
          if (window.YT?.Player) {
            clearInterval(check);
            apiLoaded = true;
            resolve();
          }
        }, 200);
        setTimeout(() => {
          clearInterval(check);
          if (!window.YT?.Player) {
            apiError = true;
            reject(new Error('YouTube API load timeout (script existed)'));
          }
        }, 15000);
        return;
      }

      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => {
        apiError = true;
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube IFrame API script'));
      };

      const firstScript = document.getElementsByTagName('script')[0];
      firstScript.parentNode?.insertBefore(tag, firstScript);

      const originalCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        apiLoaded = true;
        if (originalCallback) originalCallback();
        resolve();
      };

      // Fallback timeout
      setTimeout(() => {
        if (!window.YT?.Player) {
          apiError = true;
          ytApiPromise = null;
          reject(new Error('YouTube API load timeout (15s)'));
        }
      }, 15000);
    });

    return ytApiPromise;
  }

  function initPlayer(id: string) {
    if (!id || !window.YT?.Player) return;
    currentVideoId = id;

    // Destroy previous player if exists to prevent DOM conflicts
    if (player) {
      try {
        player.destroy();
      } catch {
        // ignore
      }
      player = null;
    }

    player = new window.YT.Player(playerContainerId, {
      height: '100%',
      width: '100%',
      videoId: id,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined
      },
      events: {
        onReady: () => {
          playerReady = true;
          updateTitle();
        },
        onStateChange: handleStateChange,
        onError: (e: { data: number }) => {
          console.error('[YouTube] Player error:', e.data);
          apiError = true;
        }
      }
    });
  }

  let titleRetries = 0;
  function updateTitle() {
    if (!player) return;
    if (titleRetries > 10) return;
    try {
      const data = player.getVideoData?.();
      if (data?.title) {
        currentVideoTitle = data.title;
        titleRetries = 0;
      } else {
        titleRetries++;
        setTimeout(updateTitle, 500);
      }
    } catch {
      titleRetries++;
      setTimeout(updateTitle, 500);
    }
  }

  function handleStateChange(event: YT.OnStateChangeEvent) {
    if (isSyncing || !player) return;

    const time = player.getCurrentTime() || 0;
    const timeJump = Math.abs(time - lastReportedTime);
    const isSeek = timeJump > 3 && event.data !== window.YT.PlayerState.BUFFERING;

    if (event.data === window.YT.PlayerState.PLAYING) {
      if (isSeek) emitSync('seek', time);
      emitSync('play', time);
    } else if (event.data === window.YT.PlayerState.PAUSED) {
      if (isSeek) emitSync('seek', time);
      emitSync('pause', time);
    }

    lastReportedTime = time;
  }

  function emitSync(action: 'play' | 'pause' | 'seek', time: number) {
    socketStore.emit('media:sync', { action, time, videoId: currentVideoId });
  }

  function handleSync(event: { action: 'play' | 'pause' | 'seek'; time: number; videoId: string; sender: string; serverTime: number }) {
    if (event.sender === currentUser()?.username) return;
    if (!playerReady || !player) return;

    syncStatus = 'syncing';

    if (event.videoId && event.videoId !== currentVideoId) {
      currentVideoId = event.videoId;
      videoInput = event.videoId;
      currentVideoTitle = '';
      // Cue instead of load to avoid unwanted autoplay; sync action handles play/pause
      (player as unknown as { cueVideoById: (id: string) => void }).cueVideoById(event.videoId);
      setTimeout(() => applySyncAction(event), 300);
      return;
    }

    applySyncAction(event);
  }

  function applySyncAction(event: { action: 'play' | 'pause' | 'seek'; time: number }) {
    if (!player) return;

    const currentTime = player.getCurrentTime() || 0;
    const timeDiff = Math.abs(currentTime - event.time);

    isSyncing = true;

    if (event.action === 'play') {
      if (timeDiff > 1.5) player.seekTo(event.time, true);
      player.playVideo();
    } else if (event.action === 'pause') {
      if (timeDiff > 1.5) player.seekTo(event.time, true);
      player.pauseVideo();
    } else if (event.action === 'seek') {
      player.seekTo(event.time, true);
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        isSyncing = false;
        syncStatus = 'idle';
      }, 300);
    });
  }

  function loadVideo() {
    const id = extractVideoId(videoInput);
    if (!id) return;

    if (player && playerReady) {
      player.loadVideoById(id);
      currentVideoId = id;
      currentVideoTitle = '';
      updateTitle();
      // Play state change will emit sync automatically; don't force-seek here
    } else if (apiLoaded || window.YT?.Player) {
      initPlayer(id);
    } else {
      // Wait for API then init
      loadYouTubeAPI()
        .then(() => initPlayer(id))
        .catch((err) => {
          console.error('[YouTube] Failed to load API:', err);
          apiError = true;
        });
    }
  }

  function extractVideoId(url: string): string {
    if (!url) return '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : (/^[a-zA-Z0-9_-]{11}$/.test(url) ? url : '');
  }

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  $effect(() => {
    const evt = mediaSync.value;
    if (evt) handleSync(evt);
  });

  onMount(() => {
    loadYouTubeAPI().catch((err) => {
      console.error('[YouTube]', err);
      apiError = true;
    });
  });

  onDestroy(() => {
    if (player) {
      try {
        player.destroy();
      } catch {
        // ignore
      }
      player = null;
    }
    ytApiPromise = null;
  });
</script>

{#if isAuthenticated()}
  <div class="px-3 py-4 space-y-4" in:fade>
    <h2 class="text-xl font-bold">🎵 Listen Together</h2>

    {#if apiError}
      <div class="glass rounded-xl p-4 text-rina-rose text-sm text-center">
        <p class="font-semibold mb-1">Failed to load YouTube API</p>
        <p class="text-xs text-rina-slate">Please check your connection or try again.</p>
        <button
          onclick={() => { apiError = false; loadYouTubeAPI().then(() => { if (videoInput) loadVideo(); }); }}
          class="mt-2 px-4 py-1.5 rounded-lg bg-white/5 text-xs hover:bg-white/10 transition-colors"
        >
          Retry
        </button>
      </div>
    {/if}

    <GlassCard class="mb-4">
      <div class="flex gap-2">
        <input
          bind:value={videoInput}
          placeholder="Paste YouTube URL or Video ID..."
          class="input-safe flex-1 px-4 py-3 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark
            focus:outline-none focus:border-rina-rose/50 transition-all"
          onkeydown={(e) => e.key === 'Enter' && loadVideo()}
        />
        <button
          onclick={loadVideo}
          disabled={!videoInput.trim() || apiError}
          class="touch-target px-5 py-3 rounded-xl bg-rina-rose text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Load
        </button>
      </div>
      {#if currentVideoTitle}
        <p class="text-sm text-rina-slate mt-2 truncate">Now playing: {currentVideoTitle}</p>
      {/if}
      {#if syncStatus === 'syncing'}
        <p class="text-xs text-emerald-400 mt-1 animate-pulse">↻ Syncing with partner...</p>
      {/if}
    </GlassCard>

    <!-- Player Container -->
    <div class="glass rounded-2xl overflow-hidden aspect-video relative" in:scale>
      <div id={playerContainerId} class="w-full h-full"></div>
      {#if !playerReady}
        <div class="absolute inset-0 flex flex-col items-center justify-center text-rina-slate pointer-events-none">
          <span class="text-5xl mb-4">🎵</span>
          <p class="text-lg font-medium">Paste a YouTube link to start listening together</p>
          <p class="text-sm text-rina-slate-dark mt-1">Play, pause, and seek are synced in real-time</p>
        </div>
      {/if}
    </div>

    <div class="text-center">
      <p class="text-xs text-rina-slate-dark">
        💡 Synced to the millisecond via Socket.io. Your partner's player will mirror yours automatically.
      </p>
    </div>
  </div>
{/if}
