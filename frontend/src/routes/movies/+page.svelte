<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { movieApi, type Movie } from '$lib/utils/api';
  import { fade, fly, scale } from 'svelte/transition';

  let movies: Movie[] = $state([]);
  let loading = $state(true);
  let uploadLoading = $state(false);
  let showUpload = $state(false);
  let searchQuery = $state('');
  let hoveredMovie = $state<string | null>(null);
  let deleteConfirmId = $state<string | null>(null);

  let title = $state('');
  let posterUrl = $state('');
  let trailerUrl = $state('');
  let backdropUrl = $state('');
  let fileInput = $state<HTMLInputElement | null>(null);

  async function loadMovies() {
    try {
      movies = await movieApi.list();
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  async function uploadMovie() {
    if (!title || !fileInput?.files?.[0]) return;
    uploadLoading = true;
    try {
      const formData = new FormData();
      formData.append('title', title);
      if (posterUrl) formData.append('posterPath', posterUrl);
      if (trailerUrl) formData.append('trailerUrl', trailerUrl);
      if (backdropUrl) formData.append('backdropPath', backdropUrl);
      formData.append('file', fileInput.files[0]);
      await movieApi.create(formData);
      await loadMovies();
      showUpload = false;
      title = '';
      posterUrl = '';
      trailerUrl = '';
      backdropUrl = '';
      if (fileInput) fileInput.value = '';
    } catch (err) {
      alert('Upload failed: ' + (err instanceof Error ? err.message : 'unknown'));
    } finally {
      uploadLoading = false;
    }
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

  function downloadMovie(id: string) {
    window.location.href = movieApi.download(id);
  }

  function watchMovie(id: string) {
    window.location.href = movieApi.watch(id);
  }

  const filteredMovies = $derived(
    searchQuery.trim()
      ? movies.filter((m) => m.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : movies
  );

  const featuredMovie = $derived(movies[0] || null);

  onMount(() => {
    loadMovies();
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

{#if isAuthenticated()}
  <div class="min-h-screen pb-8 bg-rina-bg" in:fade={{ duration: 300 }}>
    <!-- ─── Hero Banner ─────────────────────────────────────────── -->
    {#if featuredMovie}
      <div class="relative w-full h-[40vh] md:h-[50vh] overflow-hidden rounded-b-2xl md:rounded-b-3xl shadow-soft-lg">
        <div
          class="absolute inset-0 bg-cover bg-center transition-transform duration-700 scale-105"
          style="background-image: url({featuredMovie.backdropPath || featuredMovie.posterPath || ''});"
        ></div>
        <div class="absolute inset-0 bg-gradient-to-t from-rina-bg via-rina-bg/50 to-transparent"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-rina-bg/90 via-rina-bg/30 to-transparent"></div>

        <div class="absolute bottom-0 left-0 right-0 p-4 md:p-8">
          <div class="max-w-7xl mx-auto">
            <span class="badge-primary mb-2 inline-flex items-center gap-1">
              <span class="text-xs">✨</span> Featured
            </span>
            <h1 class="text-2xl md:text-5xl font-display font-bold text-rina-text mb-2 md:mb-3 leading-tight drop-shadow-sm">
              {featuredMovie.title}
            </h1>
            <div class="flex items-center gap-2 md:gap-3 flex-wrap">
              {#if featuredMovie.trailerUrl}
                <a
                  href={featuredMovie.trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn-secondary text-xs md:text-sm"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 5.84a.5.5 0 0 1 .77-.42l7.15 4.16a.5.5 0 0 1 0 .84l-7.15 4.16a.5.5 0 0 1-.77-.42V5.84Z"/></svg>
                  Trailer
                </a>
              {/if}
              <button
                onclick={() => downloadMovie(featuredMovie.id)}
                class="btn-ghost text-xs md:text-sm border border-rina-border"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/></svg>
                Download
              </button>
              <button
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

    <!-- ─── Header + Search ─────────────────────────────────────── -->
    <div class="px-4 md:px-8 pt-6 pb-4 max-w-7xl mx-auto">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 class="text-xl md:text-2xl font-display font-bold text-rina-text">Movies</h2>
          <p class="text-xs text-rina-text-muted mt-0.5">{movies.length} title{movies.length === 1 ? '' : 's'} in library</p>
        </div>

        <div class="flex items-center gap-3">
          <div class="relative flex-1 md:w-64">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search movies..."
              class="input pl-10 pr-4 py-2.5 text-sm"
            />
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rina-text-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
          </div>
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
    </div>

    <!-- ─── Upload Form ─────────────────────────────────────────── -->
    {#if showUpload}
      <div class="px-4 md:px-8 pb-6 max-w-7xl mx-auto" transition:fly={{ y: -10, duration: 200 }}>
        <div class="card p-5 md:p-6 space-y-4 max-w-2xl">
          <h3 class="text-lg font-display font-bold text-rina-text">Upload Movie</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <label class="flex-1 min-w-[200px] cursor-pointer">
              <input
                bind:this={fileInput}
                type="file"
                accept="video/*"
                class="hidden"
              />
              <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-rina-surface-muted border border-dashed border-rina-border-strong text-rina-text-secondary text-sm hover:bg-rina-primary-soft hover:border-rina-primary transition-all duration-200">
                <svg class="w-5 h-5 text-rina-primary" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0-3 3m3-3 3 3M6.75 19.5h10.5A2.25 2.25 0 0 0 19.5 17.25V6.75A2.25 2.25 0 0 0 17.25 4.5H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                <span class="truncate">{fileInput?.files?.[0]?.name || 'Choose video file...'}</span>
              </div>
            </label>
            <button
              onclick={uploadMovie}
              disabled={uploadLoading || !title}
              class="btn-primary"
            >
              {#if uploadLoading}
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                Uploading...
              {:else}
                Upload
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- ─── Movie Grid ──────────────────────────────────────────── -->
    <div class="px-4 md:px-8 max-w-7xl mx-auto">
      {#if loading}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {#each Array(10) as _, i}
            <div class="aspect-[2/3] rounded-2xl bg-rina-surface-muted animate-pulse shadow-soft"></div>
          {/each}
        </div>
      {:else if filteredMovies.length === 0}
        <div class="text-center py-20">
          <div class="text-4xl mb-3">🎬</div>
          <p class="text-rina-text-muted text-sm">{searchQuery ? 'No movies match your search.' : 'No movies yet.'}</p>
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {#each filteredMovies as movie, i (movie.id)}
            <div
              role="figure"
              class="group relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer card-elevated"
              class:scale-[1.03]={hoveredMovie === movie.id}
              class:z-10={hoveredMovie === movie.id}
              onmouseenter={() => hoveredMovie = movie.id}
              onmouseleave={() => hoveredMovie = null}
              style="transition-delay: {i % 5 * 30}ms"
              in:scale={{ duration: 300, delay: i * 50, start: 0.9 }}
              aria-label={movie.title}
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
                      class="flex-1 py-2 rounded-xl bg-white/20 backdrop-blur-md text-white text-[10px] font-bold text-center hover:bg-white/30 transition-colors border border-white/20"
                    >
                      Trailer
                    </a>
                  {/if}
                  <button
                    onclick={() => downloadMovie(movie.id)}
                    class="flex-1 py-2 rounded-xl bg-rina-success/20 backdrop-blur-md text-white text-[10px] font-bold hover:bg-rina-success/30 transition-colors border border-rina-success/20"
                  >
                    Download
                  </button>
                  <button
                    onclick={() => watchMovie(movie.id)}
                    class="flex-1 py-2 rounded-xl bg-rina-primary/30 backdrop-blur-md text-white text-[10px] font-bold hover:bg-rina-primary/40 transition-colors border border-rina-primary/20"
                  >
                    Watch
                  </button>
                </div>
                {#if currentUser()?.username === 'maroon'}
                  <button
                    onclick={() => confirmDelete(movie.id)}
                    class="w-full py-1.5 rounded-xl bg-white/10 text-white/80 text-[10px] font-bold hover:bg-rina-accent/30 hover:text-white transition-colors"
                  >
                    Delete
                  </button>
                {/if}
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
    onkeydown={(e) => e.key === 'Escape' && cancelDelete()}
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
        <button onclick={cancelDelete} class="btn-ghost flex-1">Cancel</button>
        <button onclick={() => deleteConfirmId && deleteMovie(deleteConfirmId)} class="btn-primary flex-1 bg-rina-accent hover:bg-rina-accent/90">Delete</button>
      </div>
    </div>
  </div>
{/if}
