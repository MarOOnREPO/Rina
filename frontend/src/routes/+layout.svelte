<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { auth } from '$lib/stores/auth.svelte';
  import { initializeSockets, socketStore } from '$lib/stores/socket.svelte';
  import { loadConfig } from '$lib/stores/config.svelte';
  import GlassNav from '$lib/components/GlassNav.svelte';
  import MobileHeader from '$lib/components/MobileHeader.svelte';
  import PingOverlay from '$lib/components/PingOverlay.svelte';

  let { children } = $props();

  $effect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        const vh = window.visualViewport?.height || window.innerHeight;
        const doc = document.documentElement;
        doc.style.setProperty('--vvh', `${vh}px`);
      };
      window.visualViewport?.addEventListener('resize', handleResize);
      handleResize();
      return () => window.visualViewport?.removeEventListener('resize', handleResize);
    }
  });

  // Initialize auth, sockets, and config on client
  onMount(() => {
    if (browser) {
      auth.init();
      initializeSockets();
      loadConfig();
    }

    return () => {
      socketStore.disconnect();
    };
  });
</script>

<svelte:head>
  <meta name="theme-color" content="#BE185D" />
</svelte:head>

<!-- Strict mobile viewport wrapper -->
<div class="mobile-viewport shadow-soft-xl md:shadow-none" id="app-root">
  <MobileHeader />
  <GlassNav />

  <main class="min-h-screen pt-16 md:pt-16 md:pb-0 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
    {@render children()}
  </main>

  <PingOverlay />
</div>
