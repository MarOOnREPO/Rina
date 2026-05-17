<script lang="ts">
  import { pingReceived } from '$lib/stores/socket.svelte';
  import { scale, fade } from 'svelte/transition';
  import { elasticOut } from 'svelte/easing';

  let ping = $derived(pingReceived.value);

  // Trigger vibration when ping arrives
  $effect(() => {
    if (ping && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([100, 50, 200, 50, 100]);
    }
  });
</script>

{#if ping}
  <div
    class="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
    transition:fade={{ duration: 400 }}
  >
    <!-- Soft screen glow -->
    <div
      class="absolute inset-0 bg-rina-rose/10 animate-pulse-slow"
      style="backdrop-filter: blur(2px);"
    ></div>

    <!-- Heart -->
    <div
      class="relative z-10"
      in:scale={{ duration: 600, easing: elasticOut, start: 0.2 }}
      out:scale={{ duration: 300, start: 1, delay: 300 }}
    >
      <svg
        width="120"
        height="120"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="drop-shadow-[0_0_30px_rgba(251,113,133,0.6)]"
      >
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill="#fb7185"
        />
      </svg>
      <p class="text-center mt-4 text-rina-rose font-semibold text-lg drop-shadow-lg">
        {ping.from} is thinking of you
      </p>
    </div>
  </div>
{/if}
