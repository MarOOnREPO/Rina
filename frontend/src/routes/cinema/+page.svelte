<script lang="ts">
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import CinemaLobby from '$lib/components/CinemaLobby.svelte';

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

{#if isAuthenticated()}
  <div class="px-3 py-4 space-y-4">
    <h1 class="text-xl font-bold text-white px-1">Cinema</h1>
    <CinemaLobby />
  </div>
{/if}
