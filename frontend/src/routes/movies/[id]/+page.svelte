<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { movieApi, type Movie } from '$lib/utils/api';
  import { fade, scale } from 'svelte/transition';

  const id = page.params.id;

  let movie = $state<Movie | null>(null);
  let loading = $state(true);
  let errorMsg = $state('');
  let deleteConfirm = $state(false);

  async function load() {
    loading = true;
    errorMsg = '';
    deleteConfirm = false;
    try {
      movie = await movieApi.get(id);
    } catch (err: any) {
      errorMsg = err.message || 'Failed to load movie.';
    } finally {
      loading = false;
    }
  }

  async function toggleWatched() {
    if (!movie) return;
    const newWatched = !movie.watched;
    try {
      await movieApi.update(id, { watched: newWatched });
      movie = { ...movie, watched: newWatched, watchedAt: newWatched ? new Date().toISOString() : undefined };
    } catch {
      alert('Failed to update watched status');
    }
  }

  async function setRating(r: number) {
    if (!movie) return;
    try {
      await movieApi.update(id, { rating: r });
      movie = { ...movie, rating: r };
    } catch {
      alert('Failed to update rating');
    }
  }

  async function deleteMovie() {
    try {
      await movieApi.remove(id);
      goto('/movies');
    } catch {
      alert('Delete failed');
    }
  }

  function download() {
    window.location.href = movieApi.download(id);
  }

  function watch() {
    window.location.href = movieApi.watch(id);
  }

  onMount(() => {
    load();
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && deleteConfirm && (deleteConfirm = false)} />
{#if isAuthenticated()}
  <div class="min-h-screen pb-12 bg-rina-bg" in:fade={{ duration: 300 }}>
    {#if loading}
      <div class="w-full h-[45vh] lg:h-[65vh] bg-rina-surface-muted animate-pulse"></div>
      <div class="px-4 md:px-8 max-w-7xl mx-auto -mt-20 lg:-mt-40 relative z-10">
        <div class="flex flex-col md:flex-row gap-6 md:gap-10">
          <div class="w-40 md:w-56 lg:w-72 aspect-[2/3] rounded-2xl bg-rina-surface-muted animate-pulse shrink-0"></div>
          <div class="flex-1 space-y-3 pt-4">
            <div class="h-8 w-3/4 bg-rina-surface-muted animate-pulse rounded-lg"></div>
            <div class="h-4 w-1/2 bg-rina-surface-muted animate-pulse rounded-lg"></div>
            <div class="h-20 w-full bg-rina-surface-muted animate-pulse rounded-lg"></div>
          </div>
        </div>
      </div>
    {:else if errorMsg}
      <div class="text-center py-20">
        <div class="text-4xl mb-3">😔</div>
        <p class="text-rina-text-muted text-sm mb-4">{errorMsg}</p>
        <button onclick={load} class="btn-secondary text-sm">Try Again</button>
      </div>
    {:else if movie}
      <!-- ─── Hero Backdrop ──────────────────────────────────────── -->
      <div class="relative w-full h-[45vh] md:h-[55vh] lg:h-[65vh] overflow-hidden">
        <div
          class="absolute inset-0 bg-cover bg-center"
          class:bg-rina-surface-muted={!(movie.backdropPath || movie.posterPath)}
          style={movie.backdropPath || movie.posterPath ? `background-image: url(${movie.backdropPath || movie.posterPath})` : ''}
        ></div>
        <div class="absolute inset-0 bg-gradient-to-t from-rina-bg via-rina-bg/70 to-transparent"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-rina-bg/80 via-transparent to-transparent"></div>
      </div>

      <!-- ─── Content ────────────────────────────────────────────── -->
      <div class="px-4 md:px-8 max-w-7xl mx-auto -mt-24 md:-mt-32 lg:-mt-40 relative z-10">
        <div class="flex flex-col md:flex-row gap-6 md:gap-10">
          <!-- Poster -->
          <div class="shrink-0 mx-auto md:mx-0">
            <div class="w-40 md:w-56 lg:w-72 aspect-[2/3] rounded-2xl overflow-hidden shadow-soft-xl card-elevated">
              {#if movie.posterPath}
                <img src={movie.posterPath} alt={movie.title} class="w-full h-full object-cover" />
              {:else}
                <div class="w-full h-full bg-rina-surface-muted flex items-center justify-center text-5xl">🎬</div>
              {/if}
            </div>
          </div>

          <!-- Info -->
          <div class="flex-1 pt-2 md:pt-4 lg:pt-6">
            <h1 class="text-2xl md:text-4xl lg:text-5xl font-display font-bold text-rina-text mb-2 lg:mb-3 leading-tight">
              {movie.title}
            </h1>

            <!-- Meta -->
            <div class="flex flex-wrap items-center gap-2 mb-4">
              {#if movie.releaseDate}
                <span class="px-2 py-0.5 rounded-lg bg-rina-surface-muted text-rina-text-secondary text-xs font-medium">
                  {movie.releaseDate.split('-')[0]}
                </span>
              {/if}
              {#if movie.runtime}
                <span class="px-2 py-0.5 rounded-lg bg-rina-surface-muted text-rina-text-secondary text-xs font-medium">
                  {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
                </span>
              {/if}
              {#if movie.voteAverage}
                <span class="px-2 py-0.5 rounded-lg bg-rina-primary-soft text-rina-primary text-xs font-bold flex items-center gap-1">
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  {movie.voteAverage.toFixed(1)}
                </span>
              {/if}
              {#if movie.sourceType === 'watchlist'}
                <span class="px-2 py-0.5 rounded-lg bg-rina-warning-soft text-rina-warning text-xs font-medium">
                  Watchlist
                </span>
              {/if}
            </div>

            <!-- Genres -->
            {#if movie.genres?.length}
              <div class="flex flex-wrap gap-1.5 mb-5">
                {#each movie.genres as g (g.id)}
                  <span class="px-2.5 py-1 rounded-full bg-rina-primary-soft text-rina-primary text-xs font-medium">
                    {g.name}
                  </span>
                {/each}
              </div>
            {/if}

            <!-- Actions -->
            <div class="flex flex-wrap gap-3 mb-6">
              {#if movie.filePath}
                <button type="button" onclick={watch} class="btn-primary text-sm lg:text-base lg:px-5 lg:py-2.5 shadow-glow">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 5.84a.5.5 0 0 1 .77-.42l7.15 4.16a.5.5 0 0 1 0 .84l-7.15 4.16a.5.5 0 0 1-.77-.42V5.84Z"/></svg>
                  Watch Now
                </button>
                <button type="button" onclick={download} class="btn-secondary text-sm lg:text-base lg:px-5 lg:py-2.5">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/></svg>
                  Download
                </button>
              {:else}
                <span class="px-4 py-2 rounded-xl bg-rina-surface-muted text-rina-text-muted text-sm font-medium flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
                  No file uploaded yet
                </span>
              {/if}
              {#if movie.trailerUrl}
                <a href={movie.trailerUrl} target="_blank" rel="noopener noreferrer" class="btn-ghost text-sm lg:text-base lg:px-5 lg:py-2.5 border border-rina-border">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 5.84a.5.5 0 0 1 .77-.42l7.15 4.16a.5.5 0 0 1 0 .84l-7.15 4.16a.5.5 0 0 1-.77-.42V5.84Z"/></svg>
                  Trailer
                </a>
              {/if}
              <a href="/movies" class="btn-ghost text-sm lg:text-base lg:px-5 lg:py-2.5 border border-rina-border">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>
                Back
              </a>
            </div>

            <!-- Synopsis -->
            {#if movie.overview}
              <div class="mb-6 lg:mb-8">
                <h3 class="text-lg lg:text-xl font-display font-bold text-rina-text mb-2 lg:mb-3">Synopsis</h3>
                <p class="text-sm lg:text-base text-rina-text-secondary leading-relaxed lg:leading-relaxed max-w-3xl">{movie.overview}</p>
              </div>
            {/if}

            <!-- Watch status & Rating -->
            <div class="flex flex-wrap items-center gap-6 mb-6">
              <button
                type="button"
                onclick={toggleWatched}
                class="flex items-center gap-2 text-sm font-medium transition-colors"
                class:text-rina-success={movie.watched}
                class:text-rina-text-secondary={!movie.watched}
              >
                <div class="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors"
                  class:border-rina-success={movie.watched}
                  class:bg-rina-success={movie.watched}
                  class:border-rina-border-strong={!movie.watched}
                >
                  {#if movie.watched}
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                  {/if}
                </div>
                {movie.watched ? 'Watched' : 'Mark as Watched'}
              </button>

              <!-- Star rating -->
              <div class="flex items-center gap-1">
                {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as star (star)}
                  <button
                    onclick={() => setRating(star)}
                    class="transition-transform hover:scale-110"
                    aria-label="Rate {star} out of 10"
                  >
                    <svg
                      class="w-5 h-5"
                      class:text-rina-primary={star <= (movie.rating || 0)}
                      class:text-rina-border-strong={star > (movie.rating || 0)}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  </button>
                {/each}
                {#if movie.rating}
                  <span class="text-xs text-rina-text-muted ml-1">{movie.rating}/10</span>
                {/if}
              </div>
            </div>

            <!-- Admin actions -->
            {#if currentUser()?.username === 'maroon'}
              <div class="pt-4 border-t border-rina-border">
                <button
                  onclick={() => deleteConfirm = true}
                  class="text-sm text-rina-accent hover:text-rina-accent/80 font-medium flex items-center gap-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
                  Delete Movie
                </button>
              </div>
            {/if}
          </div>
        </div>

        <!-- ─── Cast ───────────────────────────────────────────────── -->
        {#if movie.cast?.length}
          <div class="mt-8 lg:mt-12 mb-10">
            <h3 class="text-lg lg:text-xl font-display font-bold text-rina-text mb-4 lg:mb-5">Cast</h3>
            <div class="flex gap-3 lg:gap-4 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory">
              {#each movie.cast as actor (actor.id)}
                <div class="shrink-0 w-24 md:w-28 lg:w-32 text-center snap-start">
                  <div class="w-24 h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-2xl overflow-hidden mb-2 shadow-soft bg-rina-surface-muted mx-auto">
                    {#if actor.profilePath}
                      <img src={actor.profilePath} alt={actor.name} class="w-full h-full object-cover" loading="lazy" />
                    {:else}
                      <div class="w-full h-full flex items-center justify-center text-2xl">👤</div>
                    {/if}
                  </div>
                  <p class="text-xs font-bold text-rina-text truncate">{actor.name}</p>
                  <p class="text-[10px] text-rina-text-muted truncate">{actor.character}</p>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<!-- ─── Delete Confirmation ─────────────────────────────────────── -->
{#if deleteConfirm}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rina-text/30 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    onclick={(e) => { if (e.target === e.currentTarget) deleteConfirm = false; }}
    onkeydown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) deleteConfirm = false; }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-title"
    tabindex="-1"
  >
    <div class="card-elevated p-6 w-full max-w-sm text-center" transition:scale={{ duration: 200, start: 0.95 }}>
      <div class="w-12 h-12 rounded-full bg-rina-accent-soft flex items-center justify-center mx-auto mb-3">
        <svg class="w-6 h-6 text-rina-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
      </div>
      <h3 class="text-lg font-display font-bold text-rina-text mb-1">Delete Movie?</h3>
      <p class="text-sm text-rina-text-secondary mb-5">This action cannot be undone.</p>
      <div class="flex gap-3">
        <button type="button" onclick={() => deleteConfirm = false} class="btn-ghost flex-1">Cancel</button>
        <button type="button" onclick={deleteMovie} class="btn-primary flex-1 bg-rina-accent hover:bg-rina-accent/90">Delete</button>
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
