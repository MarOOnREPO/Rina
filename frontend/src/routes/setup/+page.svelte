<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { setupApi, type SetupStatus } from '$lib/utils/api';

  let status = $state<SetupStatus | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let lastRefresh = $state<Date | null>(null);

  async function fetchStatus() {
    loading = true;
    error = null;
    try {
      status = await setupApi.status();
      lastRefresh = new Date();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to reach the server';
      status = null;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchStatus();
  });

  const checklist = $derived([
    { label: 'Domain configured', ok: !!status?.environment.domain },
    { label: 'SSL / HTTPS active', ok: typeof window !== 'undefined' && window.location.protocol === 'https:' },
    { label: 'Database connected', ok: status?.checks.database ?? false },
    { label: 'Redis connected', ok: status?.checks.redis ?? false },
    { label: 'AWS S3 reachable', ok: status?.checks.s3 ?? false },
    { label: 'CORS origin set', ok: !!status?.environment.corsOrigin },
    { label: 'Production mode', ok: status?.environment.nodeEnv === 'production' }
  ]);

  const completedCount = $derived(checklist.filter((c) => c.ok).length);
  const progressPercent = $derived(Math.round((completedCount / checklist.length) * 100));
</script>

<svelte:head>
  <title>System Setup — Rina</title>
</svelte:head>

