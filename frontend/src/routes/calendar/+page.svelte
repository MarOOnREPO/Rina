<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade, fly, slide, scale } from 'svelte/transition';
  import { calendarApi, type CalendarEvent, cycleApi, type CycleEntry } from '$lib/utils/api';
  import { formatTime, formatDate, getUserTimezone, isoToDatetimeLocal, datetimeLocalToIso } from '$lib/utils/timezone';
  import { socketStore } from '$lib/stores/socket.svelte';
  import CyclePhaseOrb from '$lib/components/CyclePhaseOrb.svelte';

  let currentDate = $state(new Date());
  let events: CalendarEvent[] = $state([]);

  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');

  // View toggle: 'agenda' | 'grid'
  let viewMode = $state<'agenda' | 'grid'>('grid');

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
    return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
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
      events = await calendarApi.list(fromDate.toISOString(), toDate.toISOString());
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
    selectedDate = event.startTime.split('T')[0];
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
    saving = true;

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
    } finally {
      saving = false;
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this event?')) return;
    saving = true;
    try {
      await calendarApi.remove(id);
      showEventModal = false;
      resetForm();
      await loadData();
    } catch (err) {
      error = 'Failed to delete event';
      console.error('[Calendar]', err);
    } finally {
      saving = false;
    }
  }

  function getEventColor(type: string, customColor?: string) {
    if (customColor) return customColor;
    return type === 'WORK' ? '#818cf8' : '#BE185D';
  }

  function getEventBadgeColor(type: string, customColor?: string): string {
    if (customColor) return '';
    return type === 'WORK' ? 'badge bg-indigo-50 text-indigo-600' : 'badge-primary';
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
      cycleEntries = await cycleApi.list(from, to);
    } catch (err) {
      console.error('[Calendar] loadCycleData failed:', err);
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
    } catch (err) {
      console.error('[Calendar] saveCycleSettings failed:', err);
    }
  }

  // ─── Cycle Phase Helpers ───────────────────────────────────────
  function getPhaseInfo(dateStr: string): { phase: string; day: number } | null {
    const last = getLastPeriodStart();
    if (!last) return null;
    const lastDate = new Date(last);
    const target = new Date(dateStr);
    lastDate.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    let dayInCycle: number;
    if (diff >= 0) {
      dayInCycle = (diff % cycleLength) + 1;
    } else {
      const n = Math.ceil(Math.abs(diff) / cycleLength);
      const adjustedStart = new Date(lastDate.getTime() - n * cycleLength * (1000 * 60 * 60 * 24));
      const adjustedDiff = Math.round((target.getTime() - adjustedStart.getTime()) / (1000 * 60 * 60 * 24));
      dayInCycle = adjustedDiff + 1;
    }
    if (dayInCycle <= 5) return { phase: 'menstrual', day: dayInCycle };
    if (dayInCycle <= 14) return { phase: 'follicular', day: dayInCycle };
    if (dayInCycle <= 17) return { phase: 'ovulation', day: dayInCycle };
    return { phase: 'luteal', day: dayInCycle };
  }

  function getPhaseBg(info: { phase: string } | null): string {
    if (!info) return '';
    switch (info.phase) {
      case 'menstrual': return 'bg-rose-50';
      case 'follicular': return 'bg-pink-50';
      case 'ovulation': return 'bg-purple-50';
      case 'luteal': return 'bg-sky-50';
      default: return '';
    }
  }

  function getPhaseTextColor(info: { phase: string } | null): string {
    if (!info) return '';
    switch (info.phase) {
      case 'menstrual': return 'text-rose-600';
      case 'follicular': return 'text-pink-500';
      case 'ovulation': return 'text-purple-600';
      case 'luteal': return 'text-sky-600';
      default: return '';
    }
  }

  function getPhaseEmoji(phase: string): string {
    switch (phase) {
      case 'menstrual': return '🩸';
      case 'follicular': return '💧';
      case 'ovulation': return '🌱';
      case 'luteal': return '🌊';
      default: return '';
    }
  }

  // ─── Up Next Derived State ─────────────────────────────────────
  let nextUpcomingEvent = $derived(
    (() => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return [...events]
        .filter((e) => new Date(e.startTime).getTime() >= startOfToday.getTime())
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] ?? null;
    })()
  );

  let daysUntilNextPeriod = $derived(
    (() => {
      const last = getLastPeriodStart();
      if (!last) return null;
      const lastDate = new Date(last);
      lastDate.setHours(0, 0, 0, 0);
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const diff = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0) {
        return Math.ceil((lastDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      }
      const cycles = Math.floor(diff / cycleLength);
      const nextPeriod = new Date(lastDate.getTime() + (cycles + 1) * cycleLength * (1000 * 60 * 60 * 24));
      return Math.ceil((nextPeriod.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    })()
  );

  let currentCycleInfo = $derived(
    (() => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return getPhaseInfo(todayStr);
    })()
  );

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
    const update = socketStore.globalSync;
    if (update && (update.payload as { type?: string }).type === 'calendar') {
      loadData();
    }
  });

  onMount(() => {
    loadData();
  });
