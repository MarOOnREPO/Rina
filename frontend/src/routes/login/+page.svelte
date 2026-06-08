<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth, isLoading } from '$lib/stores/auth.svelte';
  import { scale, fade } from 'svelte/transition';

  let username = $state('');
  let password = $state('');
  let showPassword = $state(false);
  let error = $derived(auth.error);

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    try {
      await auth.login(username.toLowerCase().trim(), password);
      goto('/');
    } catch {
      // Error handled in store
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-rina-bg">
  <!-- Soft romantic background blobs -->
  <div class="absolute top-[-10%] left-[-10%] w-72 h-72 bg-rina-primary/8 rounded-full blur-[80px]"></div>
  <div class="absolute bottom-[-10%] right-[-10%] w-72 h-72 bg-rina-secondary/8 rounded-full blur-[80px]"></div>
  <div class="absolute top-1/3 right-1/4 w-48 h-48 bg-rina-accent/5 rounded-full blur-[60px]"></div>

  <div
    class="w-full max-w-sm"
    in:scale={{ duration: 400, start: 0.95, delay: 100 }}
  >
    <!-- Logo & Branding -->
    <div class="text-center mb-8" in:fade={{ duration: 400, delay: 200 }}>
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-rina-primary to-rina-secondary shadow-glow mb-4">
        <svg
          class="w-9 h-9 text-white"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </div>
      <h1 class="font-display text-3xl font-bold text-gradient-rose mb-1">Welcome back, my love</h1>
      <p class="text-rina-text-secondary text-sm">Your private sanctuary awaits</p>
    </div>

    <!-- Login Card -->
    <div
      class="glass-strong rounded-3xl p-8 shadow-soft-xl border border-rina-border"
      in:scale={{ duration: 400, start: 0.95, delay: 250 }}
    >
      <form onsubmit={handleLogin} class="space-y-5">
        <div>
          <label for="username" class="block text-xs font-semibold text-rina-text-secondary mb-1.5 uppercase tracking-wider">
            Username
          </label>
          <input
            id="username"
            type="text"
            bind:value={username}
            placeholder="maroon or rina"
            class="input"
            autocomplete="username"
          />
        </div>

        <div>
          <label for="password" class="block text-xs font-semibold text-rina-text-secondary mb-1.5 uppercase tracking-wider">
            Password
          </label>
          <div class="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              bind:value={password}
              placeholder="••••••••"
              class="input pr-12"
              autocomplete="current-password"
            />
            <button
              type="button"
              onclick={() => (showPassword = !showPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-rina-text-muted hover:text-rina-text-secondary transition-colors touch-target w-8 h-8 flex items-center justify-center rounded-lg"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {#if showPassword}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              {/if}
            </button>
          </div>
        </div>

        {#if error}
          <div class="flex items-center gap-2 text-rina-error text-sm p-3 rounded-xl bg-rina-error-soft" role="alert" transition:fade>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            <span>{error}</span>
          </div>
        {/if}

        <button
          type="submit"
          disabled={isLoading()}
          class="w-full btn-primary rounded-xl py-3.5 text-base font-semibold shadow-soft hover:shadow-glow active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-soft"
        >
          {#if isLoading()}
            <svg class="inline-block animate-spin mr-2 w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Entering...
          {:else}
            Enter Our Space
          {/if}
        </button>
      </form>
    </div>

    <div class="mt-8 text-center" in:fade={{ duration: 400, delay: 400 }}>
      <p class="text-xs text-rina-text-muted">
        This space belongs to MarOOn & Rina only.
      </p>
      <div class="flex items-center justify-center gap-1 mt-2">
        <svg class="w-3 h-3 text-rina-primary" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
        <span class="text-[10px] text-rina-text-muted font-medium">Forever & Always</span>
        <svg class="w-3 h-3 text-rina-primary" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </div>
    </div>
  </div>
</div>
