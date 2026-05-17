<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade, scale } from 'svelte/transition';
  import { goalApi, type Goal } from '$lib/utils/api';
  import GlassCard from '$lib/components/GlassCard.svelte';

  let goals: Goal[] = $state([]);
  let loading = $state(true);
  let showAdd = $state(false);
  let newGoal: Partial<Goal> = $state({ title: '', targetAmount: 0, currency: 'EUR', icon: '🎯' });

  async function loadGoals() {
    try {
      goals = await goalApi.list();
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  async function addGoal() {
    if (!newGoal.title || !newGoal.targetAmount) return;
    try {
      const goal = await goalApi.create(newGoal);
      goals = [goal, ...goals];
      showAdd = false;
      newGoal = { title: '', targetAmount: 0, currency: 'EUR', icon: '🎯' };
    } catch {
      // handle error
    }
  }

  async function contribute(id: string, amount: number) {
    try {
      const updated = await goalApi.contribute(id, amount);
      goals = goals.map((g) => (g.id === id ? updated : g));
    } catch {
      // handle error
    }
  }

  function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(amount / 100);
  }

  // Redirect if not authenticated (wait for auth loading to finish)
  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
    goto('/login');
    }
  });

  onMount(() => {
    loadGoals();
  });
</script>

{#if isAuthenticated()}
  <div class="max-w-3xl mx-auto px-4 py-6" in:fade>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">🎯 Goals</h2>
      <button
        onclick={() => showAdd = true}
        class="px-4 py-2 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity"
      >
        + New Goal
      </button>
    </div>

    {#if loading}
      <div class="text-center py-12 text-rina-slate">Loading goals...</div>
    {:else if goals.length === 0}
      <GlassCard class="text-center py-12">
        <p class="text-4xl mb-3">🎯</p>
        <p class="text-rina-slate">No goals yet. Start dreaming together.</p>
      </GlassCard>
    {:else}
      <div class="space-y-4">
        {#each goals as goal (goal.id)}
          {@const pct = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))}
          <div in:scale={{ duration: 200, start: 0.95 }}>
          <GlassCard>
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <span class="text-2xl">{goal.icon || '🎯'}</span>
                <div>
                  <p class="font-semibold">{goal.title}</p>
                  <p class="text-xs text-rina-slate">
                    {formatCurrency(goal.currentAmount, goal.currency)} of {formatCurrency(goal.targetAmount, goal.currency)}
                  </p>
                </div>
              </div>
              <span class="text-lg font-bold text-gradient">{pct}%</span>
            </div>

            <!-- Liquid wave progress -->
            <div class="relative h-12 rounded-xl bg-rina-bg overflow-hidden border border-rina-border">
              <svg
                class="absolute bottom-0 left-0 w-full h-full"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <defs>
                  <linearGradient id="liquidGradient-{goal.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#fb7185" />
                    <stop offset="100%" stop-color="#818cf8" />
                  </linearGradient>
                </defs>
                {#if pct > 0}
                  <path
                    d="M0,{100 - pct} Q25,{100 - pct - 3} 50,{100 - pct} T100,{100 - pct} V100 H0 Z"
                    fill="url(#liquidGradient-{goal.id})"
                    opacity="0.6"
                  >
                    <animate
                      attributeName="d"
                      dur="3s"
                      repeatCount="indefinite"
                      values="
                        M0,{100 - pct} Q25,{100 - pct - 3} 50,{100 - pct} T100,{100 - pct} V100 H0 Z;
                        M0,{100 - pct} Q25,{100 - pct + 3} 50,{100 - pct} T100,{100 - pct} V100 H0 Z;
                        M0,{100 - pct} Q25,{100 - pct - 3} 50,{100 - pct} T100,{100 - pct} V100 H0 Z
                      "
                    />
                  </path>
                {/if}
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-xs font-medium text-white drop-shadow">{pct}%</span>
              </div>
            </div>

            <div class="flex gap-2 mt-3">
              <button
                onclick={() => contribute(goal.id, 1000)}
                class="px-3 py-1.5 rounded-lg text-xs bg-rina-rose/20 text-rina-rose hover:bg-rina-rose/30 transition-colors"
              >
                +€10
              </button>
              <button
                onclick={() => contribute(goal.id, 5000)}
                class="px-3 py-1.5 rounded-lg text-xs bg-rina-indigo/20 text-rina-indigo hover:bg-rina-indigo/30 transition-colors"
              >
                +€50
              </button>
              <button
                onclick={() => contribute(goal.id, 10000)}
                class="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                +€100
              </button>
            </div>
          </GlassCard>
          </div>
        {/each}
      </div>
    {/if}

    {#if showAdd}
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade onclick={() => showAdd = false}>
        <div class="glass-strong rounded-2xl p-6 w-full max-w-sm" transition:scale onclick={(e) => e.stopPropagation()}>
          <h3 class="text-lg font-semibold mb-4">New Goal</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-rina-slate mb-1">Title</label>
              <input bind:value={newGoal.title} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Target Amount (cents)</label>
              <input type="number" bind:value={newGoal.targetAmount} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div class="flex gap-2 pt-2">
              <button onclick={() => showAdd = false} class="flex-1 py-2 rounded-lg border border-rina-border text-sm hover:bg-white/5">Cancel</button>
              <button onclick={addGoal} class="flex-1 py-2 rounded-lg bg-rina-rose text-white text-sm font-medium hover:opacity-90">Save</button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
