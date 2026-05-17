<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth, isLoading } from '$lib/stores/auth.svelte';
  import { scale, fade } from 'svelte/transition';

  let username = '';
  let password = '';
  let showPassword = false;

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    try {
      await auth.login(username.toLowerCase().trim(), password);
      goto('/');
    } catch {
      // Error handled in store
    }
  }

  $: error = auth.error;
</script>

<div class="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
  <!-- Ambient background glows -->
  <div class="absolute top-1/4 left-1/4 w-64 h-64 bg-rina-rose/10 rounded-full blur-[100px]"></div>
  <div class="absolute bottom-1/4 right-1/4 w-64 h-64 bg-rina-indigo/10 rounded-full blur-[100px]"></div>

  <div
    class="w-full max-w-sm glass-strong rounded-2xl p-8 shadow-2xl"
    in:scale={{ duration: 400, start: 0.9, delay: 100 }}
  >
    <div class="text-center mb-8">
      <h1 class="text-3xl font-bold text-gradient mb-2">Welcome</h1>
      <p class="text-rina-slate text-sm">Project Rina — Private Sanctuary</p>
    </div>

    <form on:submit={handleLogin} class="space-y-5">
      <div>
        <label for="username" class="block text-xs font-medium text-rina-slate mb-1.5 uppercase tracking-wider">
          Username
        </label>
        <input
          id="username"
          type="text"
          bind:value={username}
          placeholder="maroon or rina"
          class="w-full px-4 py-3 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark
            focus:outline-none focus:border-rina-rose/50 focus:ring-1 focus:ring-rina-rose/30 transition-all"
          autocomplete="username"
        />
      </div>

      <div>
        <label for="password" class="block text-xs font-medium text-rina-slate mb-1.5 uppercase tracking-wider">
          Password
        </label>
        <div class="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            placeholder="••••••••"
            class="w-full px-4 py-3 pr-12 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark
              focus:outline-none focus:border-rina-rose/50 focus:ring-1 focus:ring-rina-rose/30 transition-all"
            autocomplete="current-password"
          />
          <button
            type="button"
            on:click={() => (showPassword = !showPassword)}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-rina-slate-dark hover:text-rina-slate transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      {#if error}
        <div class="text-rina-rose text-sm text-center" transition:fade>
          {error}
        </div>
      {/if}

      <button
        type="submit"
        disabled={isLoading}
        class="w-full py-3 rounded-xl bg-gradient-to-r from-rina-rose to-rina-indigo text-white font-semibold
          hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if isLoading}
          <span class="inline-block animate-spin mr-2">⏳</span>
          Entering...
        {:else}
          Enter
        {/if}
      </button>
    </form>

    <div class="mt-6 text-center">
      <p class="text-xs text-rina-slate-dark">
        This space belongs to MarOOn & Rina only.
      </p>
    </div>
  </div>
</div>
