<script lang="ts">
  import { page } from '$app/stores';
  import { isAuthenticated } from '$lib/stores/auth.svelte';
  import PresenceOrb from './PresenceOrb.svelte';

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/chat', label: 'Chat', icon: '💬' },
    { path: '/calendar', label: 'Calendar', icon: '📅' },
    { path: '/movies', label: 'Movies', icon: '🎬' },
    { path: '/listen', label: 'Music', icon: '🎵' },
    { path: '/roulette', label: 'Food', icon: '🍽️' },
  ];

  $: currentPath = $page.url.pathname;
</script>

{#if isAuthenticated()}
  <!-- Desktop Header -->
  <header class="fixed top-0 left-0 right-0 z-50 glass border-b border-rina-border">
    <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <span class="text-xl font-bold text-gradient">Rina</span>
      </a>

      <nav class="hidden md:flex items-center gap-1">
        {#each navItems as item}
          <a
            href={item.path}
            class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
              {currentPath === item.path
                ? 'bg-rina-rose/10 text-rina-rose'
                : 'text-rina-slate hover:text-white hover:bg-white/5'}"
          >
            <span class="mr-1.5">{item.icon}</span>
            {item.label}
          </a>
        {/each}
      </nav>

      <div class="flex items-center gap-3">
        <PresenceOrb />
      </div>
    </div>
  </header>

  <!-- Mobile Bottom Tab Bar -->
  <nav class="fixed bottom-0 left-0 right-0 z-50 glass border-t border-rina-border md:hidden pb-safe">
    <div class="flex items-center justify-around h-16">
      {#each navItems as item}
        <a
          href={item.path}
          class="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all duration-200
            {currentPath === item.path
              ? 'text-rina-rose'
              : 'text-rina-slate-dark'}"
        >
          <span class="text-xl">{item.icon}</span>
          <span class="text-[10px] font-medium">{item.label}</span>
        </a>
      {/each}
    </div>
  </nav>
{/if}

<style>
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
</style>
