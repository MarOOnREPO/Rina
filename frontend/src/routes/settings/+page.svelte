<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { currentUser } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  interface ConfigValues {
    DOMAIN: string;
    FRONTEND_URL: string;
    CORS_ORIGIN: string;
    YOUTUBE_INVIOUS_INSTANCE: string;
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
  let loading = $state(true);
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
      keys: ['YOUTUBE_INVIOUS_INSTANCE'] as const,
      help: 'Optional Invidious instance for search (default: vid.puffyan.us). No API key needed.',
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
      loading = false;
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
      const data = await res.json();
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

  onMount(() => {
    loadConfig();
  });

  // Redirect if not logged in
  $effect(() => {
    if (!loading && !currentUser()) {
      goto('/login');
    }
  });
</script>

<div class="min-h-screen px-4 py-6 max-w-3xl mx-auto" in:fade={{ duration: 300 }}>
  <!-- Header -->
  <div class="flex items-center gap-3 mb-8">
    <div class="text-3xl">⚙️</div>
    <div>
      <h1 class="text-2xl font-bold text-white">Settings</h1>
      <p class="text-sm text-rina-slate">Configure API keys and feature toggles</p>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="animate-spin text-2xl">⏳</div>
    </div>
  {:else}
    <!-- Alerts -->
    {#if message}
      <div class="mb-6 glass rounded-xl p-4 border border-green-500/30 bg-green-500/10" in:scale>
        <p class="text-green-400 text-sm">{message}</p>
      </div>
    {/if}
    {#if error}
      <div class="mb-6 glass rounded-xl p-4 border border-rina-rose/30 bg-rina-rose/10" in:scale>
        <p class="text-rina-rose text-sm">{error}</p>
      </div>
    {/if}

    <!-- Config Sections -->
    <div class="space-y-6">
      {#each sections as section}
        <div class="glass rounded-2xl p-5 space-y-4">
          <div class="flex items-center gap-2">
            <span class="text-xl">{section.icon}</span>
            <h2 class="text-lg font-semibold text-white">{section.title}</h2>
            {#if hasChanges(section.keys)}
              <span class="ml-auto text-[10px] font-bold text-rina-rose uppercase tracking-wider">Modified</span>
            {/if}
          </div>

          {#if section.help}
            <p class="text-xs text-rina-slate">{section.help}</p>
          {/if}

          <div class="space-y-3">
            {#each section.keys as key}
              <div>
                <label class="block text-xs font-medium text-rina-slate uppercase tracking-wider mb-1.5">
                  {key.replace(/_/g, ' ')}
                </label>
                <input
                  type={key.includes('SECRET') || key.includes('PASSWORD') || key.includes('KEY') ? 'password' : 'text'}
                  bind:value={config[key as keyof ConfigValues]}
                  placeholder="Leave empty to disable feature..."
                  class="w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm placeholder-rina-slate-dark
                    focus:outline-none focus:border-rina-rose/50 focus:ring-1 focus:ring-rina-rose/30 transition-all"
                />
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <!-- Save Button -->
    <div class="fixed bottom-6 left-0 right-0 px-4 z-30 md:static md:px-0 md:mt-8">
      <button
        onclick={saveConfig}
        disabled={saving}
        class="w-full md:w-auto md:min-w-[200px] py-3 px-6 rounded-xl bg-gradient-to-r from-rina-rose to-rina-indigo text-white font-semibold
          hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
      >
        {#if saving}
          <span class="inline-block animate-spin mr-2">⏳</span> Saving...
        {:else}
          💾 Save Settings
        {/if}
      </button>
    </div>
  {/if}
</div>
