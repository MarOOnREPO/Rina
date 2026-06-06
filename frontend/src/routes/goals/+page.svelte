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

  // Tab state
  let activeTab = $state<'goals' | 'tricount'>('goals');

  // ─── Tricount State ────────────────────────────────────────────
  interface TricountExpense {
    id: string;
    title: string;
    amount: number; // cents
    paidBy: 'me' | 'partner';
    date: string;
    settled: boolean;
    createdAt: number;
  }

  const TRICOUNT_KEY = 'rina_tricount_expenses_v1';

  let expenses = $state<TricountExpense[]>([]);
  let showExpenseModal = $state(false);
  let expenseTitle = $state('');
  let expenseAmount = $state('');
  let expensePaidBy = $state<'me' | 'partner'>('me');
  let expenseDate = $state('');

  function loadTricount() {
    try {
      const raw = localStorage.getItem(TRICOUNT_KEY);
      if (raw) expenses = JSON.parse(raw);
    } catch {
      expenses = [];
    }
  }

  function saveTricount() {
    try {
      localStorage.setItem(TRICOUNT_KEY, JSON.stringify(expenses));
    } catch {
      // ignore
    }
  }

  function addExpense() {
    const amount = parseFloat(expenseAmount);
    if (!expenseTitle.trim() || isNaN(amount) || amount <= 0) {
      error = 'Title and a valid amount are required';
      return;
    }
    const expense: TricountExpense = {
      id: crypto.randomUUID(),
      title: expenseTitle.trim(),
      amount: Math.round(amount * 100),
      paidBy: expensePaidBy,
      date: expenseDate || new Date().toISOString().slice(0, 10),
      settled: false,
      createdAt: Date.now(),
    };
    expenses = [expense, ...expenses];
    closeExpenseModal();
    error = '';
  }

  function closeExpenseModal() {
    showExpenseModal = false;
    expenseTitle = '';
    expenseAmount = '';
    expensePaidBy = 'me';
    expenseDate = '';
    error = '';
  }

  function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    expenses = expenses.filter((e) => e.id !== id);
  }

  function settleUp() {
    if (!confirm('Settle up? This will mark all expenses as settled.')) return;
    expenses = expenses.map((e) => ({ ...e, settled: true }));
  }

  function clearSettled() {
    if (!confirm('Clear all settled expenses from history?')) return;
    expenses = expenses.filter((e) => !e.settled);
  }

  let unsettledExpenses = $derived(expenses.filter((e) => !e.settled));
  let settledExpenses = $derived(expenses.filter((e) => e.settled));

  let mePaid = $derived(
    unsettledExpenses.filter((e) => e.paidBy === 'me').reduce((sum, e) => sum + e.amount, 0)
  );
  let partnerPaid = $derived(
    unsettledExpenses.filter((e) => e.paidBy === 'partner').reduce((sum, e) => sum + e.amount, 0)
  );

  // Positive = partner owes me, negative = I owe partner
  let balance = $derived(Math.round((partnerPaid - mePaid) / 2));

  $effect(() => {
    saveTricount();
  });

  // ─── Goals (existing) ──────────────────────────────────────────
  let showAddModal = $state(false);
  let showContributeModal = $state(false);
  let editingGoal: Goal | null = $state(null);
  let contributingGoal: Goal | null = $state(null);

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
    loadTricount();
  });
</script>

