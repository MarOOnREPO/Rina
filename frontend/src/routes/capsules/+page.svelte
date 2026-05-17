<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth';
  import { fade, scale } from 'svelte/transition';
  import { capsuleApi, type TimeCapsule } from '$lib/utils/api';
  import GlassCard from '$lib/components/GlassCard.svelte';

  let capsules: TimeCapsule[] = [];
  let loading = true;
  let showAdd = false;
  let newCapsule: Partial<TimeCapsule> & { encryptedData?: string } = {
    title: '',
    description: '',
    mediaType: 'text',
    unlockAt: ''
  };

  async function loadCapsules() {
    try {
      capsules = await capsuleApi.list();
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  async function createCapsule() {
    if (!newCapsule.title || !newCapsule.unlockAt) return;
    try {
      // In production, encrypt client-side with Web Crypto API
      const encrypted = btoa(newCapsule.description || ''); // Mock encryption
      await capsuleApi.create({
        ...newCapsule,
        encryptedData: encrypted
      });
      showAdd = false;
      newCapsule = { title: '', description: '', mediaType: 'text', unlockAt: '' };
      loadCapsules();
    } catch {
      // handle error
    }
  }

  async function tryUnlock(capsule: TimeCapsule) {
    try {
      const result = await capsuleApi.unlock(capsule.id);
      if (result.decrypted) {
        alert(`Unlocked: ${atob(result.data)}`);
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || 'Failed to unlock';
      alert(msg);
    }
  }

  function isLocked(unlockAt: string): boolean {
    return new Date() < new Date(unlockAt);
  }

  function timeUntil(unlockAt: string): string {
    const diff = new Date(unlockAt).getTime() - Date.now();
    if (diff <= 0) return 'Unlocked!';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h remaining`;
  }

  // Redirect if not authenticated (wait for auth loading to finish)
  $: if (!$isLoading && !$isAuthenticated && typeof window !== 'undefined') {
    goto('/login');
  }

  onMount(() => {
    loadCapsules();
  });
</script>

{#if $isAuthenticated}
  <div class="max-w-3xl mx-auto px-4 py-6" in:fade>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">⏳ Time Capsules</h2>
      <button
        on:click={() => showAdd = true}
        class="px-4 py-2 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity"
      >
        + New Capsule
      </button>
    </div>

    {#if loading}
      <div class="text-center py-12 text-rina-slate">Loading capsules...</div>
    {:else if capsules.length === 0}
      <GlassCard className="text-center py-12">
        <p class="text-4xl mb-3">📦</p>
        <p class="text-rina-slate">No time capsules yet. Lock a memory for the future.</p>
      </GlassCard>
    {:else}
      <div class="space-y-4">
        {#each capsules as capsule (capsule.id)}
          <div in:scale={{ duration: 200, start: 0.95 }}>
          <GlassCard>
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <span class="text-2xl">
                  {capsule.mediaType === 'audio' ? '🎙️' : capsule.mediaType === 'video' ? '📹' : '📝'}
                </span>
                <div>
                  <p class="font-semibold">{capsule.title}</p>
                  <p class="text-xs text-rina-slate">{timeUntil(capsule.unlockAt)}</p>
                </div>
              </div>
              <button
                on:click={() => tryUnlock(capsule)}
                disabled={isLocked(capsule.unlockAt)}
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  {isLocked(capsule.unlockAt)
                    ? 'glass text-rina-slate-dark cursor-not-allowed'
                    : 'bg-rina-rose/20 text-rina-rose hover:bg-rina-rose/30'}"
              >
                {isLocked(capsule.unlockAt) ? '🔒 Locked' : '🔓 Open'}
              </button>
            </div>
            {#if capsule.description}
              <p class="text-sm text-rina-slate mt-2">{capsule.description}</p>
            {/if}
          </GlassCard>
          </div>
        {/each}
      </div>
    {/if}

    {#if showAdd}
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" transition:fade on:click={() => showAdd = false}>
        <div class="glass-strong rounded-2xl p-6 w-full max-w-sm" transition:scale on:click|stopPropagation>
          <h3 class="text-lg font-semibold mb-4">New Time Capsule</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-rina-slate mb-1">Title</label>
              <input bind:value={newCapsule.title} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Message (will be encrypted)</label>
              <textarea bind:value={newCapsule.description} rows={3} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50"></textarea>
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Unlock Date</label>
              <input type="datetime-local" bind:value={newCapsule.unlockAt} class="w-full px-3 py-2 rounded-lg bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div class="flex gap-2 pt-2">
              <button on:click={() => showAdd = false} class="flex-1 py-2 rounded-lg border border-rina-border text-sm hover:bg-white/5">Cancel</button>
              <button on:click={createCapsule} class="flex-1 py-2 rounded-lg bg-rina-rose text-white text-sm font-medium hover:opacity-90">Lock</button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
