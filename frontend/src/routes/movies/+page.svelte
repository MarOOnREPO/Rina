<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { movieApi, type Movie } from '$lib/utils/api';
  import GlassCard from '$lib/components/GlassCard.svelte';
  import FeatureGate from '$lib/components/FeatureGate.svelte';

  let movies: Movie[] = $state([]);
  let searchQuery = $state('');
  let searchResults: Array<{ tmdbId: number; title: string; posterPath?: string; releaseDate?: string }> = $state([]);
  let loading = $state(true);
  let searching = $state(false);
  let watchedFilter: 'all' | 'watched' | 'unwatched' = $state('all');

  async function loadMovies() {
    try {
      movies = await movieApi.list();
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  async function search() {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      searchResults = [];
      return;
    }
    searching = true;
    try {
      searchResults = await movieApi.searchTmdb(searchQuery);
    } catch {
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  async function addMovie(tmdbId: number) {
    try {
      const movie = await movieApi.add(tmdbId);
      movies = [movie, ...movies];
      searchResults = searchResults.filter((r) => r.tmdbId !== tmdbId);
    } catch {
      // handle error
    }
  }

  async function toggleWatched(movie: Movie) {
    try {
      const updated = await movieApi.toggleWatched(movie.id);
      movies = movies.map((m) => (m.id === updated.id ? updated : m));
    } catch {
      // handle error
    }
  }

  async function removeMovie(id: string) {
    try {
      await movieApi.remove(id);
      movies = movies.filter((m) => m.id !== id);
    } catch {
      // handle error
    }
  }

  let filteredMovies = $derived(movies.filter((m) => {
    if (watchedFilter === 'watched') return m.watched;
    if (watchedFilter === 'unwatched') return !m.watched;
    return true;
  }));

  let searchTimeout: ReturnType<typeof setTimeout>;
  function handleSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(search, 400);
  }

  // Redirect if not authenticated (wait for auth loading to finish)
  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
    goto('/login');
    }
  });

  onMount(() => {
    loadMovies();
  });
</script>

{#if isAuthenticated()}
<FeatureGate feature="tmdb">
  <div class="max-w-5xl mx-auto px-4 py-6" in:fade>
    <h2 class="text-2xl font-bold mb-6">🎬 Movie Watchlist</h2>

    <!-- Search -->
    <GlassCard class="mb-6">
      <div class="relative">
        <input
          bind:value={searchQuery}
          oninput={handleSearchInput}
          placeholder="Search TMDB for movies..."
          class="w-full px-4 py-3 pr-10 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark
            focus:outline-none focus:border-rina-rose/50 transition-all"
        />
        {#if searching}
          <span class="absolute right-3 top-1/2 -translate-y-1/2 animate-spin">⏳</span>
        {:else}
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-rina-slate-dark">🔍</span>
        {/if}
      </div>

      {#if searchResults.length > 0}
        <div class="mt-4 space-y-2 max-h-64 overflow-y-auto" transition:fly={{ y: -10 }}>
          {#each searchResults as result (result.tmdbId)}
            <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors">
              {#if result.posterPath}
                <img src={result.posterPath} alt={result.title} class="w-12 h-16 object-cover rounded-lg bg-rina-bg" loading="lazy" />
              {:else}
                <div class="w-12 h-16 rounded-lg bg-rina-bg flex items-center justify-center text-lg">🎬</div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{result.title}</p>
                <p class="text-xs text-rina-slate">{result.releaseDate || 'Unknown year'}</p>
              </div>
              <button
                onclick={() => addMovie(result.tmdbId)}
                class="px-3 py-1.5 rounded-lg bg-rina-rose/20 text-rina-rose text-xs font-medium hover:bg-rina-rose/30 transition-colors"
              >
                Add
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </GlassCard>

    <!-- Filters -->
    <div class="flex gap-2 mb-4">
      {#each [['all', 'All'], ['unwatched', 'To Watch'], ['watched', 'Watched']] as [filter, label]}
        <button
          onclick={() => watchedFilter = filter as typeof watchedFilter}
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all
            {watchedFilter === filter ? 'bg-rina-rose/20 text-rina-rose' : 'glass text-rina-slate hover:text-white'}"
        >
          {label}
        </button>
      {/each}
    </div>

    <!-- Watchlist -->
    {#if loading}
      <div class="text-center py-12 text-rina-slate">Loading movies...</div>
    {:else if filteredMovies.length === 0}
      <GlassCard class="text-center py-12">
        <p class="text-4xl mb-3">🍿</p>
        <p class="text-rina-slate">No movies in this list yet.</p>
      </GlassCard>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {#each filteredMovies as movie (movie.id)}
          <div
            class="glass rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform"
            animate:flip={{ duration: 300 }}
            in:scale={{ duration: 200, start: 0.9 }}
          >
            <div class="relative aspect-[2/3] bg-rina-bg">
              {#if movie.posterPath}
                <img
                  src={movie.posterPath}
                  alt={movie.title}
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-4xl">🎬</div>
              {/if}
              <!-- Watched overlay -->
              {#if movie.watched}
                <div class="absolute inset-0 bg-black/60 flex items-center justify-center" transition:fade>
                  <div class="text-center">
                    <span class="text-3xl">✅</span>
                    {#if movie.rating}
                      <div class="flex items-center justify-center gap-0.5 mt-1">
                        {#each [1, 2, 3, 4, 5] as star}
                          <span class="text-xs {star <= Math.round(movie.rating / 2) ? 'text-yellow-400' : 'text-white/20'}">★</span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
              <!-- Actions -->
              <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button
                  onclick={() => toggleWatched(movie)}
                  class="w-8 h-8 rounded-full bg-black/60 backdrop-blur text-white text-xs hover:bg-rina-rose transition-colors"
                  title={movie.watched ? 'Mark unwatched' : 'Mark watched'}
                >
                  {movie.watched ? '↩️' : '✓'}
                </button>
                <button
                  onclick={() => removeMovie(movie.id)}
                  class="w-8 h-8 rounded-full bg-black/60 backdrop-blur text-white text-xs hover:bg-red-500 transition-colors"
                  title="Remove"
                >
                  🗑️
                </button>
              </div>
            </div>
            <div class="p-3">
              <p class="text-sm font-medium truncate {movie.watched ? 'line-through text-rina-slate-dark' : ''}">
                {movie.title}
              </p>
              <p class="text-xs text-rina-slate mt-0.5">
                {movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : 'Unknown'}
              </p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</FeatureGate>
{/if}
