<script lang="ts">
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  interface Props {
    href: string;
    icon: string;
    title: string;
    subtitle?: string;
    size?: 'sm' | 'md' | 'lg' | 'wide';
    color?: string;
    delay?: number;
    children?: import('svelte').Snippet;
  }

  let {
    href,
    icon,
    title,
    subtitle = '',
    size = 'md',
    color = 'from-white/5 to-white/[0.02]',
    delay = 0,
    children
  }: Props = $props();

  const sizeClasses = {
    sm: 'col-span-1 row-span-1',
    md: 'col-span-1 row-span-1',
    lg: 'col-span-1 md:col-span-2 row-span-1 md:row-span-2',
    wide: 'col-span-1 md:col-span-2 row-span-1'
  };
</script>

<a
  {href}
  class="group relative glass rounded-2xl p-4 md:p-5 flex flex-col
    bg-gradient-to-br {color}
    hover:bg-white/[0.06] hover:scale-[1.01] hover:shadow-lg hover:shadow-black/20
    active:scale-[0.98] transition-all duration-300 overflow-hidden
    {sizeClasses[size]}"
  in:scale={{ duration: 400, delay, easing: cubicOut, start: 0.9 }}
>
  <!-- Glow effect on hover -->
  <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>

  <!-- Header -->
  <div class="relative flex items-start justify-between mb-2">
    <span class="text-2xl md:text-3xl group-hover:scale-110 transition-transform duration-300">{icon}</span>
    <svg class="w-4 h-4 text-rina-slate-dark group-hover:text-rina-slate group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M17 7H7M17 7v10"/>
    </svg>
  </div>

  <!-- Title -->
  <div class="relative mt-auto">
    <h3 class="font-semibold text-sm md:text-base group-hover:text-white transition-colors">{title}</h3>
    {#if subtitle}
      <p class="text-xs text-rina-slate-dark mt-0.5 line-clamp-1">{subtitle}</p>
    {/if}
  </div>

  <!-- Optional content slot -->
  {#if children}
    <div class="relative mt-2 flex-1 min-h-0">
      {@render children()}
    </div>
  {/if}
</a>
