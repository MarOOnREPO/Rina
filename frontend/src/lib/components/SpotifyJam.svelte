<script lang="ts">
  import { onMount } from 'svelte';
  import { socketStore, type SpotifyJamEvent } from '$lib/stores/socket.svelte';
  import { spotifyApi } from '$lib/utils/api';
  import { currentUser } from '$lib/stores/auth.svelte';
  import { SPOTIFY_CLIENT_ID } from '$lib/config/spotify';

  interface SpotifyImage {
    url: string;
    height: number;
    width: number;
  }

  interface SpotifyArtist {
    name: string;
  }

  interface SpotifyAlbum {
    images: SpotifyImage[];
  }

  interface SpotifyTrack {
    uri: string;
    name: string;
    artists: SpotifyArtist[];
    album: SpotifyAlbum;
  }

  interface SpotifyDevice {
    id: string;
    name: string;
    is_active: boolean;
  }

  let query = $state('');
  let results = $state<SpotifyTrack[]>([]);
  let loading = $state(false);
  let error = $state('');
  let currentTrack = $state<SpotifyTrack | null>(null);
  let isPlaying = $state(false);
  let isConnected = $state(false);
  let devices = $state<SpotifyDevice[]>([]);
  let selectedDevice = $state('');
  let searchFocused = $state(false);
  let clientIdWarning = $state(SPOTIFY_CLIENT_ID === 'YOUR_SPOTIFY_CLIENT_ID_HERE');

  onMount(() => {
    socketStore.emit('spotify:join');
    checkConnection();
    loadDevices();
    setupSocketListeners();
    setupPopupListener();
    return () => socketStore.emit('spotify:leave');
  });

  async function checkConnection() {
    try {
      const res = await spotifyApi.me();
      isConnected = res.success;
      if (res.data?.item) {
        currentTrack = res.data.item;
        isPlaying = res.data.is_playing;
      }
    } catch {
      isConnected = false;
    }
  }

  async function loadDevices() {
    try {
      const res = await spotifyApi.devices();
      if (res.success) devices = res.data.devices || [];
    } catch {
      /* ignore */
    }
  }

  function setupSocketListeners() {
    socketStore.on('spotify:state', (data: SpotifyJamEvent) => {
      if (data.sender === currentUser()?.username) return;
      if (data.uri) {
        currentTrack = { name: 'Partner selection', uri: data.uri };
      }
      isPlaying = data.action === 'play' || data.action === 'track';
    });

    socketStore.on('spotify:error', (data: { message: string }) => {
      error = data.message;
      setTimeout(() => (error = ''), 5000);
    });
  }

  function setupPopupListener() {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'SPOTIFY_CONNECTED') {
        if (event.data.error) {
          error = event.data.error;
        } else {
          isConnected = true;
          loadDevices();
        }
      }
    };
    window.addEventListener('message', handler);
  }

  // ─── PKCE Helpers ──────────────────────────────────────────────
  function generateCodeVerifier(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(128));
    return Array.from(values, (x) => possible[x % possible.length]).join('');
  }

  async function generateCodeChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async function connectSpotify() {
    error = '';
    if (clientIdWarning) {
      error = 'Please add your Spotify Client ID in src/lib/config/spotify.ts';
      return;
    }

    const verifier = generateCodeVerifier();
    sessionStorage.setItem('spotify_code_verifier', verifier);
    const challenge = await generateCodeChallenge(verifier);

    const redirectUri = `${window.location.origin}/jam`;
    const scope = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';

    const url = new URL('https://accounts.spotify.com/authorize');
    url.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('scope', scope);

    window.open(url.toString(), 'spotify-auth', 'width=500,height=700,top=100,left=100');
  }

  async function disconnectSpotify() {
    try {
      await spotifyApi.disconnect();
      isConnected = false;
      currentTrack = null;
    } catch {
      /* ignore */
    }
  }

  async function search() {
    if (!query.trim()) return;
    loading = true;
    error = '';
    try {
      const res = await spotifyApi.search(query);
      results = res.data?.tracks?.items || [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function playTrack(uri: string, name: string, artists: string, image: string) {
    error = '';
    const position_ms = 0;
    try {
      await spotifyApi.play({ uris: [uri], position_ms, device_id: selectedDevice || undefined });
      currentTrack = { uri, name, artists, image };
      isPlaying = true;
      socketStore.emit('spotify:control', {
        action: 'track',
        uri,
        position_ms,
        device_id: selectedDevice || undefined
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function togglePlay() {
    error = '';
    if (isPlaying) {
      await spotifyApi.pause({ device_id: selectedDevice || undefined });
      isPlaying = false;
      socketStore.emit('spotify:control', {
        action: 'pause',
        position_ms: 0,
        device_id: selectedDevice || undefined
      });
    } else if (currentTrack?.uri) {
      await spotifyApi.play({ uris: [currentTrack.uri], position_ms: 0, device_id: selectedDevice || undefined });
      isPlaying = true;
      socketStore.emit('spotify:control', {
        action: 'play',
        position_ms: 0,
        device_id: selectedDevice || undefined
      });
    }
  }

  function getSmallestImage(images: SpotifyImage[]) {
    if (!images?.length) return null;
    return images[images.length - 1]?.url;
  }
</script>

<div class="glass rounded-2xl p-5 space-y-4">
  {#if clientIdWarning}
    <div class="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
      ⚠️ Add your Spotify Client ID in <code class="font-mono">src/lib/config/spotify.ts</code> to enable Jam.
      <a href="https://developer.spotify.com/dashboard" target="_blank" class="underline">Get it free here</a>.
    </div>
  {/if}

  {#if !isConnected}
    <div class="text-center py-8 space-y-4">
      <div class="w-14 h-14 rounded-full bg-[#1DB954]/10 flex items-center justify-center mx-auto">
        <svg class="w-7 h-7 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      </div>
      <div class="space-y-1">
        <p class="text-sm text-white font-medium">Connect Spotify Premium</p>
        <p class="text-xs text-rina-slate-dark max-w-[240px] mx-auto">Both partners need Premium. No server config needed.</p>
      </div>
      <button
        onclick={connectSpotify}
        class="px-6 py-2.5 rounded-xl bg-[#1DB954] text-white text-sm font-semibold hover:scale-105 active:scale-95 transition shadow-lg shadow-[#1DB954]/20"
      >Connect Spotify</button>
    </div>
  {:else}
    {#if error}
      <div class="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
    {/if}

    <!-- Device Selector -->
    <div class="flex items-center gap-2">
      <select
        bind:value={selectedDevice}
        class="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rina-rose/50"
      >
        <option value="">🎧 Active Device</option>
        {#each devices as device}
          <option value={device.id}>{device.name} ({device.type}) {device.is_active ? '• active' : ''}</option>
        {/each}
      </select>
      <button onclick={loadDevices} class="text-[11px] text-rina-rose hover:underline px-2 py-2">Refresh</button>
      <button onclick={disconnectSpotify} class="text-[11px] text-rina-slate-dark hover:text-red-400 transition px-2 py-2">Disconnect</button>
    </div>

    <!-- Search -->
    <div class="relative">
      <div class="flex gap-2">
        <div class="flex-1 relative">
          <input
            type="text"
            bind:value={query}
            onkeydown={(e) => e.key === 'Enter' && search()}
            onfocus={() => (searchFocused = true)}
            placeholder="Search tracks, artists..."
            class="w-full bg-black/20 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-rina-slate-dark focus:outline-none focus:border-rina-rose/50 focus:ring-1 focus:ring-rina-rose/20 transition"
          />
          <svg class="w-4 h-4 text-rina-slate-dark absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <button
          onclick={search}
          disabled={loading || !query.trim()}
          class="px-4 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-medium hover:bg-rina-rose/90 active:scale-95 disabled:opacity-40 transition"
        >
          {#if loading}
            <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block"></span>
          {:else}
            Search
          {/if}
        </button>
      </div>

      {#if searchFocused && results.length > 0}
        <div class="absolute z-20 mt-2 w-full glass-strong rounded-xl p-2 space-y-1 max-h-72 overflow-y-auto shadow-2xl border border-white/10">
          {#each results as track}
            <button
              onclick={() => {
                playTrack(track.uri, track.name, track.artists.map((a: SpotifyArtist) => a.name).join(', '), getSmallestImage(track.album.images));
                searchFocused = false;
              }}
              class="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition text-left group"
            >
              <img
                src={getSmallestImage(track.album.images) || '/placeholder-album.png'}
                alt=""
                class="w-10 h-10 rounded-md object-cover bg-white/5 flex-shrink-0"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm text-white truncate">{track.name}</p>
                <p class="text-[11px] text-rina-slate-dark truncate">{track.artists.map((a: SpotifyArtist) => a.name).join(', ')}</p>
              </div>
              <span class="text-rina-rose opacity-0 group-hover:opacity-100 text-xs transition">▶</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Now Playing -->
    {#if currentTrack}
      <div class="flex items-center gap-3 pt-3 border-t border-white/5">
        {#if currentTrack.image}
          <img src={currentTrack.image} alt="" class="w-12 h-12 rounded-lg object-cover bg-white/5 flex-shrink-0" />
        {:else}
          <div class="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-lg flex-shrink-0">🎵</div>
        {/if}
        <div class="flex-1 min-w-0">
          <p class="text-sm text-white truncate font-medium">{currentTrack.name}</p>
          <p class="text-xs text-rina-slate-dark truncate">{currentTrack.artists || (currentTrack.artist ? currentTrack.artist : 'Spotify')}</p>
        </div>
        <button
          onclick={togglePlay}
          class="w-11 h-11 rounded-full bg-rina-rose hover:bg-rina-rose/90 active:scale-95 flex items-center justify-center transition shadow-lg shadow-rina-rose/20"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {#if isPlaying}
            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
          {:else}
            <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          {/if}
        </button>
      </div>
    {:else}
      <div class="text-center py-4 text-xs text-rina-slate-dark">Search for a track and hit play to start the Jam.</div>
    {/if}
  {/if}
</div>
