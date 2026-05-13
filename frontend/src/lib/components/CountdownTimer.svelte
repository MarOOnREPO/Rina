<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { scale } from 'svelte/transition';

  export let targetDate: string;
  export let title: string;

  let now = Date.now();
  let interval: ReturnType<typeof setInterval>;

  $: target = new Date(targetDate).getTime();
  $: diff = Math.max(0, target - now);

  $: days = Math.floor(diff / (1000 * 60 * 60 * 24));
  $: hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  $: minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  $: seconds = Math.floor((diff % (1000 * 60)) / 1000);

  onMount(() => {
    interval = setInterval(() => {
      now = Date.now();
    }, 1000);
  });

  onDestroy(() => {
    clearInterval(interval);
  });

  function pad(n: number) {
    return n.toString().padStart(2, '0');
  }
</script>

<div class="glass rounded-2xl p-6 text-center" in:scale>
  <h3 class="text-sm font-medium text-rina-slate uppercase tracking-wider mb-4">{title}</h3>
  <div class="flex items-center justify-center gap-3">
    <div class="flex flex-col items-center">
      <span class="text-3xl md:text-4xl font-bold tabular-nums text-gradient">{pad(days)}</span>
      <span class="text-[10px] text-rina-slate uppercase mt-1">Days</span>
    </div>
    <span class="text-2xl text-rina-slate-dark pb-4">:</span>
    <div class="flex flex-col items-center">
      <span class="text-3xl md:text-4xl font-bold tabular-nums text-gradient">{pad(hours)}</span>
      <span class="text-[10px] text-rina-slate uppercase mt-1">Hrs</span>
    </div>
    <span class="text-2xl text-rina-slate-dark pb-4">:</span>
    <div class="flex flex-col items-center">
      <span class="text-3xl md:text-4xl font-bold tabular-nums text-gradient">{pad(minutes)}</span>
      <span class="text-[10px] text-rina-slate uppercase mt-1">Min</span>
    </div>
    <span class="text-2xl text-rina-slate-dark pb-4">:</span>
    <div class="flex flex-col items-center">
      <span class="text-3xl md:text-4xl font-bold tabular-nums text-gradient">{pad(seconds)}</span>
      <span class="text-[10px] text-rina-slate uppercase mt-1">Sec</span>
    </div>
  </div>
</div>
