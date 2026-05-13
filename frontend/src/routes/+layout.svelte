<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { auth } from '$lib/stores/auth';
  import { initializeSockets, socketStore } from '$lib/stores/socket';
  import GlassNav from '$lib/components/GlassNav.svelte';
  import PingOverlay from '$lib/components/PingOverlay.svelte';
  import TranslationTooltip from '$lib/components/TranslationTooltip.svelte';

  // Initialize auth and sockets on client
  onMount(() => {
    if (browser) {
      auth.init().then(() => {
        if (auth) {
          initializeSockets();
        }
      });
    }

    return () => {
      socketStore.disconnect();
    };
  });
</script>

<svelte:head>
  <meta name="theme-color" content="#0f0f1a" />
</svelte:head>

<GlassNav />

<main class="min-h-screen pt-14 md:pb-0 pb-20">
  <slot />
</main>

<PingOverlay />
<TranslationTooltip />