</script>

{#if isAuthenticated()}
  <div class="h-full flex flex-col bg-rina-bg px-4 py-4 space-y-4 overflow-y-auto" in:fade={{ duration: 200 }}>
    <!-- Header -->
    <div class="flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-2xl font-semibold text-rina-text font-display">📅 Calendar</h2>
        <p class="text-xs text-rina-text-muted mt-0.5">Plan your moments together</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={() => viewMode = viewMode === 'agenda' ? 'grid' : 'agenda'}
          class="btn-ghost text-xs px-3 py-2"
        >
          {viewMode === 'agenda' ? 'Grid View' : 'Agenda View'}
        </button>
      </div>
    </div>

    {#if error}
      <div class="card border-rina-accent/20 bg-rina-accent-soft p-3 text-rina-accent text-sm" transition:slide>
        {error}
      </div>
    {/if}

    <!-- Up Next -->
    {#if nextUpcomingEvent || daysUntilNextPeriod !== null}
      <div class="card-elevated p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-sm font-semibold text-rina-text">⏭️ Up Next</span>
        </div>
        <div class="space-y-2.5">
          {#if nextUpcomingEvent}
            <div class="flex items-center gap-3 p-2.5 rounded-xl bg-rina-surface-muted">
              <div class="w-10 h-10 rounded-xl bg-rina-primary-soft flex items-center justify-center shrink-0">
                <span class="text-lg">📅</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-rina-text truncate">{nextUpcomingEvent.title}</p>
                <p class="text-xs text-rina-text-muted">
                  {formatEventDate(nextUpcomingEvent)}
                  {nextUpcomingEvent.allDay ? '' : formatEventTime(nextUpcomingEvent)}
                </p>
              </div>
            </div>
          {/if}
          {#if daysUntilNextPeriod !== null}
            <div class="flex items-center gap-3 p-2.5 rounded-xl bg-rose-50">
              <div class="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <span class="text-lg">🩸</span>
              </div>
              <div class="flex-1">
                <p class="text-sm font-medium text-rose-700">
                  {#if daysUntilNextPeriod === 0}
                    Period expected today
                  {:else}
                    Period in {daysUntilNextPeriod} day{daysUntilNextPeriod === 1 ? '' : 's'}
                  {/if}
                </p>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if viewMode === 'grid'}
      <!-- Cycle Phase Visualizer -->
      <CyclePhaseOrb lastPeriodStart={getLastPeriodStart()} {cycleLength} />

      <!-- Month Grid -->
      <div class="card p-4">
        <div class="flex items-center justify-between mb-4">
          <button onclick={prevMonth} aria-label="Previous month" class="w-10 h-10 rounded-xl bg-rina-surface-muted flex items-center justify-center hover:bg-rina-primary-soft transition-all duration-200 text-rina-text-secondary hover:text-rina-primary">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <h3 class="text-base font-semibold text-rina-text font-display">{monthName}</h3>
          <button onclick={nextMonth} aria-label="Next month" class="w-10 h-10 rounded-xl bg-rina-surface-muted flex items-center justify-center hover:bg-rina-primary-soft transition-all duration-200 text-rina-text-secondary hover:text-rina-primary">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>

        {#if currentCycleInfo}
          <div class="mb-4 rounded-xl px-3 py-2.5 text-xs font-medium flex items-center gap-2 {getPhaseBg(currentCycleInfo)} {getPhaseTextColor(currentCycleInfo)}">
            <span class="text-base">{getPhaseEmoji(currentCycleInfo.phase)}</span>
            <span>
              {currentCycleInfo.phase.charAt(0).toUpperCase() + currentCycleInfo.phase.slice(1)} phase – Day {currentCycleInfo.day}/{cycleLength}
            </span>
          </div>
        {/if}

        <div class="grid grid-cols-7 gap-1 mb-2">
          {#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day}
            <div class="text-center text-[11px] font-semibold text-rina-text-muted py-2">{day}</div>
          {/each}
        </div>

        <div class="grid grid-cols-7 gap-1">
          {#each daysWithEvents as cell}
            {#if cell}
              {@const { day, dateStr, events: dayEvents } = cell}
              {@const phaseInfo = getPhaseInfo(dateStr)}
              <div
                role="button"
                tabindex="0"
                onclick={() => openCreateModal(dateStr)}
                onkeydown={(e) => e.key === 'Enter' && openCreateModal(dateStr)}
                class="relative aspect-square rounded-xl p-1 flex flex-col items-start gap-0.5
                  hover:bg-rina-surface-muted transition-all duration-200 text-left touch-target
                  {isToday(day) ? 'ring-2 ring-rina-primary ring-offset-2 ring-offset-rina-bg' : ''}
                  {getPhaseBg(phaseInfo)}"
              >
                <span class="text-xs font-medium {isToday(day) ? 'text-rina-primary' : phaseInfo?.phase === 'menstrual' ? 'text-rose-600' : 'text-rina-text'}">
                  {day}
                </span>
                {#if dayEvents.length > 0}
                  <div class="flex flex-col gap-[2px] w-full overflow-hidden">
                    {#each dayEvents.slice(0, 2) as event}
                      <button
                        onclick={(e) => { e.stopPropagation(); openEditModal(event); }}
                        class="h-1.5 rounded-full w-full cursor-pointer hover:opacity-80 transition-opacity"
                        style="background-color: {getEventColor(event.type, event.color)}"
                        aria-label={event.title}
                      ></button>
                    {/each}
                    {#if dayEvents.length > 2}
                      <span class="text-[8px] text-rina-text-muted pl-0.5">+{dayEvents.length - 2}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {:else}
              <div class="aspect-square"></div>
            {/if}
          {/each}
        </div>

        <div class="flex items-center justify-between mt-4 pt-3 border-t border-rina-border">
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-full bg-rina-primary"></div><span class="text-[10px] text-rina-text-muted">Shared</span></div>
            <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-full bg-indigo-400"></div><span class="text-[10px] text-rina-text-muted">Work</span></div>
            <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-sm bg-rose-400"></div><span class="text-[10px] text-rina-text-muted">Menstrual</span></div>
            <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-sm bg-pink-300"></div><span class="text-[10px] text-rina-text-muted">Follicular</span></div>
            <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-sm bg-purple-400"></div><span class="text-[10px] text-rina-text-muted">Ovulation</span></div>
            <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-sm bg-sky-300"></div><span class="text-[10px] text-rina-text-muted">Luteal</span></div>
          </div>
          <button onclick={() => showCycleSettings = true} class="text-xs text-rina-text-secondary hover:text-rina-primary transition-colors flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Cycle
          </button>
        </div>
      </div>
    {:else}
      <!-- Agenda View -->
      <div class="card p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-semibold text-rina-text font-display">Upcoming Events</h3>
          <span class="text-xs text-rina-text-muted">{monthName}</span>
        </div>

        {#if loading}
          <div class="flex items-center justify-center py-8 gap-3">
            <div class="w-6 h-6 rounded-full border-2 border-rina-border border-t-rina-primary animate-spin"></div>
            <p class="text-sm text-rina-text-muted">Loading events...</p>
          </div>
        {:else if upcomingEvents.length === 0}
          <div class="flex flex-col items-center justify-center py-10 text-center">
            <div class="w-12 h-12 rounded-full bg-rina-primary-soft flex items-center justify-center mb-3">
              <span class="text-xl">📆</span>
            </div>
            <p class="text-sm text-rina-text-muted">No upcoming events. Tap + to add one.</p>
          </div>
        {:else}
          <div class="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {#each upcomingEvents as event (event.id)}
              {@const eventDate = new Date(event.startTime)}
              <button
                onclick={() => openEditModal(event)}
                class="w-full flex items-center gap-3 p-3 rounded-xl bg-rina-surface-muted hover:bg-rina-primary-soft transition-all duration-200 text-left group"
                transition:slide
              >
                <div class="flex flex-col items-center min-w-[3rem]">
                  <span class="text-[10px] font-semibold text-rina-text-muted uppercase">{eventDate.toLocaleDateString('en-GB', { month: 'short', timeZone: getUserTimezone() })}</span>
                  <span class="text-xl font-bold text-rina-text font-display">{eventDate.toLocaleDateString('en-GB', { day: 'numeric', timeZone: getUserTimezone() })}</span>
                </div>
                <div class="w-1 h-10 rounded-full shrink-0" style="background-color: {getEventColor(event.type, event.color)}"></div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-rina-text truncate group-hover:text-rina-primary transition-colors">{event.title}</p>
                  <p class="text-[11px] text-rina-text-muted">
                    {formatEventDate(event)}
                    {event.allDay ? '' : formatEventTime(event)}
                    {#if event.endTime}
                      – {formatTime(event.endTime, getUserTimezone())}
                    {/if}
                  </p>
                </div>
                <svg class="w-4 h-4 text-rina-text-muted group-hover:text-rina-primary transition-colors shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Cycle Settings Modal -->
    {#if showCycleSettings}
      <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-rina-text/20 backdrop-blur-sm" transition:fade role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) showCycleSettings = false; }} onkeydown={(e) => e.key === 'Escape' && (showCycleSettings = false)}>
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-sm" transition:fly={{ y: 20 }}>
          <h3 class="text-lg font-semibold text-rina-text font-display mb-4">Cycle Settings</h3>
          <div class="space-y-4">
            <div>
              <label for="cycleStart" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Last Period Start</label>
              <input id="cycleStart" type="date" bind:value={cycleStartStr} class="input" />
            </div>
            <div>
              <label for="cycleLength" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Cycle Length (days)</label>
              <input id="cycleLength" type="number" bind:value={cycleLength} min="20" max="40" class="input" />
            </div>
            <div class="flex gap-2 pt-2">
              <button onclick={() => showCycleSettings = false} class="btn-ghost flex-1">Cancel</button>
              <button onclick={saveCycleSettings} class="btn-primary flex-1">Save</button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Event Modal (Create/Edit) -->
    {#if showEventModal}
      <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-rina-text/20 backdrop-blur-sm" transition:fade role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) showEventModal = false; }} onkeydown={(e) => e.key === 'Escape' && (showEventModal = false)}>
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" transition:fly={{ y: 20 }}>
          <h3 class="text-lg font-semibold text-rina-text font-display mb-4">
            {modalMode === 'edit' ? 'Edit Event' : 'Add Event'} – {selectedDate}
          </h3>
          <div class="space-y-4">
            <div>
              <label for="eventTitle" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Title *</label>
              <input id="eventTitle" bind:value={formEvent.title} class="input" placeholder="Event title" />
            </div>
            <div>
              <label for="eventDesc" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Description</label>
              <textarea id="eventDesc" bind:value={formEvent.description} rows={2} class="input resize-none" placeholder="Add details..."></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="eventStart" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Start *</label>
                <input id="eventStart" type="datetime-local" bind:value={formEvent.startTime} class="input" />
              </div>
              <div>
                <label for="eventEnd" class="block text-xs font-medium text-rina-text-secondary mb-1.5">End</label>
                <input id="eventEnd" type="datetime-local" bind:value={formEvent.endTime} class="input" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="eventType" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Type</label>
                <select id="eventType" bind:value={formEvent.type} class="input">
                  <option value="SHARED">Shared</option>
                  <option value="WORK">Work</option>
                </select>
              </div>
              <div>
                <label for="eventColor" class="block text-xs font-medium text-rina-text-secondary mb-1.5">Color</label>
                <input id="eventColor" type="color" bind:value={formEvent.color} class="input h-[46px] px-1 py-1" />
              </div>
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" bind:checked={formEvent.allDay} id="allDay" class="rounded w-4 h-4 accent-rina-primary" />
              <label for="allDay" class="text-sm text-rina-text-secondary">All day</label>
            </div>
            <div class="flex gap-2 pt-2">
              {#if modalMode === 'edit' && editingEvent}
                <button onclick={() => deleteEvent(editingEvent!.id)} class="btn text-rina-accent hover:bg-rina-accent-soft">Delete</button>
              {/if}
              <button onclick={() => showEventModal = false} class="btn-ghost flex-1">Cancel</button>
              <button onclick={saveEvent} disabled={saving} class="btn-primary flex-1">
                {saving ? 'Saving...' : 'Save'}
              </button>
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
          class="absolute right-4 -top-6 w-14 h-14 rounded-full bg-rina-primary text-white shadow-soft-lg flex items-center justify-center text-2xl hover:scale-105 active:scale-95 transition-transform pointer-events-auto"
          aria-label="Add event"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        </button>
      </div>
    </div>
  {/if}
{/if}
