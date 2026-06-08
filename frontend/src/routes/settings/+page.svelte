<script lang="ts">
  import { fade, scale, slide } from 'svelte/transition';
  import { currentUser, auth, partnerName } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  // ─── Profile ────────────────────────────────────────────────────
  let displayName = $state('');
  let editingName = $state(false);
  let savingProfile = $state(false);

  // ─── Notification Settings ──────────────────────────────────────
  interface NotificationSettings {
    pushEnabled: boolean;
    messageNotifications: boolean;
    movieNotifications: boolean;
    cycleReminders: boolean;
    partnerPresence: boolean;
  }

  let notifications = $state<NotificationSettings>({
    pushEnabled: true,
    messageNotifications: true,
    movieNotifications: true,
    cycleReminders: true,
    partnerPresence: true,
  });

  // ─── Admin Config ───────────────────────────────────────────────
  interface ConfigValues {
    DOMAIN: string;
    FRONTEND_URL: string;
    CORS_ORIGIN: string;
    YOUTUBE_API_KEY: string;
    VAPID_PUBLIC_KEY: string;
    VAPID_PRIVATE_KEY: string;
    TMDB_API_KEY: string;
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_REGION: string;
    S3_BUCKET_NAME: string;
    COTURN_REALM: string;
    COTURN_SECRET: string;
    BACKUP_ENCRYPTION_KEY: string;
    VITE_MAPBOX_TOKEN: string;
  }

  let config = $state<Partial<ConfigValues>>({});
  let original = $state<Partial<ConfigValues>>({});
  let configLoading = $state(true);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  const sections = [
    {
      title: 'Domain & App',
      icon: '🌐',
      keys: ['DOMAIN', 'FRONTEND_URL', 'CORS_ORIGIN'] as const,
      help: 'Domain settings for CORS and links',
    },
    {
      title: 'YouTube Sync',
      icon: '📺',
      keys: ['YOUTUBE_API_KEY'] as const,
      help: 'Get free API key at https://console.cloud.google.com/apis/credentials (enable YouTube Data API v3). Search uses ~200 quota units per query.',
    },
    {
      title: 'TMDB Movies',
      icon: '🎬',
      keys: ['TMDB_API_KEY'] as const,
      help: 'Get free API key at https://www.themoviedb.org/settings/api',
    },
    {
      title: 'Mapbox',
      icon: '🗺️',
      keys: ['VITE_MAPBOX_TOKEN'] as const,
      help: 'Get free token at https://account.mapbox.com/access-tokens/',
    },
    {
      title: 'AWS S3 Uploads',
      icon: '☁️',
      keys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET_NAME'] as const,
      help: 'Create an IAM user with s3:PutObject, s3:GetObject, s3:DeleteObject',
    },
    {
      title: 'Web Push Notifications',
      icon: '🔔',
      keys: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] as const,
      help: 'Generate with: npx web-push generate-vapid-keys',
    },
    {
      title: 'Coturn TURN Server',
      icon: '📡',
      keys: ['COTURN_REALM', 'COTURN_SECRET'] as const,
      help: 'For WebRTC video calls. Deploy Coturn on a separate instance.',
    },
    {
      title: 'Backup Encryption',
      icon: '🔐',
      keys: ['BACKUP_ENCRYPTION_KEY'] as const,
      help: 'Encrypt database backups. Must be 32+ characters.',
    },
  ];

  async function loadConfig() {
    try {
      const res = await fetch('/api/admin/config', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load config');
      const data = await res.json();
      config = { ...data.config };
      original = { ...data.config };
    } catch (err: any) {
      error = err.message || 'Failed to load config';
    } finally {
      configLoading = false;
    }
  }

  async function saveConfig() {
    saving = true;
    message = '';
    error = '';
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error('Failed to save');
      original = { ...config };
      message = 'Settings saved! Refresh the page to apply changes.';
    } catch (err: any) {
      error = err.message || 'Failed to save';
    } finally {
      saving = false;
    }
  }

  function hasChanges(sectionKeys: readonly string[]): boolean {
    return sectionKeys.some(k => config[k as keyof ConfigValues] !== original[k as keyof ConfigValues]);
  }

  async function saveDisplayName() {
    if (!displayName.trim()) {
      editingName = false;
      displayName = currentUser()?.displayName || '';
      return;
    }
    savingProfile = true;
    try {
      await auth.updateMe?.({ displayName: displayName.trim() });
      if (currentUser()) {
        currentUser()!.displayName = displayName.trim();
      }
      editingName = false;
    } catch {
      // ignore
    } finally {
      savingProfile = false;
    }
  }

  function toggleNotification(key: keyof NotificationSettings) {
    notifications = { ...notifications, [key]: !notifications[key] };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rina-notifications', JSON.stringify(notifications));
    }
  }

  function loadNotificationSettings() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('rina-notifications');
      if (saved) {
        try {
          notifications = { ...notifications, ...JSON.parse(saved) };
        } catch {
          // ignore
        }
      }
    }
  }

  function handleLogout() {
    auth.logout();
  }

  onMount(() => {
    loadNotificationSettings();
    displayName = currentUser()?.displayName || '';
    if (currentUser()?.username === 'maroon') {
      loadConfig();
    } else {
      configLoading = false;
    }
  });

  // Redirect if not logged in
  $effect(() => {
    if (!configLoading && !currentUser()) {
      goto('/login');
    }
  });

  const user = $derived(currentUser());
  const isAdmin = $derived(user?.username === 'maroon');
  const partner = $derived(user?.partner);
