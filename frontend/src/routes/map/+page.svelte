<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade } from 'svelte/transition';
  import { scrapbookApi, type ScrapbookPhoto } from '$lib/utils/api';
  import GlassCard from '$lib/components/GlassCard.svelte';
  import 'mapbox-gl/dist/mapbox-gl.css';

  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

  let mapContainer: HTMLDivElement | undefined = $state();
  let mapError = $state('');
  let loading = $state(true);
  let photos: ScrapbookPhoto[] = $state([]);

  // Fallback demo data if no real photos exist
  const demoPhotos = [
    { lat: 34.26, lng: -6.58, caption: 'Kenitra Streets', url: '', year: 2024 },
    { lat: 58.01, lng: 56.25, caption: 'Perm Winter', url: '', year: 2024 },
    { lat: 48.8566, lng: 2.3522, caption: 'Paris Together', url: '', year: 2023 },
  ];

  async function loadPhotos() {
    try {
      photos = await scrapbookApi.list();
    } catch (err) {
      console.error('[Map] Failed to load photos:', err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadPhotos();

    if (!MAPBOX_TOKEN) {
      mapError = 'Mapbox token not configured. Set VITE_MAPBOX_TOKEN in frontend/.env.local';
      return;
    }

    import('mapbox-gl').then((mapboxgl) => {
      mapboxgl.default.accessToken = MAPBOX_TOKEN;

      const map = new mapboxgl.default.Map({
        container: mapContainer!,
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

      map.on('load', () => {
        const markers = photos.length > 0 ? photos.filter((p) => p.lat != null && p.lng != null) : demoPhotos;

        markers.forEach((photo) => {
          const el = document.createElement('div');
          el.className = 'w-4 h-4 rounded-full bg-rina-rose shadow-[0_0_10px_rgba(251,113,133,0.6)] cursor-pointer hover:scale-125 transition-transform';

          const popupHtml = photo.url
            ? `<div style="color:#0f0f1a;font-family:sans-serif;max-width:200px;">
                <img src="${photo.url}" style="width:100%;border-radius:6px;margin-bottom:4px;" />
                <p style="font-weight:600;margin:0;font-size:13px;">${photo.caption || 'Untitled'}</p>
                <p style="font-size:11px;color:#666;margin:2px 0 0;">${photo.takenAt ? new Date(photo.takenAt).toLocaleDateString('en-GB') : ''}</p>
              </div>`
            : `<div style="color:#0f0f1a;font-family:sans-serif;">
                <p style="font-weight:600;margin:0">${photo.caption || 'Untitled'}</p>
                <p style="font-size:12px;color:#666;margin:4px 0 0">${(photo as any).year || ''}</p>
              </div>`;

          new mapboxgl.default.Marker(el)
            .setLngLat([photo.lng!, photo.lat!])
            .setPopup(new mapboxgl.default.Popup({ offset: 8 }).setHTML(popupHtml))
            .addTo(map);
        });
      });
    }).catch((err) => {
      mapError = 'Failed to load Mapbox. Check console for details.';
      console.error('[Map]', err);
    });
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

{#if isAuthenticated()}
  <div class="fixed inset-0 pt-14 pb-16 md:pb-0 flex flex-col" in:fade>
    <div class="relative flex-1">
      {#if mapError}
        <!-- Fallback 3D globe visualization -->
        <div class="absolute inset-0 flex items-center justify-center bg-rina-bg">
          <div class="relative w-64 h-64 md:w-96 md:h-96">
            <div class="absolute inset-0 rounded-full border border-rina-border opacity-30"></div>
            <div class="absolute inset-4 rounded-full border border-rina-border opacity-20"></div>
            <div class="absolute inset-8 rounded-full border border-rina-border opacity-10"></div>

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
              <p class="text-rina-slate-dark text-sm">🌍 {mapError}</p>
            </div>
          </div>
        </div>
      {:else}
        <div bind:this={mapContainer} class="absolute inset-0"></div>
      {/if}

      <!-- Overlay UI -->
      <div class="absolute top-4 left-4 z-10">
        <GlassCard padding="sm" class="max-w-xs">
          <h3 class="text-sm font-semibold mb-1">🌍 Scrapbook Map</h3>
          <p class="text-xs text-rina-slate">
            {#if loading}
              Loading photos...
            {:else if photos.filter(p => p.lat != null).length > 0}
              {photos.filter(p => p.lat != null).length} photo{photos.filter(p => p.lat != null).length > 1 ? 's' : ''} pinned.
            {:else}
              Photos pinned by EXIF location data.
            {/if}
          </p>
        </GlassCard>
      </div>
    </div>
  </div>
{/if}
