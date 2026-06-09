<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { movieApi, type Movie } from '$lib/utils/api';
  import { createUpload } from '$lib/utils/upload';
  import { fade, fly, scale } from 'svelte/transition';

  let movies: Movie[] = $state([]);
  let loading = $state(true);
  let uploadLoading = $state(false);
  let uploadProgress = $state(0);
  let uploadSpeed = $state('');
  let uploadEta = $state('');
  let uploadBytes = $state('');
  let uploadTotal = $state('');
  let uploadAbort = $state<(() => void) | null>(null);
  let uploadCancelled = $state(false);
  let showUpload = $state(false);
  let searchQuery = $state('');
  let hoveredMovie = $state<string | null>(null);
  let deleteConfirmId = $state<string | null>(null);
  let sourceFilter = $state<'all' | 'uploaded' | 'watchlist'>('all');
  let watchedFilter = $state<'all' | 'watched' | 'unwatched'>('all');

  let title = $state('');
  let posterUrl = $state('');
  let trailerUrl = $state('');
  let backdropUrl = $state('');
  let tmdbId = $state('');
  let fileInput = $state<HTMLInputElement | null>(null);

  async function loadMovies() {
    try {
      movies = await movieApi.list(sourceFilter);
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '';
    if (seconds < 60) return Math.ceil(seconds) + 's';
    const m = Math.floor(seconds / 60);
    const s = Math.ceil(seconds % 60);
    return `${m}m ${s}s`;
  }

  async function uploadMovie() {
    if (!title || !fileInput?.files?.[0]) return;
    uploadLoading = true;
    uploadProgress = 0;
    uploadSpeed = '';
    uploadEta = '';
    uploadBytes = '';
    uploadTotal = '';

    const file = fileInput.files[0];
    const totalSize = file.size;
    uploadTotal = formatBytes(totalSize);

    let lastLoaded = 0;
    let lastTime = Date.now();
    let uploadUrl = '';

    try {
      // Step 1: Upload file via TUS to S3
      await new Promise<void>((resolve, reject) => {
        const tusUpload = createUpload({
          file,
          metadata: { filename: file.name, filetype: file.type, title },
          onProgress: (bytesUploaded, bytesTotal) => {
            uploadProgress = Math.round((bytesUploaded / bytesTotal) * 100);
            uploadBytes = formatBytes(bytesUploaded);

            const now = Date.now();
            const dt = (now - lastTime) / 1000;
            if (dt > 0.5) {
              const speed = (bytesUploaded - lastLoaded) / dt;
              uploadSpeed = formatBytes(speed) + '/s';
              const remaining = bytesTotal - bytesUploaded;
              uploadEta = speed > 0 ? formatTime(remaining / speed) : '';
              lastLoaded = bytesUploaded;
              lastTime = now;
            }
          },
          onSuccess: (url) => {
            uploadUrl = url;
            resolve();
          },
          onError: (error) => {
            reject(error);
          }
        });

        uploadAbort = () => {
          tusUpload.abort();
        };

        tusUpload.start();
      });

      // Step 2: Extract S3 key from TUS upload URL
      const s3Key = uploadUrl.split('/').pop() || '';
      if (!s3Key) {
        throw new Error('Could not determine upload key');
      }

      // Step 3: Create movie record with metadata
      await movieApi.upload({
        title,
        s3Key,
        posterPath: posterUrl || null,
        backdropPath: backdropUrl || null,
        trailerUrl: trailerUrl || null,
        tmdbId: tmdbId ? parseInt(tmdbId, 10) : undefined
      });

      await loadMovies();
      showUpload = false;
      title = '';
      posterUrl = '';
      trailerUrl = '';
      backdropUrl = '';
      tmdbId = '';
      if (fileInput) fileInput.value = '';
    } catch (err) {
      if (!uploadCancelled) {
        alert('Upload failed: ' + (err instanceof Error ? err.message : 'unknown'));
      }
    } finally {
      uploadLoading = false;
      uploadProgress = 0;
      uploadSpeed = '';
      uploadEta = '';
      uploadBytes = '';
      uploadTotal = '';
      uploadAbort = null;
      uploadCancelled = false;
    }
  }

  function cancelUpload() {
    uploadCancelled = true;
    if (uploadAbort) {
      uploadAbort();
    }
    if (fileInput) fileInput.value = '';
  }

  function confirmDelete(id: string) {
    deleteConfirmId = id;
  }

  function cancelDelete() {
    deleteConfirmId = null;
  }

  async function deleteMovie(id: string) {
    try {
      await movieApi.remove(id);
      movies = movies.filter((m) => m.id !== id);
      deleteConfirmId = null;
    } catch {
      alert('Delete failed');
    }
  }

  async function downloadMovie(id: string) {
    window.location.href = await movieApi.download(id);
  }

  async function watchMovie(id: string) {
    window.location.href = await movieApi.watch(id);
  }

  async function toggleWatched(movie: Movie, e: Event) {
    e.stopPropagation();
    const newWatched = !movie.watched;
    try {
      await movieApi.update(movie.id, { watched: newWatched });
      movie.watched = newWatched;
      movie.watchedAt = newWatched ? new Date().toISOString() : undefined;
    } catch {
      alert('Failed to update');
    }
  }

  const filteredMovies = $derived(
    movies.filter((m) => {
      if (watchedFilter === 'watched' && !m.watched) return false;
      if (watchedFilter === 'unwatched' && m.watched) return false;
      if (searchQuery.trim()) {
        return m.title.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    })
  );

  const featuredMovie = $derived(movies.find(m => m.sourceType === 'uploaded') || movies[0] || null);

  const uploadedCount = $derived(movies.filter(m => m.sourceType === 'uploaded').length);
  const watchlistCount = $derived(movies.filter(m => m.sourceType === 'watchlist').length);

  onMount(() => {
    loadMovies();
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && deleteConfirmId && cancelDelete()} />
{#if isAuthenticated()}
  <div class="min-h-screen pb-8 bg-rina-bg" in:fade={{ duration: 300 }}>
    <!-- ─── Hero Banner ─────────────────────────────────────────── -->
    {#if featuredMovie}
      <div class="relative w-full h-[40vh] md:h-[50vh] lg:h-[65vh] overflow-hidden rounded-b-2xl md:rounded-b-3xl shadow-soft-lg">
        <div
          class="absolute inset-0 bg-cover bg-center transition-transform duration-700 scale-105"
          class:bg-rina-surface-muted={!(featuredMovie.backdropPath || featuredMovie.posterPath)}
          style={featuredMovie.backdropPath || featuredMovie.posterPath ? `background-image: url(${featuredMovie.backdropPath || featuredMovie.posterPath})` : ''}
        ></div>
        <div class="absolute inset-0 bg-gradient-to-t from-rina-bg via-rina-bg/50 to-transparent"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-rina-bg/90 via-rina-bg/30 to-transparent"></div>

        <div class="absolute bottom-0 left-0 right-0 p-4 md:p-8 lg:p-12">
          <div class="max-w-7xl mx-auto">
            <span class="badge-primary mb-2 inline-flex items-center gap-1 lg:mb-3">
              <span class="text-xs lg:text-sm">✨</span> Featured
            </span>
            <h1 class="text-2xl md:text-5xl lg:text-6xl font-display font-bold text-rina-text mb-2 md:mb-3 leading-tight drop-shadow-sm">
              {featuredMovie.title}
            </h1>
            <div class="flex items-center gap-2 md:gap-3 flex-wrap">
              {#if featuredMovie.trailerUrl}
                <a
                  href={featuredMovie.trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn-secondary text-xs md:text-sm lg:text-base lg:px-5 lg:py-2.5"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 5.84a.5.5 0 0 1 .77-.42l7.15 4.16a.5.5 0 0 1 0 .84l-7.15 4.16a.5.5 0 0 1-.77-.42V5.84Z"/></svg>
                  Trailer
                </a>
              {/if}
              <button
                type="button"
                onclick={() => downloadMovie(featuredMovie.id)}
                class="btn-ghost text-xs md:text-sm border border-rina-border"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/></svg>
                Download
              </button>
              <button
                type="button"
                onclick={() => watchMovie(featuredMovie.id)}
                class="btn-primary text-xs md:text-sm shadow-glow"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 5.84a.5.5 0 0 1 .77-.42l7.15 4.16a.5.5 0 0 1 0 .84l-7.15 4.16a.5.5 0 0 1-.77-.42V5.84Z"/></svg>
                Watch Now
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- ─── Header + Tabs + Search ──────────────────────────────── -->
    <div class="px-4 md:px-8 pt-6 pb-4 max-w-7xl mx-auto">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h2 class="text-xl md:text-2xl font-display font-bold text-rina-text">Movies</h2>
          <p class="text-xs text-rina-text-muted mt-0.5">
            {uploadedCount} uploaded · {watchlistCount} watchlist
          </p>
        </div>

        <div class="flex items-center gap-3">
          <div class="relative flex-1 md:w-64">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search movies..."
              class="input pl-10 pr-4 py-2.5 text-sm w-full"
            />
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rina-text-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
          </div>
          <a href="/movies/browse" class="btn-secondary shrink-0 text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59"/></svg>
            Browse
          </a>
          {#if currentUser()?.username === 'maroon'}
            <button
              onclick={() => showUpload = !showUpload}
              class="btn-secondary shrink-0 text-sm"
            >
              {showUpload ? 'Cancel' : '+ Upload'}
            </button>
          {/if}
        </div>
      </div>

      <!-- Filter tabs -->
      <div class="flex flex-wrap gap-2">
        <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {#each [['all', 'All'], ['uploaded', 'Uploaded'], ['watchlist', 'Watchlist']] as [key, label] (key)}
            <button
              type="button"
              onclick={() => { sourceFilter = key as any; loadMovies(); }}
              class="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200"
              class:bg-rina-primary={sourceFilter === key}
              class:text-white={sourceFilter === key}
              class:bg-rina-surface-muted={sourceFilter !== key}
              class:text-rina-text-secondary={sourceFilter !== key}
            >
              {label}
            </button>
          {/each}
        </div>
        <div class="w-px h-6 bg-rina-border self-center mx-1 hidden md:block"></div>
        <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {#each [['all', 'All'], ['unwatched', 'Unwatched'], ['watched', 'Watched']] as [key, label] (key)}
            <button
              type="button"
              onclick={() => watchedFilter = key as any}
              class="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200"
              class:bg-rina-primary={watchedFilter === key}
              class:text-white={watchedFilter === key}
              class:bg-rina-surface-muted={watchedFilter !== key}
              class:text-rina-text-secondary={watchedFilter !== key}
            >
              {label}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- ─── Upload Form ─────────────────────────────────────────── -->
    {#if showUpload}
      <div class="px-4 md:px-8 pb-6 max-w-7xl mx-auto" transition:fly={{ y: -10, duration: 200 }}>
        <div class="card p-5 md:p-6 lg:p-8 space-y-4">
          <h3 class="text-lg lg:text-xl font-display font-bold text-rina-text">Upload Movie</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
            <input
              bind:value={title}
              placeholder="Movie title *"
              class="input"
            />
            <input
              bind:value={posterUrl}
              placeholder="Poster image URL"
              class="input"
            />
            <input
              bind:value={backdropUrl}
              placeholder="Backdrop image URL"
              class="input"
            />
            <input
              bind:value={trailerUrl}
              placeholder="Trailer URL (YouTube)"
              class="input"
            />
            <input
              bind:value={tmdbId}
              placeholder="TMDB ID (auto-fills metadata)"
              class="input"
              type="number"
            />
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <label class="flex-1 min-w-[200px] lg:min-w-[240px] cursor-pointer">
              <input
                bind:this={fileInput}
                type="file"
                accept="video/*"
                class="hidden"
              />
              <div class="flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-4 rounded-xl bg-rina-surface-muted border border-dashed border-rina-border-strong text-rina-text-secondary text-sm lg:text-base hover:bg-rina-primary-soft hover:border-rina-primary transition-all duration-200">
                <svg class="w-5 h-5 text-rina-primary" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0-3 3m3-3 3 3M6.75 19.5h10.5A2.25 2.25 0 0 0 19.5 17.25V6.75A2.25 2.25 0 0 0 17.25 4.5H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                <span class="truncate">{fileInput?.files?.[0]?.name || 'Choose video file...'}</span>
              </div>
            </label>
            {#if uploadLoading}
              <div class="flex-1 min-w-[200px] space-y-2">
                <div class="flex items-center justify-between text-xs text-rina-text-secondary">
                  <span class="font-medium">{uploadProgress}%</span>
                  <span>{uploadBytes} / {uploadTotal}</span>
                </div>
                <div class="h-2 rounded-full bg-rina-surface-muted overflow-hidden">
                  <div
                    class="h-full rounded-full bg-rina-primary transition-all duration-200"
                    style="width: {uploadProgress}%"
                  ></div>
                </div>
                <div class="flex items-center justify-between text-[10px] text-rina-text-muted">
                  <span>{uploadSpeed}</span>
                  <span>{uploadEta ? 'ETA: ' + uploadEta : ''}</span>
                </div>
              </div>
              <button
                type="button"
                onclick={cancelUpload}
                class="btn-ghost text-sm border border-rina-border shrink-0"
                aria-label="Cancel upload"
              >
                Cancel
              </button>
            {:else}
              <button
                type="button"
                onclick={uploadMovie}
                disabled={!title || !fileInput?.files?.[0]}
                class="btn-primary"
              >
                Upload
              </button>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- ─── Movie Grid ──────────────────────────────────────────── -->
    <div class="px-4 md:px-8 max-w-7xl mx-auto">
      {#if loading}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 xl:gap-5">
          {#each Array(12) as _, i (i)}
            <div class="aspect-[2/3] rounded-2xl bg-rina-surface-muted animate-pulse shadow-soft"></div>
          {/each}
        </div>
      {:else if filteredMovies.length === 0}
        <div class="text-center py-20">
          <div class="text-4xl mb-3">🎬</div>
          <p class="text-rina-text-muted text-sm">{searchQuery ? 'No movies match your search.' : 'No movies yet.'}</p>
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 xl:gap-5">
          {#each filteredMovies as movie, i (movie.id)}
            <div
              role="button"
              tabindex="0"
              class="group relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer card-elevated"
              class:scale-[1.03]={hoveredMovie === movie.id}
              class:z-10={hoveredMovie === movie.id}
              onmouseenter={() => hoveredMovie = movie.id}
              onmouseleave={() => hoveredMovie = null}
              style="transition-delay: {i % 5 * 30}ms"
              in:scale={{ duration: 300, delay: i * 50, start: 0.9 }}
              aria-label={movie.title}
              onclick={() => goto(`/movies/${movie.id}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/movies/${movie.id}`)}
            >
              <!-- Poster -->
              {#if movie.posterPath || movie.backdropPath}
                <img
                  src={movie.posterPath || movie.backdropPath}
                  alt={movie.title}
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />
              {:else}
                <div class="w-full h-full bg-rina-surface-muted flex items-center justify-center text-5xl">🎬</div>
              {/if}

              <!-- Vote Average Badge -->
              {#if movie.voteAverage}
                <div class="absolute top-2 right-2 z-10 bg-rina-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-soft flex items-center gap-0.5">
                  <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  {movie.voteAverage.toFixed(1)}
                </div>
              {/if}

              <!-- Watched Checkmark -->
              {#if movie.watched}
                <div class="absolute top-2 left-2 z-10 bg-rina-success text-white w-5 h-5 rounded-full flex items-center justify-center shadow-soft">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                </div>
              {/if}

              <!-- Source Badge (watchlist) -->
              {#if movie.sourceType === 'watchlist'}
                <div class="absolute top-8 left-2 z-10 bg-rina-warning text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-soft">
                  Watchlist
                </div>
              {/if}

              <!-- Gradient Overlay -->
              <div class="absolute inset-0 bg-gradient-to-t from-rina-text/80 via-rina-text/10 to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300"></div>

              <!-- Title (always visible at bottom) -->
              <div class="absolute bottom-0 left-0 right-0 p-3 transform transition-transform duration-300 group-hover:translate-y-[-60%]">
                <h3 class="text-sm font-bold text-white leading-tight drop-shadow-md line-clamp-2">{movie.title}</h3>
              </div>

              <!-- Hover Actions -->
              <div
                class="absolute inset-0 flex flex-col items-center justify-end p-3 gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0"
              >
                <div class="flex gap-2 w-full">
                  {#if movie.trailerUrl}
                    <a
                      href={movie.trailerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onclick={(e) => e.stopPropagation()}
                      class="flex-1 py-2 rounded-xl bg-white/20 backdrop-blur-md text-white text-[10px] font-bold text-center hover:bg-white/30 transition-colors border border-white/20"
                    >
                      Trailer
                    </a>
                  {/if}
                  {#if movie.filePath}
                    <button
                      type="button"
                      onclick={(e) => { e.stopPropagation(); downloadMovie(movie.id); }}
                      class="flex-1 py-2 rounded-xl bg-rina-success/20 backdrop-blur-md text-white text-[10px] font-bold hover:bg-rina-success/30 transition-colors border border-rina-success/20"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onclick={(e) => { e.stopPropagation(); watchMovie(movie.id); }}
                      class="flex-1 py-2 rounded-xl bg-rina-primary/30 backdrop-blur-md text-white text-[10px] font-bold hover:bg-rina-primary/40 transition-colors border border-rina-primary/20"
                    >
                      Watch
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={(e) => { e.stopPropagation(); goto(`/movies/${movie.id}`); }}
                      class="flex-1 py-2 rounded-xl bg-rina-primary/30 backdrop-blur-md text-white text-[10px] font-bold hover:bg-rina-primary/40 transition-colors border border-rina-primary/20"
                    >
                      Details
                    </button>
                  {/if}
                </div>
                {#if currentUser()?.username === 'maroon'}
                  <button
                    type="button"
                    onclick={(e) => { e.stopPropagation(); confirmDelete(movie.id); }}
                    class="w-full py-1.5 rounded-xl bg-white/10 text-white/80 text-[10px] font-bold hover:bg-rina-accent/30 hover:text-white transition-colors"
                  >
                    Delete
                  </button>
                {/if}
                <button
                  type="button"
                  onclick={(e) => toggleWatched(movie, e)}
                  class="w-full py-1.5 rounded-xl bg-white/10 text-white/80 text-[10px] font-bold hover:bg-rina-success/30 hover:text-white transition-colors flex items-center justify-center gap-1"
                >
                  {#if movie.watched}
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                    Watched
                  {:else}
                    Mark Watched
                  {/if}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- ─── Delete Confirmation Modal ─────────────────────────────── -->
{#if deleteConfirmId}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rina-text/30 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    onclick={(e) => { if (e.target === e.currentTarget) cancelDelete(); }}
    onkeydown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) cancelDelete(); }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-title"
    tabindex="-1"
  >
    <div
      class="card-elevated p-6 w-full max-w-sm text-center"
      transition:scale={{ duration: 200, start: 0.95 }}
    >
      <div class="w-12 h-12 rounded-full bg-rina-accent-soft flex items-center justify-center mx-auto mb-3">
        <svg class="w-6 h-6 text-rina-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
      </div>
      <h3 id="delete-title" class="text-lg font-display font-bold text-rina-text mb-1">Delete Movie?</h3>
      <p class="text-sm text-rina-text-secondary mb-5">This action cannot be undone.</p>
      <div class="flex gap-3">
        <button type="button" onclick={cancelDelete} class="btn-ghost flex-1">Cancel</button>
        <button type="button" onclick={() => deleteConfirmId && deleteMovie(deleteConfirmId)} class="btn-primary flex-1 bg-rina-accent hover:bg-rina-accent/90">Delete</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
