<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '$lib/stores/auth';
  import { fade, scale } from 'svelte/transition';
  import GlassCard from '$lib/components/GlassCard.svelte';

  let meals = [
    '🇲🇦 Couscous',
    '🇷🇺 Borscht',
    '🍕 Pizza',
    '🍣 Sushi',
    '🌮 Tacos',
    '🍔 Burgers',
    '🥗 Healthy Salad',
    '🍝 Pasta',
    '🥘 Paella',
    '🍛 Curry',
    '🥞 Pancakes',
    '🍜 Ramen'
  ];

  let rotation = 0;
  let spinning = false;
  let selectedMeal: string | null = null;
  let showAdd = false;
  let newMeal = '';

  function spin() {
    if (spinning) return;
    spinning = true;
    selectedMeal = null;

    const extraSpins = 5 + Math.random() * 3;
    const segmentAngle = 360 / meals.length;
    const randomOffset = Math.random() * segmentAngle;
    const targetRotation = rotation + extraSpins * 360 + randomOffset;

    const start = performance.now();
    const duration = 4000;
    const startRot = rotation;

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      rotation = startRot + (targetRotation - startRot) * ease;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        spinning = false;
        const normalized = (360 - (rotation % 360)) % 360;
        const index = Math.floor(normalized / segmentAngle) % meals.length;
        selectedMeal = meals[index];
      }
    }

    requestAnimationFrame(animate);
  }

  function addMeal() {
    if (!newMeal.trim()) return;
    meals = [...meals, newMeal.trim()];
    newMeal = '';
    showAdd = false;
  }

  function removeMeal(index: number) {
    if (meals.length <= 2) return;
    meals = meals.filter((_, i) => i !== index);
  }

  onMount(() => {
    if (!$isAuthenticated) goto('/login');
  });
</script>

{#if $isAuthenticated}
  <div class="max-w-2xl mx-auto px-4 py-6" in:fade>
    <h2 class="text-2xl font-bold mb-6">🍽️ Dinner Date Roulette</h2>

    <!-- Wheel -->
    <div class="flex flex-col items-center">
      <div class="relative w-72 h-72 md:w-96 md:h-96" in:scale>
        <!-- Pointer -->
        <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
          <div class="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-rina-rose"></div>
        </div>

        <!-- Wheel SVG -->
        <svg
          viewBox="0 0 100 100"
          class="w-full h-full drop-shadow-2xl"
          style="transform: rotate({rotation}deg); transition: none;"
        >
          {#each meals as meal, i}
            {@const angle = (360 / meals.length) * i}
            {@const nextAngle = (360 / meals.length) * (i + 1)}
            {@const rad1 = (angle * Math.PI) / 180}
            {@const rad2 = (nextAngle * Math.PI) / 180}
            {@const x1 = 50 + 45 * Math.cos(rad1)}
            {@const y1 = 50 + 45 * Math.sin(rad1)}
            {@const x2 = 50 + 45 * Math.cos(rad2)}
            {@const y2 = 50 + 45 * Math.sin(rad2)}
            {@const midAngle = (angle + nextAngle) / 2}
            {@const midRad = (midAngle * Math.PI) / 180}
            {@const tx = 50 + 30 * Math.cos(midRad)}
            {@const ty = 50 + 30 * Math.sin(midRad)}
            {@const colors = ['#fb7185', '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#fb923c']}

            <path
              d="M50,50 L{x1},{y1} A45,45 0 0,1 {x2},{y2} Z"
              fill={colors[i % colors.length]}
              opacity="0.8"
              stroke="rgba(255,255,255,0.1)"
              stroke-width="0.5"
            />
            <text
              x={tx}
              y={ty}
              text-anchor="middle"
              dominant-baseline="middle"
              fill="white"
              font-size="4"
              font-weight="600"
              transform="rotate({midAngle + 90}, {tx}, {ty})"
            >
              {meal.length > 8 ? meal.slice(0, 6) + '..' : meal}
            </text>
          {/each}

          <!-- Center circle -->
          <circle cx="50" cy="50" r="8" fill="#0f0f1a" stroke="rgba(255,255,255,0.2)" stroke-width="0.5" />
          <circle cx="50" cy="50" r="3" fill="#fb7185" />
        </svg>
      </div>

      <!-- Result -->
      {#if selectedMeal}
        <div class="mt-6 text-center" in:scale>
          <p class="text-sm text-rina-slate mb-1">Tonight we're having...</p>
          <p class="text-3xl font-bold text-gradient">{selectedMeal}</p>
        </div>
      {/if}

      <!-- Controls -->
      <button
        on:click={spin}
        disabled={spinning}
        class="mt-8 px-10 py-4 rounded-full bg-gradient-to-r from-rina-rose to-rina-indigo text-white font-bold text-lg
          hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rina-rose/20"
      >
        {spinning ? 'Spinning...' : 'SPIN'}
      </button>
    </div>

    <!-- Meal List -->
    <GlassCard className="mt-8">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold">Menu Options</h3>
        <button
          on:click={() => showAdd = true}
          class="text-xs px-3 py-1.5 rounded-lg bg-rina-rose/20 text-rina-rose hover:bg-rina-rose/30 transition-colors"
        >
          + Add
        </button>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each meals as meal, i}
          <div class="flex items-center gap-1 px-3 py-1.5 rounded-full glass text-sm">
            {meal}
            <button
              on:click={() => removeMeal(i)}
              class="ml-1 text-rina-slate-dark hover:text-rina-rose transition-colors"
              aria-label="Remove {meal}"
            >
              ×
            </button>
          </div>
        {/each}
      </div>
    </GlassCard>

    {#if showAdd}
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade on:click={() => showAdd = false}>
        <div class="glass-strong rounded-2xl p-6 w-full max-w-sm" transition:scale on:click|stopPropagation>
          <h3 class="text-lg font-semibold mb-4">Add Meal</h3>
          <input
            bind:value={newMeal}
            placeholder="e.g. 🇮🇹 Risotto"
            class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 mb-4"
            on:keydown={(e) => e.key === 'Enter' && addMeal()}
          />
          <div class="flex gap-2">
            <button on:click={() => showAdd = false} class="flex-1 py-2 rounded-lg border border-rina-border text-sm hover:bg-white/5">Cancel</button>
            <button on:click={addMeal} class="flex-1 py-2 rounded-lg bg-rina-rose text-white text-sm font-medium hover:opacity-90">Add</button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
