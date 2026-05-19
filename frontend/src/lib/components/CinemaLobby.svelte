<script lang="ts">
  import { cinemaApi } from '$lib/utils/api';
  import CinemaPlayer from './CinemaPlayer.svelte';

  let sourceType = $state<'torrent' | 'direct'>('direct');
  let uri = $state('');
  let loading = $state(false);
  let error = $state('');
  let session = $state<{ id: string; playlistUrl: string } | null>(null);

  async function startSession() {
    if (!uri.trim()) return;
    loading = true;
    error = '';
    try {
      const res = await cinemaApi.start({ type: sourceType, uri: uri.trim() });
      if (res.status === 'error') throw new Error(res.error || 'Session failed');
      session = { id: res.id, playlistUrl: res.playlistUrl };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function leaveSession() {
    if (session) cinemaApi.destroy(session.id).catch(() => {});
    session = null;
    uri = '';
  }
</script>

{#if !session}
  <div class="glass rounded-2xl p-6 space-y-4">
    <div class="flex items-center gap-3">
      <span class="text-2xl">🎬</span>
      <div>
        <h2 class="text-lg font-semibold text-white leading-tight">Cinema Room</h2>
        <p class="text-xs text-rina-slate-dark">Synchronized MKV / MP4 / Torrent playback</p>
      </div>
    </div>

    <div class="flex gap-2 p-1 bg-black/20 rounded-xl">
      <button
        onclick={() => (sourceType = 'direct')}
        class="flex-1 py-2 rounded-lg text-xs font-semibold transition {sourceType === 'direct' ? 'bg-rina-rose text-white shadow' : 'text-rina-slate hover:text-white'}"
      >Direct Link</button>
      <button
        onclick={() => (sourceType = 'torrent')}
        class="flex-1 py-2 rounded-lg text-xs font-semibold transition {sourceType === 'torrent' ? 'bg-rina-rose text-white shadow' : 'text-rina-slate hover:text-white'}"
      >Magnet / Torrent</button>
    </div>

    <div class="space-y-2">
      <label class="text-[11px] uppercase tracking-wider text-rina-slate-dark font-semibold">
        {sourceType === 'direct' ? 'Video URL' : 'Magnet URI'}
      </label>
      <input
        type="text"
        bind:value={uri}
        placeholder={sourceType === 'direct' ? 'https://example.com/movie.mkv' : 'magnet:?xt=urn:btih:...'}
        class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-rina-slate-dark focus:outline-none focus:border-rina-rose/50 focus:ring-1 focus:ring-rina-rose/20 transition"
      />
      {#if sourceType === 'torrent'}
        <p class="text-[10px] text-rina-slate-dark">MKV with AC3 audio is fully supported via backend transcoding.</p>
      {/if}
    </div>

    {#if error}
      <div class="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
    {/if}

    <button
      onclick={startSession}
      disabled={loading || !uri.trim()}
      class="w-full py-3 rounded-xl bg-rina-rose text-white font-semibold text-sm hover:bg-rina-rose/90 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 transition flex items-center justify-center gap-2"
    >
      {#if loading}
        <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        Starting stream...
      {:else}
        Start Watching
      {/if}
    </button>
  </div>
{:else}
  <div class="space-y-3">
    <CinemaPlayer sessionId={session.id} playlistUrl={session.playlistUrl} />
    <button onclick={leaveSession} class="text-xs text-rina-slate-dark hover:text-rina-rose transition flex items-center gap-1">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
      Leave Room
    </button>
  </div>
{/if}
