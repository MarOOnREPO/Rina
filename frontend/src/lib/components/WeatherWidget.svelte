<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';


  interface HourlyData {
    time: string[];
    temperature_2m: number[];
    weathercode: number[];
  }

  interface WeatherResponse {
    current_weather: {
      temperature: number;
      weathercode: number;
      is_day: number;
    };
    hourly: HourlyData;
    daily?: {
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weathercode: number[];
    };
  }

  let {
    lat,
    lon,
    timezone,
    label
  }: { lat: number; lon: number; timezone: string; label: string } = $props();

  let data = $state<WeatherResponse | null>(null);
  let loading = $state(true);
  let showModal = $state(false);
  let modalDay: 'today' | 'tomorrow' = $state('today');

  let tCode = $derived(data?.daily?.weathercode[1] ?? 0);
  let tMax = $derived(data?.daily?.temperature_2m_max[1] ?? 0);
  let tMin = $derived(data?.daily?.temperature_2m_min[1] ?? 0);
  let modalHourly = $derived(modalDay === 'today' ? getTodayHourly() : getTomorrowHourly());

  function weatherIcon(code: number, isDay = true): string {
    if (code <= 1) return isDay ? '☀️' : '🌙';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '🌨️';
    if (code <= 82) return '🌦️';
    if (code <= 86) return '❄️';
    if (code <= 99) return '⛈️';
    return '🌡️';
  }

  function weatherLabel(code: number): string {
    if (code <= 1) return 'Clear';
    if (code <= 3) return 'Partly cloudy';
    if (code <= 48) return 'Foggy';
    if (code <= 67) return 'Rainy';
    if (code <= 77) return 'Snowy';
    if (code <= 82) return 'Showers';
    if (code <= 86) return 'Snowfall';
    if (code <= 99) return 'Stormy';
    return 'Unknown';
  }

  async function fetchWeather() {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=${encodeURIComponent(timezone)}&forecast_days=3`;
      const res = await fetch(url);
      data = await res.json();
    } catch (err) {
      console.error('[Weather]', err);
    } finally {
      loading = false;
    }
  }

  function getTodayHourly(): { hour: string; temp: number; code: number }[] {
    if (!data?.hourly) return [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    return data.hourly.time
      .map((t, i) => ({ time: t, temp: data!.hourly.temperature_2m[i], code: data!.hourly.weathercode[i] }))
      .filter((d) => d.time.startsWith(todayStr))
      .map((d) => ({ hour: d.time.slice(11, 16), temp: d.temp, code: d.code }));
  }

  function getTomorrowHourly(): { hour: string; temp: number; code: number }[] {
    if (!data?.hourly) return [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    return data.hourly.time
      .map((t, i) => ({ time: t, temp: data!.hourly.temperature_2m[i], code: data!.hourly.weathercode[i] }))
      .filter((d) => d.time.startsWith(tomorrowStr))
      .map((d) => ({ hour: d.time.slice(11, 16), temp: d.temp, code: d.code }));
  }

  function openModal(day: 'today' | 'tomorrow') {
    modalDay = day;
    showModal = true;
  }

  onMount(() => {
    fetchWeather();
  });
</script>

{#if loading}
  <div class="glass rounded-2xl p-4 md:p-5 animate-pulse">
    <div class="h-4 bg-rina-surface-muted rounded w-1/3 mb-2"></div>
    <div class="h-8 bg-rina-surface-muted rounded w-1/2"></div>
  </div>
{:else if data}
  <div class="grid grid-cols-2 gap-3">
    <!-- Today -->
    <button
      onclick={() => openModal('today')}
      class="glass rounded-2xl p-4 text-left hover:bg-rina-glass-strong transition-colors duration-200 group"
    >
      <p class="text-[10px] font-medium text-rina-text-muted uppercase tracking-wider mb-1">Today — {label}</p>
      <div class="flex items-center gap-2">
        <span class="text-2xl group-hover:scale-110 transition-transform duration-200">{weatherIcon(data.current_weather.weathercode, !!data.current_weather.is_day)}</span>
        <div>
          <p class="text-xl font-bold text-rina-text">{Math.round(data.current_weather.temperature)}°</p>
          <p class="text-[10px] text-rina-text-muted">{weatherLabel(data.current_weather.weathercode)}</p>
        </div>
      </div>
    </button>

    <!-- Tomorrow -->
    <button
      onclick={() => openModal('tomorrow')}
      class="glass rounded-2xl p-4 text-left hover:bg-rina-glass-strong transition-colors duration-200 group"
    >
      <p class="text-[10px] font-medium text-rina-text-muted uppercase tracking-wider mb-1">Tomorrow — {label}</p>
      <div class="flex items-center gap-2">
        <span class="text-2xl group-hover:scale-110 transition-transform duration-200">{weatherIcon(tCode)}</span>
        <div>
          <p class="text-xl font-bold text-rina-text">{Math.round(tMax)}° <span class="text-sm text-rina-text-muted font-normal">/ {Math.round(tMin)}°</span></p>
          <p class="text-[10px] text-rina-text-muted">{weatherLabel(tCode)}</p>
        </div>
      </div>
    </button>
  </div>
{/if}

<!-- Hourly Forecast Modal -->
{#if showModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rina-text/20 backdrop-blur-sm"
    transition:fade
    role="button"
    tabindex="0"
    onclick={() => showModal = false}
    onkeydown={(e) => e.key === 'Escape' && (showModal = false)}
  >
    <div
      class="glass-strong rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto border border-rina-border shadow-soft-xl"
      transition:scale
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && (showModal = false)}
    >
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-display font-semibold text-rina-text">
          {modalDay === 'today' ? 'Today' : 'Tomorrow'} — {label}
        </h3>
        <button onclick={() => showModal = false} class="text-rina-text-muted hover:text-rina-text transition-colors text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rina-surface-muted">×</button>
      </div>

      <div class="space-y-2">
        {#each modalHourly as h}
          <div class="flex items-center gap-3 p-2 rounded-xl bg-rina-surface-muted">
            <span class="text-xs text-rina-text-secondary w-10 font-medium">{h.hour}</span>
            <span class="text-lg">{weatherIcon(h.code)}</span>
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <div class="flex-1 h-1.5 rounded-full bg-rina-border overflow-hidden">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-rina-primary to-rina-secondary"
                    style="width: {Math.min(100, Math.max(0, (h.temp + 10) / 50 * 100))}%"
                  ></div>
                </div>
                <span class="text-sm font-medium w-10 text-right text-rina-text">{Math.round(h.temp)}°</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
