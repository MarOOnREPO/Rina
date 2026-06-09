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

  // Selected day for detail panel
  let selectedDayDetail = $state<string | null>(null);

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

  function isToday(day: number) {
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  }

  function eventMatchesDay(event: CalendarEvent, day: number): boolean {
    const d = new Date(event.startTime);
    return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
  }

  function eventMatchesDateStr(event: CalendarEvent, dateStr: string): boolean {
    const d = new Date(event.startTime);
    const [y, m, day] = dateStr.split('-').map(Number);
    return d.getDate() === day && d.getMonth() === m - 1 && d.getFullYear() === y;
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

  function openCreateModal(dateStr?: string | null) {
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    selectedDate = dateStr || localToday;
    selectedDayDetail = selectedDate;
    modalMode = 'create';
    resetForm();
    formEvent.startTime = isoToDatetimeLocal(`${selectedDate}T09:00:00Z`);
    formEvent.endTime = isoToDatetimeLocal(`${selectedDate}T10:00:00Z`);
    showEventModal = true;
  }

  function openEditModal(event: CalendarEvent) {
    modalMode = 'edit';
    selectedDate = event.startTime.split('T')[0];
    selectedDayDetail = selectedDate;
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
    if (type === 'WORK') return '#818cf8';
    if (type === 'PERSONAL') return '#9ca3af';
    return '#BE185D';
  }

  function getEventBadgeColor(type: string, customColor?: string): string {
    if (customColor) return '';
    if (type === 'WORK') return 'badge bg-indigo-50 text-indigo-600';
    if (type === 'PERSONAL') return 'badge bg-gray-50 text-gray-600';
    return 'badge-primary';
  }

  function formatEventTime(event: CalendarEvent): string {
    if (event.allDay) return 'All day';
    return formatTime(event.startTime, getUserTimezone());
  }

  function formatEventDate(event: CalendarEvent): string {
    return formatDate(event.startTime, getUserTimezone());
  }

  function hexToRgba(hex: string, alpha: number): string {
    if (!hex || typeof hex !== 'string') return `rgba(0, 0, 0, ${alpha})`;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return `rgba(0, 0, 0, ${alpha})`;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getEventTypeIcon(type: string): string {
    switch (type) {
      case 'SHARED': return '💕';
      case 'WORK': return '💼';
      case 'PERSONAL': return '👤';
      default: return '📌';
    }
  }

  function getEventTypeLabel(type: string): string {
    switch (type) {
      case 'SHARED': return 'Shared';
      case 'WORK': return 'Work';
      case 'PERSONAL': return 'Personal';
      default: return type;
    }
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
      const data = await cycleApi.list(from, to);
      cycleEntries = data.entries || [];
    } catch (err) {
      console.error('[Calendar] loadCycleData failed:', err);
      cycleEntries = [];
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
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    selectedDayDetail = todayStr;
    loadData();
  });
</script>

{#if isAuthenticated()}
  <div class="h-full flex flex-col bg-rina-bg px-4 md:px-8 py-4 md:py-8 space-y-4 max-w-7xl mx-auto overflow-y-auto" in:fade={{ duration: 200 }}>
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
      <div class="card p-4 md:p-6">
        <div class="flex items-center justify-between mb-4">
          <button onclick={prevMonth} aria-label="Previous month" class="w-10 h-10 rounded-xl bg-rina-surface-muted flex items-center justify-center hover:bg-rina-primary-soft transition-all duration-200 text-rina-text-secondary hover:text-rina-primary">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <h3 class="text-base md:text-lg font-semibold text-rina-text font-display">{monthName}</h3>
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

        <div class="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day}
            <div class="text-center text-[11px] md:text-sm font-semibold text-rina-text-muted py-2 md:py-3">{day}</div>
          {/each}
        </div>

        <div class="grid grid-cols-7 gap-1 md:gap-2">
          {#each daysWithEvents as cell}
            {#if cell}
              {@const { day, dateStr, events: dayEvents } = cell}
              {@const phaseInfo = getPhaseInfo(dateStr)}
              {@const todayClass = isToday(day)}
              <div
                class="relative min-h-[72px] md:min-h-[110px] rounded-xl touch-target
                  hover:bg-rina-surface-muted/60 transition-all duration-200
                  {todayClass ? 'ring-2 ring-rina-primary ring-offset-2 ring-offset-rina-bg bg-rose-50/60' : ''}
                  {getPhaseBg(phaseInfo)}"
              >
                <button
                  type="button"
                  onclick={() => openCreateModal(dateStr)}
                  onkeydown={(e) => e.key === 'Enter' && openCreateModal(dateStr)}
                  class="absolute inset-0 rounded-xl z-0 cursor-pointer"
                  aria-label={`Add event for ${dateStr}`}
                ></button>
                <div class="relative z-10 pointer-events-none flex flex-col items-start gap-1 p-1.5 md:p-2.5 h-full text-left">
                  <span class="text-sm md:text-base font-semibold pointer-events-none {todayClass ? 'text-rina-primary' : phaseInfo?.phase === 'menstrual' ? 'text-rose-600' : 'text-rina-text'}">
                    {day}
                  </span>
                  {#if dayEvents.length > 0}
                    <div class="flex flex-col gap-[3px] w-full overflow-hidden pointer-events-none">
                      {#each dayEvents.slice(0, 3) as event}
                        <button
                          type="button"
                          onclick={() => openEditModal(event)}
                          class="w-full text-left px-1.5 py-[3px] rounded-md text-[10px] md:text-xs truncate cursor-pointer hover:brightness-95 transition-all leading-tight font-medium pointer-events-auto"
                          style="background-color: {hexToRgba(getEventColor(event.type, event.color), 0.12)}; color: {getEventColor(event.type, event.color)}; border-left: 3px solid {getEventColor(event.type, event.color)};"
                          aria-label={event.title}
                          title={event.title}
                        >
                          <span class="mr-0.5">{getEventTypeIcon(event.type)}</span>{event.title}
                        </button>
                      {/each}
                      {#if dayEvents.length > 3}
                        <span class="text-[8px] md:text-[10px] text-rina-text-muted pl-0.5 font-medium pointer-events-none">+{dayEvents.length - 3} more</span>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="min-h-[72px] md:min-h-[110px]"></div>
            {/if}
          {/each}
        </div>

        <div class="flex items-center justify-between mt-4 pt-3 border-t border-rina-border">
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-full bg-rina-primary"></div><span class="text-[10px] text-rina-text-muted">Shared</span></div>
            <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-full bg-gray-400"></div><span class="text-[10px] text-rina-text-muted">Personal</span></div>
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

      <!-- Day Detail Panel -->
      {#if selectedDayDetail}
        {@const selectedDayEvents = events.filter((e) => eventMatchesDateStr(e, selectedDayDetail!))}
        {@const selectedDateObj = new Date(selectedDayDetail + 'T00:00:00')}
        <div class="card p-4 md:p-6" transition:slide>
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-base md:text-lg font-semibold text-rina-text font-display">
              {selectedDateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h4>
            <button onclick={() => openCreateModal(selectedDayDetail)} class="btn-secondary text-xs md:text-sm px-3 py-1.5">
              + Add Event
            </button>
          </div>
          {#if selectedDayEvents.length === 0}
            <div class="flex flex-col items-center justify-center py-10 text-center" transition:fade>
              <div class="w-14 h-14 rounded-full bg-rina-primary-soft flex items-center justify-center mb-4">
                <span class="text-2xl">📆</span>
              </div>
              <p class="text-sm md:text-base text-rina-text-muted mb-1">No events for this day</p>
              <p class="text-xs text-rina-text-muted/70 mb-4">Tap the button below to plan something special</p>
              <button onclick={() => openCreateModal(selectedDayDetail)} class="btn-primary text-sm px-5 py-2">
                + Add Event
              </button>
            </div>
          {:else}
            <div class="space-y-2.5">
              {#each selectedDayEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) as event (event.id)}
                <button
                  onclick={() => openEditModal(event)}
                  class="w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-rina-surface-muted hover:bg-rina-primary-soft transition-all duration-200 text-left group"
                  transition:slide
                >
                  <div class="w-1 h-10 md:h-12 rounded-full shrink-0" style="background-color: {getEventColor(event.type, event.color)}"></div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                      <p class="text-sm md:text-base font-semibold text-rina-text truncate group-hover:text-rina-primary transition-colors">{event.title}</p>
                      <span class="text-xs shrink-0" title={getEventTypeLabel(event.type)}>{getEventTypeIcon(event.type)}</span>
                    </div>
                    {#if event.description}
                      <p class="text-xs md:text-sm text-rina-text-muted truncate mb-1">{event.description}</p>
                    {/if}
                    <p class="text-[11px] md:text-xs text-rina-text-muted flex items-center gap-1.5 flex-wrap">
                      <span class="inline-flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        {event.allDay ? 'All day' : formatTime(event.startTime, getUserTimezone())}
                        {#if event.endTime && !event.allDay}
                          – {formatTime(event.endTime, getUserTimezone())}
                        {/if}
                      </span>
                      <span class="w-1 h-1 rounded-full bg-rina-text-muted/40"></span>
                      <span class="inline-flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        {formatEventDate(event)}
                      </span>
                    </p>
                  </div>
                  <svg class="w-4 h-4 md:w-5 md:h-5 text-rina-text-muted group-hover:text-rina-primary transition-colors shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {:else}
      <!-- Agenda View -->
      <div class="card p-4 md:p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base md:text-lg font-semibold text-rina-text font-display">Upcoming Events</h3>
          <span class="text-xs md:text-sm text-rina-text-muted">{monthName}</span>
        </div>

        {#if loading}
          <div class="flex items-center justify-center py-8 gap-3">
            <div class="w-6 h-6 rounded-full border-2 border-rina-border border-t-rina-primary animate-spin"></div>
            <p class="text-sm text-rina-text-muted">Loading events...</p>
          </div>
        {:else if upcomingEvents.length === 0}
          <div class="flex flex-col items-center justify-center py-12 text-center" transition:fade>
            <div class="w-14 h-14 rounded-full bg-rina-primary-soft flex items-center justify-center mb-4">
              <span class="text-2xl">📆</span>
            </div>
            <p class="text-sm md:text-base text-rina-text-muted mb-1">No upcoming events</p>
            <p class="text-xs text-rina-text-muted/70 mb-5">Plan your next special moment together</p>
            <button onclick={() => openCreateModal()} class="btn-primary text-sm px-5 py-2">
              + Add Event
            </button>
          </div>
        {:else}
          <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {#each upcomingEvents as event (event.id)}
              {@const eventDate = new Date(event.startTime)}
              <button
                onclick={() => openEditModal(event)}
                class="w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-rina-surface-muted hover:bg-rina-primary-soft transition-all duration-200 text-left group border-l-4"
                style="border-left-color: {getEventColor(event.type, event.color)}"
                transition:slide
              >
                <div class="flex flex-col items-center min-w-[3.5rem] md:min-w-[4rem]">
                  <span class="text-[10px] md:text-xs font-semibold text-rina-text-muted uppercase">{eventDate.toLocaleDateString('en-GB', { month: 'short', timeZone: getUserTimezone() })}</span>
                  <span class="text-xl md:text-2xl font-bold text-rina-text font-display">{eventDate.toLocaleDateString('en-GB', { day: 'numeric', timeZone: getUserTimezone() })}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5">
                    <p class="text-sm md:text-base font-semibold text-rina-text truncate group-hover:text-rina-primary transition-colors">{event.title}</p>
                    <span class="text-xs shrink-0" title={getEventTypeLabel(event.type)}>{getEventTypeIcon(event.type)}</span>
                  </div>
                  {#if event.description}
                    <p class="text-xs md:text-sm text-rina-text-muted truncate mb-1">{event.description}</p>
                  {/if}
                  <p class="text-[11px] md:text-xs text-rina-text-muted flex items-center gap-1.5 flex-wrap">
                    <span class="inline-flex items-center gap-1">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      {event.allDay ? 'All day' : formatTime(event.startTime, getUserTimezone())}
                      {#if event.endTime && !event.allDay}
                        – {formatTime(event.endTime, getUserTimezone())}
                      {/if}
                    </span>
                    <span class="w-1 h-1 rounded-full bg-rina-text-muted/40"></span>
                    <span class="inline-flex items-center gap-1">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      {formatEventDate(event)}
                    </span>
                  </p>
                </div>
                <svg class="w-4 h-4 md:w-5 md:h-5 text-rina-text-muted group-hover:text-rina-primary transition-colors shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Cycle Settings Modal -->
    {#if showCycleSettings}
      <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-rina-text/20 backdrop-blur-sm" transition:fade role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) showCycleSettings = false; }} onkeydown={(e) => e.key === 'Escape' && (showCycleSettings = false)}>
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-sm md:max-w-lg" transition:fly={{ y: 20 }}>
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
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-md md:max-w-lg max-h-[90vh] overflow-y-auto" transition:fly={{ y: 20 }}>
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
                  <option value="SHARED">💕 Shared</option>
                  <option value="PERSONAL">👤 Personal</option>
                  <option value="WORK">💼 Work</option>
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
