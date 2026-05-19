<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { auth } from '$lib/stores/auth.svelte';
  import { initializeSockets, socketStore } from '$lib/stores/socket.svelte';
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

  // Initialize auth and sockets on client
  onMount(() => {
    if (browser) {
      auth.init();
      initializeSockets();
    }

    return () => {
      socketStore.disconnect();
    };
  });
</script>

<svelte:head>
  <meta name="theme-color" content="#0f0f1a" />
</svelte:head>

<!-- Strict mobile viewport wrapper -->
<div class="mobile-viewport shadow-2xl" id="app-root">
  <MobileHeader />
  <GlassNav />

  <main class="min-h-screen pt-[7.5rem] md:pt-14 md:pb-0 pb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
    {@render children()}
  </main>

  <PingOverlay />
</div>
