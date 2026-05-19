<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade, scale, fly } from 'svelte/transition';
  import { goalApi, type Goal } from '$lib/utils/api';
  import GlassCard from '$lib/components/GlassCard.svelte';
import { globalSync } from '$lib/stores/socket.svelte';

  let goals: Goal[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  // Modal states
  let showAddModal = $state(false);
  let showContributeModal = $state(false);
  let editingGoal: Goal | null = $state(null);
  let contributingGoal: Goal | null = $state(null);

  // Form states — use explicit string states for inputs, parse on save
  let formTitle = $state('');
  let formTargetAmount = $state('');
  let formCurrency = $state('EUR');
  let formIcon = $state('🎯');
  let formDeadline = $state('');
  let contributeAmount = $state('');

  const currencies = ['EUR', 'USD', 'GBP', 'MAD', 'RUB'];
  const icons = ['🎯', '✈️', '🏠', '🚗', '🎁', '💍', '📱', '💻', '🪑', '🐕', '🐱', '🌴'];

  async function loadGoals() {
    loading = true;
    error = '';
    try {
      goals = await goalApi.list();
    } catch (err) {
      error = 'Failed to load goals';
      console.error('[Goals]', err);
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    formTitle = '';
    formTargetAmount = '';
    formCurrency = 'EUR';
    formIcon = '🎯';
    formDeadline = '';
    editingGoal = null;
    error = '';
  }

  async function saveGoal() {
    const target = parseFloat(formTargetAmount);
    if (!formTitle.trim() || isNaN(target) || target <= 0) {
      error = 'Title and a valid target amount are required';
      return;
    }
    error = '';

    const payload: Partial<Goal> = {
      title: formTitle.trim(),
      targetAmount: Math.round(target * 100),
      currency: formCurrency,
      icon: formIcon,
      deadline: formDeadline || undefined
    };

    try {
      if (editingGoal) {
        const updated = await goalApi.update(editingGoal.id, payload);
        goals = goals.map((g) => (g.id === updated.id ? updated : g));
      } else {
        const goal = await goalApi.create(payload);
        goals = [goal, ...goals];
      }
      showAddModal = false;
      resetForm();
    } catch (err) {
      error = editingGoal ? 'Failed to update goal' : 'Failed to create goal';
      console.error('[Goals]', err);
    }
  }

  async function deleteGoal(id: string) {
    if (!confirm('Delete this goal?')) return;
    try {
      await goalApi.remove(id);
      goals = goals.filter((g) => g.id !== id);
    } catch (err) {
      error = 'Failed to delete goal';
      console.error('[Goals]', err);
    }
  }

  async function contribute(id: string, amountCents: number) {
    try {
      const updated = await goalApi.contribute(id, amountCents);
      goals = goals.map((g) => (g.id === id ? updated : g));
      showContributeModal = false;
      contributingGoal = null;
      contributeAmount = '';
    } catch (err) {
      error = 'Failed to contribute';
      console.error('[Goals]', err);
    }
  }

  function handleContribute() {
    if (!contributingGoal || !contributeAmount) return;
    const amount = parseFloat(contributeAmount);
    if (isNaN(amount) || amount <= 0) {
      error = 'Enter a valid amount';
      return;
    }
    error = '';
    contribute(contributingGoal.id, Math.round(amount * 100));
  }

  function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(amount / 100);
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function daysUntil(dateStr?: string): number | null {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function getProgressPct(current: number, target: number): number {
    if (target <= 0) return 0;
    const pct = (current / target) * 100;
    return Math.min(100, Math.max(0, pct));
  }

  function openEdit(goal: Goal) {
    editingGoal = goal;
    formTitle = goal.title;
    formTargetAmount = (goal.targetAmount / 100).toString();
    formCurrency = goal.currency;
    formIcon = goal.icon || '🎯';
    formDeadline = goal.deadline ? goal.deadline.slice(0, 10) : '';
    showAddModal = true;
  }

  function openContribute(goal: Goal) {
    contributingGoal = goal;
    contributeAmount = '';
    showContributeModal = true;
  }

  // Sort: incomplete first, then by deadline
  let sortedGoals = $derived(
    [...goals].sort((a, b) => {
      const aDone = a.currentAmount >= a.targetAmount;
      const bDone = b.currentAmount >= b.targetAmount;
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      return 0;
    })
  );

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  $effect(() => {
    const update = globalSync.lastUpdate;
    if (update && (update.type === 'goal' || update.type === 'goals')) {
      loadGoals();
    }
  });

  onMount(() => {
    loadGoals();
  });
</script>

{#if isAuthenticated()}
  <div class="px-3 py-4 space-y-4" in:fade>
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">🎯 Goals</h2>
      <button
        onclick={() => { resetForm(); showAddModal = true; }}
        class="touch-target px-4 py-2 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity"
      >
        + New
      </button>
    </div>

    {#if error}
      <div class="glass rounded-xl p-3 text-rina-rose text-sm" transition:fly={{ y: -10 }}>
        {error}
      </div>
    {/if}

    {#if loading}
      <div class="text-center py-12 text-rina-slate">Loading goals...</div>
    {:else if goals.length === 0}
      <GlassCard class="text-center py-12">
        <p class="text-4xl mb-3">🎯</p>
        <p class="text-rina-slate">No goals yet. Start dreaming together.</p>
      </GlassCard>
    {:else}
      <div class="space-y-3">
        {#each sortedGoals as goal (goal.id)}
          {@const pct = getProgressPct(goal.currentAmount, goal.targetAmount)}
          {@const isComplete = pct >= 100}
          {@const remaining = goal.targetAmount - goal.currentAmount}
          {@const daysLeft = daysUntil(goal.deadline)}
          <div in:scale={{ duration: 200, start: 0.95 }}>
            <GlassCard class="relative overflow-hidden">
              {#if isComplete}
                <div class="absolute top-2 right-2 text-lg" title="Completed!">🏆</div>
              {/if}

              <div class="flex items-start gap-3">
                <div class="text-2xl shrink-0">{goal.icon || '🎯'}</div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1.5">
                    <h3 class="font-semibold text-sm truncate pr-4">{goal.title}</h3>
                    <span class="text-sm font-bold shrink-0 {isComplete ? 'text-emerald-400' : 'text-gradient'}">
                      {Math.floor(pct)}%
                    </span>
                  </div>

                  <!-- Progress bar -->
                  <div class="h-2.5 rounded-full bg-white/10 overflow-hidden mb-2">
                    <div
                      class="h-full rounded-full transition-all duration-700 ease-out {isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-rina-rose to-rina-indigo'}"
                      style="width: {pct}%"
                    ></div>
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-rina-slate mb-2">
                    <span>{formatCurrency(goal.currentAmount, goal.currency)} of {formatCurrency(goal.targetAmount, goal.currency)}</span>
                    {#if !isComplete && remaining > 0}
                      <span>{formatCurrency(remaining, goal.currency)} left</span>
                    {/if}
                  </div>

                  <!-- Meta row -->
                  <div class="flex items-center gap-2 flex-wrap">
                    {#if goal.deadline}
                      <span class="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-rina-slate">
                        📅 {formatDate(goal.deadline)}
                        {#if daysLeft !== null && daysLeft > 0 && !isComplete}
                          <span class="text-rina-rose">({daysLeft}d)</span>
                        {:else if daysLeft !== null && daysLeft <= 0 && !isComplete}
                          <span class="text-red-400">(overdue)</span>
                        {/if}
                      </span>
                    {/if}

                    {#if !isComplete}
                      <button
                        onclick={() => openContribute(goal)}
                        class="touch-target text-[10px] px-2 py-0.5 rounded-full bg-rina-rose/20 text-rina-rose hover:bg-rina-rose/30 transition-colors"
                      >
                        + Contribute
                      </button>
                    {/if}

                    <button
                      onclick={() => openEdit(goal)}
                      class="touch-target text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-rina-slate hover:bg-white/10 transition-colors"
                    >
                      Edit
                    </button>

                    <button
                      onclick={() => deleteGoal(goal.id)}
                      class="touch-target text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Add/Edit Modal -->
    {#if showAddModal}
      <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" transition:fade role="button" tabindex="0" onclick={() => showAddModal = false} onkeydown={(e) => e.key === 'Escape' && (showAddModal = false)}>
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" transition:scale onclick={(e) => e.stopPropagation()}>
          <h3 class="text-lg font-semibold mb-4">{editingGoal ? 'Edit Goal' : 'New Goal'}</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-rina-slate mb-1">Title</label>
              <input bind:value={formTitle} placeholder="e.g. Trip to Japan" class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Target Amount</label>
              <div class="flex gap-2">
                <input type="number" min="0.01" step="0.01" bind:value={formTargetAmount} placeholder="1000" class="input-safe flex-1 px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
                <select bind:value={formCurrency} class="input-safe px-2 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50">
                  {#each currencies as c}
                    <option value={c}>{c}</option>
                  {/each}
                </select>
              </div>
              <p class="text-[10px] text-rina-slate-dark mt-1">Enter amount in whole units (e.g. 1000 for €1000)</p>
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Deadline</label>
              <input type="date" bind:value={formDeadline} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Icon</label>
              <div class="flex gap-2 flex-wrap">
                {#each icons as icon}
                  <button
                    onclick={() => formIcon = icon}
                    class="touch-target w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-colors {formIcon === icon ? 'bg-rina-rose/20 ring-1 ring-rina-rose' : 'bg-white/5 hover:bg-white/10'}"
                  >
                    {icon}
                  </button>
                {/each}
              </div>
            </div>
            <div class="flex gap-2 pt-2">
              <button onclick={() => showAddModal = false} class="touch-target flex-1 py-2.5 rounded-xl border border-rina-border text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button onclick={saveGoal} class="touch-target flex-1 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Contribute Modal -->
    {#if showContributeModal && contributingGoal}
      <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" transition:fade role="button" tabindex="0" onclick={() => showContributeModal = false} onkeydown={(e) => e.key === 'Escape' && (showContributeModal = false)}>
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-sm" transition:scale onclick={(e) => e.stopPropagation()}>
          <h3 class="text-lg font-semibold mb-1">Contribute</h3>
          <p class="text-xs text-rina-slate mb-4">{contributingGoal.title}</p>

          <div class="space-y-3">
            <!-- Quick amounts -->
            <div class="grid grid-cols-3 gap-2">
              {#each [10, 50, 100] as amt}
                <button
                  onclick={() => contributeAmount = amt.toString()}
                  class="touch-target py-2.5 rounded-xl text-sm bg-white/5 hover:bg-white/10 transition-colors {contributeAmount === amt.toString() ? 'ring-1 ring-rina-rose' : ''}"
                >
                  {new Intl.NumberFormat('en-GB', { style: 'currency', currency: contributingGoal.currency, maximumFractionDigits: 0 }).format(amt)}
                </button>
              {/each}
            </div>

            <!-- Custom amount -->
            <div>
              <label class="block text-xs text-rina-slate mb-1">Custom Amount</label>
              <div class="flex gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  bind:value={contributeAmount}
                  placeholder="Enter amount..."
                  class="input-safe flex-1 px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50"
                />
                <span class="px-3 py-2.5 rounded-xl bg-white/5 text-rina-slate text-sm">{contributingGoal.currency}</span>
              </div>
            </div>

            <div class="flex gap-2 pt-2">
              <button onclick={() => showContributeModal = false} class="touch-target flex-1 py-2.5 rounded-xl border border-rina-border text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button onclick={handleContribute} class="touch-target flex-1 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity">Add</button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
