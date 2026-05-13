<script lang="ts">
  import { partnerPresence } from '$lib/stores/socket';
  import { currentUser } from '$lib/stores/auth';

  // Orb breathes based on partner status
  $: status = $partnerPresence?.status ?? 'offline';
  $: color = status === 'online' ? '#22c55e' : status === 'typing' ? '#f59e0b' : status === 'away' ? '#94a3b8' : '#475569';
  $: glowClass = status === 'typing' ? 'animate-pulse' : status === 'online' ? 'animate-pulse-slow' : '';
</script>

<div class="relative flex items-center gap-2">
  <span class="text-xs font-medium text-rina-slate hidden sm:inline">
    {#if $currentUser}
      {$currentUser.username === 'maroon' ? 'Rina' : 'MarOOn'}
    {:else}
      Partner
    {/if}
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
