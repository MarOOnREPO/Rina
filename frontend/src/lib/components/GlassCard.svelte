<script lang="ts">
  interface Props {
    hover?: boolean;
    padding?: 'none' | 'sm' | 'md' | 'lg';
    class?: string;
    children?: import('svelte').Snippet;
    [key: string]: unknown;
  }

  let { hover = true, padding = 'md', class: className = '', children, ...rest }: Props = $props();

  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-8'
  };
</script>

<div
  class="glass rounded-2xl {paddingClasses[padding]} {hover ? 'hover:bg-white/[0.04] transition-colors' : ''} {className}"
  {...rest}
>
  {@render children?.()}
</div>
