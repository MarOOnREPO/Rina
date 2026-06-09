<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser, partnerName } from '$lib/stores/auth.svelte';
  import { socketStore } from '$lib/stores/socket.svelte';
  import { fly, fade, slide } from 'svelte/transition';
  import { messageApi, type ChatMessage } from '$lib/utils/api';
  import { formatTime, formatDate } from '$lib/utils/timezone';
  import VideoCallOverlay from '$lib/components/VideoCallOverlay.svelte';

  let messages: ChatMessage[] = $state([]);
  let input = $state('');
  let containerRef = $state<HTMLDivElement | undefined>(undefined);
  let loading = $state(true);
  let typingTimeout: ReturnType<typeof setTimeout>;
  let sendError = $state('');

  // Video call state
  let videoCallOpen = $state(false);
  let incomingCallBanner = $state(false);
  let incomingCallerName = $state('');
  let incomingCallSender = $state('');
  let videoCallRef = $state<VideoCallOverlay | undefined>(undefined);

  // Edit state
  let editingId = $state<string | null>(null);
  let editInput = $state('');
  let showActionsFor = $state<string | null>(null);

  async function loadHistory() {
    try {
      const data = await messageApi.history();
      messages = data.reverse();
    } catch {
      // ignore
    } finally {
      loading = false;
      await tick();
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
  }

  function handleInput() {
    socketStore.send('typing:start');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socketStore.send('typing:stop');
    }, 1500);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    input = '';
    socketStore.send('typing:stop');

    try {
      const msg = await messageApi.send(text);
      messages = [...messages, msg];
      await tick();
      scrollToBottom();
      socketStore.send('chat:message', msg);
      sendError = '';
    } catch (err: unknown) {
      sendError = (err as { message?: string }).message || 'Failed to send message';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleChatMessage(payload: unknown) {
    const msg = payload as ChatMessage;
    messages = [...messages, msg];
    tick().then(scrollToBottom);
  }

  function startEdit(msg: ChatMessage) {
    if (msg.senderId !== currentUser()?.id) return;
    editingId = msg.id;
    editInput = msg.content;
    showActionsFor = null;
  }

  function cancelEdit() {
    editingId = null;
    editInput = '';
  }

  async function saveEdit() {
    if (!editingId || !editInput.trim()) {
      cancelEdit();
      return;
    }
    try {
      const updated = await messageApi.edit(editingId, editInput.trim());
      messages = messages.map((m) => (m.id === editingId ? updated : m));
      editingId = null;
      editInput = '';
    } catch (err: unknown) {
      sendError = (err as { message?: string }).message || 'Failed to edit message';
    }
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm('Delete this message?')) return;
    try {
      await messageApi.remove(id);
      messages = messages.filter((m) => m.id !== id);
      showActionsFor = null;
    } catch (err: unknown) {
      sendError = (err as { message?: string }).message || 'Failed to delete message';
    }
  }

  function toggleActions(id: string) {
    showActionsFor = showActionsFor === id ? null : id;
  }

  function formatMessageDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return formatDate(dateStr);
  }

  function groupMessagesByDate(msgs: ChatMessage[]) {
    const groups: { date: string; items: ChatMessage[] }[] = [];
    let currentGroup: { date: string; items: ChatMessage[] } | null = null;
    for (const msg of msgs) {
      const dateLabel = formatMessageDate(msg.createdAt);
      if (!currentGroup || currentGroup.date !== dateLabel) {
        currentGroup = { date: dateLabel, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(msg);
    }
    return groups;
  }

  // Incoming video call handling
  function handleVideoOffer(data: { sender: string; senderDisplayName: string; offer: unknown }) {
    if (!videoCallOpen) {
      incomingCallBanner = true;
      incomingCallerName = data.senderDisplayName || data.sender;
      incomingCallSender = data.sender;
    }
  }

  function answerIncomingCall() {
    videoCallOpen = true;
    incomingCallBanner = false;
  }

  function declineIncomingCall() {
    // Let the overlay handle sending the decline signal
    if (videoCallRef) {
      videoCallRef.declineCall();
    }
    incomingCallBanner = false;
    incomingCallerName = '';
    incomingCallSender = '';
  }

  function handleVideoCallClose() {
    videoCallOpen = false;
    // The overlay will clean up its own call state via its internal effect
  }

  // Redirect if not authenticated (wait for auth loading to finish)
  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  // Hide incoming call banner when the video overlay is opened
  $effect(() => {
    if (videoCallOpen) {
      incomingCallBanner = false;
    }
  });

  $effect(() => {
    const update = socketStore.globalSync;
    if (update && (update.payload as { type?: string }).type === 'message') {
      loadHistory();
    }
  });

  onMount(() => {
    loadHistory();
    socketStore.on('chat:message', handleChatMessage);
    socketStore.on('webrtc:offer', handleVideoOffer);
  });

  onDestroy(() => {
    clearTimeout(typingTimeout);
    socketStore.off('chat:message', handleChatMessage);
    socketStore.off('webrtc:offer', handleVideoOffer);
  });

  let partnerTyping = $derived(socketStore.typing);
  let partnerStatus = $derived(() => {
    const user = currentUser();
    if (!user) return 'offline';
    const partnerUsername = user.partner?.username || (user.username === 'maroon' ? 'rina' : 'maroon');
    return socketStore.presence[partnerUsername]?.status || 'offline';
  });
  let messageGroups = $derived(groupMessagesByDate(messages));
</script>

{#if isAuthenticated()}
  <div class="h-full flex flex-col bg-rina-bg max-w-7xl mx-auto px-4 md:px-8 w-full" in:fade={{ duration: 200 }}>
    <!-- Incoming call notification banner -->
    {#if incomingCallBanner}
      <div
        class="fixed top-4 left-4 right-4 z-[90] md:left-auto md:right-4 md:w-96"
        transition:fly={{ y: -20, duration: 300 }}
      >
        <div class="card flex items-center gap-3 px-4 py-3 shadow-soft-lg border-rina-primary/30">
          <div class="w-12 h-12 rounded-full bg-rina-primary-soft flex items-center justify-center shrink-0 animate-pulse">
            <span class="text-xl">📲</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-rina-text truncate">{incomingCallerName}</p>
            <p class="text-xs text-rina-text-muted">Incoming video call</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              onclick={answerIncomingCall}
              class="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600 active:scale-95 transition-all"
              aria-label="Answer call"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </button>
            <button
              onclick={declineIncomingCall}
              class="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 active:scale-95 transition-all"
              aria-label="Decline call"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Chat Header -->
    <div class="shrink-0 pt-4 pb-3 w-full">
      <div class="card flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-rina-primary-soft flex items-center justify-center">
            <span class="text-lg">💕</span>
          </div>
          <div>
            <h2 class="text-base font-semibold text-rina-text font-display">{partnerName() || 'Partner'}</h2>
            <p class="text-xs text-rina-text-muted flex items-center gap-1">
              {#if partnerTyping}
                <span in:slide class="text-rina-primary flex items-center gap-1">
                  <span class="flex gap-0.5">
                    <span class="w-1 h-1 rounded-full bg-rina-primary animate-bounce" style="animation-delay: 0ms;"></span>
                    <span class="w-1 h-1 rounded-full bg-rina-primary animate-bounce" style="animation-delay: 150ms;"></span>
                    <span class="w-1 h-1 rounded-full bg-rina-primary animate-bounce" style="animation-delay: 300ms;"></span>
                  </span>
                  typing...
                </span>
              {:else if partnerStatus() === 'online'}
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-rina-success"></span>
                  Online
                </span>
              {:else}
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-rina-border-strong"></span>
                  Offline
                </span>
              {/if}
            </p>
          </div>
        </div>
        <button
          onclick={() => videoCallOpen = true}
          class="w-10 h-10 rounded-xl bg-rina-surface-muted flex items-center justify-center hover:bg-rina-primary-soft transition-all duration-200 group"
          aria-label="Start video call"
        >
          <svg class="w-5 h-5 text-rina-text-secondary group-hover:text-rina-primary transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div
      bind:this={containerRef}
      class="flex-1 overflow-y-auto pb-2 space-y-4 w-full"
      style="scroll-behavior: smooth;"
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
    >
      {#if loading}
        <div class="flex flex-col items-center justify-center py-12 gap-3">
          <div class="w-8 h-8 rounded-full border-2 border-rina-border border-t-rina-primary animate-spin"></div>
          <p class="text-sm text-rina-text-muted">Loading your love notes...</p>
        </div>
      {:else if messages.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-16 h-16 rounded-full bg-rina-primary-soft flex items-center justify-center mb-4">
            <span class="text-3xl">💌</span>
          </div>
          <h3 class="text-lg font-semibold text-rina-text font-display mb-1">No messages yet</h3>
          <p class="text-sm text-rina-text-muted max-w-[16rem] md:max-w-sm">Say something sweet to start the conversation.</p>
        </div>
      {:else}
        {#each messageGroups as group (group.date)}
          <!-- Date Separator -->
          <div class="flex items-center justify-center gap-3 py-2">
            <div class="h-px flex-1 bg-rina-border"></div>
            <span class="text-[11px] font-medium text-rina-text-muted uppercase tracking-wider">{group.date}</span>
            <div class="h-px flex-1 bg-rina-border"></div>
          </div>

          {#each group.items as msg (msg.id)}
            {@const isMe = msg.senderId === currentUser()?.id}
            {@const showActions = showActionsFor === msg.id}
            <div
              class="flex {isMe ? 'justify-end' : 'justify-start'}"
              in:fly={{ y: 8, duration: 200 }}
            >
              <div class="relative group max-w-[80%]">
                <!-- Actions dropdown for own messages -->
                {#if isMe && !editingId}
                  <button
                    onclick={() => toggleActions(msg.id)}
                    class="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-10 w-6 h-6 rounded-full bg-rina-surface shadow-soft flex items-center justify-center"
                    aria-label="Message actions"
                  >
                    <svg class="w-3 h-3 text-rina-text-muted" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                    </svg>
                  </button>
                {/if}

                {#if showActions && isMe}
                  <div
                    class="absolute -top-1 right-6 z-20 bg-rina-surface rounded-xl shadow-soft-lg border border-rina-border py-1 min-w-[6rem]"
                    transition:fly={{ y: -4, duration: 150 }}
                  >
                    <button
                      onclick={() => startEdit(msg)}
                      class="w-full px-3 py-2 text-left text-xs text-rina-text-secondary hover:bg-rina-primary-soft hover:text-rina-primary transition-colors flex items-center gap-2"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      Edit
                    </button>
                    <button
                      onclick={() => deleteMessage(msg.id)}
                      class="w-full px-3 py-2 text-left text-xs text-rina-text-secondary hover:bg-rina-accent-soft hover:text-rina-accent transition-colors flex items-center gap-2"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      Delete
                    </button>
                  </div>
                {/if}

                <!-- Message bubble -->
                {#if editingId === msg.id}
                  <div class="bg-rina-surface border border-rina-border rounded-2xl rounded-br-md px-4 py-3 shadow-soft">
                    <input
                      bind:value={editInput}
                      onkeydown={handleEditKeydown}
                      class="w-full bg-transparent text-sm text-rina-text focus:outline-none"
                    />
                    <div class="flex items-center justify-end gap-2 mt-2">
                      <button onclick={cancelEdit} class="text-[11px] text-rina-text-muted hover:text-rina-text transition-colors px-2 py-1">Cancel</button>
                      <button onclick={saveEdit} class="text-[11px] font-medium text-rina-primary hover:text-rina-primary/80 transition-colors px-2 py-1">Save</button>
                    </div>
                  </div>
                {:else}
                  <div
                    class="px-4 py-2.5 rounded-2xl text-sm shadow-soft
                      {isMe
                        ? 'bg-rina-primary text-white rounded-br-md'
                        : 'bg-rina-surface border border-rina-border text-rina-text rounded-bl-md'}"
                  >
                    <p class="break-words leading-relaxed">{msg.content}</p>
                    <div class="flex items-center justify-end gap-1 mt-1">
                      <span class="text-[10px] {isMe ? 'text-white/70' : 'text-rina-text-muted'}">
                        {formatTime(msg.createdAt)}
                      </span>
                      {#if isMe}
                        <!-- Message status -->
                        <span class="flex items-center" aria-label="Message delivered">
                          <svg class="w-3 h-3 {isMe ? 'text-white/70' : 'text-rina-text-muted'}" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                          </svg>
                        </span>
                      {/if}
                    </div>
                    {#if msg.editedAt}
                      <p class="text-[9px] {isMe ? 'text-white/50' : 'text-rina-text-muted'} text-right mt-0.5">edited</p>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {/each}
      {/if}
    </div>

    <!-- Typing Indicator (when partner is typing and no messages yet in current session) -->
    {#if partnerTyping && messages.length > 0}
      <div class="pb-1 w-full" in:fly={{ y: 4, duration: 150 }} out:fly={{ y: 4, duration: 150 }}>
        <div class="flex items-end gap-2">
          <div class="w-7 h-7 rounded-full bg-rina-primary-soft flex items-center justify-center text-xs">
            💕
          </div>
          <div class="bg-rina-surface border border-rina-border rounded-2xl rounded-bl-md px-4 py-2.5 shadow-soft flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-rina-primary/40 animate-bounce" style="animation-delay: 0ms;"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-rina-primary/40 animate-bounce" style="animation-delay: 150ms;"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-rina-primary/40 animate-bounce" style="animation-delay: 300ms;"></span>
          </div>
        </div>
      </div>
    {/if}

    <!-- Input -->
    <div class="shrink-0 pb-4 pt-2 w-full">
      {#if sendError}
        <p class="text-rina-accent text-xs px-1 mb-2" transition:fade>{sendError}</p>
      {/if}
      <div class="card flex items-center gap-2 px-3 py-2">
        <input
          bind:value={input}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="Type a sweet message..."
          class="flex-1 bg-transparent border-none text-sm text-rina-text placeholder:text-rina-text-muted focus:outline-none px-2 min-h-[44px]"
        />
        <button
          onclick={sendMessage}
          disabled={!input.trim()}
          class="w-11 h-11 rounded-xl bg-rina-primary flex items-center justify-center hover:bg-rina-primary/90 active:scale-95 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed shadow-soft"
          aria-label="Send message"
        >
          <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Video Call Overlay -->
  <VideoCallOverlay
    bind:this={videoCallRef}
    isOpen={videoCallOpen}
    onClose={handleVideoCallClose}
  />
{/if}

<style>
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  .animate-bounce {
    animation: bounce 0.6s ease-in-out infinite;
  }
</style>
