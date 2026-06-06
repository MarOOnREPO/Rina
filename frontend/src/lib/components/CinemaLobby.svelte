<script lang="ts">
  import { cinemaApi } from '$lib/utils/api';
  import { startUpload } from '$lib/utils/upload';
  import CinemaPlayer from './CinemaPlayer.svelte';
  import type { CinemaSessionResponse, CinemaTmdbMetadata } from '$lib/utils/api';

  let sourceType = $state<'torrent' | 'direct' | 'upload'>('direct');
  let uri = $state('');
  let loading = $state(false);
  let error = $state('');
  let session = $state<{ id: string; playlistUrl: string; source: CinemaSessionResponse['source'] } | null>(null);

  // Upload state
  let fileInput: HTMLInputElement | null = null;
  let uploadProgress = $state(0);
  let isUploading = $state(false);
  let uploadError = $state('');

  async function startSession() {
    if (!uri.trim()) return;
    loading = true;
    error = '';
    try {
      const body: { type: 'torrent' | 'direct' | 'upload'; uri: string; filename?: string } =
        sourceType === 'upload'
          ? { type: 'upload', uri: uri.trim(), filename: session?.source?.filename || 'uploaded-video' }
          : { type: sourceType, uri: uri.trim() };

      const res = await cinemaApi.start(body);
      if (res.status === 'error') throw new Error(res.error || 'Session failed');
      session = { id: res.id, playlistUrl: res.playlistUrl, source: res.source };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    uploadFile(file);
  }

  function uploadFile(file: File) {
    isUploading = true;
    uploadProgress = 0;
    uploadError = '';

    const upload = startUpload({
      file,
      onProgress: (bytesUploaded, bytesTotal) => {
        uploadProgress = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
      },
      onSuccess: (uploadUrl) => {
        isUploading = false;
        const key = uploadUrl.split('/').pop();
        if (!key) {
          uploadError = 'Failed to get upload key';
          return;
        }
        uri = key;
        session = { id: '', playlistUrl: '', source: { type: 'upload', filename: file.name } };
        startSession();
      },
      onError: (err) => {
        isUploading = false;
        uploadError = err.message || 'Upload failed';
      }
    });

    // Allow cancelling
    return upload;
  }

  function triggerFilePicker() {
    fileInput?.click();
  }

  async function fetchDownloadUrl() {
    if (!session?.id) return;
    try {
      const res = await cinemaApi.downloadUrl(session.id);
      window.open(res.url, '_blank');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Download failed';
    }
  }

  function leaveSession() {
    if (session?.id) cinemaApi.destroy(session.id).catch(() => {});
    session = null;
    uri = '';
    uploadProgress = 0;
    uploadError = '';
    error = '';
    if (fileInput) fileInput.value = '';
  }

  function getYear(date?: string | null): string {
    return date ? `(${date.split('-')[0]})` : '';
  }
</script>

{#if !session?.id}
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
      <button
        onclick={() => (sourceType = 'upload')}
        class="flex-1 py-2 rounded-lg text-xs font-semibold transition {sourceType === 'upload' ? 'bg-rina-rose text-white shadow' : 'text-rina-slate hover:text-white'}"
      >Upload</button>
    </div>

    {#if sourceType === 'upload'}
      <div class="space-y-3">
        <input
          bind:this={fileInput}
          type="file"
          accept="video/*,.mkv,.mp4,.avi,.mov,.webm,.mpeg,.mpg"
          onchange={handleFileSelect}
          class="hidden"
        />
        <button
          onclick={triggerFilePicker}
          disabled={isUploading}
          class="w-full py-8 rounded-xl border-2 border-dashed border-white/20 hover:border-rina-rose/50 hover:bg-white/5 transition flex flex-col items-center gap-2 disabled:opacity-50"
        >
          <span class="text-2xl">📁</span>
          <span class="text-sm text-white font-medium">
            {isUploading ? 'Uploading...' : 'Click to select a video file'}
          </span>
          <span class="text-xs text-rina-slate-dark">MKV, MP4, AVI, MOV up to 5GB</span>
        </button>

        {#if isUploading}
          <div class="space-y-1">
            <div class="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                class="h-full bg-rina-rose transition-all duration-300"
                style="width: {uploadProgress}%"
              ></div>
            </div>
            <p class="text-xs text-rina-slate-dark text-center">{uploadProgress}% uploaded</p>
          </div>
        {/if}

        {#if uploadError}
          <div class="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{uploadError}</div>
        {/if}
      </div>
    {:else}
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
    {/if}
  </div>
{:else}
  <div class="space-y-4">
    <!-- TMDB Metadata Card -->
    {#if session.source?.metadata}
      {@const meta = session.source.metadata}
      <div class="glass rounded-2xl p-4 flex gap-4">
        {#if meta.posterPath}
          <img
            src={meta.posterPath}
            alt={meta.title}
            class="w-24 h-36 object-cover rounded-lg bg-black/20 flex-shrink-0"
          />
        {:else}
          <div class="w-24 h-36 rounded-lg bg-black/20 flex items-center justify-center flex-shrink-0">
            <span class="text-3xl">🎬</span>
          </div>
        {/if}
        <div class="min-w-0 flex-1">
          <h3 class="text-lg font-bold text-white truncate">
            {meta.title}
            <span class="text-rina-slate font-normal">{getYear(meta.releaseDate)}</span>
          </h3>
          {#if meta.overview}
            <p class="text-xs text-rina-slate-dark mt-1 line-clamp-4">{meta.overview}</p>
          {/if}
          {#if session.source.filename}
            <p class="text-[10px] text-rina-slate-dark mt-2 truncate">File: {session.source.filename}</p>
          {/if}
        </div>
      </div>
    {:else if session.source?.filename}
      <div class="glass rounded-2xl p-4 flex items-center gap-3">
        <div class="w-12 h-12 rounded-lg bg-black/20 flex items-center justify-center flex-shrink-0">
          <span class="text-2xl">🎬</span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm text-white font-medium truncate">{session.source.filename}</p>
          <p class="text-xs text-rina-slate-dark">No TMDB info found</p>
        </div>
      </div>
    {/if}

    <CinemaPlayer sessionId={session.id} playlistUrl={session.playlistUrl} />

    <div class="flex items-center gap-3">
      {#if session.source?.s3Key}
        <button
          onclick={fetchDownloadUrl}
          class="px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/15 active:scale-[0.98] transition flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Download original
        </button>
      {/if}
      <button onclick={leaveSession} class="text-xs text-rina-slate-dark hover:text-rina-rose transition flex items-center gap-1">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        Leave Room
      </button>
    </div>
  </div>
{/if}
