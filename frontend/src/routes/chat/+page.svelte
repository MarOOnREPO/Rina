<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { socketStore, typing, globalSync } from '$lib/stores/socket.svelte';
  import { fly, fade, slide } from 'svelte/transition';
  import { messageApi, type ChatMessage } from '$lib/utils/api';
  import { formatTime } from '$lib/utils/timezone';

  let messages: ChatMessage[] = $state([]);
  let input = $state('');
  let containerRef = $state<HTMLDivElement | undefined>(undefined);
  let loading = $state(true);
  let typingTimeout: ReturnType<typeof setTimeout>;
  let sendError = $state('');

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
    socketStore.emit('typing:start');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socketStore.emit('typing:stop');
    }, 1500);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    input = '';
    socketStore.emit('typing:stop');

    try {
      const msg = await messageApi.send(text);
      messages = [...messages, msg];
      await tick();
      scrollToBottom();
      socketStore.emit('chat:message', msg);
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

  function handleChatMessage(msg: ChatMessage) {
    messages = [...messages, msg];
    tick().then(scrollToBottom);
  }

  // Redirect if not authenticated (wait for auth loading to finish)
  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
    goto('/login');
    }
  });

  $effect(() => {
    const update = globalSync.lastUpdate;
    if (update && update.type === 'message') {
      loadHistory();
    }
  });

  onMount(() => {
    loadHistory();

    const sock = socketStore.getSocket();
    if (sock) {
      sock.on('chat:message', handleChatMessage);
    }
  });

  onDestroy(() => {
    clearTimeout(typingTimeout);
    const sock = socketStore.getSocket();
    if (sock) {
      sock.off('chat:message', handleChatMessage);
    }
  });

  let partnerTyping = $derived(typing.value);
</script>

{#if isAuthenticated()}
  <div class="h-full flex flex-col px-3 py-4" in:fade>
    <!-- Chat Header -->
    <div class="glass rounded-2xl p-4 mb-3 flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-lg font-semibold">💬 Chat</h2>
        <p class="text-xs text-rina-slate">
          {#if partnerTyping}
            <span in:slide class="text-rina-rose">{partnerTyping.displayName} is typing...</span>
          {:else}
            Encrypted • End-to-end
          {/if}
        </p>
      </div>
      <button
        onclick={() => goto('/video')}
        class="relative group w-9 h-9 rounded-full glass flex items-center justify-center hover:bg-white/10 transition-colors"
        aria-label="Start video call"
      >
        <svg class="w-5 h-5 text-rina-slate group-hover:text-white transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <span class="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-rina-bg border border-rina-border px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Start video call
        </span>
      </button>
    </div>

    <!-- Messages -->
    <div
      bind:this={containerRef}
      class="flex-1 overflow-y-auto space-y-3 px-1 pb-2"
      style="scroll-behavior: smooth;"
    >
      {#if loading}
        <div class="text-center text-rina-slate py-8">Loading messages...</div>
      {:else if messages.length === 0}
        <div class="text-center text-rina-slate-dark py-12">
          <p class="text-4xl mb-3">💌</p>
          <p>No messages yet. Say something sweet.</p>
        </div>
      {:else}
        {#each messages as msg (msg.id)}
          {@const isMe = msg.senderId === currentUser()?.id}
          <div
            class="flex {isMe ? 'justify-end' : 'justify-start'}"
            in:fly={{ y: 10, duration: 200 }}
          >
            <div
              class="max-w-[75%] px-4 py-2.5 rounded-2xl text-sm
                {isMe
                  ? 'bg-rina-rose/20 text-white rounded-br-md'
                  : 'glass text-white rounded-bl-md'}"
            >
              <p class="break-words">{msg.content}</p>
              <p class="text-[10px] mt-1 opacity-50 text-right">
                {formatTime(msg.createdAt)}
              </p>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Input -->
    <div class="mt-3 shrink-0 space-y-2">
      {#if sendError}
        <p class="text-rina-rose text-xs px-1" transition:fade>{sendError}</p>
      {/if}
      <div class="glass rounded-2xl p-3 flex gap-2">
        <input
          bind:value={input}
          oninput={handleInput}
          onkeydown={handleKeydown}
          placeholder="Type a message..."
          class="flex-1 bg-transparent border-none text-white placeholder-rina-slate-dark text-sm
            focus:outline-none px-2"
        />
        <button
          onclick={sendMessage}
          disabled={!input.trim()}
          class="w-9 h-9 rounded-full bg-rina-rose flex items-center justify-center
            hover:scale-105 active:scale-95 transition-transform disabled:opacity-30"
          aria-label="Send message"
        >
          <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
{/if}