{#if isAuthenticated()}
  <div class="px-3 py-4 space-y-4" in:fade>
    <!-- Header with tabs -->
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">🎯 Goals</h2>
      {#if activeTab === 'goals'}
        <button
          onclick={() => { resetForm(); showAddModal = true; }}
          class="touch-target px-4 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_12px_rgba(244,114,182,0.25)]"
        >
          + New
        </button>
      {:else}
        <button
          onclick={() => { showExpenseModal = true; }}
          class="touch-target px-4 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_12px_rgba(244,114,182,0.25)]"
        >
          + Expense
        </button>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="flex p-1 rounded-xl bg-white/5 border border-rina-border">
      <button
        onclick={() => { activeTab = 'goals'; error = ''; }}
        class="flex-1 touch-target py-2.5 rounded-lg text-sm font-bold transition-all duration-200
          {activeTab === 'goals'
            ? 'bg-rina-rose/15 text-rina-rose shadow-[0_0_12px_rgba(244,114,182,0.2)]'
            : 'text-white/50 hover:text-white/80'}"
      >
        Goals
      </button>
      <button
        onclick={() => { activeTab = 'tricount'; error = ''; }}
        class="flex-1 touch-target py-2.5 rounded-lg text-sm font-bold transition-all duration-200
          {activeTab === 'tricount'
            ? 'bg-rina-rose/15 text-rina-rose shadow-[0_0_12px_rgba(244,114,182,0.2)]'
            : 'text-white/50 hover:text-white/80'}"
      >
        Tricount
      </button>
    </div>

    {#if error}
      <div class="glass rounded-xl p-3 text-rina-rose text-sm font-medium" transition:fly={{ y: -10 }}>
        {error}
      </div>
    {/if}

    {#if activeTab === 'goals'}
      <!-- ─── Goals View ────────────────────────────────────────── -->
      {#if loading}
        <div class="text-center py-12 text-white/50 font-medium">Loading goals...</div>
      {:else if goals.length === 0}
        <GlassCard class="text-center py-12">
          <p class="text-4xl mb-3">🎯</p>
          <p class="text-white/50 font-medium">No goals yet. Start dreaming together.</p>
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
                      <h3 class="font-bold text-sm truncate pr-4 text-white/90">{goal.title}</h3>
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

                    <div class="flex items-center justify-between text-[11px] text-white/60 mb-2 font-medium">
                      <span>{formatCurrency(goal.currentAmount, goal.currency)} of {formatCurrency(goal.targetAmount, goal.currency)}</span>
                      {#if !isComplete && remaining > 0}
                        <span>{formatCurrency(remaining, goal.currency)} left</span>
                      {/if}
                    </div>

                    <!-- Meta row -->
                    <div class="flex items-center gap-2 flex-wrap">
                      {#if goal.deadline}
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/50 font-medium">
                          📅 {formatDate(goal.deadline)}
                          {#if daysLeft !== null && daysLeft > 0 && !isComplete}
                            <span class="text-rina-rose font-bold">({daysLeft}d)</span>
                          {:else if daysLeft !== null && daysLeft <= 0 && !isComplete}
                            <span class="text-red-400 font-bold">(overdue)</span>
                          {/if}
                        </span>
                      {/if}

                      {#if !isComplete}
                        <button
                          onclick={() => openContribute(goal)}
                          class="touch-target text-[10px] px-2 py-1 rounded-full bg-rina-rose/20 text-rina-rose font-bold hover:bg-rina-rose/30 active:scale-95 transition-all"
                        >
                          + Contribute
                        </button>
                      {/if}

                      <button
                        onclick={() => openEdit(goal)}
                        class="touch-target text-[10px] px-2 py-1 rounded-full bg-white/5 text-white/60 font-medium hover:bg-white/10 hover:text-white/90 active:scale-95 transition-all"
                      >
                        Edit
                      </button>

                      <button
                        onclick={() => deleteGoal(goal.id)}
                        class="touch-target text-[10px] px-2 py-1 rounded-full bg-red-500/10 text-red-400 font-medium hover:bg-red-500/20 active:scale-95 transition-all"
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
            <h3 class="text-lg font-bold mb-4 text-white">{editingGoal ? 'Edit Goal' : 'New Goal'}</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-xs text-white/60 mb-1 font-medium">Title</label>
                <input bind:value={formTitle} placeholder="e.g. Trip to Japan" class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 font-medium" />
              </div>
              <div>
                <label class="block text-xs text-white/60 mb-1 font-medium">Target Amount</label>
                <div class="flex gap-2">
                  <input type="number" min="0.01" step="0.01" bind:value={formTargetAmount} placeholder="1000" class="input-safe flex-1 px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 font-medium" />
                  <select bind:value={formCurrency} class="input-safe px-2 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 font-medium">
                    {#each currencies as c}
                      <option value={c}>{c}</option>
                    {/each}
                  </select>
                </div>
                <p class="text-[10px] text-white/40 mt-1">Enter amount in whole units (e.g. 1000 for €1000)</p>
              </div>
              <div>
                <label class="block text-xs text-white/60 mb-1 font-medium">Deadline</label>
                <input type="date" bind:value={formDeadline} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 font-medium" />
              </div>
              <div>
                <label class="block text-xs text-white/60 mb-1 font-medium">Icon</label>
                <div class="flex gap-2 flex-wrap">
                  {#each icons as icon}
                    <button
                      onclick={() => formIcon = icon}
                      class="touch-target w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all {formIcon === icon ? 'bg-rina-rose/20 ring-1 ring-rina-rose shadow-[0_0_8px_rgba(244,114,182,0.2)]' : 'bg-white/5 hover:bg-white/10 active:scale-95'}"
                    >
                      {icon}
                    </button>
                  {/each}
                </div>
              </div>
              <div class="flex gap-2 pt-2">
                <button onclick={() => showAddModal = false} class="touch-target flex-1 py-2.5 rounded-xl border border-rina-border text-sm font-semibold text-white/70 hover:bg-white/5 active:scale-95 transition-all">Cancel</button>
                <button onclick={saveGoal} class="touch-target flex-1 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_12px_rgba(244,114,182,0.25)]">Save</button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Contribute Modal -->
      {#if showContributeModal && contributingGoal}
        <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" transition:fade role="button" tabindex="0" onclick={() => showContributeModal = false} onkeydown={(e) => e.key === 'Escape' && (showContributeModal = false)}>
          <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-sm" transition:scale onclick={(e) => e.stopPropagation()}>
            <h3 class="text-lg font-bold mb-1 text-white">Contribute</h3>
            <p class="text-xs text-white/60 mb-4 font-medium">{contributingGoal.title}</p>

            <div class="space-y-3">
              <!-- Quick amounts -->
              <div class="grid grid-cols-3 gap-2">
                {#each [10, 50, 100] as amt}
                  <button
                    onclick={() => contributeAmount = amt.toString()}
                    class="touch-target py-2.5 rounded-xl text-sm font-semibold bg-white/5 hover:bg-white/10 active:scale-95 transition-all {contributeAmount === amt.toString() ? 'ring-1 ring-rina-rose shadow-[0_0_8px_rgba(244,114,182,0.15)]' : ''}"
                  >
                    {new Intl.NumberFormat('en-GB', { style: 'currency', currency: contributingGoal.currency, maximumFractionDigits: 0 }).format(amt)}
                  </button>
                {/each}
              </div>

              <!-- Custom amount -->
              <div>
                <label class="block text-xs text-white/60 mb-1 font-medium">Custom Amount</label>
                <div class="flex gap-2">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    bind:value={contributeAmount}
                    placeholder="Enter amount..."
                    class="input-safe flex-1 px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 font-medium"
                  />
                  <span class="px-3 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-medium">{contributingGoal.currency}</span>
                </div>
              </div>

              <div class="flex gap-2 pt-2">
                <button onclick={() => showContributeModal = false} class="touch-target flex-1 py-2.5 rounded-xl border border-rina-border text-sm font-semibold text-white/70 hover:bg-white/5 active:scale-95 transition-all">Cancel</button>
                <button onclick={handleContribute} class="touch-target flex-1 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_12px_rgba(244,114,182,0.25)]">Add</button>
              </div>
            </div>
          </div>
        </div>
      {/if}

    {:else}
      <!-- ─── Tricount View ─────────────────────────────────────── -->
      {#if unsettledExpenses.length === 0 && settledExpenses.length === 0}
        <GlassCard class="text-center py-12">
          <p class="text-4xl mb-3">💰</p>
          <p class="text-white/50 font-medium">No shared expenses yet.</p>
          <p class="text-white/40 text-xs mt-1">Tap + Expense to add one.</p>
        </GlassCard>
      {:else}
        <!-- Balance Card -->
        <GlassCard class="relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 bg-rina-rose/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div class="relative">
            <p class="text-xs font-bold text-white/50 uppercase tracking-wider mb-1">Current Balance</p>
            {#if balance === 0}
              <p class="text-2xl font-bold text-emerald-400">All settled up 💚</p>
              <p class="text-xs text-white/50 mt-1">No one owes anything</p>
            {:else if balance > 0}
              <p class="text-2xl font-bold text-emerald-400">Partner owes you {formatCurrency(Math.abs(balance), 'EUR')}</p>
              <p class="text-xs text-white/50 mt-1">You're ahead on shared expenses</p>
            {:else}
              <p class="text-2xl font-bold text-rina-rose">You owe {formatCurrency(Math.abs(balance), 'EUR')}</p>
              <p class="text-xs text-white/50 mt-1">Time to settle up!</p>
            {/if}

            <div class="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
              <div class="flex-1">
                <p class="text-[10px] text-white/40 font-bold uppercase tracking-wider">You paid</p>
                <p class="text-sm font-bold text-white/80">{formatCurrency(mePaid, 'EUR')}</p>
              </div>
              <div class="flex-1">
                <p class="text-[10px] text-white/40 font-bold uppercase tracking-wider">Partner paid</p>
                <p class="text-sm font-bold text-white/80">{formatCurrency(partnerPaid, 'EUR')}</p>
              </div>
              <div class="flex-1">
                <p class="text-[10px] text-white/40 font-bold uppercase tracking-wider">Total</p>
                <p class="text-sm font-bold text-white/80">{formatCurrency(mePaid + partnerPaid, 'EUR')}</p>
              </div>
            </div>

            {#if balance !== 0}
              <button
                onclick={settleUp}
                class="mt-4 w-full touch-target py-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 text-sm font-bold hover:bg-emerald-500/25 active:scale-95 transition-all border border-emerald-500/20"
              >
                ✅ Settle Up
              </button>
            {/if}
          </div>
        </GlassCard>

        <!-- Unsettled Expenses -->
        {#if unsettledExpenses.length > 0}
          <div class="space-y-2">
            <div class="flex items-center justify-between px-1">
              <h3 class="text-sm font-bold text-white/70">Unsettled ({unsettledExpenses.length})</h3>
              <span class="text-xs text-white/40 font-medium">Each share: 50%</span>
            </div>
            {#each unsettledExpenses as expense (expense.id)}
              <div in:scale={{ duration: 200, start: 0.95 }}>
                <GlassCard class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 {expense.paidBy === 'me' ? 'bg-cyan-500/15' : 'bg-rina-rose/15'}">
                    {expense.paidBy === 'me' ? '👤' : '❤️'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                      <p class="text-sm font-bold text-white/90 truncate pr-2">{expense.title}</p>
                      <p class="text-sm font-bold text-white">{formatCurrency(expense.amount, 'EUR')}</p>
                    </div>
                    <div class="flex items-center justify-between mt-0.5">
                      <div class="flex items-center gap-2">
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold {expense.paidBy === 'me' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-rina-rose/15 text-rina-rose'}">
                          Paid by {expense.paidBy === 'me' ? 'you' : 'partner'}
                        </span>
                        <span class="text-[10px] text-white/40 font-medium">{formatDate(expense.date)}</span>
                      </div>
                      <span class="text-[10px] text-white/50 font-medium">{formatCurrency(Math.round(expense.amount / 2), 'EUR')} each</span>
                    </div>
                  </div>
                  <button
                    onclick={() => deleteExpense(expense.id)}
                    class="touch-target w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 active:scale-95 transition-all shrink-0"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </GlassCard>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Settled Expenses -->
        {#if settledExpenses.length > 0}
          <div class="space-y-2">
            <div class="flex items-center justify-between px-1">
              <h3 class="text-sm font-bold text-white/40">Settled History</h3>
              <button
                onclick={clearSettled}
                class="text-[10px] text-red-400/70 hover:text-red-400 font-medium transition-colors"
              >
                Clear history
              </button>
            </div>
            {#each settledExpenses as expense (expense.id)}
              <div in:scale={{ duration: 200, start: 0.95 }}>
                <GlassCard class="flex items-center gap-3 opacity-60 hover:opacity-80 transition-opacity">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 bg-white/5">
                    ✅
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                      <p class="text-sm font-medium text-white/60 truncate pr-2">{expense.title}</p>
                      <p class="text-sm font-medium text-white/60">{formatCurrency(expense.amount, 'EUR')}</p>
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-[10px] text-white/30 font-medium">{formatDate(expense.date)}</span>
                      <span class="text-[10px] text-white/30 font-medium">• Paid by {expense.paidBy === 'me' ? 'you' : 'partner'}</span>
                    </div>
                  </div>
                  <button
                    onclick={() => deleteExpense(expense.id)}
                    class="touch-target w-8 h-8 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all shrink-0"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </GlassCard>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      <!-- Add Expense Modal -->
      {#if showExpenseModal}
        <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" transition:fade role="button" tabindex="0" onclick={() => showExpenseModal = false} onkeydown={(e) => e.key === 'Escape' && (showExpenseModal = false)}>
          <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-sm" transition:scale onclick={(e) => e.stopPropagation()}>
            <h3 class="text-lg font-bold mb-4 text-white">Add Expense</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-xs text-white/60 mb-1 font-medium">Title</label>
                <input bind:value={expenseTitle} placeholder="e.g. Groceries" class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 font-medium" />
              </div>
              <div>
                <label class="block text-xs text-white/60 mb-1 font-medium">Amount</label>
                <div class="flex gap-2">
                  <input type="number" min="0.01" step="0.01" bind:value={expenseAmount} placeholder="0.00" class="input-safe flex-1 px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 font-medium" />
                  <span class="px-3 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-medium">EUR</span>
                </div>
              </div>
              <div>
                <label class="block text-xs text-white/60 mb-1 font-medium">Who Paid?</label>
                <div class="flex gap-2">
                  <button
                    onclick={() => expensePaidBy = 'me'}
                    class="flex-1 touch-target py-2.5 rounded-xl text-sm font-bold transition-all
                      {expensePaidBy === 'me'
                        ? 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-400/30 shadow-[0_0_8px_rgba(34,211,238,0.15)]'
                        : 'bg-white/5 text-white/50 hover:bg-white/5 hover:text-white/70'}"
                  >
                    👤 Me
                  </button>
                  <button
                    onclick={() => expensePaidBy = 'partner'}
                    class="flex-1 touch-target py-2.5 rounded-xl text-sm font-bold transition-all
                      {expensePaidBy === 'partner'
                        ? 'bg-rina-rose/15 text-rina-rose ring-1 ring-rina-rose/30 shadow-[0_0_8px_rgba(244,114,182,0.15)]'
                        : 'bg-white/5 text-white/50 hover:bg-white/5 hover:text-white/70'}"
                  >
                    ❤️ Partner
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-xs text-white/60 mb-1 font-medium">Date</label>
                <input type="date" bind:value={expenseDate} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 font-medium" />
              </div>
              <div class="flex gap-2 pt-2">
                <button onclick={() => showExpenseModal = false} class="touch-target flex-1 py-2.5 rounded-xl border border-rina-border text-sm font-semibold text-white/70 hover:bg-white/5 active:scale-95 transition-all">Cancel</button>
                <button onclick={addExpense} class="touch-target flex-1 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_12px_rgba(244,114,182,0.25)]">Add</button>
              </div>
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
{/if}