</script>

<div class="min-h-screen px-4 py-6 max-w-3xl mx-auto bg-rina-bg" in:fade={{ duration: 300 }}>
  <!-- Header -->
  <div class="flex items-center gap-3 mb-8">
    <div class="w-10 h-10 rounded-xl bg-rina-primary-soft flex items-center justify-center">
      <svg class="w-5 h-5 text-rina-primary" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a15.995 15.995 0 0 1-3.42-3.42Z"/></svg>
    </div>
    <div>
      <h1 class="text-2xl font-display font-bold text-rina-text">Settings</h1>
      <p class="text-sm text-rina-text-muted">Personalize your experience</p>
    </div>
  </div>

  {#if configLoading}
    <div class="flex items-center justify-center py-20">
      <div class="animate-pulse flex items-center gap-2 text-rina-text-muted">
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
        Loading...
      </div>
    </div>
  {:else}
    <!-- Alerts -->
    {#if message}
      <div class="card border-rina-success/30 bg-rina-success-soft mb-6" in:scale>
        <div class="flex items-center gap-2 p-4">
          <svg class="w-4 h-4 text-rina-success" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
          <p class="text-rina-success text-sm font-medium">{message}</p>
        </div>
      </div>
    {/if}
    {#if error}
      <div class="card border-rina-accent/30 bg-rina-accent-soft mb-6" in:scale>
        <div class="flex items-center gap-2 p-4">
          <svg class="w-4 h-4 text-rina-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
          <p class="text-rina-accent text-sm font-medium">{error}</p>
        </div>
      </div>
    {/if}

    <div class="space-y-6">
      <!-- ─── Profile Card ─────────────────────────────────────── -->
      <div class="card p-5 md:p-6">
        <h2 class="text-lg font-display font-bold text-rina-text mb-4 flex items-center gap-2">
          <span class="text-xl">👤</span> Profile
        </h2>

        <div class="flex items-center gap-4 mb-5">
          <div class="relative">
            {#if user?.avatarUrl}
              <img src={user.avatarUrl} alt="Avatar" class="avatar-ring w-16 h-16 object-cover" />
            {:else}
              <div class="w-16 h-16 rounded-full bg-rina-primary-soft flex items-center justify-center text-2xl font-display font-bold text-rina-primary border-2 border-rina-border">
                {(user?.displayName || user?.username || '?')[0].toUpperCase()}
              </div>
            {/if}
            <div class="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-rina-success border-2 border-rina-surface flex items-center justify-center">
              <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clip-rule="evenodd"/></svg>
            </div>
          </div>

          <div class="flex-1 min-w-0">
            {#if editingName}
              <div class="flex items-center gap-2">
                <input
                  bind:value={displayName}
                  onkeydown={(e) => e.key === 'Enter' && saveDisplayName()}
                  class="input py-2 text-sm"
                  placeholder="Your display name"
                />
                <button onclick={saveDisplayName} disabled={savingProfile} class="btn-primary py-2 px-3" aria-label="Save display name">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                </button>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-rina-text truncate">{user?.displayName || user?.username}</h3>
                <button onclick={() => editingName = true} class="text-rina-text-muted hover:text-rina-primary transition-colors" aria-label="Edit display name">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"/></svg>
                </button>
              </div>
            {/if}
            <p class="text-xs text-rina-text-muted mt-0.5">@{user?.username}</p>
          </div>
        </div>

        {#if partner}
          <div class="flex items-center gap-3 p-3 rounded-xl bg-rina-surface-muted">
            <div class="w-10 h-10 rounded-full bg-rina-secondary-soft flex items-center justify-center text-lg">
              💕
            </div>
            <div>
              <p class="text-sm font-medium text-rina-text">{partner.displayName}</p>
              <p class="text-xs text-rina-text-muted">Your partner • @{partner.username}</p>
            </div>
          </div>
        {/if}
      </div>

      <!-- ─── Notifications ────────────────────────────────────── -->
      <div class="card p-5 md:p-6">
        <h2 class="text-lg font-display font-bold text-rina-text mb-4 flex items-center gap-2">
          <span class="text-xl">🔔</span> Notifications
        </h2>

        <div class="space-y-4">
          {#each [
            { key: 'pushEnabled' as const, label: 'Push Notifications', desc: 'Receive push notifications on this device' },
            { key: 'messageNotifications' as const, label: 'Messages', desc: 'Get notified when your partner sends a message' },
            { key: 'movieNotifications' as const, label: 'New Movies', desc: 'Alert when a new movie is added to the library' },
            { key: 'cycleReminders' as const, label: 'Cycle Reminders', desc: 'Gentle reminders about cycle tracking' },
            { key: 'partnerPresence' as const, label: 'Partner Online', desc: 'Notify when your partner comes online' },
          ] as item}
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-rina-text">{item.label}</p>
                <p class="text-xs text-rina-text-muted">{item.desc}</p>
              </div>
              <button
                onclick={() => toggleNotification(item.key)}
                class="relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rina-primary focus-visible:ring-offset-2 focus-visible:ring-offset-rina-bg"
                class:bg-rina-primary={notifications[item.key]}
                class:bg-rina-border-strong={!notifications[item.key]}
                role="switch"
                aria-checked={notifications[item.key]}
                aria-label={item.label}
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition duration-200"
                  class:translate-x-6={notifications[item.key]}
                  class:translate-x-1={!notifications[item.key]}
                  style="margin-top: 3px;"
                ></span>
              </button>
            </div>
            {#if item.key !== 'partnerPresence'}
              <div class="divider my-0"></div>
            {/if}
          {/each}
        </div>
      </div>

      <!-- ─── Admin Config ─────────────────────────────────────── -->
      {#if isAdmin}
        <div class="card p-5 md:p-6">
          <h2 class="text-lg font-display font-bold text-rina-text mb-1 flex items-center gap-2">
            <span class="text-xl">🔧</span> Admin Configuration
          </h2>
          <p class="text-xs text-rina-text-muted mb-4">Manage API keys and server settings</p>

          <div class="space-y-6">
            {#each sections as section}
              <div class="card p-4 md:p-5 space-y-3 bg-rina-surface-warm">
                <div class="flex items-center gap-2">
                  <span class="text-xl">{section.icon}</span>
                  <h3 class="text-sm font-semibold text-rina-text">{section.title}</h3>
                  {#if hasChanges(section.keys)}
                    <span class="ml-auto badge-primary text-[10px]">Modified</span>
                  {/if}
                </div>

                {#if section.help}
                  <p class="text-xs text-rina-text-muted">{section.help}</p>
                {/if}

                <div class="space-y-3">
                  {#each section.keys as key}
                    <div>
                      <label for={key} class="block text-xs font-medium text-rina-text-secondary uppercase tracking-wider mb-1.5">
                        {key.replace(/_/g, ' ')}
                      </label>
                      <input
                        id={key}
                        type={key.includes('SECRET') || key.includes('PASSWORD') || key.includes('KEY') ? 'password' : 'text'}
                        bind:value={config[key as keyof ConfigValues]}
                        placeholder="Leave empty to disable feature..."
                        class="input"
                      />
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- ─── Logout ───────────────────────────────────────────── -->
      <div class="card p-5 md:p-6">
        <h2 class="text-lg font-display font-bold text-rina-text mb-4 flex items-center gap-2">
          <span class="text-xl">🚪</span> Session
        </h2>
        <button onclick={handleLogout} class="btn-outline w-full md:w-auto">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"/></svg>
          Log Out
        </button>
      </div>
    </div>

    <!-- Save Button (Admin only) -->
    {#if isAdmin}
      <div class="fixed bottom-6 left-0 right-0 px-4 z-30 md:static md:px-0 md:mt-8">
        <button
          onclick={saveConfig}
          disabled={saving}
          class="w-full md:w-auto md:min-w-[200px] btn-primary shadow-soft-lg"
        >
          {#if saving}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            Saving...
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 11.186 0Z"/></svg>
            Save Settings
          {/if}
        </button>
      </div>
    {/if}
  {/if}
</div>
