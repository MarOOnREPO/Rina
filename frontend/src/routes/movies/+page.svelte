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

  let title = $state('');
  let posterUrl = $state('');
  let trailerUrl = $state('');
  let backdropUrl = $state('');
  let fileInput: HTMLInputElement | null = null;

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

  async function deleteMovie(id: string) {
    if (!confirm('Delete this movie?')) return;
    try {
      await movieApi.remove(id);
      movies = movies.filter((m) => m.id !== id);
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
  <div class="min-h-screen pb-8" in:fade={{ duration: 300 }}>
    <!-- ─── Hero Banner ─────────────────────────────────────────── -->
    {#if featuredMovie}
      <div class="relative w-full h-[40vh] md:h-[50vh] overflow-hidden">
        <div
          class="absolute inset-0 bg-cover bg-center transition-transform duration-700"
          style="background-image: url({featuredMovie.posterPath || featuredMovie.backdropPath || ''});"
        ></div>
        <div class="absolute inset-0 bg-gradient-to-t from-rina-bg via-rina-bg/60 to-transparent"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-rina-bg/80 via-transparent to-transparent"></div>

        <div class="absolute bottom-0 left-0 right-0 p-4 md:p-8">
          <div class="max-w-7xl mx-auto">
            <span class="text-[10px] md:text-xs font-bold uppercase tracking-widest text-rina-rose mb-2 block">Featured</span>
            <h1 class="text-2xl md:text-5xl font-black text-white mb-2 md:mb-3 leading-tight drop-shadow-lg">
              {featuredMovie.title}
            </h1>
            <div class="flex items-center gap-2 md:gap-3">
              {#if featuredMovie.trailerUrl}
                <a
                  href={featuredMovie.trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="px-3 md:px-5 py-1.5 md:py-2.5 rounded-lg bg-white text-rina-bg text-xs md:text-sm font-bold hover:bg-white/90 transition-colors flex items-center gap-1.5"
                >
                  <span>▶</span> Trailer
                </a>
              {/if}
              <button
                onclick={() => downloadMovie(featuredMovie.id)}
                class="px-3 md:px-5 py-1.5 md:py-2.5 rounded-lg bg-white/10 text-white text-xs md:text-sm font-bold hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/10 flex items-center gap-1.5"
              >
                <span>⬇</span> Download
              </button>
              <button
                onclick={() => watchMovie(featuredMovie.id)}
                class="px-3 md:px-5 py-1.5 md:py-2.5 rounded-lg bg-rina-rose text-white text-xs md:text-sm font-bold hover:bg-rina-rose/90 transition-colors flex items-center gap-1.5 shadow-[0_0_20px_rgba(251,113,133,0.3)]"
              >
                <span>▶</span> Watch
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
          <h2 class="text-xl md:text-2xl font-bold text-white">Movies</h2>
          <p class="text-xs text-white/40 mt-0.5">{movies.length} title{movies.length === 1 ? '' : 's'} in library</p>
        </div>

        <div class="flex items-center gap-3">
          <div class="relative flex-1 md:w-64">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search movies..."
              class="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-rina-rose/50 focus:bg-white/[0.07] transition-all"
            />
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">🔍</span>
          </div>
          {#if currentUser()?.username === 'maroon'}
            <button
              onclick={() => showUpload = !showUpload}
              class="px-4 py-2 rounded-xl bg-rina-rose/15 text-rina-rose text-sm font-bold hover:bg-rina-rose/25 transition-colors border border-rina-rose/20 shrink-0"
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
        <div class="glass rounded-2xl p-5 md:p-6 space-y-4 max-w-2xl">
          <h3 class="text-lg font-bold text-white">Upload Movie</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              bind:value={title}
              placeholder="Movie title *"
              class="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-rina-rose/50 transition-all"
            />
            <input
              bind:value={posterUrl}
              placeholder="Poster image URL"
              class="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-rina-rose/50 transition-all"
            />
            <input
              bind:value={backdropUrl}
              placeholder="Backdrop image URL"
              class="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-rina-rose/50 transition-all"
            />
            <input
              bind:value={trailerUrl}
              placeholder="Trailer URL (YouTube)"
              class="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-rina-rose/50 transition-all"
            />
          </div>
          <div class="flex items-center gap-3">
            <input
              bind:this={fileInput}
              type="file"
              accept="video/*"
              class="flex-1 text-sm text-white/60 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-rina-rose/15 file:text-rina-rose file:font-bold file:text-sm"
            />
            <button
              onclick={uploadMovie}
              disabled={uploadLoading || !title}
              class="px-6 py-2.5 rounded-xl bg-rina-rose text-white font-bold text-sm hover:bg-rina-rose/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_16px_rgba(251,113,133,0.2)]"
            >
              {uploadLoading ? 'Uploading...' : 'Upload'}
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
            <div class="aspect-[2/3] rounded-xl bg-white/5 animate-pulse"></div>
          {/each}
        </div>
      {:else if filteredMovies.length === 0}
        <div class="text-center py-20">
          <div class="text-4xl mb-3">🎬</div>
          <p class="text-white/50 text-sm">{searchQuery ? 'No movies match your search.' : 'No movies yet.'}</p>
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {#each filteredMovies as movie, i (movie.id)}
            <div
              class="group relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
              class:scale-105={hoveredMovie === movie.id}
              class:z-10={hoveredMovie === movie.id}
              onmouseenter={() => hoveredMovie = movie.id}
              onmouseleave={() => hoveredMovie = null}
              style="transition-delay: {i % 5 * 30}ms"
              in:scale={{ duration: 300, delay: i * 50, start: 0.9 }}
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
                <div class="w-full h-full bg-white/5 flex items-center justify-center text-5xl">🎬</div>
              {/if}

              <!-- Gradient Overlay -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300"></div>

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
                      class="flex-1 py-2 rounded-lg bg-white/10 backdrop-blur-md text-white text-[10px] font-bold text-center hover:bg-white/20 transition-colors border border-white/10"
                    >
                      Trailer
                    </a>
                  {/if}
                  <button
                    onclick={() => downloadMovie(movie.id)}
                    class="flex-1 py-2 rounded-lg bg-emerald-500/20 backdrop-blur-md text-emerald-300 text-[10px] font-bold hover:bg-emerald-500/30 transition-colors border border-emerald-500/20"
                  >
                    Download
                  </button>
                  <button
                    onclick={() => watchMovie(movie.id)}
                    class="flex-1 py-2 rounded-lg bg-rina-rose/20 backdrop-blur-md text-rina-rose text-[10px] font-bold hover:bg-rina-rose/30 transition-colors border border-rina-rose/20"
                  >
                    Watch
                  </button>
                </div>
                {#if currentUser()?.username === 'maroon'}
                  <button
                    onclick={() => deleteMovie(movie.id)}
                    class="w-full py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-bold hover:bg-red-500/20 transition-colors"
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

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
