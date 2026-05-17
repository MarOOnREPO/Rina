<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { calendarApi, type CalendarEvent, cycleApi, type CycleEntry } from '$lib/utils/api';
  import GlassCard from '$lib/components/GlassCard.svelte';
  import CountdownTimer from '$lib/components/CountdownTimer.svelte';
  import { countdownApi, type Countdown } from '$lib/utils/api';

  let currentDate = $state(new Date());
  let events: CalendarEvent[] = $state([]);
  let countdowns: Countdown[] = $state([]);
  let loading = $state(true);
  let showAddModal = $state(false);
  let selectedDate: string | null = $state(null);

  // New event form
  let newEvent: Partial<CalendarEvent> = $state({
    title: '',
    description: '',
    type: 'SHARED',
    allDay: false
  });

  let year = $derived(currentDate.getFullYear());
  let month = $derived(currentDate.getMonth());
  let monthName = $derived(currentDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' }));
  let firstDayOfMonth = $derived(new Date(year, month, 1).getDay()); // 0 = Sunday
  let daysInMonth = $derived(new Date(year, month + 1, 0).getDate());
  let calendarDays = $derived(Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDayOfMonth + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return dayNum;
  }));

  let daysWithEvents = $derived(calendarDays.map((day) => {
    if (!day) return null;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = events.filter((e) => {
      const d = new Date(e.startTime);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
    return { day, dateStr, events: dayEvents };
  }));

  async function loadData() {
    try {
      const [evts, cnts] = await Promise.all([
        calendarApi.list(),
        countdownApi.list()
      ]);
      events = evts;
      countdowns = cnts;
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  function prevMonth() {
    currentDate = new Date(year, month - 1, 1);
  }

  function nextMonth() {
    currentDate = new Date(year, month + 1, 1);
  }

  function openAddModal(dateStr: string) {
    selectedDate = dateStr;
    newEvent = {
      title: '',
      description: '',
      type: 'SHARED',
      allDay: false,
      startTime: `${dateStr}T09:00`
    };
    showAddModal = true;
  }

  async function saveEvent() {
    if (!newEvent.title || !newEvent.startTime) return;
    try {
      await calendarApi.create(newEvent);
      showAddModal = false;
      loadData();
    } catch {
      // handle error
    }
  }

  function getEventColor(type: string) {
    return type === 'WORK' ? 'bg-rina-indigo' : 'bg-rina-rose';
  }

  // ─── Cycle Tracker (API-backed) ────────────────────────────────
  let cycleEntries: CycleEntry[] = [];
  let showCycleSettings = $state(false);
  let cycleStartStr = $state('');
  let cycleLength = $state(28);
  let cycleLoading = false;

  function getCycleEntryForDate(dateStr: string): CycleEntry | undefined {
    return cycleEntries.find((e) => e.date === dateStr);
  }

  function getLastPeriodStart(): string | null {
    const periodEntries = cycleEntries
      .filter((e) => (e.flowIntensity ?? 0) > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return periodEntries[0]?.date ?? null;
  }

  function isPeriodDay(day: number): boolean {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = getCycleEntryForDate(dateStr);
    return (entry?.flowIntensity ?? 0) > 0;
  }

  function isFertileDay(day: number): boolean {
    const lastStart = getLastPeriodStart();
    if (!lastStart) return false;
    const start = new Date(lastStart);
    const check = new Date(year, month, day);
    const diff = Math.floor((check.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return false;
    const fertileStart = 14;
    const fertileEnd = fertileStart + 5;
    const dayInCycle = diff % cycleLength;
    return dayInCycle >= fertileStart && dayInCycle < fertileEnd;
  }

  async function loadCycleData() {
    try {
      cycleLoading = true;
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const toDate = new Date(year, month + 1, 0);
      const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;
      const { entries } = await cycleApi.list(from, to);
      cycleEntries = entries;
    } catch {
      // ignore
    } finally {
      cycleLoading = false;
    }
  }

  async function saveCycleSettings() {
    if (!cycleStartStr) {
      showCycleSettings = false;
      return;
    }
    try {
      await cycleApi.create({
        date: cycleStartStr,
        flowIntensity: 4,
        symptoms: [],
        notes: 'Period start'
      });
      showCycleSettings = false;
      await loadCycleData();
    } catch {
      // ignore error
    }
  }

  // Reload cycle data when month changes
  $effect(() => {
    if (typeof window !== 'undefined') {
      const _ = year + month; // track dependency
      loadCycleData();
    }
  });

  // Redirect if not authenticated (wait for auth loading to finish)
  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  onMount(() => {
    loadData();
  });
</script>

{#if isAuthenticated()}
  <div class="max-w-5xl mx-auto px-4 py-6" in:fade>
    <h2 class="text-2xl font-bold mb-6">📅 Calendar</h2>

    <!-- Countdowns -->
    {#if countdowns.length > 0}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {#each countdowns as cd (cd.id)}
          <CountdownTimer targetDate={cd.targetDate} title={cd.title} />
        {/each}
      </div>
    {/if}

    <!-- Calendar Grid -->
    <GlassCard class="mb-6">
      <div class="flex items-center justify-between mb-4">
        <button onclick={prevMonth} class="p-2 rounded-lg hover:bg-white/5 transition-colors text-rina-slate">
          ←
        </button>
        <h3 class="text-lg font-semibold">{monthName}</h3>
        <button onclick={nextMonth} class="p-2 rounded-lg hover:bg-white/5 transition-colors text-rina-slate">
          →
        </button>
      </div>

      <!-- Weekday headers -->
      <div class="grid grid-cols-7 gap-1 mb-2">
        {#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as day}
          <div class="text-center text-xs font-medium text-rina-slate py-2">{day}</div>
        {/each}
      </div>

      <!-- Days -->
      <div class="grid grid-cols-7 gap-1">
        {#each daysWithEvents as cell}
          {#if cell}
            {@const { day, dateStr, events: dayEvents } = cell}
            <button
              onclick={() => openAddModal(dateStr)}
              class="relative aspect-square rounded-xl p-1.5 flex flex-col items-start gap-0.5
                hover:bg-white/5 transition-colors text-left
                {isPeriodDay(day) ? 'bg-red-500/10' : ''}
                {isFertileDay(day) ? 'bg-blue-500/10' : ''}"
            >
              <span class="text-sm font-medium {isPeriodDay(day) ? 'text-red-400' : isFertileDay(day) ? 'text-blue-400' : 'text-white'}">
                {day}
              </span>
              {#if dayEvents.length > 0}
                <div class="flex flex-wrap gap-0.5 w-full">
                  {#each dayEvents.slice(0, 3) as event}
                    <div class="h-1.5 flex-1 rounded-full {getEventColor(event.type)}"></div>
                  {/each}
                </div>
              {/if}
              {#if isPeriodDay(day)}
                <span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500"></span>
              {/if}
              {#if isFertileDay(day)}
                <span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              {/if}
            </button>
          {:else}
            <div class="aspect-square"></div>
          {/if}
        {/each}
      </div>

      <!-- Legend & Cycle Settings -->
      <div class="flex items-center justify-between mt-4 text-xs text-rina-slate">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full bg-rina-rose"></div>
            Shared
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full bg-rina-indigo"></div>
            Work
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full bg-red-500"></div>
            Period
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full bg-blue-500"></div>
            Fertile
          </div>
        </div>
        <button onclick={() => showCycleSettings = true} class="hover:text-rina-rose transition-colors">
          ⚙️ Cycle
        </button>
      </div>
    </GlassCard>

    <!-- Cycle Settings Modal -->
    {#if showCycleSettings}
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade onclick={() => showCycleSettings = false}>
        <div class="glass-strong rounded-2xl p-6 w-full max-w-sm" transition:fly={{ y: 20 }} onclick={(e) => e.stopPropagation()}>
          <h3 class="text-lg font-semibold mb-4">Cycle Settings</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-rina-slate mb-1">Last Period Start</label>
              <input type="date" bind:value={cycleStartStr} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Cycle Length (days)</label>
              <input type="number" bind:value={cycleLength} min="20" max="40" class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div class="flex gap-2 pt-2">
              <button onclick={() => showCycleSettings = false} class="flex-1 py-2 rounded-lg border border-rina-border text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button onclick={saveCycleSettings} class="flex-1 py-2 rounded-lg bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Add Event Modal -->
    {#if showAddModal}
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade onclick={() => showAddModal = false}>
        <div class="glass-strong rounded-2xl p-6 w-full max-w-md" transition:fly={{ y: 20 }} onclick={(e) => e.stopPropagation()}>
          <h3 class="text-lg font-semibold mb-4">Add Event — {selectedDate}</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-rina-slate mb-1">Title</label>
              <input bind:value={newEvent.title} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Description</label>
              <textarea bind:value={newEvent.description} rows={2} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-rina-slate mb-1">Start</label>
                <input type="datetime-local" bind:value={newEvent.startTime} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
              </div>
              <div>
                <label class="block text-xs text-rina-slate mb-1">Type</label>
                <select bind:value={newEvent.type} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50">
                  <option value="SHARED">Shared</option>
                  <option value="WORK">Work</option>
                </select>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" bind:checked={newEvent.allDay} id="allDay" class="rounded" />
              <label for="allDay" class="text-sm text-rina-slate">All day</label>
            </div>
            <div class="flex gap-2 pt-2">
              <button onclick={() => showAddModal = false} class="flex-1 py-2 rounded-lg border border-rina-border text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button onclick={saveEvent} class="flex-1 py-2 rounded-lg bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Events List -->
    <GlassCard>
      <h3 class="text-lg font-semibold mb-4">Upcoming Events</h3>
      {#if loading}
        <p class="text-rina-slate text-sm">Loading...</p>
      {:else if events.length === 0}
        <p class="text-rina-slate-dark text-sm">No events yet. Tap a date to add one.</p>
      {:else}
        <div class="space-y-2">
          {#each events.slice(0, 10) as event (event.id)}
            <div class="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]" transition:slide>
              <div class="w-1 h-8 rounded-full {getEventColor(event.type)}"></div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{event.title}</p>
                <p class="text-xs text-rina-slate">
                  {new Date(event.startTime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {event.allDay ? '' : new Date(event.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </GlassCard>
  </div>
{/if}
