<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import GlassCard from './GlassCard.svelte';

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
    <div class="h-4 bg-white/10 rounded w-1/3 mb-2"></div>
    <div class="h-8 bg-white/10 rounded w-1/2"></div>
  </div>
{:else if data}
  <div class="grid grid-cols-2 gap-3">
    <!-- Today -->
    <button
      onclick={() => openModal('today')}
      class="glass rounded-2xl p-4 text-left hover:bg-white/5 transition-colors group"
    >
      <p class="text-[10px] font-medium text-rina-slate uppercase tracking-wider mb-1">Today — {label}</p>
      <div class="flex items-center gap-2">
        <span class="text-2xl group-hover:scale-110 transition-transform">{weatherIcon(data.current_weather.weathercode, !!data.current_weather.is_day)}</span>
        <div>
          <p class="text-xl font-bold">{Math.round(data.current_weather.temperature)}°</p>
          <p class="text-[10px] text-rina-slate">{weatherLabel(data.current_weather.weathercode)}</p>
        </div>
      </div>
    </button>

    <!-- Tomorrow -->
    <button
      onclick={() => openModal('tomorrow')}
      class="glass rounded-2xl p-4 text-left hover:bg-white/5 transition-colors group"
    >
      <p class="text-[10px] font-medium text-rina-slate uppercase tracking-wider mb-1">Tomorrow — {label}</p>
      <div class="flex items-center gap-2">
        <span class="text-2xl group-hover:scale-110 transition-transform">{weatherIcon(tCode)}</span>
        <div>
          <p class="text-xl font-bold">{Math.round(tMax)}° <span class="text-sm text-rina-slate font-normal">/ {Math.round(tMin)}°</span></p>
          <p class="text-[10px] text-rina-slate">{weatherLabel(tCode)}</p>
        </div>
      </div>
    </button>
  </div>
{/if}

<!-- Hourly Forecast Modal -->
{#if showModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    transition:fade
    onclick={() => showModal = false}
  >
    <div
      class="glass-strong rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto"
      transition:scale
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">
          {modalDay === 'today' ? 'Today' : 'Tomorrow'} — {label}
        </h3>
        <button onclick={() => showModal = false} class="text-rina-slate hover:text-white transition-colors text-xl">×</button>
      </div>

      <div class="space-y-2">
        {#each modalHourly as h}
          <div class="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03]">
            <span class="text-xs text-rina-slate w-10">{h.hour}</span>
            <span class="text-lg">{weatherIcon(h.code)}</span>
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <div class="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-rina-rose to-rina-indigo"
                    style="width: {Math.min(100, Math.max(0, (h.temp + 10) / 50 * 100))}%"
                  ></div>
                </div>
                <span class="text-sm font-medium w-10 text-right">{Math.round(h.temp)}°</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
