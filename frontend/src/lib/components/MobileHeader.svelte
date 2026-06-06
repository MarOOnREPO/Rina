<script lang="ts">
  import { onMount } from 'svelte';
  import { currentUser } from '$lib/stores/auth.svelte';
  import { formatTime, getOffsetLabel } from '$lib/utils/timezone';
  import { fade } from 'svelte/transition';

  // ─── Clocks ────────────────────────────────────────────────────
  let now = $state(new Date());
  let kenitraTime = $state('--:--');
  let permTime = $state('--:--');
  let kenitraOffset = $state('');
  let permOffset = $state('');

  // ─── Weather ───────────────────────────────────────────────────
  interface WeatherMini {
    temp: number;
    code: number;
    label: string;
  }

  let kenitraToday = $state<WeatherMini | null>(null);
  let permToday = $state<WeatherMini | null>(null);
  let kenitraTomorrow = $state<WeatherMini | null>(null);
  let permTomorrow = $state<WeatherMini | null>(null);
  let weatherLoading = $state(true);

  function updateClocks() {
    now = new Date();
    kenitraTime = formatTime(now, 'Africa/Casablanca');
    permTime = formatTime(now, 'Asia/Yekaterinburg');
    kenitraOffset = getOffsetLabel('Africa/Casablanca');
    permOffset = getOffsetLabel('Asia/Yekaterinburg');
  }

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

  async function fetchWeather(lat: number, lon: number, timezone: string): Promise<WeatherMini | null> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=${encodeURIComponent(timezone)}&forecast_days=2`;
      const res = await fetch(url);
      const data = await res.json();
      return {
        temp: Math.round(data.current_weather.temperature),
        code: data.current_weather.weathercode,
        label: timezone
      };
    } catch (err) {
      console.error('[Weather]', err);
      return null;
    }
  }

  async function fetchTomorrow(lat: number, lon: number, timezone: string): Promise<WeatherMini | null> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=${encodeURIComponent(timezone)}&forecast_days=2`;
      const res = await fetch(url);
      const data = await res.json();
      return {
        temp: Math.round(data.daily.temperature_2m_max[1]),
        code: data.daily.weathercode[1],
        label: timezone
      };
    } catch (err) {
      console.error('[Weather]', err);
      return null;
    }
  }

  async function loadWeather() {
    weatherLoading = true;
    const [kt, pt, ktom, ptom] = await Promise.all([
      fetchWeather(34.26, -6.58, 'Africa/Casablanca'),
      fetchWeather(58.01, 56.25, 'Asia/Yekaterinburg'),
      fetchTomorrow(34.26, -6.58, 'Africa/Casablanca'),
      fetchTomorrow(58.01, 56.25, 'Asia/Yekaterinburg')
    ]);
    kenitraToday = kt;
    permToday = pt;
    kenitraTomorrow = ktom;
    permTomorrow = ptom;
    weatherLoading = false;
  }

  onMount(() => {
    updateClocks();
    const interval = setInterval(updateClocks, 1000);
    loadWeather();
    return () => clearInterval(interval);
  });
</script>

{#if currentUser()}
  <header
    class="fixed-mobile top-0 z-40 glass-strong border-b border-rina-border md:hidden"
    in:fade={{ duration: 200 }}
  >
    <!-- Row 1: Clocks + Welcome -->
    <div class="flex items-center justify-between px-4 pt-safe pb-2">
      <!-- Kenitra Clock -->
      <div class="flex-1 min-w-0">
        <p class="text-[9px] font-medium text-rina-slate uppercase tracking-wider">Kenitra</p>
        <p class="text-xl font-bold tabular-nums leading-tight">{kenitraTime}</p>
        <p class="text-[9px] text-rina-slate-dark">{kenitraOffset}</p>
      </div>

      <!-- Center Welcome -->
      <div class="flex-1 text-center px-2">
        <p class="text-[9px] font-medium text-rina-slate uppercase tracking-wider">Bienvenue</p>
        <p class="text-sm font-bold text-gradient truncate">{currentUser()?.displayName || 'Love'}</p>
      </div>

      <!-- Perm Clock -->
      <div class="flex-1 min-w-0 text-right">
        <p class="text-[9px] font-medium text-rina-slate uppercase tracking-wider">Perm</p>
        <p class="text-xl font-bold tabular-nums leading-tight">{permTime}</p>
        <p class="text-[9px] text-rina-slate-dark">{permOffset}</p>
      </div>
    </div>

    <!-- Row 2: Weather Strip -->
    <div class="px-4 pb-2">
      {#if weatherLoading}
        <div class="flex items-center justify-center gap-4 py-1">
          <div class="h-3 bg-white/10 rounded w-16 animate-pulse"></div>
          <div class="h-3 bg-white/10 rounded w-16 animate-pulse"></div>
        </div>
      {:else}
        <div class="flex items-center justify-between">
          <!-- Today -->
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-bold text-rina-rose uppercase tracking-wider">Today</span>
            {#if kenitraToday}
              <span class="flex items-center gap-0.5 text-xs">
                <span>{weatherIcon(kenitraToday.code)}</span>
                <span class="font-medium">{kenitraToday.temp}°</span>
              </span>
            {/if}
            <span class="text-rina-border">|</span>
            {#if permToday}
              <span class="flex items-center gap-0.5 text-xs">
                <span>{weatherIcon(permToday.code)}</span>
                <span class="font-medium">{permToday.temp}°</span>
              </span>
            {/if}
          </div>

          <!-- Tomorrow -->
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-bold text-rina-indigo uppercase tracking-wider">Tomorrow</span>
            {#if kenitraTomorrow}
              <span class="flex items-center gap-0.5 text-xs">
                <span>{weatherIcon(kenitraTomorrow.code)}</span>
                <span class="font-medium">{kenitraTomorrow.temp}°</span>
              </span>
            {/if}
            <span class="text-rina-border">|</span>
            {#if permTomorrow}
              <span class="flex items-center gap-0.5 text-xs">
                <span>{weatherIcon(permTomorrow.code)}</span>
                <span class="font-medium">{permTomorrow.temp}°</span>
              </span>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </header>
{/if}
