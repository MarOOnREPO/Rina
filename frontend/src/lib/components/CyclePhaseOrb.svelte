<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';

  interface Props {
    lastPeriodStart: string | null;
    cycleLength: number;
  }

  let { lastPeriodStart, cycleLength }: Props = $props();

  let orbRef = $state<HTMLDivElement | null>(null);
  let glowRef = $state<HTMLDivElement | null>(null);

  type Phase = {
    name: string;
    subtitle: string;
    color: string;
    glow: string;
    scale: number;
  };

  function getPhase(): Phase {
    if (!lastPeriodStart) {
      return { name: 'Set Cycle', subtitle: 'Open settings to begin', color: '#475569', glow: '#64748b', scale: 1 };
    }
    const start = new Date(lastPeriodStart);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const day = ((diff % cycleLength) + cycleLength) % cycleLength;
    const progress = day / cycleLength;

    if (day < 5) {
      return { name: 'Release', subtitle: 'Rest and renew', color: '#be123c', glow: '#fb7185', scale: 0.94 };
    }
    if (progress < 0.45) {
      return { name: 'Rise', subtitle: 'Energy returns like sunlight', color: '#ec4899', glow: '#f9a8d4', scale: 1.04 };
    }
    if (progress < 0.55) {
      return { name: 'Bloom', subtitle: 'Peak vitality and openness', color: '#f59e0b', glow: '#fcd34d', scale: 1.14 };
    }
    return { name: 'Reflect', subtitle: 'Turning inward, gently', color: '#6366f1', glow: '#a5b4fc', scale: 1 };
  }

  let phase = $derived(getPhase());

  $effect(() => {
    if (!orbRef) return;
    gsap.to(orbRef, {
      background: `radial-gradient(circle at 35% 35%, ${phase.glow}, ${phase.color})`,
      scale: phase.scale,
      duration: 1.4,
      ease: 'power2.out'
    });
  });

  onMount(() => {
    if (!glowRef) return;
    gsap.to(glowRef, {
      opacity: 0.5,
      scale: 1.2,
      duration: 2.4,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1
    });
  });
</script>

<div class="flex items-center gap-4 p-4 glass rounded-2xl">
  <div class="relative w-14 h-14 flex-shrink-0">
    <div bind:this={orbRef} class="w-full h-full rounded-full bg-slate-700 shadow-inner"></div>
    <div bind:this={glowRef} class="absolute inset-0 rounded-full opacity-30 blur-lg bg-white pointer-events-none"></div>
  </div>
  <div class="min-w-0">
    <p class="text-sm font-semibold text-white tracking-wide">{phase.name}</p>
    <p class="text-xs text-rina-slate-dark">{phase.subtitle}</p>
  </div>
</div>
