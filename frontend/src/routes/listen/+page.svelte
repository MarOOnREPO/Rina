<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth';
  import { socketStore, mediaSync } from '$lib/stores/socket';
  import { fade, scale } from 'svelte/transition';
  import GlassCard from '$lib/components/GlassCard.svelte';

  let videoId = '';
  let player: YT.Player | null = null;
  let playerReady = false;
  let isSyncing = false;
  let currentVideoTitle = '';

  // Load YouTube IFrame API
  function loadYouTubeAPI(): Promise<void> {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript.parentNode?.insertBefore(tag, firstScript);
      (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady = resolve;
    });
  }

  function initPlayer(id: string) {
    if (!id) return;
    player = new window.YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      videoId: id,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1
      },
      events: {
        onReady: () => {
          playerReady = true;
          currentVideoTitle = player?.getVideoData()?.title || '';
        },
        onStateChange: (event: YT.OnStateChangeEvent) => {
          if (isSyncing) return;
          const time = player?.getCurrentTime() || 0;
          if (event.data === window.YT.PlayerState.PLAYING) {
            socketStore.emit('media:sync', { action: 'play', time, videoId: id });
          } else if (event.data === window.YT.PlayerState.PAUSED) {
            socketStore.emit('media:sync', { action: 'pause', time, videoId: id });
          }
        }
      }
    });
  }

  function handleSync(event: { action: 'play' | 'pause' | 'seek'; time: number; videoId: string; sender: string }) {
    if (event.sender === $currentUser?.username) return;
    if (!playerReady || !player) return;

    isSyncing = true;
    const timeDiff = Math.abs(player.getCurrentTime() - event.time);

    if (event.action === 'play') {
      if (timeDiff > 2) player.seekTo(event.time, true);
      player.playVideo();
    } else if (event.action === 'pause') {
      if (timeDiff > 2) player.seekTo(event.time, true);
      player.pauseVideo();
    } else if (event.action === 'seek') {
      player.seekTo(event.time, true);
    }

    setTimeout(() => { isSyncing = false; }, 500);
  }

  function loadVideo() {
    const id = extractVideoId(videoId);
    if (!id) return;
    if (player) {
      player.loadVideoById(id);
    } else {
      initPlayer(id);
    }
    socketStore.emit('media:sync', { action: 'seek', time: 0, videoId: id });
  }

  function extractVideoId(url: string): string {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
  }

  // Redirect if not authenticated (wait for auth loading to finish)
  $: if (!$isLoading && !$isAuthenticated && typeof window !== 'undefined') {
    goto('/login');
  }

  onMount(async () => {
    await loadYouTubeAPI();

    const sock = socketStore.getSocket();
    if (sock) {
      mediaSync.init(sock);
    }
    const unsub = mediaSync.subscribe((evt) => {
      if (evt) handleSync(evt);
    });

    return () => {
      unsub?.();
    };
  });

  onDestroy(() => {
    if (player) player.destroy();
  });

  // TypeScript declarations for YouTube API
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
</script>



{#if $isAuthenticated}
  <div class="max-w-5xl mx-auto px-4 py-6" in:fade>
    <h2 class="text-2xl font-bold mb-6">🎵 Listen Together</h2>

    <GlassCard className="mb-6">
      <div class="flex gap-2">
        <input
          bind:value={videoId}
          placeholder="Paste YouTube URL or Video ID..."
          class="flex-1 px-4 py-3 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark
            focus:outline-none focus:border-rina-rose/50 transition-all"
          on:keydown={(e) => e.key === 'Enter' && loadVideo()}
        />
        <button
          on:click={loadVideo}
          class="px-6 py-3 rounded-xl bg-rina-rose text-white font-medium hover:opacity-90 transition-opacity"
        >
          Load
        </button>
      </div>
      {#if currentVideoTitle}
        <p class="text-sm text-rina-slate mt-2 truncate">Now playing: {currentVideoTitle}</p>
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
