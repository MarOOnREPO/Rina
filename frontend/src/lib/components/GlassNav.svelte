<script lang="ts">
  import { page } from '$app/stores';
  import { isAuthenticated, currentUser } from '$lib/stores/auth.svelte';
  import PresenceOrb from './PresenceOrb.svelte';
  import { fade, scale } from 'svelte/transition';
  import { browser } from '$app/environment';

  const mainNavItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/chat', label: 'Chat', icon: '💬' },
    { path: '/calendar', label: 'Calendar', icon: '📅' },
  ];

  const featureItems = [
    { path: '/jam', label: 'Watch', icon: '📺' },
    { path: '/movies', label: 'Movies', icon: '🎬' },
    { path: '/video', label: 'Video', icon: '📹' },
  ];

  const adminNavItem = { path: '/settings', label: 'Settings', icon: '⚙️' };

  let currentPath = $derived($page.url.pathname);
  let showFeatures = $state(false);
  let featuresButtonRef = $state<HTMLButtonElement | null>(null);

  function closeFeatures() {
    showFeatures = false;
  }

  function handleFeatureClick(path: string) {
    showFeatures = false;
    if (browser) {
      window.location.href = path;
    }
  }

  // Close features sheet on route change
  $effect(() => {
    if (currentPath) {
      showFeatures = false;
    }
  });

  // Close on Escape
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showFeatures = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isAuthenticated()}
  <!-- Desktop Header -->
  <header class="fixed top-0 left-0 right-0 z-50 glass border-b border-rina-border hidden md:block">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <span class="text-xl font-bold text-gradient">Rina</span>
      </a>

      <nav class="flex items-center gap-1">
        {#each mainNavItems as item}
          <a
            href={item.path}
            class="relative px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 touch-target flex items-center gap-2
              {currentPath === item.path
                ? 'bg-rina-rose/15 text-rina-rose shadow-[0_0_16px_rgba(244,114,182,0.25)]'
                : 'text-white/70 hover:text-white hover:bg-white/5'}"
          >
            <span class="text-base">{item.icon}</span>
            <span>{item.label}</span>
            {#if currentPath === item.path}
              <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-gradient-to-r from-rina-rose to-rina-indigo"></span>
            {/if}
          </a>
        {/each}
        {#if currentUser()?.username === 'maroon'}
          <a
            href={adminNavItem.path}
            class="relative px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 touch-target flex items-center gap-2
              {currentPath === adminNavItem.path
                ? 'bg-rina-rose/15 text-rina-rose shadow-[0_0_16px_rgba(244,114,182,0.25)]'
                : 'text-white/70 hover:text-white hover:bg-white/5'}"
          >
            <span class="text-base">{adminNavItem.icon}</span>
            <span>{adminNavItem.label}</span>
            {#if currentPath === adminNavItem.path}
              <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-gradient-to-r from-rina-rose to-rina-indigo"></span>
            {/if}
          </a>
        {/if}
        <div class="relative">
          <button
            bind:this={featuresButtonRef}
            onclick={() => showFeatures = !showFeatures}
            class="relative px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 touch-target flex items-center gap-2
              {showFeatures
                ? 'bg-rina-rose/15 text-rina-rose shadow-[0_0_16px_rgba(244,114,182,0.25)]'
                : 'text-white/70 hover:text-white hover:bg-white/5'}"
          >
            <span class="text-base">✨</span>
            <span>Features</span>
            {#if showFeatures}
              <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-gradient-to-r from-rina-rose to-rina-indigo"></span>
            {/if}
          </button>

          {#if showFeatures}
            <div
              class="absolute top-full right-0 mt-3 w-60 glass-strong rounded-2xl p-3 border border-rina-border shadow-2xl"
              transition:scale={{ duration: 150, start: 0.95 }}
            >
              <div class="grid grid-cols-2 gap-2">
                {#each featureItems as item}
                  <a
                    href={item.path}
                    class="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 touch-target
                      {currentPath === item.path
                        ? 'bg-rina-rose/15 text-rina-rose shadow-[0_0_10px_rgba(244,114,182,0.2)]'
                        : 'hover:bg-white/5 text-white/70 hover:text-white'}"
                    onclick={closeFeatures}
                  >
                    <span class="text-xl">{item.icon}</span>
                    <span class="text-[11px] font-semibold">{item.label}</span>
                  </a>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </nav>

      <div class="flex items-center gap-3">
        <PresenceOrb />
      </div>
    </div>
  </header>

  <!-- Mobile Bottom Tab Bar (iOS Style) -->
  <nav class="fixed-mobile bottom-0 z-50 md:hidden">
    <div class="mx-3 mb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div class="glass-strong rounded-2xl border border-rina-border shadow-lg backdrop-blur-xl">
        <div class="flex items-center justify-around h-[4.5rem]">
          {#each mainNavItems as item}
            <a
              href={item.path}
              class="flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200 touch-target min-w-[64px]
                {currentPath === item.path
                  ? 'text-rina-rose scale-105 shadow-[0_0_14px_rgba(244,114,182,0.3)] bg-rina-rose/10'
                  : 'text-white/50 hover:text-white/80'}"
            >
              <span class="text-xl">{item.icon}</span>
              <span class="text-[10px] font-bold leading-none">{item.label}</span>
            </a>
          {/each}
          {#if currentUser()?.username === 'maroon'}
            <a
              href={adminNavItem.path}
              class="flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200 touch-target min-w-[64px]
                {currentPath === adminNavItem.path
                  ? 'text-rina-rose scale-105 shadow-[0_0_14px_rgba(244,114,182,0.3)] bg-rina-rose/10'
                  : 'text-white/50 hover:text-white/80'}"
            >
              <span class="text-xl">{adminNavItem.icon}</span>
              <span class="text-[10px] font-bold leading-none">{adminNavItem.label}</span>
            </a>
          {/if}

          <!-- Features Trigger -->
          <button
            bind:this={featuresButtonRef}
            onclick={() => showFeatures = !showFeatures}
            class="flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200 touch-target min-w-[64px]
              {showFeatures ? 'text-rina-rose scale-105 shadow-[0_0_14px_rgba(244,114,182,0.3)] bg-rina-rose/10' : 'text-white/50 hover:text-white/80'}"
            aria-label="Features"
          >
            <span class="text-xl">✨</span>
            <span class="text-[10px] font-bold leading-none">More</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Features Sheet (Mobile) -->
    {#if showFeatures}
      <div
        class="absolute bottom-full left-0 right-0 mb-2 px-3"
        transition:fade={{ duration: 150 }}
      >
        <div
          class="glass-strong rounded-2xl border border-rina-border p-3 shadow-2xl"
          transition:scale={{ duration: 200, start: 0.9 }}
        >
          <div class="grid grid-cols-4 gap-2">
            {#each featureItems as item}
              <button
                onclick={() => handleFeatureClick(item.path)}
                class="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 touch-target
                  {currentPath === item.path
                    ? 'bg-rina-rose/15 text-rina-rose shadow-[0_0_10px_rgba(244,114,182,0.2)]'
                    : 'hover:bg-white/5 text-white/70 hover:text-white'}"
              >
                <span class="text-xl">{item.icon}</span>
                <span class="text-[10px] font-semibold">{item.label}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Backdrop to close -->
      <div
        class="fixed inset-0 z-[-1]"
        onclick={closeFeatures}
        role="button"
        tabindex="-1"
        aria-hidden="true"
      ></div>
    {/if}
  </nav>
{/if}
