<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { socketStore, youtubeSync, presence } from '$lib/stores/socket.svelte';
  import { getConfig } from '$lib/stores/config.svelte';
  import { fade, scale } from 'svelte/transition';
  import GlassCard from '$lib/components/GlassCard.svelte';

  // ─── State ───────────────────────────────────────────────────────
  let videoInput = $state('');
  let searchQuery = $state('');
  let searchResults = $state<Array<{ videoId: string; title: string; author: string; lengthSeconds: number; videoThumbnails: Array<{ url: string; quality: string }> }>>([]);
  let isSearching = $state(false);
  let searchError = $state('');

  let player: YT.Player | null = null;
  let playerReady = $state(false);
  let apiLoaded = $state(false);
  let apiError = $state(false);
  let isSyncing = $state(false);
  let currentVideoId = $state('');
  let currentVideoTitle = $state('');
  let lastReportedTime = $state(0);
  let syncStatus = $state<'idle' | 'syncing'>('idle');
  const partner = $derived(currentUser()?.partner);
  const partnerStatus = $derived(partner ? presence.state[partner.username]?.status : undefined);
  const partnerInRoom = $derived(partnerStatus === 'online' || partnerStatus === 'away');
  let playerContainerId = $state(`yt-player-${Math.random().toString(36).slice(2, 9)}`);

  // ─── YouTube API Loader ──────────────────────────────────────────
  let ytApiPromise: Promise<void> | null = null;

  function loadYouTubeAPI(): Promise<void> {
    if (typeof window === 'undefined') return Promise.reject(new Error('Not in browser'));
    if (window.YT?.Player) {
      apiLoaded = true;
      apiError = false;
      return Promise.resolve();
    }
    if (ytApiPromise) {
      return ytApiPromise;
    }

    ytApiPromise = new Promise<void>((resolve, reject) => {
      let resolved = false;
      const done = () => { resolved = true; apiError = false; };

      // If API already loaded by the time we run
      if (window.YT?.Player) {
        apiLoaded = true;
        done();
        resolve();
        return;
      }

      // Poll for API readiness (catches cases where script was injected earlier)
      const poll = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(poll);
          clearTimeout(timeout);
          apiLoaded = true;
          done();
          resolve();
        }
      }, 100);

      const timeout = setTimeout(() => {
        clearInterval(poll);
        if (!resolved) {
          apiError = true;
          ytApiPromise = null;
          reject(new Error('YouTube API load timeout'));
        }
      }, 15000);

      // Set callback BEFORE injecting script to avoid race condition
      const originalCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (resolved) return;
        apiLoaded = true;
        done();
        clearInterval(poll);
        clearTimeout(timeout);
        if (originalCallback) originalCallback();
        resolve();
      };

      // Only inject if script isn't already in DOM
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.onerror = () => {
          if (resolved) return;
          clearInterval(poll);
          clearTimeout(timeout);
          apiError = true;
          ytApiPromise = null;
          reject(new Error('Failed to load YouTube IFrame API script'));
        };
        const firstScript = document.getElementsByTagName('script')[0];
        firstScript.parentNode?.insertBefore(tag, firstScript);
      }
    });

    return ytApiPromise;
  }

  function initPlayer(id: string) {
    if (!id || !window.YT?.Player) return;
    currentVideoId = id;

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

  function emitSync(action: 'play' | 'pause' | 'seek' | 'load', time = 0) {
    youtubeSync.emit({ action, time, videoId: currentVideoId });
  }

  function handleRemoteSync(event: { action: 'play' | 'pause' | 'seek' | 'load'; time: number; videoId: string; sender: string; serverTime: number }) {
    if (event.sender === currentUser()?.username) return;
    if (!playerReady || !player) return;

    syncStatus = 'syncing';

    if (event.action === 'load' && event.videoId && event.videoId !== currentVideoId) {
      currentVideoId = event.videoId;
      videoInput = event.videoId;
      currentVideoTitle = '';
      player.loadVideoById(event.videoId);
      setTimeout(() => {
        isSyncing = false;
        syncStatus = 'idle';
      }, 400);
      return;
    }

    if (event.videoId && event.videoId !== currentVideoId) {
      currentVideoId = event.videoId;
      videoInput = event.videoId;
      currentVideoTitle = '';
      (player as unknown as { cueVideoById: (id: string) => void }).cueVideoById(event.videoId);
      setTimeout(() => applySyncAction(event), 300);
      return;
    }

    applySyncAction(event);
  }

  function applySyncAction(event: { action: 'play' | 'pause' | 'seek' | 'load'; time: number }) {
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

  // ─── Video Loading ───────────────────────────────────────────────
  function loadVideo(id?: string) {
    const targetId = id || extractVideoId(videoInput);
    if (!targetId) return;

    if (!id) {
      videoInput = targetId;
    }

    if (player && playerReady) {
      player.loadVideoById(targetId);
      currentVideoId = targetId;
      currentVideoTitle = '';
      updateTitle();
    } else if (apiLoaded || window.YT?.Player) {
      initPlayer(targetId);
    } else {
      loadYouTubeAPI()
        .then(() => initPlayer(targetId))
        .catch((err) => {
          console.error('[YouTube] Failed to load API:', err);
          apiError = true;
        });
    }

    emitSync('load', 0);
  }

  function extractVideoId(url: string): string {
    if (!url) return '';
    // youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];
    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
    // watch?v=VIDEO_ID
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) return match[2];
    // raw video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    return '';
  }

  // ─── Invidious Search ────────────────────────────────────────────
  async function performSearch() {
    const query = searchQuery.trim();
    if (!query) return;
    isSearching = true;
    searchError = '';
    searchResults = [];

    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      if (res.status === 503) {
        searchError = 'YouTube search requires an API key. Ask your admin to add one in Settings.';
        return;
      }
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json();
      searchResults = data
        .filter((item: { type?: string }) => item.type === 'video')
        .map((item: { videoId: string; title: string; author: string; lengthSeconds: number; videoThumbnails: Array<{ url: string; quality: string }> }) => ({
          videoId: item.videoId,
          title: item.title,
          author: item.author,
          lengthSeconds: item.lengthSeconds,
          videoThumbnails: item.videoThumbnails
        }))
        .slice(0, 10);
    } catch (err) {
      console.error('[Search] Error:', err);
      searchError = 'Search failed. Try again.';
    } finally {
      isSearching = false;
    }
  }

  function selectSearchResult(id: string, title: string) {
    videoInput = id;
    currentVideoTitle = title;
    searchResults = [];
    searchQuery = '';
    loadVideo(id);
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ─── Effects & Lifecycle ─────────────────────────────────────────
  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  $effect(() => {
    const evt = youtubeSync.value;
    if (evt) handleRemoteSync(evt);
  });

  onMount(() => {
    loadYouTubeAPI().catch((err) => {
      console.error('[YouTube]', err);
      apiError = true;
    });
    socketStore.emit('youtube:join');
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
    socketStore.emit('youtube:leave');
  });
</script>

{#if isAuthenticated()}
  <div class="px-3 py-4 space-y-4" in:fade>
    <div class="px-1">
      <h1 class="text-xl font-bold text-white">Watch Together</h1>
      <p class="text-xs text-rina-slate-dark mt-0.5">Sync YouTube videos with your partner</p>
    </div>

    <!-- Partner Status -->
    <div class="flex items-center gap-2 px-1">
      <div class="w-2 h-2 rounded-full {partnerInRoom ? 'bg-emerald-400' : 'bg-rina-slate-dark'}"></div>
      <span class="text-xs {partnerInRoom ? 'text-emerald-400' : 'text-rina-slate-dark'}">
        {#if partnerInRoom}
          Partner is in the room
        {:else}
          Partner is offline
        {/if}
      </span>
      {#if syncStatus === 'syncing'}
        <span class="text-xs text-rina-rose animate-pulse ml-auto">↻ Syncing…</span>
      {/if}
    </div>

    {#if apiError}
      <div class="glass rounded-xl p-4 text-rina-rose text-sm text-center">
        <p class="font-semibold mb-1">Failed to load YouTube API</p>
        <p class="text-xs text-rina-slate">Please check your connection or try again.</p>
        <button
          onclick={() => { apiError = false; ytApiPromise = null; loadYouTubeAPI().then(() => { if (videoInput) loadVideo(); }); }}
          class="mt-2 px-4 py-1.5 rounded-lg bg-white/5 text-xs hover:bg-white/10 transition-colors"
        >
          Retry
        </button>
      </div>
    {/if}

    <!-- URL Input -->
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
          onclick={() => loadVideo()}
          disabled={!videoInput.trim() || apiError}
          class="touch-target px-5 py-3 rounded-xl bg-rina-rose text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Load
        </button>
      </div>
      {#if currentVideoTitle}
        <p class="text-sm text-rina-slate mt-2 truncate">Now playing: {currentVideoTitle}</p>
      {/if}
    </GlassCard>

    <!-- Search -->
    <GlassCard class="mb-4">
      <div class="flex gap-2">
        <input
          bind:value={searchQuery}
          placeholder="Search YouTube videos..."
          class="input-safe flex-1 px-4 py-3 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark
            focus:outline-none focus:border-rina-rose/50 transition-all"
          onkeydown={(e) => e.key === 'Enter' && performSearch()}
        />
        <button
          onclick={performSearch}
          disabled={!searchQuery.trim() || isSearching}
          class="touch-target px-5 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-colors disabled:opacity-50"
        >
          {#if isSearching}
            <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          {:else}
            Search
          {/if}
        </button>
      </div>

      {#if searchError}
        <p class="text-xs text-rina-rose mt-2">{searchError}</p>
      {/if}

      {#if searchResults.length > 0}
        <div class="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
          {#each searchResults as result (result.videoId)}
            <button
              onclick={() => selectSearchResult(result.videoId, result.title)}
              class="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              <img
                src={result.videoThumbnails?.find((t) => t.quality === 'mqdefault')?.url || `https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`}
                alt={result.title}
                class="w-24 h-14 object-cover rounded-lg bg-rina-bg flex-shrink-0"
                loading="lazy"
              />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-white font-medium truncate">{result.title}</p>
                <p class="text-xs text-rina-slate truncate">{result.author} • {formatDuration(result.lengthSeconds)}</p>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </GlassCard>

    <!-- Player Container -->
    <div class="glass rounded-2xl overflow-hidden aspect-video relative" in:scale>
      <div id={playerContainerId} class="w-full h-full"></div>
      {#if !playerReady}
        <div class="absolute inset-0 flex flex-col items-center justify-center text-rina-slate pointer-events-none">
          <span class="text-5xl mb-4">📺</span>
          <p class="text-lg font-medium">Paste a YouTube link or search to start watching</p>
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
