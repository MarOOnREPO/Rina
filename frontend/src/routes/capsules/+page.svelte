<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
  import { fade, scale, fly } from 'svelte/transition';
  import { capsuleApi, type TimeCapsule } from '$lib/utils/api';
  import { encryptText, decryptText } from '$lib/utils/crypto';
  import { isLocked, timeUntil, datetimeLocalToIso } from '$lib/utils/timezone';
  import GlassCard from '$lib/components/GlassCard.svelte';
import { globalSync } from '$lib/stores/socket.svelte';

  let capsules: TimeCapsule[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  // Create modal
  let showAdd = $state(false);
  let createPassphrase = $state('');
  let newTitle = $state('');
  let newDescription = $state('');
  let newSecretMessage = $state('');
  let newMediaType: 'text' | 'audio' | 'video' = $state('text');
  let newUnlockAt = $state('');

  // Unlock reveal modal
  let showReveal = $state(false);
  let revealCapsule: TimeCapsule | null = $state(null);
  let revealPassphrase = $state('');
  let revealedText = $state('');
  let revealError = $state('');
  let revealLoading = $state(false);

  async function loadCapsules() {
    loading = true;
    error = '';
    try {
      capsules = await capsuleApi.list();
    } catch (err) {
      error = 'Failed to load capsules';
      console.error('[Capsules]', err);
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    newTitle = '';
    newDescription = '';
    newSecretMessage = '';
    newMediaType = 'text';
    newUnlockAt = '';
    createPassphrase = '';
    error = '';
  }

  async function createCapsule() {
    if (!newTitle.trim() || !newUnlockAt || !createPassphrase.trim()) {
      error = 'Title, unlock date, and passphrase are required';
      return;
    }
    error = '';

    try {
      const encrypted = await encryptText(newSecretMessage || '', createPassphrase);
      const isoUnlock = datetimeLocalToIso(newUnlockAt);
      if (!isoUnlock) {
        error = 'Invalid unlock date';
        return;
      }

      await capsuleApi.create({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        encryptedData: encrypted,
        mediaType: newMediaType,
        unlockAt: isoUnlock
      });

      showAdd = false;
      resetForm();
      await loadCapsules();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create capsule';
      error = msg.includes('secure context') ? 'Encryption requires HTTPS.' : msg;
      console.error('[Capsules]', err);
    }
  }

  async function startUnlock(capsule: TimeCapsule) {
    if (isLocked(capsule.unlockAt)) return;
    revealCapsule = capsule;
    revealPassphrase = '';
    revealedText = '';
    revealError = '';
    showReveal = true;
  }

  async function confirmUnlock() {
    if (!revealCapsule || !revealPassphrase) return;
    revealLoading = true;
    revealError = '';
    revealedText = '';

    try {
      const result = await capsuleApi.unlock(revealCapsule.id);
      if (!result.data) {
        revealError = 'No encrypted data found';
        return;
      }
      const text = await decryptText(result.data, revealPassphrase);
      revealedText = text;
      await loadCapsules();
    } catch (err) {
      revealError = 'Wrong passphrase or corrupted data';
      console.error('[Capsules]', err);
    } finally {
      revealLoading = false;
    }
  }

  async function deleteCapsule(id: string) {
    if (!confirm('Delete this capsule forever?')) return;
    try {
      await capsuleApi.remove(id);
      await loadCapsules();
    } catch (err) {
      error = 'Failed to delete capsule';
      console.error('[Capsules]', err);
    }
  }

  function mediaIcon(type: string): string {
    return type === 'audio' ? '🎙️' : type === 'video' ? '📹' : '📝';
  }

  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  $effect(() => {
    const update = globalSync.lastUpdate;
    if (update && update.type === 'capsule') {
      loadCapsules();
    }
  });

  onMount(() => {
    loadCapsules();
  });
</script>

{#if isAuthenticated()}
  <div class="px-3 py-4 space-y-4" in:fade>
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">🔐 Time Capsules</h2>
      <button
        onclick={() => { showAdd = true; error = ''; }}
        class="touch-target px-4 py-2 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity"
      >
        + New
      </button>
    </div>

    {#if error}
      <div class="glass rounded-xl p-3 text-rina-rose text-sm" transition:fly={{ y: -10 }}>
        {error}
      </div>
    {/if}

    {#if loading}
      <div class="text-center py-12 text-rina-slate">Loading capsules...</div>
    {:else if capsules.length === 0}
      <GlassCard class="text-center py-12">
        <p class="text-4xl mb-3">📦</p>
        <p class="text-rina-slate">No time capsules yet. Lock a memory for the future.</p>
      </GlassCard>
    {:else}
      <div class="space-y-3">
        {#each capsules.sort((a, b) => new Date(a.unlockAt).getTime() - new Date(b.unlockAt).getTime()) as capsule (capsule.id)}
          {@const locked = isLocked(capsule.unlockAt)}
          <div in:scale={{ duration: 200, start: 0.95 }}>
            <GlassCard class="relative">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="text-2xl shrink-0">{mediaIcon(capsule.mediaType)}</span>
                  <div class="min-w-0">
                    <p class="font-semibold text-sm truncate">{capsule.title}</p>
                    <p class="text-xs {locked ? 'text-rina-slate' : 'text-emerald-400'}">
                      {locked ? `🔒 ${timeUntil(capsule.unlockAt)}` : '🔓 Unlocked'}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    onclick={() => startUnlock(capsule)}
                    disabled={locked}
                    class="touch-target px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                      {locked
                        ? 'glass text-rina-slate-dark cursor-not-allowed'
                        : 'bg-rina-rose/20 text-rina-rose hover:bg-rina-rose/30'}"
                  >
                    {locked ? 'Locked' : 'Open'}
                  </button>
                  <button
                    onclick={() => deleteCapsule(capsule.id)}
                    class="touch-target px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              {#if capsule.description}
                <p class="text-xs text-rina-slate mt-2">{capsule.description}</p>
              {/if}
              {#if capsule.openedAt}
                <p class="text-[10px] text-emerald-400 mt-1">Opened {new Date(capsule.openedAt).toLocaleDateString('en-GB')}</p>
              {/if}
            </GlassCard>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Create Modal -->
    {#if showAdd}
      <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" transition:fade role="button" tabindex="0" onclick={() => showAdd = false} onkeydown={(e) => e.key === 'Escape' && (showAdd = false)}>
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" transition:scale onclick={(e) => e.stopPropagation()}>
          <h3 class="text-lg font-semibold mb-4">New Time Capsule</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-rina-slate mb-1">Title</label>
              <input bind:value={newTitle} placeholder="A secret for us..." class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Public Hint (optional)</label>
              <input bind:value={newDescription} placeholder="A hint about what's inside..." class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Secret Message (encrypted)</label>
              <textarea bind:value={newSecretMessage} rows={3} placeholder="This will be encrypted with your passphrase..." class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50 resize-none"></textarea>
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Passphrase (shared secret)</label>
              <input type="password" bind:value={createPassphrase} placeholder="Both partners must know this" class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div>
              <label class="block text-xs text-rina-slate mb-1">Unlock Date</label>
              <input type="datetime-local" bind:value={newUnlockAt} class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50" />
            </div>
            <div class="flex gap-2 pt-2">
              <button onclick={() => showAdd = false} class="touch-target flex-1 py-2.5 rounded-xl border border-rina-border text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button onclick={createCapsule} class="touch-target flex-1 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity">Lock</button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Reveal Modal -->
    {#if showReveal && revealCapsule}
      <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" transition:fade role="button" tabindex="0" onclick={() => showReveal = false} onkeydown={(e) => e.key === 'Escape' && (showReveal = false)}>
        <div class="glass-strong rounded-t-2xl md:rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" transition:scale onclick={(e) => e.stopPropagation()}>
          <h3 class="text-lg font-semibold mb-1">🔓 {revealCapsule.title}</h3>
          <p class="text-xs text-rina-slate mb-4">Enter the shared passphrase to decrypt</p>

          {#if revealedText}
            <div class="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 mb-4">
              <p class="text-sm text-emerald-100 whitespace-pre-wrap">{revealedText}</p>
            </div>
            <button onclick={() => showReveal = false} class="touch-target w-full py-2.5 rounded-xl bg-white/5 text-sm hover:bg-white/10 transition-colors">Close</button>
          {:else}
            <div class="space-y-3">
              <input
                type="password"
                bind:value={revealPassphrase}
                placeholder="Passphrase..."
                onkeydown={(e) => e.key === 'Enter' && confirmUnlock()}
                class="input-safe w-full px-3 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-white text-sm focus:outline-none focus:border-rina-rose/50"
              />
              {#if revealError}
                <p class="text-xs text-red-400">{revealError}</p>
              {/if}
              <div class="flex gap-2">
                <button onclick={() => showReveal = false} class="touch-target flex-1 py-2.5 rounded-xl border border-rina-border text-sm hover:bg-white/5 transition-colors">Cancel</button>
                <button
                  onclick={confirmUnlock}
                  disabled={!revealPassphrase || revealLoading}
                  class="touch-target flex-1 py-2.5 rounded-xl bg-rina-rose text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {revealLoading ? 'Decrypting...' : 'Decrypt'}
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
