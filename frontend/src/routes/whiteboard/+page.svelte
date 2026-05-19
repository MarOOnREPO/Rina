<script lang="ts">
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade } from 'svelte/transition';
  import ExcalidrawWrapper from '$lib/components/excalidraw/ExcalidrawWrapper.svelte';

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

{#if isAuthenticated()}
  <div class="fixed inset-0 pt-14 pb-16 md:pb-0 flex flex-col" in:fade>
    <div class="flex-1 relative">
      <ExcalidrawWrapper />
    </div>
  </div>
{/if}
