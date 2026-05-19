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

  // Load YouTube IFrame API with error handling
  function loadYouTubeAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }
      if (apiError) {
        reject(new Error('YouTube API previously failed'));
        return;
      }

      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = () => {
        apiError = true;
        reject(new Error('Failed to load YouTube IFrame API'));
      };
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript.parentNode?.insertBefore(tag, firstScript);

      (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady = () => {
        apiLoaded = true;
        resolve();
      };

      // Timeout fallback
      setTimeout(() => {
        if (!window.YT?.Player) {
          apiError = true;
          reject(new Error('YouTube API load timeout'));
        }
      }, 10000);
    });
  }

  function initPlayer(id: string) {
    if (!id || !window.YT?.Player) return;
    currentVideoId = id;

    player = new window.YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      videoId: id,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1
      },
      events: {
        onReady: () => {
          playerReady = true;
          // Title may not be available immediately; retry
          updateTitle();
        },
        onStateChange: handleStateChange,
        onError: (e: { data: number }) => {
          console.error('[YouTube] Player error:', e.data);
        }
      }
    });
  }

  function updateTitle() {
    if (!player) return;
    const data = player.getVideoData?.();
    if (data?.title) {
      currentVideoTitle = data.title;
    } else {
      setTimeout(updateTitle, 500);
    }
  }

  function handleStateChange(event: YT.OnStateChangeEvent) {
    if (isSyncing || !player) return;

    const time = player.getCurrentTime() || 0;

    // Detect seek: if time jumped by > 3s between state changes while playing/paused
    const timeJump = Math.abs(time - lastReportedTime);
    const isSeek = timeJump > 3 && event.data !== window.YT.PlayerState.BUFFERING;

    if (event.data === window.YT.PlayerState.PLAYING) {
      if (isSeek) {
        emitSync('seek', time);
      }
      emitSync('play', time);
    } else if (event.data === window.YT.PlayerState.PAUSED) {
      if (isSeek) {
        emitSync('seek', time);
      }
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

    // If partner loaded a different video, switch to it
    if (event.videoId && event.videoId !== currentVideoId) {
      currentVideoId = event.videoId;
      videoInput = event.videoId;
      currentVideoTitle = '';
      player.loadVideoById(event.videoId);
      // Wait for video to load before seeking/playing
      setTimeout(() => applySyncAction(event), 800);
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

    // Clear sync flag once the state change settles
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
      // Use cueVideoById to avoid triggering autoplay/play state change
      (player as unknown as { cueVideoById: (id: string) => void }).cueVideoById(id);
      currentVideoId = id;
      currentVideoTitle = '';
      updateTitle();
      // Explicitly broadcast the video change
      emitSync('seek', 0);
    } else if (apiLoaded || window.YT?.Player) {
      initPlayer(id);
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
      player.destroy();
      player = null;
    }
  });
</script>

{#if isAuthenticated()}
  <div class="max-w-5xl mx-auto px-4 py-6" in:fade>
    <h2 class="text-2xl font-bold mb-6">🎵 Listen Together</h2>

    {#if apiError}
      <div class="glass rounded-xl p-4 mb-4 text-rina-rose text-sm text-center">
        Failed to load YouTube API. Please check your connection or try again.
      </div>
    {/if}

    <GlassCard class="mb-6">
      <div class="flex gap-2">
        <input
          bind:value={videoInput}
          placeholder="Paste YouTube URL or Video ID..."
          class="flex-1 px-4 py-3 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark
            focus:outline-none focus:border-rina-rose/50 transition-all"
          onkeydown={(e) => e.key === 'Enter' && loadVideo()}
        />
        <button
          onclick={loadVideo}
          disabled={!videoInput.trim() || apiError}
          class="px-6 py-3 rounded-xl bg-rina-rose text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
      <div id="yt-player" class="w-full h-full"></div>
      {#if !playerReady}
        <div class="absolute inset-0 flex flex-col items-center justify-center text-rina-slate">
          <span class="text-5xl mb-4">🎵</span>
          <p class="text-lg font-medium">Paste a YouTube link to start listening together</p>
          <p class="text-sm text-rina-slate-dark mt-1">Play, pause, and seek are synced in real-time</p>
        </div>
      {/if}
    </div>

    <div class="mt-4 text-center">
      <p class="text-xs text-rina-slate-dark">
        💡 Synced to the millisecond via Socket.io. Your partner's player will mirror yours automatically.
      </p>
    </div>
  </div>
{/if}
