<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth';
  import { fade, fly, slide } from 'svelte/transition';
  import { calendarApi, type CalendarEvent } from '$lib/utils/api';
  import GlassCard from '$lib/components/GlassCard.svelte';
  import CountdownTimer from '$lib/components/CountdownTimer.svelte';
  import { countdownApi, type Countdown } from '$lib/utils/api';

  let currentDate = new Date();
  let events: CalendarEvent[] = [];
  let countdowns: Countdown[] = [];
  let loading = true;
  let showAddModal = false;
  let selectedDate: string | null = null;

  // New event form
  let newEvent: Partial<CalendarEvent> = {
    title: '',
    description: '',
    type: 'SHARED',
    allDay: false
  };

  $: year = currentDate.getFullYear();
  $: month = currentDate.getMonth();
  $: monthName = currentDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  $: firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sunday
  $: daysInMonth = new Date(year, month + 1, 0).getDate();
  $: calendarDays = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDayOfMonth + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return dayNum;
  });

  $: daysWithEvents = calendarDays.map((day) => {
    if (!day) return null;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = events.filter((e) => {
      const d = new Date(e.startTime);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
    return { day, dateStr, events: dayEvents };
  });

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

  // Simple period tracker logic (mock for demo)
  function isPeriodDay(day: number): boolean {
    // Mock: every 28 days starting from day 5
    return (day + month * 31) % 28 === 5;
  }

  function isFertileDay(day: number): boolean {
    // Mock: fertile window ~14 days after period
    return (day + month * 31) % 28 === 19;
  }

  // Redirect if not authenticated (wait for auth loading to finish)
  $: if (!$isLoading && !$isAuthenticated && typeof window !== 'undefined') {
    goto('/login');
  }

  onMount(() => {
    loadData();
  });
</script>

{#if $isAuthenticated}
  <div class="max-w-5xl mx-auto px-4 py-6" in:fade>
    <h2 class="text-2xl font-bold mb-6">📅 Calendar</h2>

    <!-- Countdowns -->
    {#if countdowns.length > 0}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {#each countdowns as cd (cd.id)}
          <CountdownTimer targetDate={cd.targetDate} title={cd.title} />
        {/each}}
      </div>
    {/if}

    <!-- Calendar Grid -->
    <GlassCard className="mb-6">
      <div class="flex items-center justify-between mb-4">
        <button on:click={prevMonth} class="p-2 rounded-lg hover:bg-white/5 transition-colors text-rina-slate">
          ←
        </button>
        <h3 class="text-lg font-semibold">{monthName}</h3>
        <button on:click={nextMonth} class="p-2 rounded-lg hover:bg-white/5 transition-colors text-rina-slate">
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
              on:click={() => openAddModal(dateStr)}
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

      <!-- Legend -->
      <div class="flex items-center gap-4 mt-4 text-xs text-rina-slate">
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
    </GlassCard>

    <!-- Add Event Modal -->
    {#if showAddModal}
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade on:click={() => showAddModal = false}>
        <div class="glass-strong rounded-2xl p-6 w-full max-w-md" transition:fly={{ y: 20 }} on:click|stopPropagation>
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
              <button on:click={() => showAddModal = false} class="flex-1 py-2 rounded-lg border border-rina-border text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button on:click={saveEvent} class="flex-1 py-2 rounded-lg bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
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
