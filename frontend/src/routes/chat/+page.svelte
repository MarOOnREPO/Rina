<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, currentUser } from '$lib/stores/auth';
  import { socketStore, typing } from '$lib/stores/socket';
  import { fly, fade, slide } from 'svelte/transition';
  import { messageApi, type ChatMessage } from '$lib/utils/api';

  let messages: ChatMessage[] = [];
  let input = '';
  let containerRef: HTMLDivElement;
  let loading = true;
  let typingTimeout: ReturnType<typeof setTimeout>;

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
    socketStore.emit('typing:start', { channel: 'global' });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socketStore.emit('typing:stop', { channel: 'global' });
    }, 1500);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    input = '';
    socketStore.emit('typing:stop', { channel: 'global' });

    try {
      const msg = await messageApi.send(text);
      messages = [...messages, msg];
      await tick();
      scrollToBottom();
      socketStore.emit('chat:message', msg);
    } catch {
      // handle error
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  onMount(() => {
    if (!$isAuthenticated) {
      goto('/login');
      return;
    }
    loadHistory();

    const sock = socketStore.getSocket();
    if (sock) {
      sock.on('chat:message', (msg: ChatMessage) => {
        if (msg.senderId !== $currentUser?.username) {
          messages = [...messages, msg];
          tick().then(scrollToBottom);
        }
      });
    }
  });

  onDestroy(() => {
    clearTimeout(typingTimeout);
    const sock = socketStore.getSocket();
    if (sock) {
      sock.off('chat:message');
    }
  });

  $: partnerTyping = $typing;
</script>

{#if $isAuthenticated}
  <div class="max-w-3xl mx-auto h-[calc(100vh-7rem)] flex flex-col px-4" in:fade>
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
          {@const isMe = msg.senderId === $currentUser?.username}
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
                {new Date(msg.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Input -->
    <div class="glass rounded-2xl p-3 mt-3 flex gap-2 shrink-0">
      <input
        bind:value={input}
        on:input={handleInput}
        on:keydown={handleKeydown}
        placeholder="Type a message..."
        class="flex-1 bg-transparent border-none text-white placeholder-rina-slate-dark text-sm
          focus:outline-none px-2"
      />
      <button
        on:click={sendMessage}
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
{/if}
