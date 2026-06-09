<script lang="ts">
  import { socketStore } from '$lib/stores/socket.svelte';
  import { partnerName, currentUser } from '$lib/stores/auth.svelte';

  let partnerUsername = $derived(currentUser()?.partner?.username || (currentUser()?.username === 'maroon' ? 'rina' : 'maroon'));
  let presence = $derived(socketStore.presence[partnerUsername]);
  let status = $derived(presence?.status ?? 'offline');

  const statusConfig = $derived(() => {
    switch (status) {
      case 'online':
        return { color: '#059669', bg: 'bg-rina-success', label: 'Online' };
      case 'typing':
        return { color: '#D97706', bg: 'bg-rina-warning', label: 'Typing...' };
      case 'away':
        return { color: '#64748B', bg: 'bg-rina-text-muted', label: 'Away' };
      default:
        return { color: '#94A3B8', bg: 'bg-rina-border-strong', label: 'Offline' };
    }
  });

  let config = $derived(statusConfig());
  let isOnline = $derived(status === 'online');
  let isTyping = $derived(status === 'typing');
</script>

<div class="relative flex items-center gap-2">
  <span class="text-xs font-medium text-rina-text-secondary hidden sm:inline">
    {partnerName() || 'Partner'}
  </span>
  <div class="relative" title={config.label}>
    <!-- Soft glow background -->
    {#if isOnline || isTyping}
      <div
        class="absolute inset-0 rounded-full animate-pulse-slow"
        style="background-color: {config.color}; opacity: 0.25; transform: scale(1.6);"
      ></div>
    {/if}

    <!-- Core orb -->
    <div
      class="w-3 h-3 rounded-full transition-all duration-500 relative z-10"
      style="background-color: {config.color};"
    ></div>

    <!-- Typing ping ring -->
    {#if isTyping}
      <div
        class="absolute inset-0 rounded-full animate-ping opacity-40"
        style="background-color: {config.color};"
      ></div>
    {/if}
  </div>
</div>
