<script lang="ts">
  import { page } from '$app/stores';
  import { isAuthenticated } from '$lib/stores/auth.svelte';
  import PresenceOrb from './PresenceOrb.svelte';
  import { fade, scale } from 'svelte/transition';
  import { browser } from '$app/environment';

  const mainNavItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/chat', label: 'Chat', icon: '💬' },
    { path: '/calendar', label: 'Calendar', icon: '📅' },
  ];

  const featureItems = [
    { path: '/goals', label: 'Goals', icon: '🎯' },
    { path: '/cinema', label: 'Cinema', icon: '🍿' },
    { path: '/jam', label: 'Jam', icon: '🎵' },
    { path: '/movies', label: 'Movies', icon: '🎬' },
    { path: '/video', label: 'Video', icon: '📹' },
    { path: '/capsules', label: 'Capsules', icon: '🔐' },
    { path: '/map', label: 'Map', icon: '🗺️' },
    { path: '/roulette', label: 'Food', icon: '🍽️' },
    { path: '/whiteboard', label: 'Draw', icon: '🎨' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ];

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
    <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <span class="text-xl font-bold text-gradient">Rina</span>
      </a>

      <nav class="flex items-center gap-1">
        {#each mainNavItems as item}
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
        <div class="relative">
          <button
            bind:this={featuresButtonRef}
            onclick={() => showFeatures = !showFeatures}
            class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
              {showFeatures
                ? 'bg-rina-rose/10 text-rina-rose'
                : 'text-rina-slate hover:text-white hover:bg-white/5'}"
          >
            <span class="mr-1.5">✨</span>
            Features
          </button>

          {#if showFeatures}
            <div
              class="absolute top-full right-0 mt-2 w-56 glass-strong rounded-2xl p-3 border border-rina-border shadow-2xl"
              transition:scale={{ duration: 150, start: 0.95 }}
            >
              <div class="grid grid-cols-2 gap-2">
                {#each featureItems as item}
                  <a
                    href={item.path}
                    class="flex flex-col items-center gap-1 p-2 rounded-xl transition-colors
                      {currentPath === item.path
                        ? 'bg-rina-rose/10 text-rina-rose'
                        : 'hover:bg-white/5 text-rina-slate'}"
                    onclick={closeFeatures}
                  >
                    <span class="text-xl">{item.icon}</span>
                    <span class="text-[10px] font-medium">{item.label}</span>
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
        <div class="flex items-center justify-around h-14">
          {#each mainNavItems as item}
            <a
              href={item.path}
              class="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 touch-target
                {currentPath === item.path
                  ? 'text-rina-rose scale-105'
                  : 'text-rina-slate-dark'}"
            >
              <span class="text-lg">{item.icon}</span>
              <span class="text-[9px] font-semibold leading-none">{item.label}</span>
            </a>
          {/each}

          <!-- Features Trigger -->
          <button
            bind:this={featuresButtonRef}
            onclick={() => showFeatures = !showFeatures}
            class="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 touch-target
              {showFeatures ? 'text-rina-rose scale-105' : 'text-rina-slate-dark'}"
            aria-label="Features"
          >
            <span class="text-lg">✨</span>
            <span class="text-[9px] font-semibold leading-none">More</span>
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
                class="flex flex-col items-center gap-1 p-2 rounded-xl transition-colors touch-target
                  {currentPath === item.path
                    ? 'bg-rina-rose/10 text-rina-rose'
                    : 'hover:bg-white/5 text-rina-slate'}"
              >
                <span class="text-xl">{item.icon}</span>
                <span class="text-[9px] font-medium">{item.label}</span>
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
