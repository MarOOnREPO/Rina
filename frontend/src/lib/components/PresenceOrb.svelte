<script lang="ts">
  import { socketStore } from '$lib/stores/socket.svelte';
  import { partnerName, currentUser } from '$lib/stores/auth.svelte';

  let partnerUsername = $derived(currentUser()?.username === 'maroon' ? 'rina' : 'maroon');
  let presence = $derived(socketStore.presence[partnerUsername]);
  let status = $derived(presence?.status ?? 'offline');
  let color = $derived(status === 'online' ? '#22c55e' : status === 'typing' ? '#f59e0b' : status === 'away' ? '#94a3b8' : '#475569');
  let glowClass = $derived(status === 'typing' ? 'animate-pulse' : status === 'online' ? 'animate-pulse-slow' : '');
</script>

<div class="relative flex items-center gap-2">
  <span class="text-xs font-medium text-rina-slate hidden sm:inline">
    {partnerName() || 'Partner'}
  </span>
  <div class="relative">
    <div
      class="w-3 h-3 rounded-full transition-colors duration-500 {glowClass}"
      style="background-color: {color}; box-shadow: 0 0 8px {color}, 0 0 16px {color}40;"
    ></div>
    {#if status === 'typing'}
      <div
        class="absolute inset-0 rounded-full animate-ping opacity-75"
        style="background-color: {color};"
      ></div>
    {/if}
  </div>
</div>
