<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { cycleApi, type CycleEntry } from '$lib/utils/api';
  import { fade, fly } from 'svelte/transition';

  let entries = $state<CycleEntry[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingId = $state<string | null>(null);

  let date = $state(new Date().toISOString().split('T')[0]);
  let flowIntensity = $state<number | undefined>(undefined);
  let symptoms = $state<string[]>([]);
  let temperature = $state<number | undefined>(undefined);
  let notes = $state('');

  const symptomOptions = ['cramps', 'bloating', 'headache', 'mood swings', 'fatigue', 'acne', 'cravings', 'insomnia'];
  const flowLabels = ['None', 'Light', 'Medium', 'Heavy', 'Very Heavy'];
  const flowColors = ['bg-white/10', 'bg-rose-300/30', 'bg-rose-400/40', 'bg-rose-500/50', 'bg-rose-600/60'];

  async function loadEntries() {
    try {
      entries = await cycleApi.list();
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    date = new Date().toISOString().split('T')[0];
    flowIntensity = undefined;
    symptoms = [];
    temperature = undefined;
    notes = '';
    editingId = null;
  }

  function editEntry(entry: CycleEntry) {
    editingId = entry.id;
    date = entry.date.split('T')[0];
    flowIntensity = entry.flowIntensity ?? undefined;
    symptoms = entry.symptoms || [];
    temperature = entry.temperature ?? undefined;
    notes = entry.notes || '';
    showForm = true;
  }

  async function saveEntry() {
    try {
      const data = {
        date,
        flowIntensity,
        symptoms,
        temperature,
        notes: notes || undefined
      };
      if (editingId) {
        await cycleApi.update(editingId, data);
      } else {
        await cycleApi.create(data);
      }
      await loadEntries();
      showForm = false;
      resetForm();
    } catch {
      alert('Failed to save');
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this entry?')) return;
    try {
      await cycleApi.remove(id);
      entries = entries.filter((e) => e.id !== id);
    } catch {
      alert('Failed to delete');
    }
  }

  function toggleSymptom(s: string) {
    if (symptoms.includes(s)) {
      symptoms = symptoms.filter((x) => x !== s);
    } else {
      symptoms = [...symptoms, s];
    }
  }

  function getPhase(entry?: CycleEntry): { label: string; color: string; emoji: string } {
    if (!entry) return { label: 'Unknown', color: 'bg-white/5', emoji: '❓' };
    const intensity = entry.flowIntensity ?? 0;
    if (intensity >= 2) return { label: 'Period', color: 'bg-rose-500/20', emoji: '🩸' };
    if (intensity === 1) return { label: 'Spotting', color: 'bg-rose-300/20', emoji: '💧' };
    return { label: 'Follicular', color: 'bg-emerald-500/20', emoji: '🌱' };
  }

  onMount(() => {
    loadEntries();
  });

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });
</script>

{#if isAuthenticated()}
  <div class="px-3 py-4 space-y-4" in:fade={{ duration: 200 }}>
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-white">🌙 Cycle Tracker</h1>
        <p class="text-xs text-white/50 mt-0.5">Track your cycle with care</p>
      </div>
      <button
        onclick={() => { showForm = !showForm; if (!showForm) resetForm(); }}
        class="px-3 py-1.5 rounded-lg bg-rina-rose/15 text-rina-rose text-sm font-semibold hover:bg-rina-rose/25 transition-colors"
      >
        {showForm ? 'Cancel' : '+ Entry'}
      </button>
    </div>

    {#if showForm}
      <div class="glass rounded-xl p-4 space-y-3" transition:fly={{ y: 10, duration: 200 }}>
        <input
          type="date"
          bind:value={date}
          class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-rina-rose/50"
        />

        <div>
          <label class="text-xs text-white/50 mb-1.5 block">Flow Intensity</label>
          <div class="flex gap-1.5">
            {#each flowLabels as label, i}
              <button
                onclick={() => flowIntensity = i}
                class="flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all {flowIntensity === i ? flowColors[i] + ' text-white ring-1 ring-white/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}"
              >
                {label}
              </button>
            {/each}
          </div>
        </div>

        <div>
          <label class="text-xs text-white/50 mb-1.5 block">Symptoms</label>
          <div class="flex flex-wrap gap-1.5">
            {#each symptomOptions as s}
              <button
                onclick={() => toggleSymptom(s)}
                class="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all {symptoms.includes(s) ? 'bg-rina-rose/20 text-rina-rose ring-1 ring-rina-rose/30' : 'bg-white/5 text-white/40 hover:bg-white/10'}"
              >
                {s}
              </button>
            {/each}
          </div>
        </div>

        <input
          type="number"
          step="0.1"
          bind:value={temperature}
          placeholder="Temperature (°C)"
          class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-rina-rose/50"
        />

        <textarea
          bind:value={notes}
          placeholder="Notes..."
          rows="2"
          class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-rina-rose/50 resize-none"
        ></textarea>

        <button
          onclick={saveEntry}
          class="w-full py-2 rounded-lg bg-rina-rose text-white font-semibold text-sm hover:bg-rina-rose/90 transition-colors"
        >
          {editingId ? 'Update' : 'Save'}
        </button>
      </div>
    {/if}

    {#if loading}
      <div class="text-center py-8 text-white/50 text-sm">Loading...</div>
    {:else if entries.length === 0}
      <div class="text-center py-8 text-white/50 text-sm">No entries yet. Start tracking!</div>
    {:else}
      <div class="space-y-2">
        {#each entries as entry (entry.id)}
          {@const phase = getPhase(entry)}
          <div class="glass rounded-xl p-3 flex items-start gap-3 transition-all hover:bg-white/[0.03]" transition:fly={{ y: 5, duration: 150 }}>
            <div class="w-10 h-10 rounded-full {phase.color} flex items-center justify-center text-lg shrink-0">
              {phase.emoji}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <p class="text-sm font-semibold text-white">{new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <span class="text-[10px] font-medium px-2 py-0.5 rounded-full {phase.color} text-white/80">{phase.label}</span>
              </div>
              {#if entry.flowIntensity !== undefined && entry.flowIntensity !== null}
                <div class="mt-1 flex items-center gap-1.5">
                  <div class="flex gap-0.5">
                    {#each Array(5) as _, i}
                      <div class="w-3 h-1 rounded-full {i <= entry.flowIntensity ? 'bg-rose-400' : 'bg-white/10'}"></div>
                    {/each}
                  </div>
                  <span class="text-[10px] text-white/40">{flowLabels[entry.flowIntensity]}</span>
                </div>
              {/if}
              {#if entry.symptoms?.length}
                <div class="mt-1 flex flex-wrap gap-1">
                  {#each entry.symptoms as s}
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50">{s}</span>
                  {/each}
                </div>
              {/if}
              {#if entry.temperature}
                <p class="text-[11px] text-white/40 mt-0.5">🌡️ {entry.temperature}°C</p>
              {/if}
              {#if entry.notes}
                <p class="text-[11px] text-white/40 mt-0.5 italic">{entry.notes}</p>
              {/if}
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              <button onclick={() => editEntry(entry)} class="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
              <button onclick={() => deleteEntry(entry.id)} class="p-1 rounded hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
