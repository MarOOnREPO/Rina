<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
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
    <!-- Heart Ping + Notifications -->
    <div class="flex items-center gap-3">
      <button
        onclick={sendPing}
        class="flex-1 glass rounded-2xl p-4 flex items-center justify-center gap-3
          hover:bg-rina-rose/10 active:scale-95 transition-all group cursor-pointer relative"
        in:fly={{ y: 20, delay: 0 }}
      >
        {#if notifications.length > 0}
          <span class="absolute top-3 right-3 w-5 h-5 bg-rina-rose text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {notifications.length}
          </span>
        {/if}
        <svg
          class="w-7 h-7 text-rina-rose group-hover:scale-110 transition-transform group-hover:animate-pulse"
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

    <!-- Notification Dropdown -->
    {#if notifications.length > 0}
      <div class="flex justify-end px-1">
        <button
          onclick={() => showNotifications = !showNotifications}
          class="text-xs text-rina-rose hover:underline flex items-center gap-1"
        >
          💌 {notifications.length} new notification{notifications.length > 1 ? 's' : ''}
        </button>
      </div>
      {#if showNotifications}
        <div class="glass rounded-xl p-3 space-y-2 max-w-md ml-auto" transition:fade={{ duration: 200 }}>
          {#each notifications as notif (notif.id)}
            <div class="text-sm border-b border-white/5 last:border-0 pb-2 last:pb-0">
              <p class="font-medium text-rina-rose">{notif.title}</p>
              <p class="text-rina-slate text-xs">{notif.body}</p>
            </div>
          {/each}
          <button
            onclick={markAllRead}
            class="w-full text-xs py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-rina-slate"
          >
            Mark all as read
          </button>
        </div>
      {/if}
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
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full {partnerPresence()?.status === 'online' ? 'bg-emerald-400' : 'bg-rina-slate-dark'} opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 {partnerPresence()?.status === 'online' ? 'bg-emerald-500' : partnerPresence()?.status === 'typing' ? 'bg-rina-rose' : 'bg-rina-slate-dark'}"></span>
          </span>
          <span class="text-[10px] text-rina-slate capitalize">{partnerPresence()?.status || 'offline'}</span>
        </div>
      </PatchworkTile>

      <!-- Calendar -->
      <PatchworkTile href="/calendar" icon="📅" title="Calendar" subtitle="Planning & dates" color="from-emerald-500/15 to-emerald-500/5" size="wide" delay={140}>
        <p class="text-[10px] text-rina-slate-dark mt-1">Prochain événement →</p>
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
