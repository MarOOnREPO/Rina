<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade } from 'svelte/transition';
  import { scrapbookApi, type ScrapbookPhoto } from '$lib/utils/api';
  import { getConfig, loadConfig } from '$lib/stores/config.svelte';
  import { socketStore } from '$lib/stores/socket.svelte';
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

  // Live location state
  let shareLiveLocation = $state(false);
  let userPosition = $state<{ lat: number; lng: number; accuracy: number } | null>(null);
  let partnerPosition = $state<{ lat: number; lng: number } | null>(null);
  let watchId: number | null = null;
  let userMarker: import('mapbox-gl').Marker | null = null;
  let partnerMarker: import('mapbox-gl').Marker | null = null;
  let accuracyCircleMarker: import('mapbox-gl').Marker | null = null;

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

  function createUserMarkerElement() {
    const el = document.createElement('div');
    el.className = 'relative w-4 h-4';
    el.innerHTML = `
      <div class="absolute inset-0 rounded-full bg-rina-rose border-2 border-white shadow-lg z-10"></div>
      <div class="absolute inset-[-8px] rounded-full bg-rina-rose/30 animate-ping"></div>
      <div class="absolute inset-[-4px] rounded-full bg-rina-rose/20 animate-pulse"></div>
    `;
    return el;
  }

  function createPartnerMarkerElement() {
    const el = document.createElement('div');
    el.className = 'relative w-4 h-4';
    el.innerHTML = `
      <div class="absolute inset-0 rounded-full bg-sky-400 border-2 border-white shadow-lg z-10"></div>
      <div class="absolute inset-[-8px] rounded-full bg-sky-400/30 animate-ping"></div>
      <div class="absolute inset-[-4px] rounded-full bg-sky-400/20 animate-pulse"></div>
    `;
    return el;
  }

  function updateAccuracyCircle(lat: number, lng: number, accuracy: number) {
    if (!mapInstance || !mapboxModule) return;
    if (accuracyCircleMarker) {
      accuracyCircleMarker.remove();
    }
    const el = document.createElement('div');
    el.className = 'rounded-full bg-rina-rose/10 border border-rina-rose/20 pointer-events-none';
    const metersPerPixel = 40075016.686 * Math.abs(Math.cos(lat * Math.PI / 180)) / Math.pow(2, mapInstance.getZoom() + 8);
    const sizePx = Math.max(accuracy / metersPerPixel, 20);
    el.style.width = `${sizePx}px`;
    el.style.height = `${sizePx}px`;
    accuracyCircleMarker = new mapboxModule.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(mapInstance);
  }

  function updateUserMarker(lat: number, lng: number, accuracy: number) {
    if (!mapInstance || !mapboxModule) return;
    if (userMarker) {
      userMarker.setLngLat([lng, lat]);
    } else {
      const el = createUserMarkerElement();
      userMarker = new mapboxModule.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(mapInstance);
    }
    updateAccuracyCircle(lat, lng, accuracy);
  }

  function updatePartnerMarker(lat: number, lng: number) {
    if (!mapInstance || !mapboxModule) return;
    if (partnerMarker) {
      partnerMarker.setLngLat([lng, lat]);
    } else {
      const el = createPartnerMarkerElement();
      partnerMarker = new mapboxModule.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(mapInstance);
    }
  }

  function handleLocationUpdate(data: { lat: number; lng: number }) {
    partnerPosition = { lat: data.lat, lng: data.lng };
    updatePartnerMarker(data.lat, data.lng);
  }

  function toggleLiveLocation() {
    shareLiveLocation = !shareLiveLocation;
    if (shareLiveLocation) {
      if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            userPosition = { lat: latitude, lng: longitude, accuracy };
            updateUserMarker(latitude, longitude, accuracy);
            socketStore.emit('location:share', { lat: latitude, lng: longitude, accuracy });
          },
          (err) => {
            console.error('[Map] Geolocation error:', err);
            shareLiveLocation = false;
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
      }
    } else {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    }
  }

  onMount(() => {
    loadPhotos();
    let resizeObserver: ResizeObserver | null = null;

    socketStore.on('location:update', handleLocationUpdate);

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

          map.on('zoom', () => {
            if (userPosition) {
              updateAccuracyCircle(userPosition.lat, userPosition.lng, userPosition.accuracy);
            }
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

  onDestroy(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }
    socketStore.off('location:update', handleLocationUpdate);
    if (userMarker) userMarker.remove();
    if (partnerMarker) partnerMarker.remove();
    if (accuracyCircleMarker) accuracyCircleMarker.remove();
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
      <div class="absolute top-4 left-4 z-10 pointer-events-none space-y-3">
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

        <GlassCard padding="sm" class="max-w-xs pointer-events-auto">
          <button
            onclick={toggleLiveLocation}
            class="flex items-center gap-2 w-full text-left group"
          >
            <div class="w-8 h-8 rounded-full {shareLiveLocation ? 'bg-rina-rose' : 'glass'} flex items-center justify-center transition-colors">
              <svg class="w-4 h-4 {shareLiveLocation ? 'text-white' : 'text-rina-slate'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <div>
              <p class="text-xs font-semibold {shareLiveLocation ? 'text-rina-rose' : 'text-white'}">
                {shareLiveLocation ? 'Sharing live location' : 'Share my live location'}
              </p>
              <p class="text-[10px] text-rina-slate">
                {shareLiveLocation ? 'Your partner can see you on the map' : 'Tap to let your partner see you'}
              </p>
            </div>
          </button>
        </GlassCard>
      </div>
    </div>
  </div>
{/if}
