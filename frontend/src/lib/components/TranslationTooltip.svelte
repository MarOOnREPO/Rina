<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';

  let selectedText = '';
  let translation = '';
  let loading = false;
  let show = false;
  let x = 0;
  let y = 0;
  let longPressTimer: ReturnType<typeof setTimeout>;

  const LANGUAGES: Record<string, string> = {
    'darija': 'Moroccan Arabic (Darija)',
    'ru': 'Russian',
    'fr': 'French',
    'ar': 'Arabic'
  };

  async function translate(text: string, targetLang = 'en') {
    loading = true;
    try {
      // Using LibreTranslate API (free, no key required for demo)
      const response = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: 'auto',
          target: targetLang,
          format: 'text'
        })
      });
      const data = await response.json() as { translatedText?: string };
      translation = data.translatedText || 'Translation unavailable';
    } catch {
      translation = 'Translation service unavailable';
    } finally {
      loading = false;
    }
  }

  function handleTouchStart(e: TouchEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.no-translate')) return;

    longPressTimer = setTimeout(() => {
      const selection = window.getSelection()?.toString().trim();
      if (selection && selection.length > 0 && selection.length < 200) {
        selectedText = selection;
        const touch = e.touches[0];
        x = touch.clientX;
        y = touch.clientY - 60;
        show = true;
        translate(selection);
      }
    }, 600);
  }

  function handleTouchEnd() {
    clearTimeout(longPressTimer);
  }

  function handleMouseUp(e: MouseEvent) {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 0 && selection.length < 200) {
      selectedText = selection;
      x = e.clientX;
      y = e.clientY - 60;
      show = true;
      translate(selection);
    } else {
      show = false;
    }
  }

  onMount(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);
  });

  onDestroy(() => {
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchstart', handleTouchStart);
    document.removeEventListener('touchend', handleTouchEnd);
  });
</script>

{#if show}
  <div
    class="fixed z-[90] glass-strong rounded-xl p-3 shadow-2xl max-w-xs"
    style="left: {Math.min(Math.max(x, 10), window.innerWidth - 220)}px; top: {Math.max(y, 10)}px;"
    transition:scale={{ duration: 150, start: 0.9 }}
  >
    <div class="flex items-center justify-between mb-1.5">
      <p class="text-[10px] font-medium text-rina-slate uppercase tracking-wider">Translation</p>
      <button on:click={() => show = false} class="text-rina-slate-dark hover:text-white text-xs">×</button>
    </div>
    <p class="text-xs text-rina-slate-dark mb-2 line-clamp-2">“{selectedText}”</p>
    {#if loading}
      <div class="flex items-center gap-2 text-xs text-rina-slate">
        <span class="animate-spin">⏳</span> Translating...
      </div>
    {:else}
      <p class="text-sm text-white font-medium">{translation}</p>
    {/if}
  </div>
{/if}
