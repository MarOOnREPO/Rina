<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { socketStore, partnerPresence } from '$lib/stores/socket.svelte';
  import { notificationApi, type AppNotification } from '$lib/utils/api';
  import { fade, fly } from 'svelte/transition';
  import PatchworkTile from '$lib/components/PatchworkTile.svelte';
  import WeatherWidget from '$lib/components/WeatherWidget.svelte';

  // ─── Notifications ─────────────────────────────────────────────
  let notifications = $state<AppNotification[]>([]);
  let showNotifications = $state(false);

  async function fetchNotifications() {
    try {
      const { notifications: notifs } = await notificationApi.list();
      notifications = notifs;
    } catch {
      // Silently fail
    }
  }

  async function markAllRead() {
    try {
      await notificationApi.markRead();
      notifications = [];
      showNotifications = false;
    } catch {
      // Silently fail
    }
  }

  function sendPing() {
    socketStore.emit('ping:partner');
  }

  const quickActions = [
    { label: 'Chat', icon: '💬', href: '/chat', color: 'bg-rina-rose/15 text-rina-rose' },
    { label: 'Goals', icon: '🎯', href: '/goals', color: 'bg-cyan-500/15 text-cyan-400' },
    { label: 'Calendar', icon: '📅', href: '/calendar', color: 'bg-emerald-500/15 text-emerald-400' },
    { label: 'Cinema', icon: '🍿', href: '/cinema', color: 'bg-rose-500/15 text-rose-400' },
  ];

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  onMount(() => {
    fetchNotifications();
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

{#if isAuthenticated()}
  <div class="px-3 py-4 space-y-4" in:fade={{ duration: 300 }}>
    <!-- Greeting Header -->
    <div class="flex items-center justify-between" in:fly={{ y: 10, delay: 0 }}>
      <div>
        <h1 class="text-lg font-bold text-white">{getGreeting()}, <span class="text-gradient">{currentUser()?.username || 'Love'}</span></h1>
        <p class="text-xs text-white/50 mt-0.5">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      {#if notifications.length > 0}
        <button
          onclick={() => showNotifications = !showNotifications}
          class="relative touch-target w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/5 transition-colors active:scale-95"
        >
          <span class="text-lg">💌</span>
          <span class="absolute -top-1 -right-1 w-5 h-5 bg-rina-rose text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(244,114,182,0.5)]">
            {notifications.length}
          </span>
        </button>
      {/if}
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-4 gap-2" in:fly={{ y: 10, delay: 40 }}>
      {#each quickActions as action}
        <a
          href={action.href}
          class="flex flex-col items-center gap-1.5 p-2.5 rounded-xl glass hover:bg-white/5 active:scale-95 transition-all touch-target"
        >
          <span class="w-9 h-9 rounded-lg {action.color} flex items-center justify-center text-lg shadow-[0_0_10px_rgba(255,255,255,0.05)]">
            {action.icon}
          </span>
          <span class="text-[10px] font-semibold text-white/80">{action.label}</span>
        </a>
      {/each}
    </div>

    <!-- Heart Ping -->
    <button
      onclick={sendPing}
      class="w-full touch-target glass rounded-2xl p-4 flex items-center justify-center gap-3
        hover:bg-rina-rose/10 active:scale-[0.98] transition-all group cursor-pointer relative shadow-[inset_0_0_20px_rgba(244,114,182,0.05)]"
      in:fly={{ y: 20, delay: 80 }}
    >
      <svg
        class="w-8 h-8 text-rina-rose group-hover:scale-110 transition-transform group-hover:animate-pulse drop-shadow-[0_0_8px_rgba(244,114,182,0.4)]"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
      <div class="text-left">
        <span class="text-base font-bold text-rina-rose block">Thinking of You</span>
        <span class="text-xs text-white/50">Tap to send a love ping 💕</span>
      </div>
    </button>

    <!-- Notification Dropdown -->
    {#if showNotifications}
      <div class="glass rounded-xl p-3 space-y-2 max-w-md" transition:fade={{ duration: 200 }}>
        {#each notifications as notif (notif.id)}
          <div class="text-sm border-b border-white/5 last:border-0 pb-2 last:pb-0">
            <p class="font-semibold text-rina-rose">{notif.title}</p>
            <p class="text-white/60 text-xs mt-0.5">{notif.body}</p>
          </div>
        {/each}
        <button
          onclick={markAllRead}
          class="w-full text-xs font-semibold py-2 rounded-lg bg-rina-rose/15 hover:bg-rina-rose/25 active:scale-[0.98] transition-all text-rina-rose touch-target"
        >
          Mark all as read
        </button>
      </div>
    {/if}

    <!-- Desktop Weather -->
    <div class="hidden md:grid md:grid-cols-2 gap-3">
      <WeatherWidget lat={34.26} lon={-6.58} timezone="Africa/Casablanca" label="Kenitra" />
      <WeatherWidget lat={58.01} lon={56.25} timezone="Asia/Yekaterinburg" label="Perm" />
    </div>

    <!-- Main Patchwork Grid -->
    <div class="grid grid-cols-2 gap-3 auto-rows-[minmax(100px,auto)]">
      <!-- Chat -->
      <PatchworkTile href="/chat" icon="💬" title="Chat" subtitle="Messages chiffrés" color="from-rina-rose/15 to-rina-rose/5" size="wide" delay={80}>
        <div class="mt-2 flex items-center gap-2">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full {partnerPresence()?.status === 'online' ? 'bg-emerald-400' : 'bg-white/20'} opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 {partnerPresence()?.status === 'online' ? 'bg-emerald-500' : partnerPresence()?.status === 'typing' ? 'bg-rina-rose' : 'bg-white/30'}"></span>
          </span>
          <span class="text-[11px] text-white/70 font-medium capitalize">{partnerPresence()?.status || 'offline'}</span>
        </div>
      </PatchworkTile>

      <!-- Calendar -->
      <PatchworkTile href="/calendar" icon="📅" title="Calendar" subtitle="Planning & dates" color="from-emerald-500/15 to-emerald-500/5" size="wide" delay={140}>
        <p class="text-[11px] text-white/60 mt-1 font-medium">Prochain événement →</p>
      </PatchworkTile>

      <!-- Cinema -->
      <PatchworkTile href="/cinema" icon="🍿" title="Cinema" subtitle="Watch together" color="from-rose-500/15 to-rose-500/5" delay={180} />

      <!-- Movies -->
      <PatchworkTile href="/movies" icon="🎬" title="Movies" subtitle="À voir ensemble" color="from-amber-500/15 to-amber-500/5" delay={220} />

      <!-- YouTube Sync -->
      <PatchworkTile href="/jam" icon="📺" title="YouTube Sync" subtitle="Watch together" color="from-pink-500/15 to-pink-500/5" delay={280} />

      <!-- Food -->
      <PatchworkTile href="/roulette" icon="🍽️" title="Food" subtitle="Roulette des repas" color="from-orange-500/15 to-orange-500/5" delay={340} />

      <!-- Video -->
      <PatchworkTile href="/video" icon="📹" title="Video Call" subtitle="Appel visio" color="from-rina-indigo/15 to-rina-indigo/5" delay={400} />

      <!-- Capsules -->
      <PatchworkTile href="/capsules" icon="🔐" title="Capsules" subtitle="Messages temporels" color="from-violet-500/15 to-violet-500/5" delay={460} />

      <!-- Goals -->
      <PatchworkTile href="/goals" icon="🎯" title="Goals" subtitle="Objectifs communs" color="from-cyan-500/15 to-cyan-500/5" delay={520} />

      <!-- Map -->
      <PatchworkTile href="/map" icon="🗺️" title="Map" subtitle="Notre monde" color="from-teal-500/15 to-teal-500/5" delay={580} />

      <!-- Whiteboard -->
      <PatchworkTile href="/whiteboard" icon="🎨" title="Whiteboard" subtitle="Dessin collaboratif" color="from-fuchsia-500/15 to-fuchsia-500/5" delay={640} />
    </div>
  </div>
{/if}
