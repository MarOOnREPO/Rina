<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser, partnerName } from '$lib/stores/auth.svelte';
  import { socketStore, partnerPresence } from '$lib/stores/socket.svelte';
  import { fade, fly } from 'svelte/transition';
  import PatchworkTile from '$lib/components/PatchworkTile.svelte';

  // ─── Time & Weather ────────────────────────────────────────────
  let now = $state(new Date());
  let kenitraTime = $state('--:--');
  let permTime = $state('--:--');
  let kenitraTemp = $state('--');
  let permTemp = $state('--');
  let kenitraCode = $state(0);
  let permCode = $state(0);

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
      const kRes = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=34.26&longitude=-6.58&current_weather=true'
      );
      const kData = await kRes.json();
      kenitraTemp = Math.round(kData.current_weather.temperature).toString();
      kenitraCode = kData.current_weather.weathercode;

      const pRes = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=58.01&longitude=56.25&current_weather=true'
      );
      const pData = await pRes.json();
      permTemp = Math.round(pData.current_weather.temperature).toString();
      permCode = pData.current_weather.weathercode;
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

  function sendPing() {
    socketStore.emit('ping:partner');
  }

  onMount(() => {
    updateClocks();
    const interval = setInterval(updateClocks, 1000);
    fetchWeather();
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  // ─── Patchwork Tiles Config ────────────────────────────────────
  const tiles = [
    { href: '/chat', icon: '💬', title: 'Chat', subtitle: 'Messages privés', color: 'from-rina-rose/15 to-rina-rose/5', size: 'wide' as const },
    { href: '/calendar', icon: '📅', title: 'Calendar', subtitle: 'Événements & compte à rebours', color: 'from-emerald-500/15 to-emerald-500/5', size: 'wide' as const },
    { href: '/movies', icon: '🎬', title: 'Movies', subtitle: 'Films à regarder ensemble', color: 'from-amber-500/15 to-amber-500/5', size: 'md' as const },
    { href: '/listen', icon: '🎵', title: 'Music', subtitle: 'Écouter ensemble', color: 'from-pink-500/15 to-pink-500/5', size: 'md' as const },
    { href: '/roulette', icon: '🍽️', title: 'Food', subtitle: 'Roulette des repas', color: 'from-orange-500/15 to-orange-500/5', size: 'md' as const },
    { href: '/video', icon: '📹', title: 'Video Call', subtitle: 'Appel en face à face', color: 'from-rina-indigo/15 to-rina-indigo/5', size: 'md' as const },
    { href: '/capsules', icon: '🔐', title: 'Capsules', subtitle: 'Messages dans le temps', color: 'from-violet-500/15 to-violet-500/5', size: 'md' as const },
    { href: '/goals', icon: '🎯', title: 'Goals', subtitle: 'Objectifs communs', color: 'from-cyan-500/15 to-cyan-500/5', size: 'md' as const },
    { href: '/map', icon: '🗺️', title: 'Map', subtitle: 'Notre monde', color: 'from-teal-500/15 to-teal-500/5', size: 'md' as const },
    { href: '/whiteboard', icon: '🎨', title: 'Whiteboard', subtitle: 'Dessiner ensemble', color: 'from-fuchsia-500/15 to-fuchsia-500/5', size: 'md' as const },
  ];
</script>

{#if isAuthenticated()}
  <div class="max-w-7xl mx-auto px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-5" in:fade={{ duration: 300 }}>
    
    <!-- Top Row: Time + Weather + Heart -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <!-- Kenitra -->
      <div class="glass rounded-2xl p-4 md:p-5 flex items-center justify-between col-span-1" in:fly={{ y: 20, delay: 0 }}>
        <div>
          <p class="text-[10px] md:text-xs font-medium text-rina-slate uppercase tracking-wider">Kenitra, MA</p>
          <p class="text-2xl md:text-3xl font-bold tabular-nums">{kenitraTime}</p>
        </div>
        <div class="text-right">
          <span class="text-xl md:text-2xl">{weatherIcon(kenitraCode)}</span>
          <p class="text-xs md:text-sm text-rina-slate">{kenitraTemp}°C</p>
        </div>
      </div>

      <!-- Perm -->
      <div class="glass rounded-2xl p-4 md:p-5 flex items-center justify-between col-span-1" in:fly={{ y: 20, delay: 80 }}>
        <div>
          <p class="text-[10px] md:text-xs font-medium text-rina-slate uppercase tracking-wider">Perm, RU</p>
          <p class="text-2xl md:text-3xl font-bold tabular-nums">{permTime}</p>
        </div>
        <div class="text-right">
          <span class="text-xl md:text-2xl">{weatherIcon(permCode)}</span>
          <p class="text-xs md:text-sm text-rina-slate">{permTemp}°C</p>
        </div>
      </div>

      <!-- Welcome (hidden on mobile, shown on md+) -->
      <div class="hidden md:flex flex-col justify-center glass rounded-2xl p-4 md:p-5 col-span-1" in:fly={{ y: 20, delay: 160 }}>
        <p class="text-[10px] md:text-xs font-medium text-rina-slate uppercase tracking-wider">Bienvenue</p>
        <h2 class="text-lg md:text-xl font-bold truncate">
          <span class="text-gradient">{currentUser()?.displayName || 'Love'}</span>
        </h2>
      </div>

      <!-- Heart Ping -->
      <button
        onclick={sendPing}
        class="glass rounded-2xl p-4 md:p-5 flex items-center justify-center gap-2 md:gap-3
          hover:bg-rina-rose/10 active:scale-95 transition-all group cursor-pointer col-span-2 md:col-span-1"
        in:fly={{ y: 20, delay: 240 }}
      >
        <svg
          class="w-7 h-7 md:w-8 md:h-8 text-rina-rose group-hover:scale-110 transition-transform group-hover:animate-pulse"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
        <div class="text-left">
          <span class="text-sm font-medium text-rina-rose block">Thinking of You</span>
          <span class="text-[10px] text-rina-slate-dark">Envoyer un ping</span>
        </div>
      </button>
    </div>

    <!-- Mobile Welcome (visible only on small screens) -->
    <div class="md:hidden text-center" in:fly={{ y: 20, delay: 300 }}>
      <h2 class="text-xl font-bold">
        Hello, <span class="text-gradient">{currentUser()?.displayName || 'Love'}</span>
      </h2>
      <p class="text-rina-slate text-xs mt-0.5">
        {now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>

    <!-- Main Patchwork Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 auto-rows-[minmax(100px,auto)]">
      
      <!-- Chat -->
      <PatchworkTile href="/chat" icon="💬" title="Chat" subtitle="Messages chiffrés" color="from-rina-rose/15 to-rina-rose/5" size="wide" delay={320}>
        <div class="mt-2 flex items-center gap-2">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full {partnerPresence()?.status === 'online' ? 'bg-emerald-400' : 'bg-rina-slate-dark'} opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 {partnerPresence()?.status === 'online' ? 'bg-emerald-500' : partnerPresence()?.status === 'typing' ? 'bg-rina-rose' : 'bg-rina-slate-dark'}"></span>
          </span>
          <span class="text-[10px] text-rina-slate capitalize">{partnerPresence()?.status || 'offline'}</span>
        </div>
      </PatchworkTile>

      <!-- Calendar -->
      <PatchworkTile href="/calendar" icon="📅" title="Calendar" subtitle="Planning & dates" color="from-emerald-500/15 to-emerald-500/5" size="wide" delay={380}>
        <p class="text-[10px] text-rina-slate-dark mt-1">Prochain événement →</p>
      </PatchworkTile>

      <!-- Movies -->
      <PatchworkTile href="/movies" icon="🎬" title="Movies" subtitle="À voir ensemble" color="from-amber-500/15 to-amber-500/5" delay={440} />

      <!-- Music -->
      <PatchworkTile href="/listen" icon="🎵" title="Music" subtitle="Écoute synchronisée" color="from-pink-500/15 to-pink-500/5" delay={480} />

      <!-- Food -->
      <PatchworkTile href="/roulette" icon="🍽️" title="Food" subtitle="Roulette des repas" color="from-orange-500/15 to-orange-500/5" delay={520} />

      <!-- Video -->
      <PatchworkTile href="/video" icon="📹" title="Video Call" subtitle="Appel visio" color="from-rina-indigo/15 to-rina-indigo/5" delay={560} />

      <!-- Capsules -->
      <PatchworkTile href="/capsules" icon="🔐" title="Capsules" subtitle="Messages temporels" color="from-violet-500/15 to-violet-500/5" delay={600} />

      <!-- Goals -->
      <PatchworkTile href="/goals" icon="🎯" title="Goals" subtitle="Objectifs communs" color="from-cyan-500/15 to-cyan-500/5" delay={640} />

      <!-- Map -->
      <PatchworkTile href="/map" icon="🗺️" title="Map" subtitle="Notre monde" color="from-teal-500/15 to-teal-500/5" delay={680} />

      <!-- Whiteboard -->
      <PatchworkTile href="/whiteboard" icon="🎨" title="Whiteboard" subtitle="Dessin collaboratif" color="from-fuchsia-500/15 to-fuchsia-500/5" delay={720} />
    </div>

    <!-- Footer date (desktop) -->
    <div class="hidden md:block text-center pt-2" in:fade={{ delay: 800 }}>
      <p class="text-xs text-rina-slate-dark">
        {now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  </div>
{/if}
