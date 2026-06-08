<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { tmdbApi, movieApi, type TMDBMovieDetail } from '$lib/utils/api';
  import { fade, scale } from 'svelte/transition';

  const tmdbId = parseInt(page.params.tmdbId);

  let movie = $state<TMDBMovieDetail | null>(null);
  let loading = $state(true);
  let errorMsg = $state('');
  let added = $state(false);
  let trailerOpen = $state(false);

  const imageBase = 'https://image.tmdb.org/t/p';

  function posterUrl(path?: string) {
    return path ? `${imageBase}/w500${path}` : '';
  }
  function backdropUrl(path?: string) {
    return path ? `${imageBase}/w1280${path}` : '';
  }
  function profileUrl(path?: string) {
    return path ? `${imageBase}/w185${path}` : '';
  }

  async function load() {
    loading = true;
    errorMsg = '';
    added = false;
    try {
      movie = await tmdbApi.getMovie(tmdbId);
    } catch (err: any) {
      errorMsg = err.message || 'Failed to load movie details.';
    } finally {
      loading = false;
    }
  }

  async function addToWatchlist() {
    try {
      await movieApi.addToWatchlist(tmdbId);
      added = true;
      alert('Added to watchlist! 💕');
    } catch (err: any) {
      if (err.status === 409) {
        added = true;
        alert('Already in your watchlist!');
      } else {
        alert('Failed to add. Please try again.');
      }
    }
  }

  function getTrailer() {
    if (!movie?.videos?.results) return null;
    return movie.videos.results.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
  }

  const castList = $derived(movie?.credits?.cast || []);
  const crewList = $derived(movie?.credits?.crew || []);

  onMount(() => {
    load();
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && trailerOpen && (trailerOpen = false)} />
{#if isAuthenticated()}
  <div class="min-h-screen pb-12 bg-rina-bg" in:fade={{ duration: 300 }}>
    {#if loading}
      <!-- Skeleton -->
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
          class:bg-rina-surface-muted={!(movie.backdrop_path || movie.poster_path)}
          style={movie.backdrop_path || movie.poster_path ? `background-image: url(${backdropUrl(movie.backdrop_path) || posterUrl(movie.poster_path)})` : ''}
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
              {#if movie.poster_path}
                <img
                  src={posterUrl(movie.poster_path)}
                  alt={movie.title}
                  class="w-full h-full object-cover"
                />
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
            {#if movie.tagline}
              <p class="text-sm md:text-base lg:text-lg text-rina-primary italic mb-3 lg:mb-4">{movie.tagline}</p>
            {/if}

            <!-- Meta row -->
            <div class="flex flex-wrap items-center gap-2 mb-4">
              {#if movie.release_date}
                <span class="px-2 py-0.5 rounded-lg bg-rina-surface-muted text-rina-text-secondary text-xs font-medium">
                  {movie.release_date.split('-')[0]}
                </span>
              {/if}
              {#if movie.runtime}
                <span class="px-2 py-0.5 rounded-lg bg-rina-surface-muted text-rina-text-secondary text-xs font-medium">
                  {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
                </span>
              {/if}
              {#if movie.vote_average}
                <span class="px-2 py-0.5 rounded-lg bg-rina-primary-soft text-rina-primary text-xs font-bold flex items-center gap-1">
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  {movie.vote_average.toFixed(1)}
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
              <button
                type="button"
                onclick={addToWatchlist}
                class="btn-primary text-sm lg:text-base lg:px-5 lg:py-2.5 shadow-glow"
                class:opacity-70={added}
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                {added ? 'In Watchlist' : 'Add to Watchlist'}
              </button>
              {#if getTrailer()}
                <button
                  type="button"
                  onclick={() => trailerOpen = true}
                  class="btn-secondary text-sm lg:text-base lg:px-5 lg:py-2.5"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 5.84a.5.5 0 0 1 .77-.42l7.15 4.16a.5.5 0 0 1 0 .84l-7.15 4.16a.5.5 0 0 1-.77-.42V5.84Z"/></svg>
                  Trailer
                </button>
              {/if}
              <a href="/movies/browse" class="btn-ghost text-sm lg:text-base lg:px-5 lg:py-2.5 border border-rina-border">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>
                Back
              </a>
            </div>

            <!-- Synopsis -->
            <div class="mb-8 lg:mb-10">
              <h3 class="text-lg lg:text-xl font-display font-bold text-rina-text mb-2 lg:mb-3">Synopsis</h3>
              <p class="text-sm lg:text-base text-rina-text-secondary leading-relaxed lg:leading-relaxed max-w-3xl">
                {movie.overview || 'No overview available.'}
              </p>
            </div>
          </div>
        </div>

        <!-- ─── Cast ───────────────────────────────────────────────── -->
        {#if castList.length > 0}
          <div class="mt-8 lg:mt-12 mb-10">
            <h3 class="text-lg lg:text-xl font-display font-bold text-rina-text mb-4 lg:mb-5">Cast</h3>
            <div class="flex gap-3 lg:gap-4 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory">
              {#each castList.slice(0, 16) as actor (actor.id)}
                <div class="shrink-0 w-24 md:w-28 lg:w-32 text-center snap-start">
                  <div class="w-24 h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-2xl overflow-hidden mb-2 shadow-soft bg-rina-surface-muted mx-auto">
                    {#if actor.profile_path}
                      <img
                        src={profileUrl(actor.profile_path)}
                        alt={actor.name}
                        class="w-full h-full object-cover"
                        loading="lazy"
                      />
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

<!-- ─── Trailer Modal ───────────────────────────────────────────── -->
{#if trailerOpen && getTrailer()}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-rina-text/50 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    onclick={(e) => { if (e.target === e.currentTarget) trailerOpen = false; }}
    onkeydown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) trailerOpen = false; }}
    role="dialog"
    aria-modal="true"
    aria-label="{movie?.title || 'Movie'} trailer"
    tabindex="-1"
  >
    <div
      class="w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-soft-xl pointer-events-auto"
      transition:scale={{ duration: 200, start: 0.95 }}
    >
      <iframe
        class="w-full h-full"
        src="https://www.youtube-nocookie.com/embed/{getTrailer()!.key}"
        title="Trailer"
        frameborder="0"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
        loading="lazy"
      ></iframe>
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
