<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { cycleApi, type CycleEntry } from '$lib/utils/api';
  import { fade, fly, slide } from 'svelte/transition';

  let entries = $state<CycleEntry[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingId = $state<string | null>(null);

  let date = $state(new Date().toISOString().split('T')[0]);
  let flowIntensity = $state<number | undefined>(undefined);
  let symptoms = $state<string[]>([]);
  let temperature = $state<number | undefined>(undefined);
  let notes = $state('');

  const symptomOptions = ['Cramps', 'Bloating', 'Headache', 'Mood swings', 'Fatigue', 'Acne', 'Cravings', 'Insomnia', 'Backache', 'Nausea'];
  const flowLabels = ['None', 'Light', 'Medium', 'Heavy', 'Very Heavy'];
  const flowColors = [
    'bg-rina-surface-muted',
    'bg-rose-200',
    'bg-rose-300',
    'bg-rose-400',
    'bg-rose-500'
  ];

  // Calendar state
  let currentMonth = $state(new Date());
  let calendarYear = $derived(currentMonth.getFullYear());
  let calendarMonth = $derived(currentMonth.getMonth());
  let monthName = $derived(currentMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' }));
  let firstDayOfMonth = $derived(new Date(calendarYear, calendarMonth, 1).getDay());
  let daysInMonth = $derived(new Date(calendarYear, calendarMonth + 1, 0).getDate());
  let calendarDays = $derived(Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDayOfMonth + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return dayNum;
  }));

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear();

  async function loadEntries() {
    try {
      const data = await cycleApi.list();
      entries = Array.isArray(data) ? data : (data as unknown as { entries: CycleEntry[] }).entries || [];
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  function getEntryForDate(dateStr: string): CycleEntry | undefined {
    return entries.find((e) => e.date.startsWith(dateStr));
  }

  function resetForm() {
    date = new Date().toISOString().split('T')[0];
    flowIntensity = undefined;
    symptoms = [];
    temperature = undefined;
    notes = '';
    editingId = null;
  }

  function editEntry(entry: CycleEntry) {
    editingId = entry.id;
    date = entry.date.split('T')[0];
    flowIntensity = entry.flowIntensity ?? undefined;
    symptoms = entry.symptoms || [];
    temperature = entry.temperature ?? undefined;
    notes = entry.notes || '';
    showForm = true;
  }

  async function saveEntry() {
    try {
      const data = {
        date,
        flowIntensity,
        symptoms,
        temperature,
        notes: notes || undefined
      };
      if (editingId) {
        await cycleApi.update(editingId, data);
      } else {
        await cycleApi.create(data);
      }
      await loadEntries();
      showForm = false;
      resetForm();
    } catch {
      alert('Failed to save');
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this entry?')) return;
    try {
      await cycleApi.remove(id);
      entries = entries.filter((e) => e.id !== id);
    } catch {
      alert('Failed to delete');
    }
  }

  function toggleSymptom(s: string) {
    if (symptoms.includes(s)) {
      symptoms = symptoms.filter((x) => x !== s);
    } else {
      symptoms = [...symptoms, s];
    }
  }

  function getPhase(entry?: CycleEntry): { label: string; colorClass: string; emoji: string; bgClass: string } {
    if (!entry) return { label: 'No data', colorClass: 'text-rina-text-muted', emoji: '🌸', bgClass: 'bg-rina-surface-muted' };
    const intensity = entry.flowIntensity ?? 0;
    if (intensity >= 3) return { label: 'Period', colorClass: 'text-rose-600', emoji: '🩸', bgClass: 'bg-rose-50' };
    if (intensity === 2) return { label: 'Period', colorClass: 'text-rose-500', emoji: '🩸', bgClass: 'bg-rose-50' };
    if (intensity === 1) return { label: 'Spotting', colorClass: 'text-rose-400', emoji: '💧', bgClass: 'bg-rose-50' };
    return { label: 'Follicular', colorClass: 'text-rina-primary', emoji: '🌱', bgClass: 'bg-rina-primary-soft' };
  }

  function getDayIndicator(day: number): { intensity?: number; hasEntry: boolean } {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = getEntryForDate(dateStr);
    return { intensity: entry?.flowIntensity, hasEntry: !!entry };
  }

  function prevMonth() {
    currentMonth = new Date(calendarYear, calendarMonth - 1, 1);
  }

  function nextMonth() {
    currentMonth = new Date(calendarYear, calendarMonth + 1, 1);
  }

  // Temperature chart data for current entries
  let tempChartData = $derived(
    [...entries]
      .filter((e) => e.temperature !== undefined && e.temperature !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14)
  );

  let minTemp = $derived(tempChartData.length > 0 ? Math.min(...tempChartData.map((e) => e.temperature!)) - 0.2 : 36);
  let maxTemp = $derived(tempChartData.length > 0 ? Math.max(...tempChartData.map((e) => e.temperature!)) + 0.2 : 38);

  // Today's entry
  let todayEntry = $derived(getEntryForDate(new Date().toISOString().split('T')[0]));
  let todayPhase = $derived(getPhase(todayEntry));

  onMount(() => {
    loadEntries();
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

{#if isAuthenticated()}
  <div class="h-full flex flex-col bg-rina-bg overflow-y-auto" in:fade={{ duration: 200 }}>
    <div class="px-4 md:px-8 py-4 md:py-8 space-y-4 max-w-7xl mx-auto w-full">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-rina-text font-display">🌙 Cycle Tracker</h1>
          <p class="text-xs text-rina-text-muted mt-0.5">Track your cycle with love & care</p>
        </div>
        <button
          onclick={() => { showForm = !showForm; if (!showForm) resetForm(); }}
          class="btn-secondary text-xs px-4 py-2"
        >
          {showForm ? 'Cancel' : '+ Entry'}
        </button>
      </div>

      <!-- Today's Phase Card -->
      <div class="card-elevated p-4 flex items-center gap-4">
        <div class="w-14 h-14 rounded-2xl {todayPhase.bgClass} flex items-center justify-center text-2xl shrink-0">
          {todayPhase.emoji}
        </div>
        <div class="flex-1">
          <p class="text-xs text-rina-text-muted font-medium uppercase tracking-wider">Today</p>
          <p class="text-lg font-semibold text-rina-text font-display">{todayPhase.label}</p>
          {#if todayEntry}
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              {#if todayEntry.flowIntensity !== undefined}
                <span class="badge-primary text-[10px]">{flowLabels[todayEntry.flowIntensity]}</span>
              {/if}
              {#if todayEntry.temperature}
                <span class="badge bg-orange-50 text-orange-600 text-[10px]">🌡️ {todayEntry.temperature}°C</span>
              {/if}
            </div>
          {:else}
            <p class="text-xs text-rina-text-muted mt-0.5">No entry yet today</p>
          {/if}
        </div>
      </div>

      <!-- Mini Calendar -->
      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <button onclick={prevMonth} aria-label="Previous month" class="w-9 h-9 rounded-xl bg-rina-surface-muted flex items-center justify-center hover:bg-rina-primary-soft transition-all duration-200 text-rina-text-secondary hover:text-rina-primary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <h3 class="text-sm font-semibold text-rina-text font-display">{monthName}</h3>
          <button onclick={nextMonth} aria-label="Next month" class="w-9 h-9 rounded-xl bg-rina-surface-muted flex items-center justify-center hover:bg-rina-primary-soft transition-all duration-200 text-rina-text-secondary hover:text-rina-primary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="grid grid-cols-7 gap-1 mb-1">
          {#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day}
            <div class="text-center text-[10px] font-semibold text-rina-text-muted py-1.5">{day}</div>
          {/each}
        </div>
        <div class="grid grid-cols-7 gap-1">
          {#each calendarDays as day}
            {#if day}
              {@const indicator = getDayIndicator(day)}
              <button
                onclick={() => { date = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; showForm = true; }}
                class="relative aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5
                  hover:bg-rina-surface-muted transition-all duration-200 text-xs font-medium
                  {isToday(day) ? 'ring-2 ring-rina-primary ring-offset-1 ring-offset-rina-bg text-rina-primary' : 'text-rina-text'}"
              >
                <span>{day}</span>
                {#if indicator.hasEntry}
                  <div class="flex gap-0.5">
                    {#if indicator.intensity !== undefined && indicator.intensity > 0}
                      <div class="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                    {:else}
                      <div class="w-1.5 h-1.5 rounded-full bg-rina-primary/40"></div>
                    {/if}
                  </div>
                {/if}
              </button>
            {:else}
              <div class="aspect-square"></div>
            {/if}
          {/each}
        </div>
        <div class="flex items-center justify-center gap-4 mt-3 pt-2 border-t border-rina-border">
          <div class="flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full bg-rose-400"></div><span class="text-[10px] text-rina-text-muted">Period</span></div>
          <div class="flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full bg-rina-primary/40"></div><span class="text-[10px] text-rina-text-muted">Entry</span></div>
          <div class="flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full bg-rina-primary ring-1 ring-rina-primary"></div><span class="text-[10px] text-rina-text-muted">Today</span></div>
        </div>
      </div>

      {#if showForm}
        <!-- Entry Form -->
        <div class="card-elevated p-4 space-y-4" transition:fly={{ y: 10, duration: 200 }}>
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-rina-text font-display">
              {editingId ? '✏️ Edit Entry' : '✨ New Entry'}
            </h3>
            <button onclick={() => { showForm = false; resetForm(); }} aria-label="Close form" class="w-8 h-8 rounded-lg hover:bg-rina-surface-muted flex items-center justify-center transition-colors">
              <svg class="w-4 h-4 text-rina-text-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div>
            <label for="cycleDate" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Date</label>
            <input id="cycleDate" type="date" bind:value={date} class="input" />
          </div>

          <!-- Flow Intensity -->
          <div>
            <span class="block text-xs font-medium text-rina-text-secondary mb-2">Flow Intensity</span>
            <div class="flex gap-2">
              {#each flowLabels as label, i}
                <button
                  onclick={() => flowIntensity = i}
                  class="flex-1 py-2.5 rounded-xl text-[11px] font-semibold transition-all duration-200 min-h-[44px]
                    {flowIntensity === i
                      ? flowColors[i] + ' text-white shadow-soft ring-1 ring-white/30'
                      : 'bg-rina-surface-muted text-rina-text-muted hover:bg-rina-primary-soft hover:text-rina-primary'}"
                >
                  {label}
                </button>
              {/each}
            </div>
            {#if flowIntensity !== undefined && flowIntensity > 0}
              <div class="mt-2 h-2 rounded-full bg-rina-surface-muted overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500 {flowColors[flowIntensity]}" style="width: {(flowIntensity / 4) * 100}%"></div>
              </div>
            {/if}
          </div>

          <!-- Symptoms -->
          <div>
            <span class="block text-xs font-medium text-rina-text-secondary mb-2">Symptoms</span>
            <div class="flex flex-wrap gap-2">
              {#each symptomOptions as s}
                <button
                  onclick={() => toggleSymptom(s)}
                  class="{symptoms.includes(s) ? 'chip-active' : 'chip'} text-xs"
                >
                  {s}
                </button>
              {/each}
            </div>
          </div>

          <!-- Temperature -->
          <div>
            <label for="temperature" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Temperature (°C)</label>
            <input
              id="temperature"
              type="number"
              step="0.1"
              bind:value={temperature}
              placeholder="36.5"
              class="input"
            />
          </div>

          <!-- Notes -->
          <div>
            <label for="notes" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Notes</label>
            <textarea
              id="notes"
              bind:value={notes}
              placeholder="How are you feeling today? 💕"
              rows="3"
              class="input resize-none"
            ></textarea>
          </div>

          <button
            onclick={saveEntry}
            class="btn-primary w-full"
          >
            {editingId ? 'Update Entry' : 'Save Entry'}
          </button>
        </div>
      {/if}

      <!-- Temperature Chart -->
      {#if tempChartData.length > 0}
        <div class="card p-4" transition:slide>
          <h3 class="text-sm font-semibold text-rina-text font-display mb-3">🌡️ Temperature</h3>
          <div class="flex items-end gap-1 h-24 px-1">
            {#each tempChartData as entry}
              {@const temp = entry.temperature!}
              {@const heightPct = ((temp - minTemp) / (maxTemp - minTemp)) * 100}
              <div class="flex-1 flex flex-col items-center gap-1 group">
                <div class="relative w-full flex items-end justify-center">
                  <div
                    class="w-full max-w-[20px] rounded-t-lg bg-rina-primary/30 group-hover:bg-rina-primary/50 transition-all duration-200"
                    style="height: {Math.max(heightPct, 8)}%"
                  ></div>
                  <div class="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity bg-rina-text text-white text-[10px] px-1.5 py-0.5 rounded-md whitespace-nowrap pointer-events-none">
                    {temp}°C
                  </div>
                </div>
                <span class="text-[9px] text-rina-text-muted">{new Date(entry.date).getDate()}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Phase Legend -->
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-rina-text font-display mb-3">Cycle Phases</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div class="flex items-center gap-2 p-2 rounded-xl bg-rose-50">
            <span class="text-lg">🩸</span>
            <div>
              <p class="text-xs font-medium text-rose-700">Menstrual</p>
              <p class="text-[10px] text-rose-500">Days 1-5</p>
            </div>
          </div>
          <div class="flex items-center gap-2 p-2 rounded-xl bg-pink-50">
            <span class="text-lg">💧</span>
            <div>
              <p class="text-xs font-medium text-pink-600">Follicular</p>
              <p class="text-[10px] text-pink-500">Days 6-14</p>
            </div>
          </div>
          <div class="flex items-center gap-2 p-2 rounded-xl bg-purple-50">
            <span class="text-lg">🌱</span>
            <div>
              <p class="text-xs font-medium text-purple-600">Ovulation</p>
              <p class="text-[10px] text-purple-500">Days 15-17</p>
            </div>
          </div>
          <div class="flex items-center gap-2 p-2 rounded-xl bg-sky-50">
            <span class="text-lg">🌊</span>
            <div>
              <p class="text-xs font-medium text-sky-600">Luteal</p>
              <p class="text-[10px] text-sky-500">Days 18-28</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Entries List -->
      {#if loading}
        <div class="flex flex-col items-center justify-center py-10 gap-3">
          <div class="w-6 h-6 rounded-full border-2 border-rina-border border-t-rina-primary animate-spin"></div>
          <p class="text-sm text-rina-text-muted">Loading entries...</p>
        </div>
      {:else if entries.length === 0}
        <div class="flex flex-col items-center justify-center py-10 text-center">
          <div class="w-12 h-12 rounded-full bg-rina-primary-soft flex items-center justify-center mb-3">
            <span class="text-xl">🌸</span>
          </div>
          <p class="text-sm text-rina-text-muted">No entries yet. Start tracking your cycle!</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) as entry (entry.id)}
            {@const phase = getPhase(entry)}
            <div class="card p-3.5 flex items-start gap-3 transition-all duration-200 hover:shadow-soft-lg" transition:fly={{ y: 5, duration: 150 }}>
              <div class="w-12 h-12 rounded-xl {phase.bgClass} flex items-center justify-center text-xl shrink-0">
                {phase.emoji}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-semibold text-rina-text">{new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <span class="text-[10px] font-medium px-2.5 py-1 rounded-full {phase.bgClass} {phase.colorClass}">{phase.label}</span>
                </div>

                {#if entry.flowIntensity !== undefined && entry.flowIntensity !== null}
                  <div class="mt-2">
                    <div class="flex items-center gap-2 mb-1">
                      <div class="flex gap-1">
                        {#each Array(5) as _, i}
                          <div class="w-4 h-1.5 rounded-full transition-colors {i <= entry.flowIntensity ? flowColors[entry.flowIntensity] : 'bg-rina-surface-muted'}"></div>
                        {/each}
                      </div>
                      <span class="text-[10px] text-rina-text-muted">{flowLabels[entry.flowIntensity]}</span>
                    </div>
                  </div>
                {/if}

                {#if entry.symptoms?.length}
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    {#each entry.symptoms as s}
                      <span class="text-[10px] px-2 py-1 rounded-full bg-rina-surface-muted text-rina-text-secondary">{s}</span>
                    {/each}
                  </div>
                {/if}

                {#if entry.temperature}
                  <p class="text-[11px] text-rina-text-muted mt-1.5 flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    {entry.temperature}°C
                  </p>
                {/if}

                {#if entry.notes}
                  <p class="text-[11px] text-rina-text-muted mt-1.5 italic leading-relaxed">"{entry.notes}"</p>
                {/if}
              </div>

              <div class="flex flex-col gap-1 shrink-0">
                <button onclick={() => editEntry(entry)} aria-label="Edit entry" class="w-8 h-8 rounded-lg hover:bg-rina-primary-soft flex items-center justify-center text-rina-text-muted hover:text-rina-primary transition-all duration-200">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                </button>
                <button onclick={() => deleteEntry(entry.id)} aria-label="Delete entry" class="w-8 h-8 rounded-lg hover:bg-rina-accent-soft flex items-center justify-center text-rina-text-muted hover:text-rina-accent transition-all duration-200">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Bottom spacing -->
      <div class="h-8"></div>
    </div>
  </div>
{/if}
