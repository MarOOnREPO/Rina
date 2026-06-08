<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { socketStore } from '$lib/stores/socket.svelte';
  import { authApi, type AppNotification } from '$lib/utils/api';
  import { fade, fly } from 'svelte/transition';
  import PatchworkTile from '$lib/components/PatchworkTile.svelte';

  let notifications = $state<AppNotification[]>([]);
  let showNotifications = $state(false);

  async function fetchNotifications() {
    try {
      const notifs = await authApi.notifications();
      notifications = notifs.notifications;
    } catch {
      // Silently fail
    }
  }

  async function markAllRead() {
    try {
      await authApi.markRead();
      notifications = [];
      showNotifications = false;
    } catch {
      // Silently fail
    }
  }

  function sendPing() {
    // TODO: implement ping via WebSocket
  }

  const quickActions = [
    { label: 'Chat', icon: '💬', href: '/chat', color: 'bg-rina-primary-soft text-rina-primary' },
    { label: 'Calendar', icon: '📅', href: '/calendar', color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Cycle', icon: '🌙', href: '/cycle', color: 'bg-violet-50 text-violet-600' },
    { label: 'Movies', icon: '🎬', href: '/movies', color: 'bg-amber-50 text-amber-600' },
  ];

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function partnerPresence() {
    const user = currentUser();
    if (!user) return null;
    const partnerName = user.username === 'maroon' ? 'rina' : 'maroon';
    return socketStore.presence[partnerName];
  }

  function partnerDisplayName() {
    const user = currentUser();
    if (!user) return 'Love';
    return user.username === 'maroon' ? 'Rina' : 'Maroon';
  }

  function presenceColor(status?: string) {
    if (status === 'online') return 'bg-rina-success';
    if (status === 'typing') return 'bg-rina-secondary';
    if (status === 'away') return 'bg-amber-400';
    return 'bg-rina-text-muted';
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
  <div class="px-4 md:px-8 py-5 md:py-8 space-y-5 max-w-7xl mx-auto" in:fade={{ duration: 300 }}>
    <!-- Greeting Header -->
    <div class="space-y-1" in:fly={{ y: 10, delay: 0 }}>
      <p class="text-xs font-medium text-rina-text-muted uppercase tracking-wider">{getGreeting()}</p>
      <h1 class="font-display text-2xl font-semibold text-rina-text">
        {currentUser()?.displayName || 'Love'} <span class="text-rina-text-muted font-normal">&</span> <span class="text-gradient">{partnerDisplayName()}</span>
      </h1>
      <p class="text-sm text-rina-text-secondary">
        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </div>

    <!-- Partner Presence Card -->
    <div
      class="card-elevated p-4 flex items-center gap-4"
      in:fly={{ y: 10, delay: 40 }}
    >
      <div class="relative">
        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-rina-primary to-rina-secondary flex items-center justify-center text-white text-lg font-display font-bold shadow-soft">
          {partnerDisplayName()[0]}
        </div>
        <div class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-rina-surface {presenceColor(partnerPresence()?.status)}">
          {#if partnerPresence()?.status === 'online'}
            <div class="w-full h-full rounded-full animate-ping opacity-50"></div>
          {/if}
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-rina-text truncate">{partnerDisplayName()}</p>
        <p class="text-sm text-rina-text-secondary capitalize">{partnerPresence()?.status || 'offline'}</p>
      </div>
      {#if notifications.length > 0}
        <button
          onclick={() => showNotifications = !showNotifications}
          class="relative touch-target w-10 h-10 rounded-xl bg-rina-surface-muted flex items-center justify-center hover:bg-rina-primary-soft transition-colors active:scale-95"
          aria-label="Notifications"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-rina-primary"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="absolute -top-1 -right-1 w-5 h-5 bg-rina-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-soft">
            {notifications.length}
          </span>
        </button>
      {/if}
    </div>

    <!-- Notification Dropdown -->
    {#if showNotifications}
      <div class="card p-4 space-y-3 max-w-md md:max-w-none" transition:fade={{ duration: 200 }}>
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-rina-text">Notifications</p>
          <button
            onclick={markAllRead}
            class="text-xs font-medium text-rina-primary hover:text-rina-secondary transition-colors"
          >
            Mark all read
          </button>
        </div>
        <div class="space-y-2">
          {#each notifications as notif (notif.id)}
            <div class="text-sm border-b border-rina-border last:border-0 pb-2 last:pb-0">
              <p class="font-semibold text-rina-primary">{notif.title}</p>
              <p class="text-rina-text-secondary text-xs mt-0.5">{notif.body}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div in:fly={{ y: 10, delay: 80 }}>
      <p class="text-xs font-medium text-rina-text-muted uppercase tracking-wider mb-3">Quick Actions</p>
      <div class="grid grid-cols-4 gap-3">
        {#each quickActions as action}
          <a
            href={action.href}
            class="flex flex-col items-center gap-2 p-3 rounded-2xl card hover:shadow-soft-lg active:scale-95 transition-all touch-target"
          >
            <span class="w-10 h-10 rounded-xl {action.color} flex items-center justify-center text-lg shadow-soft">
              {action.icon}
            </span>
            <span class="text-[11px] font-semibold text-rina-text-secondary">{action.label}</span>
          </a>
        {/each}
      </div>
    </div>

    <!-- Heart Ping -->
    <button
      onclick={sendPing}
      class="w-full touch-target btn-primary rounded-2xl py-4 flex items-center justify-center gap-3 shadow-soft-lg hover:shadow-glow active:scale-[0.98] transition-all group cursor-pointer relative overflow-hidden"
      in:fly={{ y: 20, delay: 120 }}
    >
      <div class="absolute inset-0 bg-gradient-to-r from-rina-primary to-rina-secondary opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      <svg
        class="relative w-7 h-7 text-white group-hover:scale-110 transition-transform group-hover:animate-heart-beat drop-shadow-sm"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
      <div class="relative text-left">
        <span class="text-base font-bold text-white block">Thinking of You</span>
        <span class="text-xs text-white/80">Tap to send a love ping</span>
      </div>
    </button>

    <!-- Recent Activity -->
    <div in:fly={{ y: 10, delay: 160 }}>
      <p class="text-xs font-medium text-rina-text-muted uppercase tracking-wider mb-3">Your Space</p>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-[minmax(100px,auto)]">
        <!-- Chat -->
        <PatchworkTile href="/chat" icon="💬" title="Chat" subtitle="Encrypted messages" color="from-rina-primary-soft to-transparent" size="wide" delay={80}>
          <div class="mt-2 flex items-center gap-2">
            <span class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full {partnerPresence()?.status === 'online' ? 'bg-rina-success' : 'bg-rina-text-muted/30'} opacity-60"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 {partnerPresence()?.status === 'online' ? 'bg-rina-success' : partnerPresence()?.status === 'typing' ? 'bg-rina-secondary' : 'bg-rina-text-muted/50'}"></span>
            </span>
            <span class="text-[11px] text-rina-text-secondary font-medium capitalize">{partnerPresence()?.status || 'offline'}</span>
          </div>
        </PatchworkTile>

        <!-- Calendar -->
        <PatchworkTile href="/calendar" icon="📅" title="Calendar" subtitle="Planning & dates" color="from-emerald-50 to-transparent" size="wide" delay={140}>
          <p class="text-[11px] text-rina-text-muted mt-1 font-medium">Upcoming events</p>
        </PatchworkTile>

        <!-- Movies -->
        <PatchworkTile href="/movies" icon="🎬" title="Movies" subtitle="Watch together" color="from-amber-50 to-transparent" delay={180} />

        <!-- YouTube Sync -->
        <PatchworkTile href="/jam" icon="📺" title="YouTube Sync" subtitle="Watch together" color="from-pink-50 to-transparent" delay={220} />

        <!-- Video -->
        <PatchworkTile href="/video" icon="📹" title="Video Call" subtitle="Face to face" color="from-indigo-50 to-transparent" delay={280} />

        <!-- Cycle -->
        <PatchworkTile href="/cycle" icon="🌙" title="Cycle" subtitle="Period tracker" color="from-violet-50 to-transparent" delay={340} />
      </div>
    </div>

    <!-- Footer spacer -->
    <div class="h-4"></div>
  </div>
{/if}
