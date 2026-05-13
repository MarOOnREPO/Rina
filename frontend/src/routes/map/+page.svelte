<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '$lib/stores/auth';
  import { fade } from 'svelte/transition';
  import GlassCard from '$lib/components/GlassCard.svelte';

  // Mapbox token would come from env in production
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

  let mapContainer: HTMLDivElement;
  let loading = true;

  // Mock data for demo (Kenitra & Perm)
  const demoPhotos = [
    { lat: 34.26, lng: -6.58, caption: 'Kenitra Streets', url: '', year: 2024 },
    { lat: 58.01, lng: 56.25, caption: 'Perm Winter', url: '', year: 2024 },
    { lat: 48.8566, lng: 2.3522, caption: 'Paris Together', url: '', year: 2023 },
  ];

  onMount(() => {
    if (!$isAuthenticated) {
      goto('/login');
      return;
    }

    // If no Mapbox token, show a placeholder globe visualization
    if (!MAPBOX_TOKEN) {
      loading = false;
      return;
    }

    // Dynamic import mapbox-gl
    import('mapbox-gl').then((mapboxgl) => {
      const map = new mapboxgl.default.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [20, 40],
        zoom: 1.5,
        projection: 'globe'
      });

      map.on('style.load', () => {
        map.setFog({
          color: 'rgb(15, 15, 26)',
          'high-color': 'rgb(22, 22, 42)',
          'horizon-blend': 0.4,
          'space-color': 'rgb(15, 15, 26)',
          'star-intensity': 0.6
        });
      });

      demoPhotos.forEach((photo) => {
        const el = document.createElement('div');
        el.className = 'w-4 h-4 rounded-full bg-rina-rose shadow-[0_0_10px_rgba(251,113,133,0.6)] cursor-pointer hover:scale-125 transition-transform';
        new mapboxgl.default.Marker(el)
          .setLngLat([photo.lng, photo.lat])
          .setPopup(
            new mapboxgl.default.Popup({ offset: 8 }).setHTML(
              `<div style="color:#0f0f1a;font-family:sans-serif;">
                <p style="font-weight:600;margin:0">${photo.caption}</p>
                <p style="font-size:12px;color:#666;margin:4px 0 0">${photo.year}</p>
              </div>`
            )
          )
          .addTo(map);
      });

      loading = false;
    }).catch(() => {
      loading = false;
    });
  });
</script>

<svelte:head>
  {#if MAPBOX_TOKEN}
    <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
  {/if}
</svelte:head>

{#if $isAuthenticated}
  <div class="fixed inset-0 pt-14 pb-16 md:pb-0 flex flex-col" in:fade>
    <div class="relative flex-1">
      {#if MAPBOX_TOKEN}
        <div bind:this={mapContainer} class="absolute inset-0"></div>
      {:else}
        <!-- Fallback 3D globe visualization -->
        <div class="absolute inset-0 flex items-center justify-center bg-rina-bg">
          <div class="relative w-64 h-64 md:w-96 md:h-96">
            <!-- Globe rings -->
            <div class="absolute inset-0 rounded-full border border-rina-border opacity-30"></div>
            <div class="absolute inset-4 rounded-full border border-rina-border opacity-20"></div>
            <div class="absolute inset-8 rounded-full border border-rina-border opacity-10"></div>

            <!-- Pins -->
            {#each demoPhotos as photo, i}
              <div
                class="absolute w-3 h-3 rounded-full bg-rina-rose shadow-[0_0_12px_rgba(251,113,133,0.5)]"
                style="top: {30 + i * 25}%; left: {20 + i * 30}%;"
              >
                <div class="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-rina-slate bg-rina-bg/80 px-2 py-0.5 rounded">
                  {photo.caption}
                </div>
              </div>
            {/each}

            <div class="absolute inset-0 flex items-center justify-center">
              <p class="text-rina-slate-dark text-sm">🌍 Mapbox Globe</p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Overlay UI -->
      <div class="absolute top-4 left-4 z-10">
        <GlassCard padding="sm" className="max-w-xs">
          <h3 class="text-sm font-semibold mb-1">🌍 Scrapbook Map</h3>
          <p class="text-xs text-rina-slate">Photos pinned by EXIF location data.</p>
          {#if !MAPBOX_TOKEN}
            <p class="text-xs text-rina-rose mt-2">Set VITE_MAPBOX_TOKEN for 3D globe.</p>
          {/if}
        </GlassCard>
      </div>
    </div>
  </div>
{/if}
