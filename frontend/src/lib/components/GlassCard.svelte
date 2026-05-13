<script lang="ts">
  export let hover = true;
  export let padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  export let className = '';

  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-8'
  };
</script>

<div
  class="glass rounded-2xl {paddingClasses[padding]} {hover ? 'hover:bg-white/[0.04] transition-colors' : ''} {className}"
  {...$$restProps}
>
  <slot />
</div>
