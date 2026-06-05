<script lang="ts">
  import { isFeatureEnabled, isConfigLoading, loadConfig } from '$lib/stores/config.svelte';
  import { onMount } from 'svelte';

  let { feature, children } = $props<{
    feature: 'spotify' | 'push' | 'uploads' | 'cinema' | 'tmdb' | 'backup';
    children: () => any;
  }>();

  onMount(() => {
    loadConfig();
  });

  let enabled = $derived(isFeatureEnabled(feature));
  let loading = $derived(isConfigLoading());
</script>

{#if loading}
  <div class="text-sm text-rina-slate">Loading...</div>
{:else if enabled}
  {@render children()}
{:else}
  <div class="glass rounded-2xl p-6 text-center space-y-3">
    <div class="text-2xl">🔒</div>
    <h3 class="text-white font-semibold">Feature Not Configured</h3>
    <p class="text-sm text-rina-slate">This feature requires API keys. Add them in your server settings.</p>
  </div>
{/if}
