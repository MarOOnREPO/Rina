<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { tmdbApi, movieApi, type TMDBMovieResult, type Genre } from '$lib/utils/api';
  import { fade, fly, scale } from 'svelte/transition';

  type Category = 'popular' | 'top_rated' | 'upcoming' | 'now_playing';

  const categories: { key: Category; label: string; icon: string }[] = [
    { key: 'popular', label: 'Popular', icon: '🔥' },
    { key: 'top_rated', label: 'Top Rated', icon: '⭐' },
    { key: 'upcoming', label: 'Upcoming', icon: '📅' },
    { key: 'now_playing', label: 'Now Playing', icon: '🎬' },
  ];

  let movies: TMDBMovieResult[] = $state([]);
  let genres: Genre[] = $state([]);
  let loading = $state(true);
  let searchLoading = $state(false);
  let category = $state<Category>('popular');
  let page = $state(1);
  let totalPages = $state(1);
  let searchQuery = $state('');
  let searchTimeout: ReturnType<typeof setTimeout>;
  let selectedGenre = $state<number | null>(null);
  let heroMovie = $state<TMDBMovieResult | null>(null);
  let errorMsg = $state('');

  const imageBase = 'https://image.tmdb.org/t/p';

  function posterUrl(path?: string) {
    return path ? `${imageBase}/w500${path}` : '';
  }
  function backdropUrl(path?: string) {
    return path ? `${imageBase}/w1280${path}` : '';
  }

  async function loadGenres() {
    try {
      const res = await tmdbApi.getGenres();
      genres = res.genres;
    } catch {
      // ignore
    }
  }

  async function loadMovies(reset = false) {
    if (reset) {
      page = 1;
      movies = [];
    }
    loading = true;
    errorMsg = '';
    try {
      if (searchQuery.trim()) {
        const res = await tmdbApi.search(searchQuery, page);
        movies = reset ? res.results : [...movies, ...res.results];
        totalPages = res.total_pages;
      } else {
        const res = await tmdbApi.discover(category, page);
        movies = reset ? res.results : [...movies, ...res.results];
        totalPages = res.total_pages;
        if (reset && res.results.length > 0) {
          heroMovie = res.results[0];
        }
      }
    } catch (err) {
      errorMsg = 'Could not load movies. Please try again.';
    } finally {
      loading = false;
      searchLoading = false;
    }
  }

  function onSearch() {
    clearTimeout(searchTimeout);
    searchLoading = true;
    searchTimeout = setTimeout(() => {
      loadMovies(true);
    }, 400);
  }

  function setCategory(c: Category) {
    category = c;
    selectedGenre = null;
    searchQuery = '';
    loadMovies(true);
  }

  function loadMore() {
    if (page < totalPages) {
      page++;
      loadMovies();
    }
  }

  async function addToWatchlist(tmdbId: number) {
    try {
      await movieApi.addToWatchlist(tmdbId);
      alert('Added to watchlist! 💕');
    } catch (err: any) {
      if (err.status === 409) {
        alert('Already in your watchlist!');
      } else {
        alert('Failed to add. Please try again.');
      }
    }
  }

  const filteredMovies = $derived(
    selectedGenre
      ? movies.filter(m => m.genre_ids.includes(selectedGenre!))
      : movies
  );

  onMount(() => {
    loadGenres();
    loadMovies(true);
  });

  onDestroy(() => {
    clearTimeout(searchTimeout);
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

{#if isAuthenticated()}
  <div class="min-h-screen pb-12 bg-rina-bg" in:fade={{ duration: 300 }}>
    <!-- ─── Hero ─────────────────────────────────────────────────── -->
    {#if heroMovie && !searchQuery}
      <div class="relative w-full h-[40vh] md:h-[50vh] lg:h-[65vh] overflow-hidden rounded-b-2xl md:rounded-b-3xl shadow-soft-lg">
        <div
          class="absolute inset-0 bg-cover bg-center"
          class:bg-rina-surface-muted={!(heroMovie.backdrop_path || heroMovie.poster_path)}
          style={heroMovie.backdrop_path || heroMovie.poster_path ? `background-image: url(${backdropUrl(heroMovie.backdrop_path) || posterUrl(heroMovie.poster_path)})` : ''}
        ></div>
        <div class="absolute inset-0 bg-gradient-to-t from-rina-bg via-rina-bg/60 to-transparent"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-rina-bg/90 via-rina-bg/40 to-transparent"></div>

        <div class="absolute bottom-0 left-0 right-0 p-4 md:p-10 lg:p-12">
          <div class="max-w-7xl mx-auto">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 lg:px-4 lg:py-1.5 rounded-full bg-rina-primary/20 text-rina-primary text-xs lg:text-sm font-bold backdrop-blur-md mb-3">
              <span>🎬</span> Featured
            </span>
            <h1 class="text-2xl md:text-5xl lg:text-6xl font-display font-bold text-rina-text mb-2 md:mb-3 leading-tight drop-shadow-sm max-w-2xl lg:max-w-3xl">
              {heroMovie.title}
            </h1>
            <p class="text-sm md:text-base lg:text-lg text-rina-text-secondary max-w-xl lg:max-w-2xl line-clamp-2 lg:line-clamp-3 mb-4 lg:mb-6">
              {heroMovie.overview}
            </p>
            <div class="flex items-center gap-3">
              <button
                onclick={() => heroMovie && goto(`/movies/tmdb/${heroMovie.id}`)}
                class="btn-primary text-sm lg:text-base lg:px-5 lg:py-2.5 shadow-glow"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 5.84a.5.5 0 0 1 .77-.42l7.15 4.16a.5.5 0 0 1 0 .84l-7.15 4.16a.5.5 0 0 1-.77-.42V5.84Z"/></svg>
                View Details
              </button>
              <button
                onclick={() => heroMovie && addToWatchlist(heroMovie.id)}
                class="btn-secondary text-sm lg:text-base lg:px-5 lg:py-2.5"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                Watchlist
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
          <h2 class="text-xl md:text-2xl font-display font-bold text-rina-text">Discover Movies</h2>
          <p class="text-xs text-rina-text-muted mt-0.5">Browse trending & popular films from TMDB</p>
        </div>

        <div class="flex items-center gap-3">
          <div class="relative flex-1 md:w-72">
            <input
              type="text"
              bind:value={searchQuery}
              oninput={onSearch}
              placeholder="Search TMDB..."
              class="input pl-10 pr-4 py-2.5 text-sm w-full"
            />
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rina-text-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
            {#if searchLoading}
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rina-primary animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            {/if}
          </div>
          <a href="/movies" class="btn-ghost text-sm shrink-0 border border-rina-border">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>
            My Library
          </a>
        </div>
      </div>
    </div>

    <!-- ─── Category Tabs ────────────────────────────────────────── -->
    {#if !searchQuery}
      <div class="px-4 md:px-8 lg:px-8 pb-3 max-w-7xl mx-auto">
        <div class="flex gap-2 lg:gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {#each categories as cat (cat.key)}
            <button
              type="button"
              onclick={() => setCategory(cat.key)}
              class="shrink-0 px-4 py-2 lg:px-6 lg:py-2.5 rounded-xl text-sm lg:text-base font-medium transition-all duration-200 flex items-center gap-1.5 lg:gap-2"
              class:bg-rina-primary={category === cat.key}
              class:text-white={category === cat.key}
              class:shadow-glow={category === cat.key}
              class:bg-rina-surface={category !== cat.key}
              class:text-rina-text-secondary={category !== cat.key}
              class:hover:bg-rina-primary-soft={category !== cat.key}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ─── Genre Pills ──────────────────────────────────────────── -->
    {#if !searchQuery && genres.length > 0}
      <div class="px-4 md:px-8 lg:px-8 pb-4 max-w-7xl mx-auto">
        <div class="flex gap-1.5 lg:gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onclick={() => selectedGenre = null}
            class="shrink-0 px-3 py-1 lg:px-4 lg:py-1.5 rounded-full text-xs lg:text-sm font-medium transition-all duration-200"
            class:bg-rina-primary={selectedGenre === null}
            class:text-white={selectedGenre === null}
            class:bg-rina-surface-muted={selectedGenre !== null}
            class:text-rina-text-secondary={selectedGenre !== null}
            class:hover:bg-rina-primary-soft={selectedGenre !== null}
          >
            All
          </button>
          {#each genres as g (g.id)}
            <button
              type="button"
              onclick={() => selectedGenre = selectedGenre === g.id ? null : g.id}
              class="shrink-0 px-3 py-1 lg:px-4 lg:py-1.5 rounded-full text-xs lg:text-sm font-medium transition-all duration-200"
              class:bg-rina-primary={selectedGenre === g.id}
              class:text-white={selectedGenre === g.id}
              class:bg-rina-surface-muted={selectedGenre !== g.id}
              class:text-rina-text-secondary={selectedGenre !== g.id}
              class:hover:bg-rina-primary-soft={selectedGenre !== g.id}
            >
              {g.name}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ─── Movie Grid ───────────────────────────────────────────── -->
    <div class="px-4 md:px-8 max-w-7xl mx-auto">
      {#if loading && movies.length === 0}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 xl:gap-5">
          {#each Array(12) as _, i (i)}
            <div class="aspect-[2/3] rounded-2xl bg-rina-surface-muted animate-pulse shadow-soft"></div>
          {/each}
        </div>
      {:else if errorMsg}
        <div class="text-center py-20">
          <div class="text-4xl mb-3">😔</div>
          <p class="text-rina-text-muted text-sm mb-4">{errorMsg}</p>
          <button onclick={() => loadMovies(true)} class="btn-secondary text-sm">Try Again</button>
        </div>
      {:else if filteredMovies.length === 0}
        <div class="text-center py-20">
          <div class="text-4xl mb-3">🍿</div>
          <p class="text-rina-text-muted text-sm">
            {searchQuery ? 'No movies match your search.' : 'No movies found for this category.'}
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 xl:gap-5">
          {#each filteredMovies as movie, i (movie.id)}
            <div
              role="button"
              tabindex="0"
              class="group relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer card-elevated"
              onclick={() => goto(`/movies/tmdb/${movie.id}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/movies/tmdb/${movie.id}`)}
              aria-label={movie.title}
              style="transition-delay: {i % 5 * 30}ms"
              in:scale={{ duration: 300, delay: i * 40, start: 0.9 }}
            >
              <!-- Poster -->
              {#if movie.poster_path}
                <img
                  src={posterUrl(movie.poster_path)}
                  alt={movie.title}
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />
              {:else}
                <div class="w-full h-full bg-rina-surface-muted flex items-center justify-center text-5xl">🎬</div>
              {/if}

              <!-- Rating Badge -->
              {#if movie.vote_average > 0}
                <div class="absolute top-2 right-2 z-10 bg-rina-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-soft flex items-center gap-0.5">
                  <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  {movie.vote_average.toFixed(1)}
                </div>
              {/if}

              <!-- Gradient Overlay -->
              <div class="absolute inset-0 bg-gradient-to-t from-rina-text/80 via-rina-text/10 to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300"></div>

              <!-- Title + Year -->
              <div class="absolute bottom-0 left-0 right-0 p-3 transform transition-transform duration-300 group-hover:translate-y-[-40%]">
                <h3 class="text-sm font-bold text-white leading-tight drop-shadow-md line-clamp-2">{movie.title}</h3>
                {#if movie.release_date}
                  <p class="text-[10px] text-white/70 mt-0.5">{movie.release_date.split('-')[0]}</p>
                {/if}
              </div>

              <!-- Hover Actions -->
              <div
                class="absolute inset-0 flex flex-col items-center justify-end p-3 gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0"
              >
                <div class="flex gap-2 w-full">
                  <button
                    onclick={(e) => { e.stopPropagation(); goto(`/movies/tmdb/${movie.id}`); }}
                    class="flex-1 py-2 lg:py-2.5 rounded-xl bg-rina-primary/80 backdrop-blur-md text-white text-[10px] lg:text-xs font-bold text-center hover:bg-rina-primary transition-colors"
                  >
                    Details
                  </button>
                  <button
                    onclick={(e) => { e.stopPropagation(); addToWatchlist(movie.id); }}
                    class="flex-1 py-2 lg:py-2.5 rounded-xl bg-white/20 backdrop-blur-md text-white text-[10px] lg:text-xs font-bold hover:bg-white/30 transition-colors border border-white/20"
                  >
                    + Watchlist
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>

        <!-- Load More -->
        {#if page < totalPages}
          <div class="text-center mt-8">
            <button
              type="button"
              onclick={loadMore}
              disabled={loading}
              class="btn-secondary"
            >
              {#if loading}
                <svg class="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                Loading...
              {:else}
                Load More
              {/if}
            </button>
          </div>
        {/if}
      {/if}
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
