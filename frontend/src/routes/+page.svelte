<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { socketStore, pingReceived } from '$lib/stores/socket.svelte';
  import { fly, fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  // ─── Time & Weather ────────────────────────────────────────────
  let now = new Date();
  let kenitraTime = '';
  let permTime = '';
  let weatherLoaded = false;
  let kenitraTemp = '--';
  let permTemp = '--';
  let kenitraCode = 0;
  let permCode = 0;

  function updateClocks() {
    now = new Date();
    kenitraTime = now.toLocaleTimeString('en-GB', {
      timeZone: 'Africa/Casablanca',
      hour: '2-digit',
      minute: '2-digit'
    });
    permTime = now.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function fetchWeather() {
    try {
      // Kenitra (approx 34.3°N, 6.6°W)
      const kRes = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=34.26&longitude=-6.58&current_weather=true'
      );
      const kData = await kRes.json();
      kenitraTemp = Math.round(kData.current_weather.temperature).toString();
      kenitraCode = kData.current_weather.weathercode;

      // Perm (approx 58°N, 56°E)
      const pRes = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=58.01&longitude=56.25&current_weather=true'
      );
      const pData = await pRes.json();
      permTemp = Math.round(pData.current_weather.temperature).toString();
      permCode = pData.current_weather.weathercode;

      weatherLoaded = true;
    } catch {
      // Silently fail weather
    }
  }

  function weatherIcon(code: number): string {
    if (code <= 1) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '🌨️';
    if (code <= 82) return '🌦️';
    if (code <= 86) return '❄️';
    if (code <= 99) return '⛈️';
    return '🌡️';
  }

  // ─── Thinking of You ───────────────────────────────────────────
  function sendPing() {
    socketStore.emit('ping:partner');
  }

  // ─── Dashboard Cards ───────────────────────────────────────────
  const quickActions = [
    { path: '/chat', label: 'Chat', icon: '💬', color: 'from-rina-rose/20 to-rina-rose/5' },
    { path: '/video', label: 'Video Call', icon: '📹', color: 'from-rina-indigo/20 to-rina-indigo/5' },
    { path: '/calendar', label: 'Calendar', icon: '📅', color: 'from-emerald-500/20 to-emerald-500/5' },
    { path: '/movies', label: 'Movies', icon: '🎬', color: 'from-amber-500/20 to-amber-500/5' },
    { path: '/listen', label: 'Listen', icon: '🎵', color: 'from-pink-500/20 to-pink-500/5' },
    { path: '/roulette', label: 'Food', icon: '🍽️', color: 'from-orange-500/20 to-orange-500/5' },
  ];

  onMount(() => {
    updateClocks();
    const interval = setInterval(updateClocks, 1000);
    fetchWeather();
    return () => clearInterval(interval);
  });

  // Redirect if not authenticated (wait for auth loading to finish)
  $effect(() => {
    if (!isLoading && !isAuthenticated && typeof window !== 'undefined') {
    goto('/login');
    }
  });
</script>

{#if isAuthenticated}
  <div class="max-w-7xl mx-auto px-4 py-6 space-y-6" in:fade={{ duration: 300 }}>
    <!-- Header Section -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Time Cards -->
      <div class="glass rounded-2xl p-5 flex items-center justify-between" in:fly={{ y: 20, delay: 0 }}>
        <div>
          <p class="text-xs font-medium text-rina-slate uppercase tracking-wider">Kenitra, MA</p>
          <p class="text-3xl font-bold tabular-nums">{kenitraTime}</p>
        </div>
        <div class="text-right">
          <span class="text-2xl">{weatherIcon(kenitraCode)}</span>
          <p class="text-sm text-rina-slate">{kenitraTemp}°C</p>
        </div>
      </div>

      <div class="glass rounded-2xl p-5 flex items-center justify-between" in:fly={{ y: 20, delay: 100 }}>
        <div>
          <p class="text-xs font-medium text-rina-slate uppercase tracking-wider">Perm, RU</p>
          <p class="text-3xl font-bold tabular-nums">{permTime}</p>
        </div>
        <div class="text-right">
          <span class="text-2xl">{weatherIcon(permCode)}</span>
          <p class="text-sm text-rina-slate">{permTemp}°C</p>
        </div>
      </div>

      <!-- Heart Ping Button -->
      <button
        on:click={sendPing}
        class="glass rounded-2xl p-5 flex flex-col items-center justify-center gap-2
          hover:bg-rina-rose/10 active:scale-95 transition-all group cursor-pointer"
        in:fly={{ y: 20, delay: 200 }}
      >
        <svg
          class="w-8 h-8 text-rina-rose group-hover:scale-110 transition-transform"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
        <span class="text-sm font-medium text-rina-rose">Thinking of You</span>
      </button>
    </div>

    <!-- Welcome -->
    <div in:fly={{ y: 20, delay: 300 }}>
      <h2 class="text-2xl font-bold mb-1">
        Hello, <span class="text-gradient">{currentUser?.displayName || 'Love'}</span>
      </h2>
      <p class="text-rina-slate text-sm">
        {now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>

    <!-- Quick Actions Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
      {#each quickActions as action, i (action.path)}
        <a
          href={action.path}
          class="glass rounded-xl p-4 flex flex-col items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all
            bg-gradient-to-b {action.color}"
          in:scale={{ duration: 300, delay: 400 + i * 50, easing: cubicOut, start: 0.8 }}
        >
          <span class="text-3xl">{action.icon}</span>
          <span class="text-xs font-medium text-center">{action.label}</span>
        </a>
      {/each}
    </div>

    <!-- Placeholder for upcoming features -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4" in:fly={{ y: 20, delay: 700 }}>
      <div class="glass rounded-2xl p-6">
        <h3 class="text-lg font-semibold mb-3">🎯 Goals</h3>
        <p class="text-rina-slate text-sm">Your shared financial goals will appear here.</p>
      </div>
      <div class="glass rounded-2xl p-6">
        <h3 class="text-lg font-semibold mb-3">⏰ Next Visit</h3>
        <p class="text-rina-slate text-sm">Countdowns to your upcoming visits will appear here.</p>
      </div>
    </div>
  </div>
{/if}
