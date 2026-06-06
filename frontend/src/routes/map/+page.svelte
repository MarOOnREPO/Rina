<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade } from 'svelte/transition';
  import { scrapbookApi, type ScrapbookPhoto } from '$lib/utils/api';
  import { getConfig, loadConfig } from '$lib/stores/config.svelte';
  import GlassCard from '$lib/components/GlassCard.svelte';
  import 'mapbox-gl/dist/mapbox-gl.css';
import type { Map } from 'mapbox-gl';

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let mapContainer: HTMLDivElement | undefined = $state();
  let mapInstance: Map | null = $state(null);
  let mapboxModule: typeof import('mapbox-gl').default | null = null;
  let mapError = $state('');
  let loading = $state(true);
  let photos: ScrapbookPhoto[] = $state([]);
  let markerInstances: Array<import('mapbox-gl').Marker> = [];

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

  function addMarkers(map: Map, markerData: Array<{ lat?: number; lng?: number; caption?: string; url?: string; takenAt?: string; year?: number }>) {
    if (!mapboxModule) return;
    // Clear existing markers
    markerInstances.forEach((m) => m.remove());
    markerInstances = [];

    const validMarkers = markerData.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
    if (validMarkers.length === 0) return;

    validMarkers.forEach((photo) => {
      const el = document.createElement('div');
      el.className = 'w-4 h-4 rounded-full bg-rina-rose shadow-[0_0_10px_rgba(251,113,133,0.6)] cursor-pointer hover:scale-125 transition-transform';

      const popupHtml = photo.url
        ? `<div style="color:#0f0f1a;font-family:sans-serif;max-width:200px;">
            <img src="${escapeHtml(photo.url)}" style="width:100%;border-radius:6px;margin-bottom:4px;" />
            <p style="font-weight:600;margin:0;font-size:13px;">${escapeHtml(photo.caption || 'Untitled')}</p>
            <p style="font-size:11px;color:#666;margin:2px 0 0;">${photo.takenAt ? escapeHtml(new Date(photo.takenAt).toLocaleDateString('en-GB')) : ''}</p>
          </div>`
        : `<div style="color:#0f0f1a;font-family:sans-serif;">
            <p style="font-weight:600;margin:0">${escapeHtml(photo.caption || 'Untitled')}</p>
            <p style="font-size:12px;color:#666;margin:4px 0 0">${photo.year !== undefined ? escapeHtml(String(photo.year)) : ''}</p>
          </div>`;

      const marker = new mapboxModule!.Marker(el)
        .setLngLat([photo.lng!, photo.lat!])
        .setPopup(new mapboxModule!.Popup({ offset: 8 }).setHTML(popupHtml))
        .addTo(map);

      markerInstances.push(marker);
    });
  }

  onMount(() => {
    loadPhotos();
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      await loadConfig();

      const MAPBOX_TOKEN = getConfig()?.mapboxToken || '';

      if (!MAPBOX_TOKEN) {
        mapError = 'Mapbox token not configured. Set VITE_MAPBOX_TOKEN in frontend/.env.local';
        return;
      }

      // Defer map init to next tick so DOM container is guaranteed mounted
      requestAnimationFrame(() => {
        import('mapbox-gl').then((mapboxgl) => {
          mapboxModule = mapboxgl.default;
          mapboxgl.default.accessToken = MAPBOX_TOKEN;

          const map = new mapboxgl.default.Map({
            container: mapContainer!,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [20, 40],
            zoom: 1.5,
            projection: 'globe'
          });

          mapInstance = map;

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
            // Initial markers (will use demo if photos not loaded yet)
            const initial = photos.length > 0 ? photos.filter((p) => p.lat != null && p.lng != null) : demoPhotos;
            addMarkers(map, initial);
          });

          // Handle resize
          resizeObserver = new ResizeObserver(() => {
            map.resize();
          });
          if (mapContainer) resizeObserver.observe(mapContainer);
        }).catch((err) => {
          mapError = 'Failed to load Mapbox. Check console for details.';
          console.error('[Map]', err);
        });
      });
    })();

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
    };
  });

  // Reactive: update markers when photos change after initial load
  $effect(() => {
    if (mapInstance && mapboxModule && photos.length > 0) {
      // Clear existing markers by reloading the map style layer
      // For simplicity, we reload markers. In production, track marker refs.
      const valid = photos.filter((p) => p.lat != null && p.lng != null);
      if (valid.length > 0) {
        addMarkers(mapInstance, valid);
      }
    }
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

{#if isAuthenticated()}
  <div class="fixed inset-0 pt-[7.5rem] pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pt-14 md:pb-0 flex flex-col" in:fade>
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
      <div class="absolute top-4 left-4 z-10 pointer-events-none">
        <GlassCard padding="sm" class="max-w-xs pointer-events-auto">
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
