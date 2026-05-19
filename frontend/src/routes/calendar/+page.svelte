<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade, fly, slide, scale } from 'svelte/transition';
  import { calendarApi, type CalendarEvent, cycleApi, type CycleEntry } from '$lib/utils/api';
  import { formatTime, formatDate, getUserTimezone, isoToDatetimeLocal, datetimeLocalToIso } from '$lib/utils/timezone';
  import GlassCard from '$lib/components/GlassCard.svelte';
  import CountdownTimer from '$lib/components/CountdownTimer.svelte';
  import { countdownApi, type Countdown } from '$lib/utils/api';
  import { globalSync } from '$lib/stores/socket.svelte';
  import CyclePhaseOrb from '$lib/components/CyclePhaseOrb.svelte';

  let currentDate = $state(new Date());
  let events: CalendarEvent[] = $state([]);
  let countdowns: Countdown[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  // View toggle: 'agenda' | 'grid'
  let viewMode = $state<'agenda' | 'grid'>('agenda');

  // Modal states
  let showEventModal = $state(false);
  let modalMode: 'create' | 'edit' = $state('create');
  let selectedDate: string | null = $state(null);
  let editingEvent: CalendarEvent | null = $state(null);

  // Form state
  let formEvent: Partial<CalendarEvent> = $state({
    title: '',
    description: '',
    type: 'SHARED',
    allDay: false,
    startTime: '',
    endTime: '',
    color: ''
  });

  let year = $derived(currentDate.getFullYear());
  let month = $derived(currentDate.getMonth());
  let monthName = $derived(currentDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' }));
  let firstDayOfMonth = $derived(new Date(year, month, 1).getDay());
  let daysInMonth = $derived(new Date(year, month + 1, 0).getDate());
  let calendarDays = $derived(Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDayOfMonth + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return dayNum;
  }));

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  function eventMatchesDay(event: CalendarEvent, day: number): boolean {
    const d = new Date(event.startTime);
    return d.getUTCDate() === day && d.getUTCMonth() === month && d.getUTCFullYear() === year;
  }

  let daysWithEvents = $derived(calendarDays.map((day) => {
    if (!day) return null;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = events.filter((e) => eventMatchesDay(e, day));
    return { day, dateStr, events: dayEvents };
  }));

  async function loadData() {
    loading = true;
    error = '';
    try {
      const fromDate = new Date(year, month, 1);
      const toDate = new Date(year, month + 1, 0, 23, 59, 59);
      const [evts, cnts] = await Promise.all([
        calendarApi.list(fromDate.toISOString(), toDate.toISOString()),
        countdownApi.list()
      ]);
      events = evts;
      countdowns = cnts;
    } catch (err) {
      error = 'Failed to load calendar data';
      console.error('[Calendar]', err);
    } finally {
      loading = false;
    }
  }

  function prevMonth() {
    currentDate = new Date(year, month - 1, 1);
    loadData();
  }

  function nextMonth() {
    currentDate = new Date(year, month + 1, 1);
    loadData();
  }

  function resetForm() {
    formEvent = {
      title: '',
      description: '',
      type: 'SHARED',
      allDay: false,
      startTime: '',
      endTime: '',
      color: ''
    };
    editingEvent = null;
  }

  function openCreateModal(dateStr?: string) {
    selectedDate = dateStr || new Date().toISOString().split('T')[0];
    modalMode = 'create';
    resetForm();
    formEvent.startTime = isoToDatetimeLocal(`${selectedDate}T09:00:00Z`);
    formEvent.endTime = isoToDatetimeLocal(`${selectedDate}T10:00:00Z`);
    showEventModal = true;
  }

  function openEditModal(event: CalendarEvent) {
    modalMode = 'edit';
    editingEvent = event;
    formEvent = {
      title: event.title,
      description: event.description || '',
      type: event.type,
      allDay: event.allDay,
      startTime: isoToDatetimeLocal(event.startTime),
      endTime: event.endTime ? isoToDatetimeLocal(event.endTime) : '',
      color: event.color || ''
    };
    showEventModal = true;
  }

  async function saveEvent() {
    if (!formEvent.title?.trim() || !formEvent.startTime) {
      error = 'Title and start time are required';
      return;
    }
    error = '';

    const payload: Partial<CalendarEvent> = {
      ...formEvent,
      startTime: formEvent.allDay
        ? `${formEvent.startTime?.split('T')[0]}T00:00:00.000Z`
        : datetimeLocalToIso(formEvent.startTime!),
      endTime: formEvent.endTime
        ? (formEvent.allDay ? `${formEvent.endTime?.split('T')[0]}T23:59:59.000Z` : datetimeLocalToIso(formEvent.endTime))
        : undefined
    };

    try {
      if (modalMode === 'edit' && editingEvent) {
        await calendarApi.update(editingEvent.id, payload);
      } else {
        await calendarApi.create(payload);
      }
      showEventModal = false;
      resetForm();
      await loadData();
    } catch (err) {
      error = modalMode === 'edit' ? 'Failed to update event' : 'Failed to create event';
      console.error('[Calendar]', err);
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this event?')) return;
    try {
      await calendarApi.remove(id);
      showEventModal = false;
      resetForm();
      await loadData();
    } catch (err) {
      error = 'Failed to delete event';
      console.error('[Calendar]', err);
    }
  }

  function getEventColor(type: string, customColor?: string) {
    if (customColor) return customColor;
    return type === 'WORK' ? '#818cf8' : '#fb7185';
  }

  function formatEventTime(event: CalendarEvent): string {
    if (event.allDay) return 'All day';
    return formatTime(event.startTime, getUserTimezone());
  }

  function formatEventDate(event: CalendarEvent): string {
    return formatDate(event.startTime, getUserTimezone());
  }

  // ─── Agenda View Helpers ───────────────────────────────────────
  let upcomingEvents = $derived(
    [...events]
      .filter((e) => new Date(e.startTime).getTime() >= new Date(new Date().setHours(0,0,0,0)).getTime() - 86400000)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  );

  // ─── Cycle Tracker ─────────────────────────────────────────────
  let cycleEntries = $state<CycleEntry[]>([]);
  let showCycleSettings = $state(false);
  let cycleStartStr = $state('');
  let cycleLength = $state(28);

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

  async function loadCycleData() {
    try {
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const toDate = new Date(year, month + 1, 0);
      const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;
      const { entries } = await cycleApi.list(from, to);
      cycleEntries = entries;
    } catch {
      // ignore
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

  $effect(() => {
    if (typeof window !== 'undefined') {
      year + month;
      loadCycleData();
    }
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  $effect(() => {
    const update = globalSync.lastUpdate;
    if (update && update.type === 'calendar') {
      loadData();
    }
  });

  onMount(() => {
    loadData();
  });
</script>

{#if isAuthenticated()}
  <div class="px-3 py-4 space-y-4" in:fade>
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">📅 Calendar</h2>
      <div class="flex items-center gap-2">
        <button
          onclick={() => viewMode = viewMode === 'agenda' ? 'grid' : 'agenda'}
          class="touch-target px-3 py-1.5 rounded-lg glass text-xs font-medium text-rina-slate hover:text-white transition-colors"
        >
          {viewMode === 'agenda' ? 'Grid' : 'Agenda'}
        </button>
      </div>
    </div>

    {#if error}
      <div class="glass rounded-xl p-3 text-rina-rose text-sm" transition:slide>
        {error}
      </div>
    {/if}

    <!-- Countdowns -->
    {#if countdowns.length > 0}
      <div class="space-y-3">
        {#each countdowns as cd (cd.id)}
          <CountdownTimer targetDate={cd.targetDate} title={cd.title} />
        {/each}
      </div>
    {/if}

    {#if viewMode === 'grid'}
      <!-- Cycle Phase Visualizer -->
      <CyclePhaseOrb lastPeriodStart={getLastPeriodStart()} {cycleLength} />

      <!-- Month Grid -->
      <GlassCard class="mb-4">
        <div class="flex items-center justify-between mb-4">
          <button onclick={prevMonth} class="touch-target p-2 rounded-lg hover:bg-white/5 transition-colors text-rina-slate">←</button>
          <h3 class="text-base font-semibold">{monthName}</h3>
          <button onclick={nextMonth} class="touch-target p-2 rounded-lg hover:bg-white/5 transition-colors text-rina-slate">→</button>
        </div>

        <div class="grid grid-cols-7 gap-1 mb-2">
          {#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day}
            <div class="text-center text-[10px] font-medium text-rina-slate py-1">{day}</div>
          {/each}
        </div>

        <div class="grid grid-cols-7 gap-1">
          {#each daysWithEvents as cell}
            {#if cell}
              {@const { day, dateStr, events: dayEvents } = cell}
              {@const period = isPeriodDay(day)}
              <button
                onclick={() => openCreateModal(dateStr)}
                class="relative aspect-square rounded-xl p-1 flex flex-col items-start gap-0.5
                  hover:bg-white/5 transition-colors text-left touch-target
                  {isToday(day) ? 'ring-2 ring-rina-rose ring-offset-2 ring-offset-rina-bg' : ''}
                  {period ? 'bg-rose-500/[0.07]' : ''}"
              >
                <span class="text-xs font-medium {isToday(day) ? 'text-rina-rose' : period ? 'text-rose-300' : 'text-white'}">
                  {day}
                </span>
                {#if dayEvents.length > 0}
                  <div class="flex flex-col gap-[2px] w-full overflow-hidden">
                    {#each dayEvents.slice(0, 2) as event}
                      <div class="h-1 rounded-full w-full" style="background-color: {getEventColor(event.type, event.color)}"></div>
                    {/each}
                    {#if dayEvents.length > 2}
                      <span class="text-[7px] text-rina-slate pl-0.5">+{dayEvents.length - 2}</span>
                    {/if}
                  </div>
                {/if}
                {#if period}
                  <div class="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-rose-400/70 shadow-[0_0_4px_rgba(251,113,133,0.4)]"></div>
                {/if}
              </button>
            {:else}
              <div class="aspect-square"></div>
            {/if}
          {/each}
        </div>

        <div class="flex items-center justify-between mt-3 text-[10px] text-rina-slate">
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center gap-1"><div class="w-1.5 h-1.5 rounded-full bg-rina-rose"></div>Shared</div>
            <div class="flex items-center gap-1"><div class="w-1.5 h-1.5 rounded-full bg-rina-indigo"></div>Work</div>
            <div class="flex items-center gap-1"><div class="w-1.5 h-1.5 rounded-full bg-rose-400"></div>Period</div>
          </div>
          <button onclick={() => showCycleSettings = true} class="hover:text-rina-rose transition-colors">⚙️ Cycle</button>
        </div>
      </GlassCard>
    {:else}
      <!-- iOS Agenda View -->
      <GlassCard>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-base font-semibold">Upcoming</h3>
          <span class="text-xs text-rina-slate">{monthName}</span>
        </div>

        {#if loading}
          <p class="text-rina-slate text-sm">Loading...</p>
        {:else if upcomingEvents.length === 0}
          <p class="text-rina-slate-dark text-sm">No upcoming events. Tap + to add one.</p>
        {:else}
          <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {#each upcomingEvents as event (event.id)}
              <button
                onclick={() => openEditModal(event)}
                class="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
                transition:slide
              >
                <div class="flex flex-col items-center min-w-[3rem]">
                  <span class="text-[10px] text-rina-slate uppercase">{new Date(event.startTime).toLocaleDateString('en-GB', { month: 'short' })}</span>
                  <span class="text-xl font-bold">{new Date(event.startTime).getDate()}</span>
                </div>
                <div class="w-1 h-8 rounded-full shrink-0" style="background-color: {getEventColor(event.type, event.color)}"></div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{event.title}</p>
                  <p class="text-[11px] text-rina-slate">
                    {formatEventDate(event)}
                    {event.allDay ? '' : formatEventTime(event)}
                    {#if event.endTime}
                      – {formatTime(event.endTime, getUserTimezone())}
                    {/if}
                  </p>
                </div>
                <span class="text-xs text-rina-slate-dark shrink-0">→</span>
              </button>
            {/each}
          </div>
        {/if}
      </GlassCard>
    {/if}

    <!-- Cycle Settings Modal -->
    {#if showCycleSettings}
      <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" transition:fade role="button" tabindex="0" onclick={() => showCycleSettings = false} onkeydown={(e) => e.key === 'Escape' && (showCycleSettings = false)}>
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-sm" transition:fly={{ y: 20 }} onclick={(e) => e.stopPropagation()}>
          <h3 class="text-lg font-semibold mb-4">Cycle Settings</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-rina-slate mb-1">Last Period Start</label>
              <input type="date" bind:value={cycleStartStr} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Cycle Length (days)</label>
              <input type="number" bind:value={cycleLength} min="20" max="40" class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div class="flex gap-2 pt-2">
              <button onclick={() => showCycleSettings = false} class="touch-target flex-1 py-2.5 rounded-xl border border-rina-border text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button onclick={saveCycleSettings} class="touch-target flex-1 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Event Modal (Create/Edit) -->
    {#if showEventModal}
      <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" transition:fade role="button" tabindex="0" onclick={() => showEventModal = false} onkeydown={(e) => e.key === 'Escape' && (showEventModal = false)}>
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" transition:fly={{ y: 20 }} onclick={(e) => e.stopPropagation()}>
          <h3 class="text-lg font-semibold mb-4">
            {modalMode === 'edit' ? 'Edit Event' : 'Add Event'} — {selectedDate}
          </h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-rina-slate mb-1">Title *</label>
              <input bind:value={formEvent.title} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Description</label>
              <textarea bind:value={formEvent.description} rows={2} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 resize-none"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-rina-slate mb-1">Start *</label>
                <input type="datetime-local" bind:value={formEvent.startTime} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
              </div>
              <div>
                <label class="block text-xs text-rina-slate mb-1">End</label>
                <input type="datetime-local" bind:value={formEvent.endTime} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-rina-slate mb-1">Type</label>
                <select bind:value={formEvent.type} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50">
                  <option value="SHARED">Shared</option>
                  <option value="WORK">Work</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-rina-slate mb-1">Color</label>
                <input type="color" bind:value={formEvent.color} class="input-safe w-full h-[42px] px-1 py-1 rounded-xl bg-rina-bg border border-rina-border text-white text-sm" />
              </div>
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" bind:checked={formEvent.allDay} id="allDay" class="rounded w-4 h-4" />
              <label for="allDay" class="text-sm text-rina-slate">All day</label>
            </div>
            <div class="flex gap-2 pt-2">
              {#if modalMode === 'edit' && editingEvent}
                <button onclick={() => deleteEvent(editingEvent!.id)} class="touch-target px-4 py-2.5 rounded-xl bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors">Delete</button>
              {/if}
              <button onclick={() => showEventModal = false} class="touch-target flex-1 py-2.5 rounded-xl border border-rina-border text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button onclick={saveEvent} class="touch-target flex-1 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Floating Action Button -->
  {#if !showEventModal}
    <div class="fixed-mobile bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-40 pointer-events-none" transition:scale>
      <div class="relative w-full h-0">
        <button
          onclick={() => openCreateModal()}
          class="absolute right-4 -top-6 w-12 h-12 rounded-full bg-rina-rose text-white shadow-lg flex items-center justify-center text-xl hover:scale-105 active:scale-95 transition-transform pointer-events-auto"
          aria-label="Add event"
        >
          +
        </button>
      </div>
    </div>
  {/if}
{/if}