<div class="min-h-screen relative overflow-hidden px-4 py-10">
  <!-- Ambient background glows -->
  <div class="absolute top-0 left-1/4 w-96 h-96 bg-rina-rose/10 rounded-full blur-[120px]"></div>
  <div class="absolute bottom-0 right-1/4 w-96 h-96 bg-rina-indigo/10 rounded-full blur-[120px]"></div>

  <div class="max-w-3xl mx-auto relative z-10">
    <!-- Header -->
    <div class="text-center mb-10" in:fly={{ y: -20, duration: 500 }}>
      <h1 class="text-4xl md:text-5xl font-bold text-gradient mb-3">System Setup</h1>
      <p class="text-rina-slate text-sm md:text-base">
        Deployment health dashboard for Project Rina
      </p>
    </div>

    <!-- Overall Status Card -->
    <div
      class="glass-strong rounded-2xl p-6 mb-6 shadow-2xl"
      in:scale={{ duration: 400, start: 0.95, delay: 100 }}
    >
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div
            class="w-3 h-3 rounded-full"
            class:bg-emerald-400={status?.healthy}
            class:bg-amber-400={status && !status.healthy}
            class:bg-rose-500={!status && !loading}
            class:animate-pulse={loading}
          ></div>
          <span class="text-lg font-semibold">
            {#if loading}
              Checking services...
            {:else if error}
              Server Unreachable
            {:else if status?.healthy}
              All Systems Operational
            {:else}
              Some Services Down
            {/if}
          </span>
        </div>
        <button
          onclick={fetchStatus}
          disabled={loading}
          class="px-4 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm font-medium
            hover:border-rina-rose/50 hover:bg-rina-rose/5 transition-all disabled:opacity-50"
        >
          {loading ? '⏳ Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      <!-- Progress bar -->
      <div class="w-full h-2 bg-rina-bg rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-700 ease-out"
          class:bg-emerald-400={progressPercent === 100}
          class:bg-amber-400={progressPercent > 50 && progressPercent < 100}
          class:bg-rose-500={progressPercent <= 50}
          style="width: {loading ? 0 : progressPercent}%"
        ></div>
      </div>
      <div class="mt-2 text-right text-xs text-rina-slate">
        {#if !loading}
          {completedCount} of {checklist.length} checks passed
        {/if}
      </div>
    </div>

    {#if error}
      <div
        class="glass-strong rounded-2xl p-6 mb-6 border border-rose-500/30"
        in:fade={{ duration: 300 }}
      >
        <div class="flex items-start gap-3">
          <span class="text-2xl">⚠️</span>
          <div>
            <h3 class="font-semibold text-rose-400 mb-1">Connection Error</h3>
            <p class="text-rina-slate text-sm">{error}</p>
            <p class="text-rina-slate-dark text-xs mt-2">
              Make sure the backend is running and Nginx is proxying `/api/setup/status` correctly.
            </p>
          </div>
        </div>
      </div>
    {/if}

    {#if status}
      <!-- Service Status Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {#each [
          { key: 'database', label: 'PostgreSQL', icon: '🐘' },
          { key: 'redis', label: 'Redis', icon: '⚡' },
          { key: 's3', label: 'AWS S3', icon: '☁️' }
        ] as service, i}
          {@const ok = status.checks[service.key as keyof typeof status.checks]}
          <div
            class="glass-strong rounded-2xl p-5 text-center transition-all hover:bg-white/5"
            in:fly={{ y: 20, duration: 400, delay: 150 + i * 100 }}
          >
            <div class="text-3xl mb-2">{service.icon}</div>
            <div class="text-sm font-medium text-rina-slate mb-1">{service.label}</div>
            <div
              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              class:bg-emerald-500/15={ok}
              class:text-emerald-400={ok}
              class:bg-rose-500/15={!ok}
              class:text-rose-400={!ok}
            >
              <span class="w-1.5 h-1.5 rounded-full" class:bg-emerald-400={ok} class:bg-rose-400={!ok}></span>
              {ok ? 'Connected' : 'Failed'}
            </div>
          </div>
        {/each}
      </div>

      <!-- Environment Info -->
      <div
        class="glass-strong rounded-2xl p-6 mb-6"
        in:fly={{ y: 20, duration: 400, delay: 450 }}
      >
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🔧</span> Environment
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div class="bg-rina-bg/50 rounded-xl p-3">
            <span class="text-rina-slate text-xs uppercase tracking-wider">Domain</span>
            <div class="font-mono text-white mt-0.5 truncate">
              {status.environment.domain ?? '—'}
            </div>
          </div>
          <div class="bg-rina-bg/50 rounded-xl p-3">
            <span class="text-rina-slate text-xs uppercase tracking-wider">CORS Origin</span>
            <div class="font-mono text-white mt-0.5 truncate">
              {status.environment.corsOrigin ?? '—'}
            </div>
          </div>
          <div class="bg-rina-bg/50 rounded-xl p-3">
            <span class="text-rina-slate text-xs uppercase tracking-wider">S3 Bucket</span>
            <div class="font-mono text-white mt-0.5 truncate">
              {status.environment.bucketName}
            </div>
          </div>
          <div class="bg-rina-bg/50 rounded-xl p-3">
            <span class="text-rina-slate text-xs uppercase tracking-wider">Node Env</span>
            <div class="font-mono text-white mt-0.5 capitalize">
              {status.environment.nodeEnv}
            </div>
          </div>
        </div>
      </div>

      <!-- Setup Checklist -->
      <div
        class="glass-strong rounded-2xl p-6 mb-6"
        in:fly={{ y: 20, duration: 400, delay: 550 }}
      >
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>✅</span> Setup Checklist
        </h2>
        <div class="space-y-3">
          {#each checklist as item, i}
            <div
              class="flex items-center gap-3 p-3 rounded-xl transition-colors"
              class:bg-emerald-500/10={item.ok}
              class:bg-rina-bg/50={!item.ok}
              in:fade={{ duration: 300, delay: 600 + i * 50 }}
            >
              <div
                class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                class:bg-emerald-500={item.ok}
                class:bg-rina-border={!item.ok}
                class:text-white={item.ok}
              >
                {#if item.ok}
                  ✓
                {:else}
                  {i + 1}
                {/if}
              </div>
              <span class="text-sm" class:text-rina-slate={!item.ok} class:text-white={item.ok}>
                {item.label}
              </span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Footer -->
      <div class="text-center text-xs text-rina-slate-dark" in:fade={{ duration: 300, delay: 800 }}>
        {#if lastRefresh}
          Last refreshed: {lastRefresh.toLocaleTimeString()}
        {/if}
      </div>
    {/if}
  </div>
</div>
